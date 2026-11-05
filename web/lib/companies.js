/* Lapisan data Karir.
 * Sumber saat ini: data/companies.json (406 baris, dibuat dari
 * data/daftar-link-karir.csv). Setelah proyek Supabase dibuat, fungsi
 * di sini diganti membaca tabel `companies` — halaman tidak berubah,
 * karena mereka hanya memanggil fungsi di file ini. */

import companies from "../data/companies.json";

export function getCompanies() {
  return companies;
}

export function getTargets() {
  return companies
    .filter((c) => c.status === "Ada lowongan target")
    .sort((a, b) => a.perusahaan.localeCompare(b.perusahaan, "id"));
}

export function getCategories() {
  const seen = new Map();
  companies.forEach((c) => {
    if (c.kategori) seen.set(c.kategori, (seen.get(c.kategori) || 0) + 1);
  });
  return [...seen.keys()].sort((a, b) => a.localeCompare(b, "id"));
}

export const STATUS_ORDER = [
  "Ada lowongan target",
  "Ada lowongan target (tidak cocok)",
  "Tidak ada lowongan target",
  "Tidak ada lowongan terlihat",
  "Tidak dapat diverifikasi",
  "Portal tidak bisa dibuka",
];

export function getStats() {
  const total = companies.length;
  const byStatus = {};
  STATUS_ORDER.forEach((s) => {
    byStatus[s] = companies.filter((c) => c.status === s).length;
  });
  const byDate = {};
  companies.forEach((c) => {
    if (c.tanggal_cek) byDate[c.tanggal_cek] = (byDate[c.tanggal_cek] || 0) + 1;
  });
  return { total, byStatus, byDate };
}
