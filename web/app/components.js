/* Pembantu kecil yang aman dipakai di server maupun klien. */
export { formatDate, daysSince, daysUntil, deadlineInfo } from "@/lib/dates";

export function safeLink(url) {
  return typeof url === "string" && /^https?:\/\//.test(url);
}

/* Penjelasan satu kalimat per status, diambil dari makna yang sudah
 * ditulis di FAQ dan halaman Metode, bukan klaim baru. */
export const STATUS_EXPLAIN = {
  "Ada lowongan target":
    "Saat dicek, portal ini punya lowongan untuk posisi target.",
  "Ada lowongan target (tidak cocok)":
    "Saat dicek, ada lowongan, tetapi syaratnya tidak cocok.",
  "Tidak ada lowongan target":
    "Saat dicek, tidak ada lowongan untuk posisi target.",
  "Tidak ada lowongan terlihat":
    "Saat dicek, tidak ada lowongan yang terlihat di portal.",
  "Tidak dapat diverifikasi":
    "Lowongannya tidak bisa diverifikasi (halaman kosong atau perlu login). Itu bukan berarti tidak ada lowongan.",
  "Portal tidak bisa dibuka":
    "Portal gagal dibuka saat dicek. Itu bukan bukti tidak ada lowongan.",
};
