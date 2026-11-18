/* Log terstruktur observabilitas Karir (P-06, rencana-observabilitas-
 * keamanan §1.2).
 *
 * Masalah yang ditutup: kegagalan di lapisan data dan route baca
 * selama ini ditelan diam-diam (BE2-02, BE2-10, BE2-11) — satu-satunya
 * jejak adalah log runtime Vercel Hobby yang hanya berumur 1 jam.
 * Modul ini adalah satu titik masuk pencatatan untuk semua titik itu:
 * satu baris JSON terstruktur per kejadian, throttled supaya tidak
 * membanjiri log, tanpa data sensitif, dan diteruskan ke sink
 * (Sentry + koleksi `incidents`) yang didaftarkan sekali saat boot
 * server (lihat instrumentation.js).
 *
 * Aturan yang dijaga di sini:
 * - Satu kegagalan, satu kode stabil (OBS_CODES) — supaya kejadian
 *   bisa didedup, dihitung, dan diberi alarm tanpa membaca teks bebas.
 * - Console throttled: paling banyak 1 baris per menit per kode per
 *   instance (pola createThrottledWarn di lib/rate-limit.js). Sink
 *   punya dedup sendiri yang lebih ketat (Sentry 1/jam/kode,
 *   incidents 1/15 menit/kode) — jadi sink menerima SEMUA kejadian
 *   dan memutuskan sendiri mana yang diteruskan.
 * - Tidak ada data sensitif di log: pesan dan meta dibersihkan
 *   (sanitizeMessage/sanitizeMeta) — kunci yang menyerupai secret,
 *   token, UID, email, atau IP tidak pernah tercatat; alamat email
 *   di dalam teks diganti penanda; pesan dipotong 500 karakter.
 * - Modul ini MURNI (tanpa jaringan, tanpa impor Sentry): sink
 *   didaftarkan dari luar supaya unit test bisa memasang sink tiruan
 *   dan supaya impor modul ini tidak pernah menarik SDK berat ke
 *   bundle klien. */

export const OBS_CODES = Object.freeze({
  MARKER_READ_FAILED: "MARKER_READ_FAILED",
  REFILL_FAILED_SEED_FALLBACK: "REFILL_FAILED_SEED_FALLBACK",
  METERING_FAILED: "METERING_FAILED",
  QUOTA_ALERT_FAILED: "QUOTA_ALERT_FAILED",
  SEED_LOAD_FAILED: "SEED_LOAD_FAILED",
  COMPANY_READ_FAILED: "COMPANY_READ_FAILED",
  API_ROUTE_ERROR: "API_ROUTE_ERROR",
  CRON_WRITE_FAILED: "CRON_WRITE_FAILED",
  SA_TOKEN_FAILED: "SA_TOKEN_FAILED",
  CLIENT_ERROR: "CLIENT_ERROR",
  PUSH_DIGEST_FAILED: "PUSH_DIGEST_FAILED",
});

/* Jeda throttle console: 1 baris per menit per kode per instance. */
export const OBS_CONSOLE_THROTTLE_MS = 60_000;

/* Panjang maksimum pesan log dan nilai meta (karakter). */
export const OBS_MAX_MESSAGE_CHARS = 500;
export const OBS_MAX_META_VALUE_CHARS = 300;
export const OBS_MAX_META_KEYS = 10;

/* Kunci meta yang TIDAK PERNAH dicatat — token, secret, kata sandi,
 * kunci API, cookie, sesi, UID, email, nomor telepon, dan IP
 * (mentah maupun pengenal yang bisa dilacak ke pengunjung).
 * Nilai yang kuncinya cocok diganti penanda, bukan dihapus, supaya
 * keberadaan field-nya tetap terlihat di log tanpa isinya.
 * Kata pendek (ip, key, pass) hanya cocok sebagai kata terpisah
 * (batas huruf, garis bawah, atau camelCase seperti clientIp) —
 * supaya kunci sah seperti "skipReason" atau "principal" tidak
 * ikut tersamarkan karena mengandung "ip" di tengah kata. */
const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|passwd|auth|cookie|session|private|bearer|vapid|signature|signing|endpoint|email|uid|user[_-]?id|phone|telp|api[_-]?key|apiKey|clientIp|(^|[^a-zA-Z])(ip|key|pass)([^a-zA-Z]|$)|_(ip|key|pass)$|^(ip|key|pass)_)/i;

/* Pola alamat email di dalam teks bebas (mis. pesan error yang
 * mengutip input pengguna) — diganti penanda. */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/* Kredensial di dalam URL (skema://user:pass@host) — diganti penanda. */
const URL_CREDENTIALS_PATTERN = /:\/\/[^/\s@]+@/g;

export function sanitizeMessage(message, maxChars = OBS_MAX_MESSAGE_CHARS) {
  if (typeof message !== "string") return "";
  /* Urutan penting: kredensial URL dulu — pola email akan ikut
   * cocok dengan "user:pass@host" bila jalan duluan. */
  let clean = message
    .replace(URL_CREDENTIALS_PATTERN, "://[kredensial]@")
    .replace(EMAIL_PATTERN, "[email]")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length > maxChars) clean = `${clean.slice(0, maxChars - 1)}…`;
  return clean;
}

/* Bersihkan meta: hanya nilai primitif (string/number/boolean/null)
 * yang lolos, kunci sensitif disamarkan, string dipotong, jumlah
 * kunci dibatasi. Objek/array bersarang diganti penanda — meta log
 * tidak pernah butuh struktur dalam. */
export function sanitizeMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const out = {};
  let kept = 0;
  for (const [key, value] of Object.entries(meta)) {
    if (kept >= OBS_MAX_META_KEYS) break;
    if (typeof key !== "string" || key.length === 0) continue;
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = "[disamarkan]";
      kept += 1;
      continue;
    }
    if (typeof value === "string") {
      out[key] = sanitizeMessage(value, OBS_MAX_META_VALUE_CHARS);
    } else if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
    } else {
      out[key] = "[nilai-kompleks]";
    }
    kept += 1;
  }
  return out;
}

const lastEmittedAt = new Map();
const sinks = new Set();

/* Daftarkan sink kejadian (mis. Sentry, incidents). Dipanggil sekali
 * saat boot server dari instrumentation.js; test mendaftarkan sink
 * tiruan. Sink TIDAK BOLEH melempar — emitObservabilityEvent
 * membungkus tiap pemanggilan sink dengan try/catch. */
export function registerObservabilitySink(fn) {
  if (typeof fn === "function") sinks.add(fn);
}

export function clearObservabilitySinks() {
  sinks.clear();
}

/* Kosongkan keadaan modul (dipakai test supaya tiap kasus mulai dari
 * keadaan bersih: throttle + sink direset bersama). */
export function resetObservabilityForTests() {
  lastEmittedAt.clear();
  sinks.clear();
}

/* Satu baris log terstruktur: { ts, level, code, component, message,
 * meta }. Kembalikan event yang diterbitkan (sudah dibersihkan)
 * supaya test bisa mengasersi isinya tanpa menangkap console.
 * `nowMs` bisa di-inject untuk test throttle. */
export function emitObservabilityEvent({
  code,
  level = "warn",
  component = "karir",
  message = "",
  meta = {},
  nowMs = Date.now(),
} = {}) {
  const event = {
    ts: new Date(nowMs).toISOString(),
    level,
    code: typeof code === "string" && code ? code : "UNKNOWN",
    component: typeof component === "string" ? component : "karir",
    message: sanitizeMessage(message),
    meta: sanitizeMeta(meta),
  };
  for (const sink of sinks) {
    try {
      sink(event);
    } catch {
      /* Sink gagal tidak boleh merusak pemanggil. */
    }
  }
  const last = lastEmittedAt.get(event.code) || 0;
  if (nowMs - last < OBS_CONSOLE_THROTTLE_MS) return event;
  lastEmittedAt.set(event.code, nowMs);
  console.warn(`[observability] ${JSON.stringify(event)}`);
  return event;
}
