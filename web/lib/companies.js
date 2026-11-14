/* Lapisan data Karir — SEED-FIRST (keputusan S3, 15 Nov 2026).
 *
 * Sumber live: Firestore, koleksi `companies` (proyek karir-9d53a),
 * dibaca lewat Firestore REST API (fetch biasa), BUKAN SDK JS — gRPC
 * SDK tidak bisa menembus proxy egress VM ini (timeout 10 dtk lalu
 * "offline mode" dan mengembalikan 0 baris), sementara REST terbukti
 * andal (impor 406 dokumen lewat jalur ini). Baca publik diizinkan
 * aturan (`allow read: if true`), kunci API adalah konfigurasi klien
 * publik, bukan rahasia.
 *
 * Sumber cadangan: seed `web/data/companies.json` (salinan CSV,
 * dijaga check-consistency.py). Seed adalah DEFAULT: daftar disajikan
 * dari seed kecuali ada bukti data live lebih baru.
 *
 * Bukti itu adalah marker `meta/lastChange` — satu dokumen kecil
 * {rev, updatedAt, counterDay, refillsToday, readsEstimate} yang
 * dibaca 1 baca per jendela TTL 5 menit (cache memori + dedup
 * inflight). Refill penuh dari Firestore (610 baca) HANYA terjadi
 * bila rev marker berubah sejak refill terakhir, atau saat instance
 * serverless dingin pertama kali (belum punya cache live).
 *
 * Yang menaikkan rev (rev+1, updatedAt=now): cron cek ulang
 * (app/api/cron/recheck) bila ada status berubah atau tanggal_cek
 * diperbarui, impor kanonis (import_canonical.py) bila ada dokumen
 * tertulis, dan panel admin bila ada simpan/hapus/impor. Tulis TIDAK
 * kena kuota baca.
 *
 * Degradasi (inti perbaikan ini, insiden 15 Nov 2026: kuota baca
 * harian Spark 50.000 habis 00:15 WIB, semua baca 429, API 503):
 * baca marker gagal (429/offline/error apa pun) -> sajikan seed atau
 * cache live lama, TANPA melempar. Refill gagal (429) -> sajikan seed
 * atau cache live lama, TANPA melempar. API tetap 200 dari seed saat
 * Firestore mati atau kuota habis; respons membawa `source`
 * ("live" | "seed") supaya klien bisa memberi catatan "data cadangan".
 *
 * Self-metering (FIN-02): tiap refill yang sukses menaikkan pencacah
 * di marker (1 tulis PATCH, best-effort, tidak pernah menggagalkan
 * refill): refillsToday +1 dan readsEstimate += jumlah dokumen yang
 * dibaca. Aturan Firestore membatasi tulis pencacah dari API key
 * publik: rev/updatedAt tidak boleh berubah lewat jalur itu, jadi
 * tidak ada yang bisa memaksa refill dari luar. Begitu estimasi
 * mencapai 70% kuota harian, satu alert `quota` dibuat di koleksi
 * alerts (id deterministik per hari, lihat lib/notify.js).
 *
 * Marker adalah mekanisme invalidasi lintas-instance yang benar
 * untuk serverless: tiap instance memeriksa marker dan refill
 * sendiri bila rev berubah. Helper revalidateCompanies() di bawah
 * hanya membersihkan cache instance INI (dipakai test dan pemanggil
 * lokal); jangan andalkan untuk invalidasi antar-instance. */

import {
  QUOTA_ALERT_READS,
  QUOTA_ALERT_TYPE,
  quotaAlertId,
  quotaPercent,
} from "./notify.js";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const MARKER_URL = `${BASE}/meta/lastChange?key=${API_KEY}`;

/* Jendela cek marker dan cache per-perusahaan: 5 menit. Dalam jendela
 * ini, instance hangat tidak membaca Firestore sama sekali untuk
 * daftar (0 baca), dan paling banyak 1 baca marker per 5 menit. */
const MARKER_TTL_MS = 5 * 60 * 1000;
const BY_ID_TTL_MS = 5 * 60 * 1000;

/* Cache live: daftar terakhir yang berhasil di-refill dari Firestore,
 * dan rev marker saat refill itu (null = marker belum ada saat itu). */
let liveCache = null;
let liveRev = undefined;
/* Seed yang sudah dimuat (impor dinamis, sekali per instance). */
let seedCache = null;
/* Marker terakhir yang berhasil dibaca + kapan dibacanya.
 * markerLoaded true berarti sudah pernah dicek (ada atau tidak ada —
 * dokumen yang belum ada (404) juga di-cache supaya tidak dibaca
 * ulang tiap panggilan). Kegagalan baca di-cache 60 detik supaya
 * Firestore yang sedang bermasalah tidak ditembak tiap request. */
let markerCache = null;
let markerAt = 0;
let markerLoaded = false;
let markerFailAt = 0;
const MARKER_FAIL_TTL_MS = 60 * 1000;
/* Janji yang sedang berjalan, dipakai bersama supaya pemanggil
 * bersamaan tidak mengulang pekerjaan yang sama. */
let inflightMarker = null;
let inflightResolve = null;
/* Cache per-perusahaan: no -> {company, at}, dan janji per no. */
const byIdCache = new Map();
const byIdInflight = new Map();
/* Hari (WIB) terakhir alert kuota dicoba dibuat di instance ini —
 * supaya percobaan tidak diulang tiap refill setelah ambang lewat
 * (id dokumen deterministik sudah mencegah duplikat di Firestore,
 * ini hanya menghemat tulis). */
let quotaAlertDay = "";

/* Semua fetch ke Firestore WAJIB punya timeout: kalau rute egress mati,
 * request tidak boleh menggantung selamanya — gagal cepat supaya
 * pemanggil bisa jatuh ke seed, bukan hang. Timer di sini hanya
 * menutupi fetch sampai header tiba; parsing body punya timeout
 * sendiri di jsonWithTimeout di bawah (BE-09). */
async function fetchJson(url, { timeoutMs = 10_000, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    /* Opsi cache Next hanya untuk GET; tulis (PATCH/POST) tidak
     * boleh lewat cache. */
    const isGet = !options.method || options.method === "GET";
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      ...(isGet ? { next: { revalidate: 300 } } : {}),
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/* Baca body JSON dengan timeout sendiri (BE-09). fetch() resolve saat
 * header tiba dan timer AbortController fetchJson dimatikan saat itu —
 * tanpa batas di sini, body yang stall (jaringan flaky) bisa
 * menggantung sampai batas fungsi Vercel walau fetch-nya sudah
 * bertimeout. Promise.race ini membatasi parsing body; bila timeout,
 * pemanggil memperlakukannya sama seperti kegagalan baca (jatuh ke
 * seed/cache). Stream body dibatalkan supaya koneksi tidak tertahan
 * di belakang layar setelah pemanggil menyerah. Diekspor supaya
 * pola yang sama bisa dipakai di titik res.json() lain (rate-limit,
 * recheck) tanpa menduplikasi logika. */
export async function jsonWithTimeout(res, timeoutMs = 5_000) {
  let timer;
  try {
    return await Promise.race([
      res.json(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          try {
            res.body?.cancel?.();
          } catch {
            /* Pembatalan body bersifat best-effort. */
          }
          reject(new Error("Timeout membaca body respons"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/* Tanggal hari ini (WIB) sebagai "YYYY-MM-DD". */
function todayWib() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

/* Bersihkan SEMUA cache instance ini (live, marker, per-perusahaan,
 * seed tetap — seed tidak berubah selama proses berjalan).
 * Dipakai test dan pemanggil lokal. Invalidasi lintas-instance
 * TIDAK lewat sini, melainkan lewat marker: penulis data menaikkan
 * rev, tiap instance melihatnya di cek marker berikut dan refill. */
export function revalidateCompanies() {
  liveCache = null;
  liveRev = undefined;
  markerCache = null;
  markerAt = 0;
  markerLoaded = false;
  markerFailAt = 0;
  inflightMarker = null;
  inflightResolve = null;
  byIdCache.clear();
  byIdInflight.clear();
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

/* Seed cadangan: snapshot repo `data/companies.json`, sinkron dengan
 * CSV lewat rekonsiliasi berkala (check-consistency.py). Dipakai
 * sebagai DEFAULT dan saat Firestore tidak bisa dijangkau, supaya
 * pengunjung tetap melihat data asli (dengan tanggal cek aslinya),
 * bukan halaman error. Impor dinamis supaya berkas JSON tidak ikut
 * ke bundle klien; di luar Next (node --test) alias @ tidak ada,
 * jadi ada cadangan impor relatif. */
async function loadSeed() {
  if (seedCache) return seedCache;
  try {
    const { default: seed } = await import("@/data/companies.json");
    seedCache = seed;
  } catch {
    const { default: seed } = await import("../data/companies.json", {
      with: { type: "json" },
    });
    seedCache = seed;
  }
  return seedCache;
}

/* Tanggal seed = tanggal cek terbaru di seed. Dipakai respons API
 * supaya klien dan admin tahu seberapa segar data cadangannya.
 * Fail-open: tanggal seed hanya metadata — bila seed tidak bisa
 * dimuat sementara daftarnya sendiri berhasil (mis. dari cache live),
 * kembalikan "" supaya respons API tidak ikut 503; klien sudah
 * memperlakukan "" sebagai "tanggal tidak diketahui". */
export async function getSeedDate() {
  let seed;
  try {
    seed = await loadSeed();
  } catch {
    return "";
  }
  let latest = "";
  for (const c of seed) {
    if (c.tanggal_cek && c.tanggal_cek > latest) latest = c.tanggal_cek;
  }
  return latest;
}

function parseMarker(doc) {
  const f = (doc && doc.fields) || {};
  const int = (k) =>
    f[k] && f[k].integerValue != null ? Number(f[k].integerValue) : 0;
  const str = (k) =>
    f[k] && f[k].stringValue != null ? f[k].stringValue : "";
  return {
    /* rev null = dokumen tidak punya rev (tidak seharusnya terjadi
     * untuk dokumen yang ditulis penulis resmi; diperlakukan sama
     * dengan "belum ada marker"). */
    rev:
      f.rev && f.rev.integerValue != null ? Number(f.rev.integerValue) : null,
    updatedAt: str("updatedAt"),
    counterDay: str("counterDay"),
    refillsToday: int("refillsToday"),
    readsEstimate: int("readsEstimate"),
  };
}

/* Baca marker (1 baca Firestore), dengan cache 5 menit + dedup
 * inflight. Kembalikan {ok:true, marker} bila baca berhasil —
 * marker null berarti dokumen belum ada (404, belum pernah ada
 * perubahan sejak marker diperkenalkan). Kembalikan {ok:false} bila
 * baca gagal APAPUN alasannya (429 kuota, 5xx, offline, timeout):
 * pemanggil TIDAK boleh melempar, melainkan jatuh ke seed/cache. */
async function readMarker() {
  const now = Date.now();
  if (markerLoaded && now - markerAt < MARKER_TTL_MS) {
    return { ok: true, marker: markerCache };
  }
  if (now - markerFailAt < MARKER_FAIL_TTL_MS) {
    return { ok: false };
  }
  if (inflightMarker) return inflightMarker;
  const promise = (async () => {
    try {
      const res = await fetchJson(MARKER_URL, { timeoutMs: 5_000 });
      if (res.status === 404) {
        markerCache = null;
        markerAt = now;
        markerLoaded = true;
        return { ok: true, marker: null };
      }
      if (!res.ok) {
        markerFailAt = now;
        return { ok: false };
      }
      const marker = parseMarker(await jsonWithTimeout(res));
      markerCache = marker;
      markerAt = now;
      markerLoaded = true;
      return { ok: true, marker };
    } catch {
      markerFailAt = now;
      return { ok: false };
    } finally {
      if (inflightMarker === promise) inflightMarker = null;
    }
  })();
  inflightMarker = promise;
  return promise;
}

/* Refill penuh dari Firestore: paginasi 300 dokumen per halaman
 * sampai habis. Melempar bila ada halaman yang gagal — pemanggil
 * yang menangani (jatuh ke seed/cache), bukan fungsi ini. */
async function refillFromFirestore() {
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
    const body = await jsonWithTimeout(res);
    docs = docs.concat(body.documents || []);
    token = body.nextPageToken || "";
  } while (token);
  return docs.map(docToCompany).sort((a, b) => a.no - b.no);
}

/* Buat alert kuota 70% di koleksi alerts (id deterministik per hari).
 * Best-effort: 409 berarti sudah ada (bukan error), kegagalan lain
 * ditelan — alert tidak boleh menggagalkan refill. Aturan Firestore
 * mengizinkan pembuatan alert tipe `quota` berbentuk ini dari API
 * key publik; tanpa aturan itu (belum terbit) tulis 403 dan ditelan. */
async function maybeCreateQuotaAlert(day, readsEstimate) {
  if (quotaAlertDay === day) return;
  quotaAlertDay = day;
  try {
    const res = await fetchJson(
      `${BASE}/alerts?documentId=${encodeURIComponent(quotaAlertId(day))}&key=${API_KEY}`,
      {
        timeoutMs: 5_000,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            type: { stringValue: QUOTA_ALERT_TYPE },
            companyNo: { integerValue: "0" },
            perusahaan: { stringValue: "" },
            sent: { booleanValue: false },
            createdAt: { stringValue: new Date().toISOString() },
            readsEstimate: { integerValue: String(readsEstimate) },
            percent: { integerValue: String(quotaPercent(readsEstimate)) },
          },
        }),
      },
    );
    /* 200 = dibuat, 409 = sudah ada hari ini. Status lain ditelan. */
    void res;
  } catch {
    /* Best-effort: alert gagal tidak menggagalkan apa pun. */
  }
}

/* Naikkan pencacah refill di marker (1 tulis PATCH, best-effort).
 * Ganti hari (WIB) -> pencacah mulai lagi dari 1. Tulis ini TIDAK
 * kena kuota baca. Bila marker belum ada, atau aturan Firestore
 * belum mengizinkan tulis pencacah (belum terbit), PATCH gagal dan
 * ditelan — metering mulai jalan setelah aturan terbit. Bila
 * estimasi melewati ambang 70%, alert kuota dibuat (satu per hari). */
async function bumpRefillCounters(marker, docsRead) {
  if (!marker) return;
  try {
    const day = todayWib();
    const rollover = marker.counterDay !== day;
    const refillsToday = rollover ? 1 : marker.refillsToday + 1;
    const readsEstimate = rollover
      ? docsRead
      : marker.readsEstimate + docsRead;
    const url =
      `${BASE}/meta/lastChange?key=${API_KEY}` +
      `&updateMask.fieldPaths=refillsToday` +
      `&updateMask.fieldPaths=readsEstimate` +
      `&updateMask.fieldPaths=counterDay`;
    const res = await fetchJson(url, {
      timeoutMs: 5_000,
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          refillsToday: { integerValue: String(refillsToday) },
          readsEstimate: { integerValue: String(readsEstimate) },
          counterDay: { stringValue: day },
        },
      }),
    });
    if (res.ok) {
      /* Perbarui cache marker supaya pencacah lokal tidak tertinggal
       * dari nilai yang baru ditulis (menghindari dua refill
       * berurutan menulis angka yang sama). */
      if (markerCache) {
        markerCache = { ...markerCache, refillsToday, readsEstimate, counterDay: day };
      }
      if (readsEstimate >= QUOTA_ALERT_READS) {
        await maybeCreateQuotaAlert(day, readsEstimate);
      }
    }
  } catch {
    /* Best-effort: metering gagal tidak menggagalkan refill. */
  }
}

/* Inti seed-first. Kembalikan {list, source}: "live" bila daftar
 * berasal dari Firestore (refill segar atau cache live), "seed"
 * bila berasal dari seed. TIDAK PERNAH melempar karena Firestore:
 * semua kegagalan Firestore berakhir di seed/cache. Janji dipakai
 * bersama (dedup inflight) supaya pemanggil bersamaan — mis.
 * /api/stats yang memanggil getCompanies(), getStats(), dan
 * getStaleCount() sekaligus — hanya menjalankan satu rangkaian
 * cek marker + refill. */
async function resolveCompanies() {
  if (inflightResolve) return inflightResolve;
  const promise = (async () => {
    const { ok, marker } = await readMarker();
    if (!ok) {
      /* Marker tidak bisa dibaca (429 kuota / offline / error):
       * JANGAN coba refill — Firestore kemungkinan besar sedang
       * tidak bisa dipakai, dan refill 610 baca hanya menambah
       * beban. Sajikan cache live bila ada, seed bila tidak. */
      if (liveCache) return { list: liveCache, source: "live" };
      return { list: await loadSeed(), source: "seed" };
    }
    const rev = marker ? marker.rev : null;
    if (liveCache && liveRev === rev) {
      /* Marker tidak berubah sejak refill terakhir: tanpa refill. */
      return { list: liveCache, source: "live" };
    }
    try {
      const list = await refillFromFirestore();
      liveCache = list;
      liveRev = rev;
      /* Metering best-effort; kegagalannya tidak menggagalkan
       * refill, dan refill tetap disajikan. */
      await bumpRefillCounters(marker, list.length);
      return { list, source: "live" };
    } catch {
      /* Refill gagal (429 kuota / error): sajikan cache live lama
       * bila ada, seed bila tidak. Tanpa 503. */
      if (liveCache) return { list: liveCache, source: "live" };
      return { list: await loadSeed(), source: "seed" };
    }
  })();
  inflightResolve = promise;
  try {
    return await promise;
  } finally {
    if (inflightResolve === promise) inflightResolve = null;
  }
}

export async function getCompanies() {
  return (await resolveCompanies()).list;
}

/* Seperti getCompanies(), plus asal data dan tanggal seed — dipakai
 * rute API supaya respons membawa `source` + `seedDate`. */
export async function getCompaniesWithSource() {
  const [{ list, source }, seedDate] = await Promise.all([
    resolveCompanies(),
    getSeedDate(),
  ]);
  return { companies: list, source, seedDate };
}

/* Satu perusahaan berdasarkan nomor baris. Cache memori 5 menit +
 * dedup inflight per nomor (BE-18): dua panggilan bersamaan untuk
 * nomor yang sama hanya memakai satu fetch. Bila fetch gagal dan
 * ada cache lama (basi), cache lama dipakai; bila tidak ada, lempar
 * supaya pemanggil *OrSeed bisa jatuh ke seed. 404 = tidak ada,
 * kembalikan null (tidak di-cache: perusahaan bisa ditambahkan
 * admin setelahnya). */
export async function getCompanyById(no) {
  const id = Number(no);
  if (!id) return null;
  const now = Date.now();
  const cached = byIdCache.get(id);
  if (cached && now - cached.at < BY_ID_TTL_MS) return cached.company;
  const pending = byIdInflight.get(id);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const res = await fetchJson(`${BASE}/companies/${id}?key=${API_KEY}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Firestore get gagal: HTTP ${res.status}`);
      }
      const company = docToCompany(await jsonWithTimeout(res));
      byIdCache.set(id, { company, at: Date.now() });
      return company;
    } catch (err) {
      /* Gagal total (429/offline): cache basi lebih baik daripada
       * tidak ada data sama sekali. */
      if (cached) return cached.company;
      throw err;
    } finally {
      if (byIdInflight.get(id) === promise) byIdInflight.delete(id);
    }
  })();
  byIdInflight.set(id, promise);
  return promise;
}

/* getCompanies() sendiri sudah seed-first (tidak pernah melempar
 * karena Firestore), jadi varian OrSeed tinggal alias — dipertahankan
 * supaya semua pemanggil halaman yang sudah ada tidak perlu diubah. */
export async function getCompaniesOrSeed() {
  return getCompanies();
}

/* Seperti getCompanyById, plus asal data — dipakai rute
 * /api/companies/[no] supaya respons membawa `source`. Gagal baca
 * Firestore (429/offline) -> seed, tanpa melempar. */
export async function getCompanyByIdWithSource(no) {
  try {
    const company = await getCompanyById(no);
    return { company, source: "live" };
  } catch {
    const seed = await loadSeed();
    return {
      company: seed.find((c) => c.no === Number(no)) || null,
      source: "seed",
    };
  }
}

export async function getCompanyByIdOrSeed(no) {
  return (await getCompanyByIdWithSource(no)).company;
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

/* Varian seed (BE-18): perusahaan sejenis dihitung LANGSUNG dari seed,
 * tanpa memuat daftar penuh dari Firestore — daftar sejenis tidak
 * butuh kesegaran live, dan halaman detail tidak boleh memicu refill
 * 610 baca hanya untuk rekomendasi. */
export async function getRelatedOrSeed(company, n = 6) {
  return computeRelated(await loadSeed(), company, n);
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
