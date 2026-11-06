/* Lapisan data Karir — sumber: Firestore, koleksi `companies`
 * (proyek karir-9d53a). Dibaca lewat Firestore REST API (fetch biasa),
 * BUKAN SDK JS — gRPC SDK tidak bisa menembus proxy egress VM ini
 * (timeout 10 dtk lalu "offline mode" dan mengembalikan 0 baris),
 * sementara REST terbukti andal (impor 406 dokumen lewat jalur ini).
 * Baca publik diizinkan aturan (`allow read: if true`), kunci API
 * adalah konfigurasi klien publik, bukan rahasia.
 * Cache di memori server 5 menit; admin menulis wajib memanggil
 * revalidateCompanies() supaya cache dibersihkan. */

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null;
let cacheAt = 0;

export function revalidateCompanies() {
  cache = null;
  cacheAt = 0;
}

function docToCompany(d) {
  const f = d.fields || {};
  const s = (k) => (f[k] && f[k].stringValue != null ? f[k].stringValue : "");
  return {
    no: f.no && f.no.integerValue != null ? Number(f.no.integerValue) : 0,
    perusahaan: s("perusahaan"),
    kategori: s("kategori"),
    link_karir: s("link_karir"),
    status: s("status"),
    tanggal_cek: s("tanggal_cek"),
    catatan: s("catatan"),
    lokasi: s("lokasi"),
    posisi: s("posisi"),
  };
}

export async function getCompanies() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache;
  let docs = [];
  let token = "";
  do {
    const url =
      `${BASE}/companies?pageSize=300&key=${API_KEY}` +
      (token ? `&pageToken=${token}` : "");
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) {
      throw new Error(`Firestore list gagal: HTTP ${res.status}`);
    }
    const body = await res.json();
    docs = docs.concat(body.documents || []);
    token = body.nextPageToken || "";
  } while (token);
  const list = docs.map(docToCompany).sort((a, b) => a.no - b.no);
  cache = list;
  cacheAt = now;
  return list;
}

export async function getTargets() {
  const companies = await getCompanies();
  return companies
    .filter((c) => c.status === "Ada lowongan target")
    .sort((a, b) => a.perusahaan.localeCompare(b.perusahaan, "id"));
}

export async function getCategories() {
  const companies = await getCompanies();
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

export async function getStats() {
  const companies = await getCompanies();
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
