/* Akses Sentry yang aman-gagal (P-06, riset-caching-observability
 * §4.5: Sentry Developer gratis sebagai penangkap error + cron
 * monitor untuk /api/cron/recheck).
 *
 * Prinsip fail-safe (Fase A: akun Sentry O-03 BELUM ADA, jadi DSN
 * belum dipasang):
 * - Tanpa env SENTRY_DSN, SDK tidak pernah dimuat dan semua fungsi
 *   di sini menjadi no-op diam — tanpa log, tanpa error, tanpa
 *   spam. Kode produksi tidak perlu memeriksa "apakah Sentry aktif"
 *   sebelum memanggil fungsi-fungsi ini.
 * - Bila paket @sentry/nextjs tidak terpasang (mis. di lingkungan
 *   test tanpa node_modules lengkap), impor dinamis gagal dan
 *   diperlakukan sama seperti "tidak terkonfigurasi".
 * - Semua fungsi TIDAK PERNAH melempar.
 *
 * Dua jalur pemakaian:
 * 1. sentrySink(event) — sink observabilitas (didaftarkan di
 *    instrumentation.js): tiap kode kejadian dikirim paling banyak
 *    sekali per jam per instance (dedup), supaya satu error berulang
 *    tidak menghabiskan kuota 5.000 error/bulan. Tanpa dedup, satu
 *    error per menit menghabiskan kuota dalam ±3,5 hari (risiko R-4).
 * 2. checkInCron(...) — check-in cron monitor recheck harian.
 *    Check-in "in_progress" di awal run menyertakan monitorConfig,
 *    sehingga Sentry MEMBUAT monitornya otomatis pada check-in
 *    pertama (tidak perlu membuat monitor manual di dasbor — tetapi
 *    parent tetap diminta memeriksa + mengaktifkan alert-nya, lihat
 *    docs/sentry-setup.md). Tanpa DSN, tidak ada check-in.
 *
 * Privasi (gerbang Red P-06): tidak ada data pribadi pengguna yang
 * dikirim ke Sentry — scrubSentryEvent (dipakai sebagai beforeSend
 * di sentry.server.config.js dan instrumentation-client) menghapus
 * user, header, dan cookie request, serta menyamarkan kunci sensitif
 * di contexts/extra/tags dan menyamarkan email di dalam teks.
 * Konteks yang dikirim sink ini hanya meta yang sudah dibersihkan
 * sanitizeMeta (lib/observability.js). */

import { sanitizeMessage, sanitizeMeta } from "./observability.js";

/* Dedup pengiriman error: 1 per jam per kode per instance. */
export const SENTRY_DEDUP_MS = 60 * 60 * 1000;

/* Slug monitor cron default (bisa diubah lewat env
 * SENTRY_CRON_MONITOR_SLUG). */
export const DEFAULT_CRON_MONITOR_SLUG = "karir-recheck";

/* Jadwal recheck harian 01:00 WIB = 18:00 UTC. checkinMargin 15
 * menit menoleransi keterlambatan scheduler; maxRuntime 5 menit
 * (run normal < 60 detik, anggaran internal 50 detik). */
export function cronMonitorConfig() {
  return {
    schedule: { type: "crontab", value: "0 18 * * *" },
    checkinMargin: 15,
    maxRuntime: 5,
    timezone: "Asia/Jakarta",
  };
}

const lastSentAt = new Map();
let sentryModulePromise = null;
let sentryImplOverride = null;

/* Suntik implementasi Sentry tiruan (dipakai test). */
export function __setSentryImpl(impl) {
  sentryImplOverride = impl;
}

/* Kosongkan keadaan modul (dipakai test). */
export function __resetSentryForTests() {
  sentryImplOverride = null;
  lastSentAt.clear();
  sentryModulePromise = null;
}

export function isSentryConfigured(env = process.env) {
  return Boolean(env && env.SENTRY_DSN);
}

/* Muat SDK sekali, cache janji-nya. Kembalikan null bila DSN tidak
 * dipasang atau paket tidak tersedia. */
async function loadSentry() {
  if (sentryImplOverride) return sentryImplOverride;
  if (!isSentryConfigured()) return null;
  if (!sentryModulePromise) {
    sentryModulePromise = import("@sentry/nextjs").catch(() => null);
  }
  return sentryModulePromise;
}

/* Sink observabilitas: kirim satu exception per kode per jam.
 * Kembalikan true bila benar-benar dikirim (dipakai test). */
export async function sentrySink(event) {
  try {
    if (!event || typeof event.code !== "string") return false;
    /* P-07: kejadian level "info" (mis. progres per halaman
     * digest) adalah kabar rutin, bukan masalah — tidak pernah
     * menjadi exception Sentry. */
    if (event.level === "info") return false;
    const now = Date.now();
    const last = lastSentAt.get(event.code) || 0;
    if (now - last < SENTRY_DEDUP_MS) return false;
    const Sentry = await loadSentry();
    if (!Sentry || typeof Sentry.captureException !== "function") {
      return false;
    }
    lastSentAt.set(event.code, now);
    const err = new Error(event.message || event.code);
    err.name = `ObservabilityError:${event.code}`;
    Sentry.captureException(err, {
      tags: {
        observability_code: event.code,
        component: event.component || "unknown",
      },
      extra: sanitizeMeta(event.meta || {}),
    });
    return true;
  } catch {
    return false;
  }
}

/* Check-in cron monitor. `status`: "in_progress" | "ok" | "error".
 * Sertakan monitorConfig pada check-in in_progress (awal run)
 * supaya monitor dibuat/di-upsert otomatis oleh Sentry.
 * Kembalikan checkInId (string) bila dikirim, null bila tidak
 * (tanpa DSN / tanpa SDK / gagal). */
export async function checkInCron({
  status,
  checkInId = undefined,
  monitorSlug = process.env.SENTRY_CRON_MONITOR_SLUG ||
    DEFAULT_CRON_MONITOR_SLUG,
  includeConfig = false,
} = {}) {
  try {
    if (status !== "in_progress" && status !== "ok" && status !== "error") {
      return null;
    }
    const Sentry = await loadSentry();
    if (!Sentry || typeof Sentry.captureCheckIn !== "function") {
      return null;
    }
    const payload = { monitorSlug, status };
    if (checkInId) payload.checkInId = checkInId;
    if (includeConfig) payload.monitorConfig = cronMonitorConfig();
    const id = Sentry.captureCheckIn(payload);
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

/* Kirim antrean event yang tertunda (dipakai di akhir run cron
 * supaya check-in tidak hilang saat fungsi serverless dibekukan).
 * Best-effort, tidak pernah melempar. */
export async function flushSentry(timeoutMs = 2000) {
  try {
    const Sentry = await loadSentry();
    if (Sentry && typeof Sentry.flush === "function") {
      await Sentry.flush(timeoutMs);
    }
  } catch {
    /* Flush gagal tidak boleh merusak pemanggil. */
  }
}

/* Pembersih event Sentry untuk beforeSend: hapus user, header, dan
 * cookie request; samarkan kunci sensitif di contexts/extra/tags;
 * samarkan email dan potong teks panjang. Fungsi murni (tidak
 * mengubah event asli) supaya bisa diuji unit. */
const SENSITIVE_EVENT_KEY =
  /(token|secret|password|passwd|auth|cookie|session|private|bearer|vapid|signature|signing|endpoint|email|uid|user[_-]?id|phone|telp|api[_-]?key|apiKey|clientIp|(^|[^a-zA-Z])(ip|key|pass)([^a-zA-Z]|$)|_(ip|key|pass)$|^(ip|key|pass)_)/i;

function scrubDeep(value, depth = 0) {
  if (depth > 4) return "[terpotong]";
  if (Array.isArray(value)) {
    return value.map((v) => scrubDeep(v, depth + 1));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_EVENT_KEY.test(k)) {
        out[k] = "[disamarkan]";
      } else {
        out[k] = scrubDeep(v, depth + 1);
      }
    }
    return out;
  }
  if (typeof value === "string") return sanitizeMessage(value);
  return value;
}

export function scrubSentryEvent(event) {
  if (!event || typeof event !== "object") return event;
  const clean = { ...event };
  delete clean.user;
  if (clean.request && typeof clean.request === "object") {
    const req = { ...clean.request };
    delete req.headers;
    delete req.cookies;
    if (typeof req.url === "string") req.url = sanitizeMessage(req.url);
    clean.request = req;
  }
  if (clean.contexts) clean.contexts = scrubDeep(clean.contexts);
  if (clean.extra) clean.extra = scrubDeep(clean.extra);
  if (clean.tags) clean.tags = scrubDeep(clean.tags);
  if (Array.isArray(clean.breadcrumbs)) {
    clean.breadcrumbs = clean.breadcrumbs.map((b) => {
      if (!b || typeof b !== "object") return b;
      const crumb = { ...b };
      if (crumb.data) crumb.data = scrubDeep(crumb.data);
      if (typeof crumb.message === "string") {
        crumb.message = sanitizeMessage(crumb.message);
      }
      return crumb;
    });
  }
  if (typeof clean.message === "string") {
    clean.message = sanitizeMessage(clean.message);
  }
  return clean;
}
