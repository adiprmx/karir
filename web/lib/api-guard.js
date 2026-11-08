/* Penjaga API Karir: token berumur pendek, deteksi UA otomatis, dan
 * batas laju. Logika murni, tanpa Next.js, supaya bisa diuji unit
 * dengan node:test. Tidak ada fungsi di sini yang mencatat secret,
 * token, atau IP mentah ke mana pun.
 *
 * Batas laju bersama tinggal di lib/rate-limit.js (store Redis,
 * Firestore, atau memori). checkRateLimit di bawah ini tetap ada
 * sebagai pembantu memori sinkron untuk test dan kompatibilitas;
 * route produksi memakai limiter bersama lewat getSharedLimiter. */
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
 * hitungannya sendiri.
 *
 * Catatan: pembantu ini hanya hidup di memori satu instance dan
 * hilang tiap cold start. Route produksi memakai limiter bersama
 * dari lib/rate-limit.js; fungsi ini dipertahankan supaya test lama
 * dan pemakaian sinkron tetap jalan. */
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
 * laju, lalu dibuang; jangan pernah mencatat atau menyimpan hasilnya.
 *
 * Pilihan sumber, dan alasannya:
 *   1. x-real-ip dulu. Di Vercel, edge yang menulis header ini, dan
 *      nilainya adalah IP yang langsung tersambung ke edge. Header
 *      ini tidak bisa dipalsukan pengirim karena edge menimpanya.
 *   2. Bila x-real-ip kosong, pakai elemen TERAKHIR x-forwarded-for.
 *      Elemen pertama JANGAN dipakai: siapa pun bisa menulis
 *      x-forwarded-for sendiri sebelum request sampai ke server,
 *      jadi elemen pertama adalah klaim pengirim, bukan fakta.
 *      Tiap proxy yang dilewati menambahkan IP yang dilihatnya di
 *      ujung rantai; elemen terakhir adalah IP yang dilihat proxy
 *      tepercaya paling ujung (edge Vercel), jadi itu yang paling
 *      bisa dipercaya dari rantai ini.
 * Keterbatasan yang jujur: di balik NAT atau proxy bersama, banyak
 * pengunjung sah bisa berbagi satu IP yang sama dan ikut kena batas
 * yang sama. Itu harga dari batas per IP, dan batas 30-60/menit
 * dipilih longgar supaya pemakaian normal tidak kena. */
export function getClientIp(request) {
  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.trim() !== "") return realIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p !== "");
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}
