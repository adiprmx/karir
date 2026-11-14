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
 * menandai seberapa dekat batas lamar. */
export function daysUntil(value) {
  const t = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.round((t - todayUtc) / 86400000);
}
