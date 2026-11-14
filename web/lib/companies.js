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
/* Janji fetch yang sedang berjalan, dipakai bersama oleh semua pemanggil
 * bersamaan supaya satu rangkaian paginasi penuh hanya dibaca sekali.
 * Tanpa ini, tiga panggilan bersamaan (mis. /api/stats yang memanggil
 * getCompanies(), getStats(), dan getStaleCount() sekaligus) masing-masing
 * menjalankan paginasi penuh sendiri — 3x baca dokumen untuk data yang
 * sama. Dibersihkan begitu fetch selesai (sukses maupun gagal) supaya
 * panggilan berikutnya memakai cache atau mencoba lagi. */
let inflight = null;

/* Semua fetch ke Firestore WAJIB punya timeout: kalau rute egress mati,
 * request tidak boleh menggantung selamanya — gagal cepat (10 dtk) supaya
 * halaman menampilkan error yang jelas, bukan hang. */
async function fetchJson(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export function revalidateCompanies() {
  cache = null;
  cacheAt = 0;
  /* Fetch yang sedang berjalan ikut dibatalkan bagi pemanggil berikutnya:
   * tanpa ini, panggilan setelah revalidate akan bergabung ke fetch lama
   * dan mendapat data sebelum penulisan admin. Fetch lama yang sudah
   * berjalan tetap selesai, tapi tidak lagi dipakai bersama. */
  inflight = null;
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
    /* Opsional, "YYYY-MM-DD", dari catatan yang menyebut batas lamar.
     * Kosong bila tidak ada batas yang tercatat. Dipakai cron untuk
     * peringatan batas lamar (lihat lib/notify.js). */
    batas_lamar: s("batas_lamar"),
    /* Kanal melamar lain (opsional, kosong bila tidak ditemukan):
     * email HRD, nomor WhatsApp HRD, dan kanal lain (formulir, alamat
     * kirim langsung). Ditampilkan di halaman detail bila ada. */
    email_hrd: s("email_hrd"),
    wa_hrd: s("wa_hrd"),
    kontak_lain: s("kontak_lain"),
  };
}

export async function getCompanies() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache;
  if (inflight) return inflight;
  const promise = (async () => {
    let docs = [];
    let token = "";
    do {
      const url =
        `${BASE}/companies?pageSize=300&key=${API_KEY}` +
        (token ? `&pageToken=${token}` : "");
      const res = await fetchJson(url);
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
  })();
  inflight = promise;
  try {
    return await promise;
  } finally {
    /* Bersihkan janji begitu selesai: sukses → panggilan berikutnya
     * memakai cache; gagal → panggilan berikutnya mencoba lagi, bukan
     * mendapat penolakan lama yang tersimpan. */
    if (inflight === promise) inflight = null;
  }
}

export async function getCompanyById(no) {
  const id = Number(no);
  if (!id) return null;
  const res = await fetchJson(`${BASE}/companies/${id}?key=${API_KEY}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Firestore get gagal: HTTP ${res.status}`);
  }
  const d = await res.json();
  return docToCompany(d);
}

/* Cadangan lokal: snapshot repo `data/companies.json`, sinkron dengan
 * Firestore lewat rekonsiliasi berkala. Dipakai HALAMAN saat Firestore
 * tidak bisa dijangkau, supaya pengunjung tetap melihat data asli
 * (dengan tanggal cek aslinya), bukan halaman error 500. API tetap
 * memakai getCompanies() yang melempar supaya jawaban 503-nya jujur
 * saat data live tidak bisa dimuat. Impor dinamis supaya berkas JSON
 * tidak ikut ke bundle klien. */
async function loadSeed() {
  const { default: seed } = await import("@/data/companies.json");
  return seed;
}

export async function getCompaniesOrSeed() {
  try {
    return await getCompanies();
  } catch {
    return loadSeed();
  }
}

export async function getCompanyByIdOrSeed(no) {
  try {
    return await getCompanyById(no);
  } catch {
    const seed = await loadSeed();
    return seed.find((c) => c.no === Number(no)) || null;
  }
}

/* Perusahaan sejenis: kategori sama, bukan dirinya sendiri, yang punya
 * lowongan dulu, lalu nama A-Z. */
function computeRelated(companies, company, n = 6) {
  const same = companies.filter(
    (c) => c.kategori === company.kategori && c.no !== company.no,
  );
  const rank = (c) => (c.status === "Ada lowongan" ? 0 : 1);
  same.sort(
    (a, b) =>
      rank(a) - rank(b) || a.perusahaan.localeCompare(b.perusahaan, "id"),
  );
  return same.slice(0, n);
}

export async function getRelated(company, n = 6) {
  return computeRelated(await getCompanies(), company, n);
}

export async function getRelatedOrSeed(company, n = 6) {
  return computeRelated(await getCompaniesOrSeed(), company, n);
}

/* Jumlah baris yang tanggal ceknya sudah lebih dari 30 hari. */
function computeStaleCount(companies) {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  return companies.filter((c) => {
    if (!c.tanggal_cek) return true;
    const t = Date.parse(c.tanggal_cek + "T00:00:00Z");
    return Number.isNaN(t) || now - t > 30 * DAY;
  }).length;
}

export async function getStaleCount() {
  return computeStaleCount(await getCompanies());
}

function computeTargets(companies) {
  return companies
    .filter((c) => c.status === "Ada lowongan")
    .sort((a, b) => a.perusahaan.localeCompare(b.perusahaan, "id"));
}

export async function getTargets() {
  return computeTargets(await getCompanies());
}

export async function getTargetsOrSeed() {
  return computeTargets(await getCompaniesOrSeed());
}

function computeCategories(companies) {
  const seen = new Map();
  companies.forEach((c) => {
    if (c.kategori) seen.set(c.kategori, (seen.get(c.kategori) || 0) + 1);
  });
  return [...seen.keys()].sort((a, b) => a.localeCompare(b, "id"));
}

export async function getCategories() {
  return computeCategories(await getCompanies());
}

export async function getCategoriesOrSeed() {
  return computeCategories(await getCompaniesOrSeed());
}

/* Taksonomi status (14 Nov 2026): 4 nilai netral profil — pertanyaannya
 * hanya apakah perusahaan sedang ada lowongan aktif, untuk siapa pun.
 * Nilai lama ("Ada lowongan target", "Ada lowongan target (tidak cocok)",
 * "Tidak ada lowongan target", "Tidak ada lowongan terlihat") dipensiunkan. */
export const STATUS_ORDER = [
  "Ada lowongan",
  "Tidak ada lowongan",
  "Tidak dapat diverifikasi",
  "Portal tidak bisa dibuka",
];

function computeStats(companies) {
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

export async function getStats() {
  return computeStats(await getCompanies());
}

export async function getStatsOrSeed() {
  return computeStats(await getCompaniesOrSeed());
}
