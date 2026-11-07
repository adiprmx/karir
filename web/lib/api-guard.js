/* Penjaga API Karir: token berumur pendek, deteksi UA otomatis, dan
 * batas laju di memori. Logika murni, tanpa Next.js, supaya bisa diuji
 * unit dengan node:test. Tidak ada fungsi di sini yang mencatat secret,
 * token, atau IP mentah ke mana pun. */
import { createHmac, timingSafeEqual } from "node:crypto";

/* Umur token default 60 detik. */
export const TOKEN_MAX_AGE_SEC = 60;

/* Jendela batas laju default 60 detik. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/* Pola UA otomatis yang jelas: alat baris perintah dan pustaka HTTP,
 * bukan browser. UA kosong ditangani terpisah di isBotUa. */
const BOT_UA_PATTERN =
  /(?:curl|wget|python-requests|python-urllib|scrapy|go-http-client|httpie|libwww-perl|java\/)/i;

/* Buat token: detik terbit + HMAC-SHA256 atas detik itu dengan secret.
 * Format: "<detik>.<hmac-heksa>". */
export function issueToken(secret, nowSec = Math.floor(Date.now() / 1000)) {
  const ts = String(nowSec);
  const sig = createHmac("sha256", secret)
    .update(`karir-api-token:${ts}`)
    .digest("hex");
  return `${ts}.${sig}`;
}

/* Periksa token. Benar hanya bila bentuknya utuh, tanda tangannya cocok
 * dengan secret, dan umurnya tidak lebih dari maxAgeSec detik.
 * Token dari masa depan ditolak: jam terbit dan jam periksa sama-sama
 * jam server, jadi tidak ada alasan token lebih baru dari sekarang. */
export function verifyToken(token, secret, maxAgeSec = TOKEN_MAX_AGE_SEC) {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [tsText, sig] = parts;
  if (!/^\d+$/.test(tsText) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const issuedAt = Number(tsText);
  const nowSec = Math.floor(Date.now() / 1000);
  if (issuedAt > nowSec) return false;
  if (nowSec - issuedAt > maxAgeSec) return false;
  const expected = createHmac("sha256", secret)
    .update(`karir-api-token:${tsText}`)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* Benar bila UA kosong atau cocok pola otomatis yang jelas. UA browser
 * biasa, termasuk browser HP, lolos. */
export function isBotUa(ua) {
  if (typeof ua !== "string" || ua.trim() === "") return true;
  return BOT_UA_PATTERN.test(ua);
}

/* Batas laju di memori per kunci (dipakai per hash IP). Kembalikan true
 * bila request masih dalam batas dan dicatat, false bila sudah lewat
 * batas. Pola yang sama dengan /api/admin/check-link: jendela geser,
 * entri lama dibuang. Map diteruskan dari route supaya tiap route punya
 * hitungannya sendiri. */
export function checkRateLimit(
  hits,
  key,
  limit,
  windowMs = RATE_LIMIT_WINDOW_MS,
  now = Date.now(),
) {
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    if (list.length === 0) hits.delete(key);
    else hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  return true;
}

/* Ambil IP klien dari header proxy. Dipakai hanya untuk hash dan batas
 * laju, lalu dibuang; jangan pernah mencatat atau menyimpan hasilnya. */
export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
