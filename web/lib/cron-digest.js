/* Logika endpoint digest push mandiri (P-05).
 *
 * Digest web push harian sebelumnya hanya dikirim dari dalam cron
 * recheck (sesudah Telegram, dari freshAlerts run itu). P-05
 * memisahkannya menjadi job terjadwal sendiri
 * (`GET /api/cron/digest`, 01:30 WIB) supaya:
 * - digest yang gagal/terpotong di recheck (anggaran push 10 detik,
 *   daftar langganan gagal dibaca, 429) dicoba lagi oleh job
 *   khusus — bukan hilang sampai besok;
 * - alert yang dibuat di luar recheck tetap bisa masuk digest.
 *
 * Anti-duplikat: alert yang sudah masuk digest ditandai
 * `pushed: true` + `pushedAt` (oleh recheck sesudah digestnya
 * terkirim penuh, dan oleh endpoint ini sesudah kirim). Endpoint
 * ini hanya mengambil alert hari ini (tanggal WIB) yang BELUM
 * ditandai pushed. Penanda ditulis sebagai field Firestore biasa
 * (bukan dokumen terpisah) supaya tidak menambah koleksi.
 *
 * Batas: kueri mengambil maks 100 alert hari ini (+1 baris penanda
 * sisa, pola C-07). Lebih dari 100 alert baru dalam sehari tidak
 * pernah terjadi (baseline: 0-3/hari); bila terjadi, sisanya
 * dicoba lagi besok dan `hasMore: true` dicatat di heartbeat.
 * Hanya tipe new-target dan deadline yang masuk digest — alert
 * kuota (type "quota") adalah peringatan infrastruktur untuk
 * owner lewat Telegram, bukan konten push pelanggan. */
import { jsonWithTimeout } from "./companies.js";

export const DIGEST_ALERT_TYPES = ["new-target", "deadline"];
export const DIGEST_QUERY_LIMIT = 100;
const DIGEST_FETCH_TIMEOUT_MS = 10_000;

/* Rentang UTC untuk satu tanggal WIB. WIB = UTC+7, jadi tanggal
 * WIB D adalah [D-1 17:00 UTC, D 17:00 UTC). createdAt alert
 * disimpan sebagai string ISO UTC, jadi perbandingan string
 * leksikografis sama dengan urutan kronologis. */
export function wibDayUtcRange(dateWib) {
  const [year, month, day] = dateWib.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, day) - 7 * 3_600_000;
  const endMs = startMs + 24 * 3_600_000;
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

/* Uraikan satu dokumen alert REST menjadi alert digest. Field
 * pushed yang tidak ada berarti belum pernah masuk digest. */
export function alertDocToDigestAlert(doc) {
  const fields = doc?.fields || {};
  const str = (key) => fields[key]?.stringValue ?? "";
  const num = (key) => {
    const raw = fields[key]?.integerValue;
    const value = raw === undefined ? null : Number(raw);
    return Number.isInteger(value) ? value : null;
  };
  return {
    id: String(doc?.name || "").split("/").pop() || "",
    type: str("type"),
    companyNo: num("companyNo") ?? 0,
    perusahaan: str("perusahaan"),
    posisi: str("posisi"),
    link: str("link"),
    batasLamar: str("batasLamar"),
    daysLeft: num("daysLeft"),
    pushed: fields.pushed?.booleanValue === true,
  };
}

async function callJson(fetchImpl, url, { method, token, body }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIGEST_FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = await jsonWithTimeout(res, DIGEST_FETCH_TIMEOUT_MS).catch(
      () => ({}),
    );
    if (!res.ok) {
      throw new Error(`Firestore gagal: HTTP ${res.status}.`);
    }
    return parsed || {};
  } finally {
    clearTimeout(timer);
  }
}

/* Ambil alert hari ini (tanggal WIB) yang belum masuk digest.
 * Melempar bila kueri gagal — pemanggil (route digest) menjawab
 * 500 dan menandai run gagal supaya pemicu cadangan bisa mencoba
 * lagi. Kembalikan { alerts, hasMore, totalToday }: alerts hanya
 * tipe digest + belum pushed; totalToday menghitung SEMUA dokumen
 * alert hari ini yang cocok rentang (untuk heartbeat). */
export async function listUnpushedAlertsToday({
  fsBase,
  token,
  todayWib,
  fetchImpl = fetch,
  limit = DIGEST_QUERY_LIMIT,
}) {
  const { startIso, endIso } = wibDayUtcRange(todayWib);
  const runQueryUrl = `${fsBase.replace(/\/documents$/, "")}/documents:runQuery`;
  const data = await callJson(fetchImpl, runQueryUrl, {
    method: "POST",
    token,
    body: {
      structuredQuery: {
        from: [{ collectionId: "alerts" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: "createdAt" },
                  op: "GREATER_THAN_OR_EQUAL",
                  value: { stringValue: startIso },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: "createdAt" },
                  op: "LESS_THAN",
                  value: { stringValue: endIso },
                },
              },
            ],
          },
        },
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "ASCENDING" }],
        limit: limit + 1,
      },
    },
  });
  const rows = Array.isArray(data) ? data : [];
  const docs = rows.map((r) => r?.document).filter(Boolean);
  const hasMore = docs.length > limit;
  const today = docs.slice(0, limit).map(alertDocToDigestAlert);
  const alerts = today.filter(
    (a) => DIGEST_ALERT_TYPES.includes(a.type) && !a.pushed,
  );
  return { alerts, hasMore, totalToday: today.length };
}

/* Tandai alert sudah masuk digest (pushed=true + pushedAt).
 * Best-effort per alert: kegagalan satu alert tidak menghentikan
 * yang lain (alert itu akan dicoba lagi besok). Kembalikan
 * { marked, failed }. */
export async function markAlertsPushed({
  fsBase,
  token,
  alertIds,
  fetchImpl = fetch,
  nowIso = new Date().toISOString(),
}) {
  const ids = alertIds || [];
  if (ids.length === 0) return { marked: 0, failed: 0 };
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        await callJson(
          fetchImpl,
          `${fsBase}/alerts/${encodeURIComponent(id)}` +
            "?updateMask.fieldPaths=pushed&updateMask.fieldPaths=pushedAt",
          {
            method: "PATCH",
            token,
            body: {
              fields: {
                pushed: { booleanValue: true },
                pushedAt: { stringValue: nowIso },
              },
            },
          },
        );
        return true;
      } catch {
        return false;
      }
    }),
  );
  return {
    marked: results.filter(Boolean).length,
    failed: results.filter((ok) => !ok).length,
  };
}
