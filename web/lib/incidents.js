/* Koleksi Firestore `incidents` (P-06, rencana-observabilitas-
 * keamanan §1.2.2 lapisan C): jejak tahan lama kegagalan, cadangan
 * bila Sentry tidak terjangkau — dan satu-satunya jejak yang bisa
 * dibaca watcher agent-side untuk alarm berbasis durasi (mis. mode
 * seed > 1 jam, yang butuh bukti dua jam berturut-turut).
 *
 * Skema dokumen (id deterministik per kode per jam WIB):
 *   incidents/{KODE}-{YYYY-MM-DD}-{HH}
 *   { code, count, firstSeen, lastSeen, message, source }
 * Dedup: satu dokumen per kode per jam; kegagalan berikutnya dalam
 * jam yang sama hanya memperbarui lastSeen + count, paling banyak
 * sekali per 15 menit per kode per instance (throttle memori).
 * Anggaran tulis: maks ±240 tulis/hari bila 10 jenis gagal
 * sepanjang hari (1,2% kuota tulis Spark 20.000/hari) — tanpa
 * dedup, satu error berulang tiap detik menghabiskan kuota tulis
 * dalam 5,5 jam.
 *
 * Tulis memakai API key publik (pola yang sama dengan alert kuota
 * di lib/companies.js) dan dikekang aturan Firestore (lihat
 * web/firestore.rules: create hanya bila bentuknya sesuai, update
 * hanya count/lastSeen). Sampai rules baru diterbitkan parent,
 * tulis 403 dan fungsi ini mengembalikan "failed" — best-effort,
 * tidak pernah melempar dan tidak pernah menggagalkan pemanggil.
 *
 * Retensi 90 hari ditangani cron cleanup (lihat RETENTION_POLICIES
 * di app/api/cron/cleanup/route.js). */

import { sanitizeMessage } from "./observability.js";

/* Jeda minimum antar pembaruan dokumen yang sama per instance. */
export const INCIDENT_UPDATE_THROTTLE_MS = 15 * 60 * 1000;

/* Batas ukuran cache docId yang sudah dibuat (anti-bocor memori:
 * satu entri per kode-jam; dibersihkan total bila melewati batas). */
const SEEN_CREATED_CAP = 500;

const seenCreated = new Set();
const lastUpdateAt = new Map();

export function resetIncidentsForTests() {
  seenCreated.clear();
  lastUpdateAt.clear();
}

export function incidentDocId(code, dateWib, hourWib) {
  const hh = String(hourWib).padStart(2, "0");
  return `${code}-${dateWib}-${hh}`;
}

/* Tanggal + jam WIB dari stempel milidetik. WIB tetap UTC+7 tanpa
 * daylight saving, jadi aritmetika offset ini deterministik. */
export function wibDateHour(nowMs = Date.now()) {
  const d = new Date(nowMs + 7 * 60 * 60 * 1000);
  const date = d.toISOString().slice(0, 10);
  const hour = d.getUTCHours();
  return { date, hour };
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* Catat satu kejadian ke koleksi incidents. Kembalikan "created"
 * (dokumen jam ini baru dibuat), "updated" (lastSeen/count
 * diperbarui), "skipped" (masih dalam jeda throttle 15 menit), atau
 * "failed" (konfigurasi tidak ada / jaringan / 403 rules / 5xx).
 * Tidak pernah melempar. */
export async function recordIncidentEvent(
  event,
  {
    fetchImpl = fetch,
    projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    nowMs = Date.now(),
  } = {},
) {
  try {
    if (!projectId || !apiKey) return "failed";
    const code = typeof event?.code === "string" ? event.code : "";
    if (!/^[A-Z0-9_]{3,64}$/.test(code)) return "failed";
    const { date, hour } = wibDateHour(nowMs);
    const docId = incidentDocId(code, date, hour);
    const base =
      `https://firestore.googleapis.com/v1/projects/${projectId}` +
      `/databases/(default)/documents`;
    const seen = new Date(nowMs).toISOString();
    const message = sanitizeMessage(event.message || code);
    const source =
      typeof event.component === "string" ? event.component : "";

    if (!seenCreated.has(docId)) {
      if (seenCreated.size >= SEEN_CREATED_CAP) seenCreated.clear();
      const res = await fetchWithTimeout(
        fetchImpl,
        `${base}/incidents?documentId=${encodeURIComponent(docId)}&key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: {
              code: { stringValue: code },
              count: { integerValue: "1" },
              firstSeen: { stringValue: seen },
              lastSeen: { stringValue: seen },
              message: { stringValue: message },
              source: { stringValue: source },
            },
          }),
        },
      );
      if (res.ok) {
        seenCreated.add(docId);
        lastUpdateAt.set(docId, nowMs);
        return "created";
      }
      if (res.status === 409) {
        /* Dokumen jam ini sudah ada (dibuat instance lain atau run
         * sebelumnya): lanjut ke pembaruan throttled di bawah. */
        seenCreated.add(docId);
      } else {
        return "failed";
      }
    }

    const last = lastUpdateAt.get(docId) || 0;
    if (nowMs - last < INCIDENT_UPDATE_THROTTLE_MS) return "skipped";
    const getRes = await fetchWithTimeout(
      fetchImpl,
      `${base}/incidents/${encodeURIComponent(docId)}?key=${apiKey}`,
      { method: "GET" },
    );
    if (!getRes.ok) return "failed";
    const body = await getRes.json().catch(() => null);
    const count = Number(body?.fields?.count?.integerValue || 0) + 1;
    const patchRes = await fetchWithTimeout(
      fetchImpl,
      `${base}/incidents/${encodeURIComponent(docId)}?key=${apiKey}` +
        `&updateMask.fieldPaths=count&updateMask.fieldPaths=lastSeen`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            count: { integerValue: String(count) },
            lastSeen: { stringValue: seen },
          },
        }),
      },
    );
    if (!patchRes.ok) return "failed";
    lastUpdateAt.set(docId, nowMs);
    return "updated";
  } catch {
    return "failed";
  }
}

/* Sink observabilitas (didaftarkan di instrumentation.js): catat
 * kejadian secara fire-and-forget — pemanggil tidak menunggu dan
 * tidak pernah melihat kegagalannya. */
export function incidentsSink(event) {
  /* P-07: kejadian level "info" (mis. progres per halaman
   * digest) adalah kabar rutin, bukan insiden — tidak pernah
   * membuat dokumen incidents. */
  if (event && event.level === "info") return;
  recordIncidentEvent(event).catch(() => {});
}
