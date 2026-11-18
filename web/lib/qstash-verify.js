/* Verifikasi signature QStash (P-05, pemicu cadangan).
 *
 * QStash mengirim JWT di header `Upstash-Signature` pada tiap
 * request. JWT ditandatangani HS256 (HMAC-SHA256) dengan kunci
 * penandatanganan akun Upstash (bukan RS256/JWKS — dikonfirmasi
 * dari dokumentasi resmi Upstash, dibuka langsung 18 Nov 2026:
 * https://upstash.com/docs/qstash/howto/signature — "signed by your
 * individual secret signing key"). Dua kunci dipakai (current +
 * next) supaya rotasi kunci tidak memutus verifikasi: coba current
 * dulu, lalu next.
 *
 * Klaim yang diperiksa (sesuai dokumentasi + implementasi SDK
 * resmi @upstash/qstash Receiver):
 * - header.alg HARUS "HS256" — "none" atau algoritma lain ditolak
 *   sebelum verifikasi apa pun (mencegah algorithm confusion).
 * - iss HARUS "Upstash".
 * - sub HARUS sama persis dengan URL endpoint ini (URL tujuan
 *   yang didaftarkan di jadwal QStash). Signature untuk endpoint
 *   lain tidak bisa dipakai ulang di sini (anti-replay antar
 *   endpoint).
 * - exp belum lewat; nbf sudah berlaku. Tenggang jam 60 detik
 *   menutup skew jam server (JWT QStash berumur 5 menit).
 * - body HARUS sama dengan hash SHA-256 dari raw body request,
 *   di-encode base64url. Untuk request GET (tanpa body), hash
 *   dari string kosong.
 *
 * Kunci dibaca dari env QSTASH_CURRENT_SIGNING_KEY dan
 * QSTASH_NEXT_SIGNING_KEY (diambil dari Upstash Console, dipasang
 * di env Vercel — lihat docs/qstash-setup.md). Bila current key
 * belum dipasang, jalur QStash nonaktif (fail-closed): request
 * dengan signature QStash ditolak, jalur CRON_SECRET tidak
 * terpengaruh. Modul ini murni sinkron, tanpa fetch dan tanpa
 * dependensi baru (node:crypto saja).
 *
 * PENTING: sub harus sama persis dengan request.url yang diterima
 * server. Jadwal QStash WAJIB memakai URL kanonis tanpa garis
 * miring akhir (mis. https://karir-adiprmx.vercel.app/api/cron/recheck)
 * — perbedaan satu karakter saja membuat verifikasi gagal. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const QSTASH_ISSUER = "Upstash";
/* Tenggang jam untuk klaim exp/nbf (detik). */
export const QSTASH_CLOCK_LEEWAY_SECONDS = 60;

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function base64urlDecode(text) {
  if (typeof text !== "string" || !BASE64URL_RE.test(text)) {
    throw new Error("Bukan base64url.");
  }
  return Buffer.from(text, "base64url");
}

export function base64urlEncode(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

/* Hash SHA-256 raw body, base64url — bentuk klaim `body` QStash. */
export function hashRawBody(rawBody) {
  return createHash("sha256").update(rawBody ?? "", "utf8").digest().toString("base64url");
}

function safeEqualString(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/* Verifikasi satu signature QStash. Kembalikan { valid, reason }:
 * reason "ok" bila valid; bila tidak, salah satu dari:
 * "missing-signature" | "not-configured" | "malformed" |
 * "bad-alg" | "bad-signature" | "bad-issuer" | "bad-subject" |
 * "expired" | "not-yet-valid" | "bad-body". Alasan dipakai log
 * server (bukan balasan klien — balasan tetap 401 generik). */
export function verifyQstashSignature({
  signature,
  rawBody = "",
  url,
  currentSigningKey = "",
  nextSigningKey = "",
  nowMs = Date.now(),
}) {
  if (!signature) return { valid: false, reason: "missing-signature" };
  if (!currentSigningKey) return { valid: false, reason: "not-configured" };
  const parts = String(signature).split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed" };
  /* Header dicek DULU (sebelum decode signature): JWT alg "none"
   * dengan signature kosong harus ditolak sebagai bad-alg, bukan
   * lolos ke tahap berikutnya dengan alasan format. */
  let header;
  try {
    header = JSON.parse(base64urlDecode(parts[0]).toString("utf8"));
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (!header || header.alg !== "HS256") {
    return { valid: false, reason: "bad-alg" };
  }
  let payload;
  let signatureBytes;
  try {
    payload = JSON.parse(base64urlDecode(parts[1]).toString("utf8"));
    signatureBytes = base64urlDecode(parts[2]);
  } catch {
    return { valid: false, reason: "malformed" };
  }
  const signingInput = `${parts[0]}.${parts[1]}`;
  const keys = [currentSigningKey, nextSigningKey].filter(Boolean);
  let signatureOk = false;
  for (const key of keys) {
    const expected = createHmac("sha256", key)
      .update(signingInput, "utf8")
      .digest();
    if (
      expected.length === signatureBytes.length &&
      timingSafeEqual(expected, signatureBytes)
    ) {
      signatureOk = true;
      break;
    }
  }
  if (!signatureOk) return { valid: false, reason: "bad-signature" };
  if (!payload || payload.iss !== QSTASH_ISSUER) {
    return { valid: false, reason: "bad-issuer" };
  }
  if (payload.sub !== url) return { valid: false, reason: "bad-subject" };
  const nowSec = Math.floor(nowMs / 1000);
  if (
    typeof payload.exp !== "number" ||
    payload.exp + QSTASH_CLOCK_LEEWAY_SECONDS < nowSec
  ) {
    return { valid: false, reason: "expired" };
  }
  if (
    typeof payload.nbf === "number" &&
    payload.nbf - QSTASH_CLOCK_LEEWAY_SECONDS > nowSec
  ) {
    return { valid: false, reason: "not-yet-valid" };
  }
  if (!safeEqualString(payload.body, hashRawBody(rawBody))) {
    return { valid: false, reason: "bad-body" };
  }
  return { valid: true, reason: "ok" };
}
