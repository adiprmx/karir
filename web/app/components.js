/* Pembantu kecil yang aman dipakai di server maupun klien. */

export function safeLink(url) {
  return typeof url === "string" && /^https?:\/\//.test(url);
}

/* Penjelasan satu kalimat per status, diambil dari makna yang sudah
 * ditulis di FAQ dan halaman Tentang, bukan klaim baru. */
export const STATUS_EXPLAIN = {
  "Ada lowongan":
    "Saat dicek, portal ini punya lowongan aktif.",
  "Tidak ada lowongan":
    "Saat dicek, portal ini tidak punya lowongan aktif.",
  "Tidak dapat diverifikasi":
    "Lowongannya tidak bisa diverifikasi (halaman kosong atau perlu login). Itu bukan berarti tidak ada lowongan.",
  "Portal tidak bisa dibuka":
    "Portal gagal dibuka saat dicek. Itu bukan bukti tidak ada lowongan.",
};

/* "2026-11-05" menjadi "5 Nov 2026". */
export function formatDate(value, locale = "id") {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString(locale === "en" ? "en-GB" : "id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* Selisih hari dari tanggal cek sampai sekarang, atau null. */
export function daysSince(value) {
  const t = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

/* Selisih hari dari sekarang sampai tanggal ISO ("2026-11-15" bila hari
 * ini 2026-11-14 = 1). Negatif bila tanggal sudah lewat, null bila
 * bukan tanggal ISO yang valid. Dipakai halaman detail untuk
 * menandai seberapa dekat batas lamar.
 * "Hari ini" dihitung dalam WIB (UTC+7), bukan UTC: batas lamar adalah
 * tanggal kalender Indonesia dan pengunjungnya di Indonesia — memakai
 * UTC membuat penanda meleset satu hari pada 00:00–07:00 WIB. */
export function daysUntil(value) {
  const t = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const nowWib = new Date(Date.now() + 7 * 3600 * 1000);
  const todayWib = Date.UTC(
    nowWib.getUTCFullYear(),
    nowWib.getUTCMonth(),
    nowWib.getUTCDate(),
  );
  return Math.round((t - todayWib) / 86400000);
}

/* ---------- Kanal melamar (DET-02/03/04) ---------- */

/* Pecah field kanal yang berisi beberapa nilai ("a; b, c/d") menjadi
 * daftar nilai mentah. Pemisah: titik koma, koma, garis miring.
 * Spasi/strip di dalam tiap nilai dipertahankan untuk tampilan;
 * bagian kosong dibuang. */
export function splitContacts(value) {
  return String(value || "")
    .split(/[;,\/]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/* Normalisasi satu nomor WhatsApp ke tautan wa.me: buang spasi/strip,
 * awalan 0 diganti 62. Null bila tidak ada digit sama sekali.
 * Dipakai per nomor sesudah splitContacts, supaya dua nomor tidak
 * tergabung jadi satu tautan ke nomor yang tidak ada (DET-03). */
export function waLink(number) {
  const digits = String(number || "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const intl = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

/* Akhiran domain yang dikenali saat mengubah teks bebas menjadi tautan.
 * Daftar sengaja pendek dan berisi akhiran umum saja: domain tanpa
 * skema yang akhirannya tidak ada di sini dibiarkan teks biasa (gagal
 * aman), supaya singkatan alamat seperti "Jl. Tebet" tidak pernah
 * dikira domain. Akhiran bertingkat (co.id, ac.id, go.id) tertangani
 * lewat label terakhirnya ("id"). */
const BARE_TLDS = [
  "id", "com", "net", "org", "io", "me", "co", "ai", "app", "dev",
  "info", "biz", "xyz", "site", "online", "link", "page", "live",
  "club", "store", "tech", "ly", "ke", "gg", "to", "cc", "us",
  "sg", "my", "au", "de", "jp", "in", "vn", "ph", "kr",
];

/* Pola tautan dalam teks bebas, diuji berurutan di tiap posisi: URL
 * ber-skema dulu, lalu email, lalu domain tanpa skema. */
const LINK_PATTERN = new RegExp(
  `(https?:\\/\\/[^\\s<>"']+)` +
    `|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})` +
    `|((?:[A-Za-z0-9-]+\\.)+(?:${BARE_TLDS.join("|")})(?:\\/[^\\s<>"'(),;]*)?)`,
  "gi",
);

/* Tanda baca di ujung tautan yang hampir pasti milik kalimat, bukan
 * milik tautan ("lihat https://contoh.id/karir, lalu ..."). */
const TRAILING_PUNCT = ".,;:!?\"'’)]}";

function trimTrailingPunct(raw) {
  let end = raw.length;
  while (end > 0 && TRAILING_PUNCT.includes(raw[end - 1])) end -= 1;
  return raw.slice(0, end);
}

/* Ubah teks bebas menjadi potongan teks/tautan: { text } untuk teks
 * biasa, { text, href } untuk tautan. Dipakai halaman detail untuk
 * kontak_lain dan catatan (DET-02). Murni pemotong string: tidak ada
 * HTML yang dibangun di sini, render dilakukan React biasa di page.js,
 * jadi tidak ada risiko injeksi markup. Href yang dihasilkan hanya
 * http(s):// (skema asli dipertahankan) atau mailto:. */
export function linkifySegments(text) {
  const input = String(text || "");
  const segments = [];
  let cursor = 0;
  LINK_PATTERN.lastIndex = 0;
  let m;
  while ((m = LINK_PATTERN.exec(input)) !== null) {
    const raw = m[0];
    const start = m.index;
    /* Domain tanpa skema yang menempel pada token lain (mis. bagian
     * dari alamat email yang lolos dari pola email) bukan tautan:
     * lewati dan lanjutkan pencarian satu karakter sesudahnya. */
    const prev = start > 0 ? input[start - 1] : "";
    if (m[3] && /[A-Za-z0-9.@\/]/.test(prev)) {
      LINK_PATTERN.lastIndex = start + 1;
      continue;
    }
    const clean = trimTrailingPunct(raw);
    if (start > cursor) segments.push({ text: input.slice(cursor, start) });
    const href = m[1]
      ? clean
      : m[2]
        ? `mailto:${clean}`
        : `https://${clean}`;
    segments.push({ text: clean, href });
    /* Tanda baca yang dipotong tetap jadi teks biasa di potongan
     * berikutnya, jadi kursor berhenti di ujung tautan bersih. */
    cursor = start + clean.length;
    LINK_PATTERN.lastIndex = cursor;
  }
  if (cursor < input.length) segments.push({ text: input.slice(cursor) });
  return segments;
}
