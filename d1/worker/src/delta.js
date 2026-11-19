/* Logika murni Worker API karir-data (P-08, H1) — tanpa binding D1,
 * supaya dapat diuji dengan node:test tanpa akun Cloudflare.
 *
 * Kontrak delta (by marker):
 * - Klien menyimpan salinan katalog + rev terakhir yang ia miliki.
 * - GET /v1/delta?rev=N mengembalikan hanya baris yang berubah
 *   sejak rev N (WHERE rev > N). Bila N sama dengan rev saat ini,
 *   `changed` kosong — 0 baris data dibaca selain hitungan rev.
 * - rev=0 (atau tanpa parameter) = snapshot awal: seluruh baris.
 *   Ini SATU-SATUNYA pembacaan penuh, terjadi sekali per masa hidup
 *   cache klien — bukan refill penuh per kunjungan (yang dihapus
 *   syarat §11.1).
 * - Katalog tidak pernah menghapus baris (perusahaan hanya berubah
 *   status), jadi `removed` selalu [] dan dipertahankan di kontrak
 *   untuk kompatibilitas ke depan.
 *
 * 13 field publik per perusahaan (sama dengan CSV/Firestore):
 * no, perusahaan, kategori, link_karir, status, tanggal_cek,
 * catatan, lokasi, posisi, email_hrd, wa_hrd, kontak_lain,
 * batas_lamar. Field `gagal_cek` hanya disertakan bila > 0 (sama
 * seperti docToCompany di web/lib/companies.js). */

/* 13 field yang dibandingkan pada verifikasi baca-balik impor. */
export const COMPANY_FIELDS = [
  "no",
  "perusahaan",
  "kategori",
  "link_karir",
  "status",
  "tanggal_cek",
  "catatan",
  "lokasi",
  "posisi",
  "email_hrd",
  "wa_hrd",
  "kontak_lain",
  "batas_lamar",
];

/* Urutkan parameter rev dari query string. Kembalikan null bila
 * tidak ada (pemanggil memakai 0 = snapshot awal), atau bila
 * bukan bilangan bulat >= 0 (pemanggil menjawab 400). */
export function parseRev(value) {
  if (value === null || value === undefined || value === "") return null;
  if (!/^\d+$/.test(value)) return NaN;
  return Number(value);
}

/* Batas paginasi daftar: default 100, maksimum 500. Nilai di luar
 * rentang dijepit; bukan angka -> default. */
export function parsePagination(searchParams) {
  /* PERHATIAN: Number(null) === 0, jadi parameter yang tidak ada
   * WAJIB dicek null dulu — kalau tidak, limit default 100 berubah
   * menjadi 1 (dijepit dari 0). */
  const rawLimit = searchParams.get("limit");
  const rawOffset = searchParams.get("offset");
  const parsedLimit = rawLimit === null ? NaN : Number(rawLimit);
  const parsedOffset = rawOffset === null ? NaN : Number(rawOffset);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(500, Math.max(1, Math.floor(parsedLimit)))
    : 100;
  const offset = Number.isFinite(parsedOffset)
    ? Math.max(0, Math.floor(parsedOffset))
    : 0;
  return { limit, offset };
}

/* Baris D1 -> objek perusahaan publik (13 field + gagal_cek bila
 * ada). `rev` dan `updated_at` adalah metadata internal D1 dan
 * TIDAK diekspos per baris (rev global ada di respons delta). */
export function rowToCompany(row) {
  const company = {
    no: row.no,
    perusahaan: row.perusahaan ?? "",
    kategori: row.kategori ?? "",
    link_karir: row.link_karir ?? "",
    status: row.status ?? "",
    tanggal_cek: row.tanggal_cek ?? "",
    catatan: row.catatan ?? "",
    lokasi: row.lokasi ?? "",
    posisi: row.posisi ?? "",
    email_hrd: row.email_hrd ?? "",
    wa_hrd: row.wa_hrd ?? "",
    kontak_lain: row.kontak_lain ?? "",
    batas_lamar: row.batas_lamar ?? "",
  };
  if (row.gagal_cek) company.gagal_cek = row.gagal_cek;
  return company;
}

/* Bentuk respons delta. `changed` sudah dalam bentuk publik. */
export function buildDeltaResponse({ rev, updatedAt, changed, total }) {
  return {
    rev,
    updatedAt,
    changed,
    removed: [],
    total,
    source: "d1",
  };
}

/* Respons error terstruktur. `source: "unavailable"` memberi tahu
 * klien (web/lib/companies.js) untuk jatuh ke Firestore lalu seed —
 * Worker TIDAK PERNAH membaca Firestore/seed sendiri; rantai
 * fallback hidup di sisi Vercel (lihat src/client.mjs). */
export function errorBody(code, message) {
  return { error: { code, message }, source: "unavailable" };
}
