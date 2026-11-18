/* Autentikasi gabungan endpoint cron Karir (P-05).
 *
 * Satu modul untuk ketiga route cron (recheck, cleanup, digest),
 * menggantikan duplikasi cek CRON_SECRET di tiap route (semangat
 * konsolidasi BE2-24, P-04). Dua jalur autentikasi, keduanya
 * fail-closed:
 *
 * 1. Bearer CRON_SECRET — dipakai Vercel Cron (selama masa
 *    transisi) dan workflow GitHub Actions (utama). Perbandingan
 * timing-safe. Workflow Actions mengirim header tambahan
 * `X-Karir-Trigger: github-actions` sebagai LABEL pemicu
 * (informasi observabilitas, BUKAN autentikasi — nilainya
 * dibersihkan ke [a-z0-9-] dan tidak pernah memengaruhi
 * keputusan izin).
 * 2. Signature QStash — header `Upstash-Signature` (JWT HS256,
 *    lihat lib/qstash-verify.js). Dipakai jadwal QStash sebagai
 *    pemicu cadangan. Bila kunci penandatanganan belum dipasang
 *    di env, jalur ini nonaktif dan request QStash ditolak.
 *
 * Urutan: Bearer dicek dulu, lalu signature QStash. Tanpa
 * CRON_SECRET, endpoint menjawab "unconfigured" (route mengubah
 * menjadi 503 generik) — perilaku fail-closed lama dipertahankan:
 * endpoint cron tidak pernah berjalan tanpa secret terpasang,
 * lewat jalur mana pun.
 *
 * Kembalian: { ok, via, trigger, error }.
 * - ok: true -> via "cron-secret" | "qstash"; trigger label
 *   pemicu untuk heartbeat + kunci idempotency ("github-actions",
 *   "qstash", atau "cron-secret" bila tidak ada label).
 * - ok: false -> error "unconfigured" (route jawab 503) atau
 *   "unauthorized" (route jawab 401 generik, tanpa menyebut jalur
 *   mana yang gagal — pemanggil anonim tidak boleh memetakan
 *   konfigurasi auth dari balasan). */
import { timingSafeEqual } from "node:crypto";
import { requireEnv } from "./require-env.js";
import { verifyQstashSignature } from "./qstash-verify.js";

/* Bersihkan label pemicu dari header: huruf kecil, angka, strip,
 * maks 32 karakter. Nilai lain (termasuk header tidak ada) menjadi
 * "cron-secret" — label untuk Vercel Cron / pemicu manual. Label
 * ini hanya informasi; tidak pernah dipakai mengambil keputusan
 * autentikasi maupun otorisasi. */
export function sanitizeTrigger(value) {
  if (typeof value !== "string") return "cron-secret";
  const cleaned = value.trim().toLowerCase();
  if (/^[a-z0-9-]{1,32}$/.test(cleaned)) return cleaned;
  return "cron-secret";
}

/* Perbandingan string timing-safe: panjang beda langsung gagal,
 * isi dibandingkan tanpa bocor lewat waktu. */
function secretsEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function authorizeCronRequest(request, { rawBody = "" } = {}) {
  let secret;
  try {
    secret = requireEnv("CRON_SECRET");
  } catch {
    return {
      ok: false,
      via: null,
      trigger: "unknown",
      error: "unconfigured",
    };
  }
  const auth = request.headers.get("authorization") || "";
  if (secretsEqual(auth, `Bearer ${secret}`)) {
    return {
      ok: true,
      via: "cron-secret",
      trigger: sanitizeTrigger(request.headers.get("x-karir-trigger")),
      error: null,
    };
  }
  const signature = request.headers.get("upstash-signature") || "";
  if (signature) {
    const result = verifyQstashSignature({
      signature,
      rawBody,
      url: request.url,
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || "",
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || "",
    });
    if (result.valid) {
      return {
        ok: true,
        via: "qstash",
        trigger: "qstash",
        error: null,
      };
    }
    console.warn(
      `Autentikasi QStash ditolak: ${result.reason}.`,
    );
    return {
      ok: false,
      via: null,
      trigger: "unknown",
      error: "unauthorized",
    };
  }
  return {
    ok: false,
    via: null,
    trigger: "unknown",
    error: "unauthorized",
  };
}
