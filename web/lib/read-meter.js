/* Pengukur baca Firestore per sumber (P-06, kriteria 7 / T1
 * tindakan pertama): mencatat berapa dokumen yang dibaca tiap
 * sumber, per hari, ke dokumen `read-stats/{YYYY-MM-DD}` — supaya
 * sesudah 14 hari, sumber baca terbesar teridentifikasi dengan
 * angka (bukan tebakan) dan target penghematan P-08/P-10 ditetapkan
 * dari hasil ukur, bukan dari angka riset semata.
 *
 * Cara kerja:
 * - recordReads(sumber, jumlah) menumpuk hitungan di memori
 *   instance. Flush (tulis ke Firestore) terjadi malas: bila
 *   tumpukan satu sumber mencapai 50, atau 10 menit sejak flush
 *   terakhir sumber itu. Cron recheck/cleanup memanggil
 *   flushReadMeters() eksplisit di akhir run supaya hitungannya
 *   tidak hilang saat instance mati.
 * - Flush memakai satu Write batchWrite (update + updateTransforms,
 *   semantik set-with-merge SDK): increment atomik per sumber tanpa
 *   baca dulu, dan dokumen hari itu dibuat bila belum ada — tanpa
 *   precondition exists. Bila flush gagal, tumpukan dikembalikan
 *   (dicoba lagi di flush berikut) dan kegagalan dicatat sebagai
 *   METERING_FAILED (throttled).
 * - Tulis memakai API key publik (pola yang sama dengan alert
 *   kuota) dan dikekang aturan Firestore (lihat firestore.rules:
 *   id dokumen harus tanggal, kunci hanya sources + updatedAt,
 *   nama sumber dari daftar yang diizinkan). Sampai rules baru
 *   diterbitkan parent, flush 403 dan tumpukan menumpuk di memori
 *   sampai batas (lihat READ_METER_MAX_PENDING) lalu dibuang
 *   supaya memori tidak membengkak — kehilangan data ukur
 *   sementara lebih baik daripada instance kehabisan memori.
 *
 * Keterbatasan yang dicatat jujur (bukan disembunyikan):
 * - Instance serverless yang mati sebelum flush kehilangan
 *   tumpukan yang belum ter-flush (maks 49/sumber/instance) —
 *   angka laporan adalah BATAS BAWAH pemakaian sebenarnya.
 * - Jalur yang tidak diinstrumentasi (panel admin lewat SDK,
 *   impor kanonis agent-side) tidak tercatat di sini; laporan
 *   (web/scripts/read-stats-report.mjs) mencantumkan celah ini.
 * - Refill yang dipicu cron recheck lewat getCompaniesWithSource
 *   tercatat sebagai "web-refill" (jalur kode yang sama); sumber
 *   "cron-recheck" hanya menghitung baca langsung route cron
 *   (marker, snapshot, run kemarin). */

import {
  OBS_CODES,
  emitObservabilityEvent,
} from "./observability.js";

/* Sumber baca yang diukur — daftar ini JUGA ada di firestore.rules
 * (allowlist kunci map sources); ubah keduanya bersamaan. */
export const READ_SOURCES = Object.freeze([
  "web-refill",
  "web-marker",
  "web-by-id",
  "web-changes",
  "web-index-rev",
  "cron-recheck",
  "cron-cleanup",
  "watcher",
]);

/* Ambang flush malas: 50 baca tertumpuk atau 10 menit sejak flush
 * terakhir sumber itu. */
export const READ_METER_FLUSH_MIN_DELTA = 50;
export const READ_METER_FLUSH_MIN_INTERVAL_MS = 10 * 60 * 1000;
/* Batas tumpukan per sumber bila flush gagal terus-menerus (mis.
 * rules belum terbit): di atas ini, hitungan baru dibuang. */
export const READ_METER_MAX_PENDING = 10000;

const pending = new Map();
const lastFlushAt = new Map();
let flushing = null;

export function resetReadMetersForTests() {
  pending.clear();
  lastFlushAt.clear();
  flushing = null;
}

/* Tumpukan saat ini (dipakai test). */
export function pendingReadsForTests() {
  return Object.fromEntries(pending);
}

/* Tanggal WIB "YYYY-MM-DD" dari stempel milidetik (WIB = UTC+7,
 * tanpa daylight saving). */
export function wibDate(nowMs = Date.now()) {
  return new Date(nowMs + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/* Tambah hitungan baca untuk satu sumber. Sumber di luar daftar
 * dan jumlah tidak positif diabaikan diam-diam (pemanggil tidak
 * boleh gagal karena metering). */
export function recordReads(source, count = 1, { nowMs = Date.now() } = {}) {
  if (!READ_SOURCES.includes(source)) return;
  const n = Math.floor(Number(count));
  if (!Number.isFinite(n) || n <= 0) return;
  const current = pending.get(source) || 0;
  if (current >= READ_METER_MAX_PENDING) return;
  pending.set(source, Math.min(current + n, READ_METER_MAX_PENDING));
  /* Flush malas: delta per sumber mencapai ambang, atau 10 menit
   * sejak flush terakhir sumber itu. Rekaman pertama sumber itu
   * (belum pernah flush) HANYA menandai waktu — tidak langsung
   * flush (tidak ada gunanya menulis batch untuk rekaman pertama). */
  const last = lastFlushAt.get(source);
  if (last === undefined) {
    lastFlushAt.set(source, nowMs);
    if (pending.get(source) < READ_METER_FLUSH_MIN_DELTA) return;
  } else if (
    pending.get(source) < READ_METER_FLUSH_MIN_DELTA &&
    nowMs - last < READ_METER_FLUSH_MIN_INTERVAL_MS
  ) {
    return;
  }
  void flushReadMeters();
}

/* Tulis semua tumpukan ke read-stats/{tanggal-WIB} lewat batchWrite
 * (increment atomik per sumber + updatedAt). Kembalikan
 * { flushed, sources } — sources berisi yang berhasil ditulis.
 * Bila sudah ada flush berjalan, kembalikan janji flush itu. */
export async function flushReadMeters({
  fetchImpl = fetch,
  projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  nowMs = Date.now(),
} = {}) {
  if (flushing) return flushing;
  const entries = [...pending.entries()].filter(([, n]) => n > 0);
  if (entries.length === 0) return { flushed: false, sources: {} };
  if (!projectId || !apiKey) return { flushed: false, sources: {} };
  for (const [source] of entries) pending.set(source, 0);
  flushing = (async () => {
    try {
      const date = wibDate(nowMs);
      const docName =
        `projects/${projectId}/databases/(default)/documents` +
        `/read-stats/${date}`;
      const base =
        `https://firestore.googleapis.com/v1/projects/${projectId}` +
        `/databases/(default)`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      let res;
      try {
        res = await fetchImpl(
          `${base}/documents:batchWrite?key=${apiKey}`,
          {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              writes: [
                /* SATU Write dengan update + updateTransforms
                 * (semantik set-with-merge SDK): membuat dokumen
                 * bila belum ada (tanpa precondition exists), dan
                 * increment diterapkan atomik sesudah update —
                 * tanpa baca dulu, tanpa balapan antar-instance.
                 * Dua desain sebelumnya SALAH dan diperbaiki di
                 * sini (P-06): (1) update terpisah dengan
                 * updateMask pada dokumen yang belum ada
                 * mengembalikan 404 dan menggagalkan SELURUH batch;
                 * (2) satu transform per sumber melanggar batas
                 * "paling banyak satu transform per dokumen per
                 * request" (write.proto). */
                {
                  update: {
                    name: docName,
                    fields: {
                      updatedAt: {
                        stringValue: new Date(nowMs).toISOString(),
                      },
                    },
                  },
                  updateMask: { fieldPaths: ["updatedAt"] },
                  updateTransforms: entries.map(([source, count]) => ({
                    fieldPath: `sources.${source}`,
                    increment: { integerValue: String(count) },
                  })),
                },
              ],
            }),
          },
        );
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const doneAt = Date.now();
      for (const [source] of entries) lastFlushAt.set(source, doneAt);
      return { flushed: true, sources: Object.fromEntries(entries) };
    } catch (err) {
      for (const [source, count] of entries) {
        pending.set(source, (pending.get(source) || 0) + count);
      }
      emitObservabilityEvent({
        code: OBS_CODES.METERING_FAILED,
        component: "read-meter",
        message: "Flush pengukur baca gagal.",
        meta: {
          reason:
            err && err.name === "AbortError" ? "timeout" : "network",
        },
      });
      return { flushed: false, sources: {} };
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
