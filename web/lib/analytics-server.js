/* Logika server untuk analitik pengunjung anonim, dipisah dari route
 * supaya bisa diuji unit tanpa Next.js. Tidak ada yang di sini
 * menyimpan IP mentah: IP hanya masuk ke hash, lalu dibuang.
 *
 * Kontrak tulis (BE-02/SEC-06): server menulis event memakai token
 * service account, yang melewati Firestore rules — jadi aturan
 * koleksi analytics_events menutup create langsung dari klien
 * (API key Firebase ada di bundle publik; create berbentuk benar
 * pun bisa dibanjiri siapa pun tanpa melewati rate limit route).
 * Validasi bentuk event tinggal di sini (validateEvent), bukan di
 * rules. Field ts selalu timestamp (timestampValue). */
import { createHash, createSign } from "node:crypto";
import { requireEnv } from "./require-env.js";

export const EVENT_TYPES = [
  "pageview",
  "search",
  "detail",
  "portal_click",
  "tracker_mark",
  "filter",
  "onboarding",
  "report",
  "channel_copy",
];

const MAX_PATH = 200;
const MAX_Q = 200;
const MAX_Q_STORED = 100;
const MAX_ACTION = 50;
const MAX_VISITOR = 64;
const MAX_UID = 128;
const MAX_FILTER = 100;
const MAX_RESULTS = 10000;

/* Retensi event mentah (keputusan S8): event lebih tua dari ini
 * dihapus oleh cleanupOldEvents. Dasbor admin hanya memakai 30 hari
 * terakhir, jadi 90 hari memberi ruang untuk melihat tren tanpa
 * menumpuk data tanpa batas. */
export const ANALYTICS_RETENTION_DAYS = 90;
/* Batas hapus per run pembersihan: satu batchWrite Firestore
 * menampung maks 500 tulis; 200 memberi margin aman dan menjaga
 * satu run cron tetap ringan. */
export const CLEANUP_MAX_DELETE = 200;

/* Tanggal hari ini (YYYY-MM-DD) di zona Asia/Jakarta. */
export function todayJakarta(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/* Kandidat nomor telepon: diawali dan diakhiri digit, berisi digit
 * plus pemisah umum (spasi, strip, titik, kurung), panjang total
 * minimal 8 karakter. Jumlah digitnya dicek terpisah (>= 8) supaya
 * angka pendek seperti tahun tidak ikut tersaring. */
const PHONE_CANDIDATE_RE = /\+?\d[\d\s().-]{6,}\d/g;

/* Bersihkan teks pencarian sebelum disimpan (ANALITIK-09): pengunjung
 * bisa mengetik alamat email atau nomor telepon ke kolom pencarian.
 * Pola email diganti "[email]", pola telepon diganti "[telepon]",
 * lalu dipotong ke 100 karakter — cukup untuk "kata apa yang
 * populer", tanpa menyimpan teks mentah yang panjang. */
export function sanitizeQuery(q) {
  let out = String(q).replace(EMAIL_RE, "[email]");
  out = out.replace(PHONE_CANDIDATE_RE, (m) =>
    m.replace(/\D/g, "").length >= 8 ? "[telepon]" : m,
  );
  return out.slice(0, MAX_Q_STORED).trim();
}

/* Periksa bentuk event dari klien. Field lain dibuang, bukan ditolak.
 * Kembalikan { ok: true, event } atau { ok: false, error }.
 * Argumen kedua, verifiedUid, adalah UID dari ID token Firebase
 * yang SUDAH diverifikasi route (SEC-07). UID dari body klien
 * tidak pernah dipercaya: siapa pun bisa menempel UID orang lain
 * ke body dan memalsukan "aktivitas akun" di dasbor admin. */
export function validateEvent(body, verifiedUid) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body harus objek JSON" };
  }
  if (!EVENT_TYPES.includes(body.type)) {
    return { ok: false, error: "type tidak dikenal" };
  }
  if (
    typeof body.path !== "string" ||
    body.path.length < 1 ||
    body.path.length > MAX_PATH
  ) {
    return { ok: false, error: "path harus string 1-200 karakter" };
  }
  const event = { type: body.type, path: body.path };
  if (body.q !== undefined) {
    if (typeof body.q !== "string" || body.q.length > MAX_Q) {
      return { ok: false, error: "q harus string maks 200 karakter" };
    }
    /* q disimpan versi bersihnya (ANALITIK-09): pola email/telepon
     * disamarkan, lalu dipotong ke 100 karakter. */
    const clean = sanitizeQuery(body.q);
    if (clean.length > 0) event.q = clean;
  }
  /* Jumlah hasil pencarian (ANALITIK-03): dikirim pengirim event
   * search di /cari; 0 berarti "pencarian tanpa hasil". Opsional —
   * pengirim yang tidak tahu jumlah hasilnya (mis. hero di beranda)
   * tidak mengisi field ini. */
  if (body.results !== undefined) {
    if (
      typeof body.results !== "number" ||
      !Number.isInteger(body.results) ||
      body.results < 0 ||
      body.results > MAX_RESULTS
    ) {
      return { ok: false, error: "results harus int 0-10000" };
    }
    event.results = body.results;
  }
  /* Nilai filter yang dipakai (ANALITIK-04): satu string berisi
   * pasangan "kategori:<nilai>" dan/atau "status:<nilai>" yang
   * dipisah "|", mis. "kategori:Logistik|status:Ada lowongan".
   * Nilainya berasal dari dropdown terkontrol di /cari. */
  if (body.filter !== undefined) {
    if (typeof body.filter !== "string" || body.filter.length > MAX_FILTER) {
      return { ok: false, error: "filter harus string maks 100 karakter" };
    }
    if (body.filter.length > 0) event.filter = body.filter;
  }
  if (body.companyNo !== undefined) {
    if (
      typeof body.companyNo !== "number" ||
      !Number.isInteger(body.companyNo) ||
      body.companyNo < 1 ||
      body.companyNo > 10000
    ) {
      return { ok: false, error: "companyNo harus int 1-10000" };
    }
    event.companyNo = body.companyNo;
  }
  if (body.action !== undefined) {
    if (typeof body.action !== "string" || body.action.length > MAX_ACTION) {
      return { ok: false, error: "action harus string maks 50 karakter" };
    }
    if (body.action.length > 0) event.action = body.action;
  }
  if (body.visitor !== undefined) {
    if (typeof body.visitor !== "string" || body.visitor.length > MAX_VISITOR) {
      return { ok: false, error: "visitor harus string maks 64 karakter" };
    }
    if (body.visitor.length > 0) event.visitor = body.visitor;
  }
  /* uid dari body SENGAJA diabaikan (SEC-07): klien lama masih
   * mengirimnya, tapi nilainya tidak pernah dipercaya. Menolak
   * event yang membawa uid justru memecahkan event pengunjung
   * yang masuk — jadi field ini dibuang diam-diam, seperti field
   * lain yang tidak dikenal. UID hanya masuk lewat verifiedUid. */
  if (verifiedUid !== undefined && verifiedUid !== null) {
    if (
      typeof verifiedUid !== "string" ||
      verifiedUid.length < 1 ||
      verifiedUid.length > MAX_UID
    ) {
      return { ok: false, error: "uid terverifikasi tidak valid" };
    }
    event.uid = verifiedUid;
  }
  return { ok: true, event };
}

/* Hash IP dengan garam harian. Garam berubah tiap hari, jadi hash yang
 * sama besok tidak bisa ditautkan ke hash hari ini. Hasilnya 64 heksa,
 * dan IP mentah tidak pernah keluar dari fungsi ini. Garam diambil dari
 * parameter saltBase bila diberikan, kalau tidak dari env
 * ANALYTICS_SALT — tanpa nilai default. Bila keduanya kosong, fungsi
 * ini melempar; pemanggil wajib menangani (jangan pernah menyimpan
 * hash dengan garam lemah). */
export function hashVisitor(ip, day, saltBase) {
  const base = saltBase || requireEnv("ANALYTICS_SALT");
  const salt = `${base}:${day}`;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/* Batas 30 request per menit per hash IP, di memori saja.
 * BE-16: route analytics memakai limiter bersama (lib/rate-limit.js),
 * bukan fungsi ini — fungsi ini dipertahankan eksplisit sebagai
 * utilitas kecil yang teruji (dipakai test), bukan kode yang
 * terlupakan. */
export function createRateLimiter(limit = 30, windowMs = 60_000) {
  const hits = new Map();
  return {
    check(key, now = Date.now()) {
      const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (list.length >= limit) {
        hits.set(key, list);
        return false;
      }
      list.push(now);
      hits.set(key, list);
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}

export const rateLimiter = createRateLimiter();

/* Fetch dengan timeout 10 detik, supaya request yang menggantung
 * tidak menahan route/cron tanpa batas. */
async function fetchWithTimeout(fetchImpl, url, options, ms = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    if (!sa.client_email || !sa.private_key) return null;
    return sa;
  } catch {
    return null;
  }
}

/* Cache token akses service account (berlaku 1 jam; dipakai ulang
 * dengan margin aman 5 menit supaya tiap event tidak menukar JWT
 * baru ke Google). */
let saTokenCache = null; // { token, expiresAtMs }

/* Kosongkan cache token (dipakai test supaya tiap kasus mulai dari
 * keadaan bersih). */
export function resetServiceAccountTokenCache() {
  saTokenCache = null;
}

/* Tukar service account (env FIREBASE_SERVICE_ACCOUNT) menjadi access
 * token Firestore — pola yang sama dengan getAccessToken di route
 * cron recheck. Kembalikan token, atau null bila SA tidak dipasang,
 * tidak valid, atau penukaran gagal. null BUKAN error fatal bagi
 * penulis event (fallback ke API key); bagi pembersihan retensi,
 * null berarti batal (lihat cleanupOldEvents). */
export async function getServiceAccountAccessToken({
  fetchImpl = fetch,
  nowMs = Date.now(),
} = {}) {
  if (saTokenCache && saTokenCache.expiresAtMs > nowMs + 5 * 60 * 1000) {
    return saTokenCache.token;
  }
  const sa = parseServiceAccount();
  if (!sa) return null;
  const now = Math.floor(nowMs / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  let signature;
  try {
    signature = signer.sign(sa.private_key, "base64url");
  } catch {
    return null;
  }
  const jwt = `${header}.${payload}.${signature}`;
  let res;
  try {
    res = await fetchWithTimeout(
      fetchImpl,
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: jwt,
        }).toString(),
      },
    );
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  if (!body || !body.access_token) return null;
  saTokenCache = {
    token: body.access_token,
    expiresAtMs: nowMs + 3600 * 1000,
  };
  return body.access_token;
}

/* Susun body Firestore REST untuk satu event. Tidak ada field IP.
 * uaFlag hanya ditulis bila true: menandai request yang UA-nya kosong
 * atau cocok pola bot, supaya dasbor admin bisa melihatnya.
 * ts SELALU timestampValue (BE-02): rules menuntut timestamp, dan
 * query retensi (cleanupOldEvents) mengurutkan/menyaring pakai ts. */
export function buildFirestoreFields(event, visitorHash, day, nowIso, uaFlag = false) {
  const fields = {
    type: { stringValue: event.type },
    path: { stringValue: event.path },
    visitorHash: { stringValue: visitorHash },
    ts: { timestampValue: nowIso },
    day: { stringValue: day },
  };
  if (event.q !== undefined) fields.q = { stringValue: event.q };
  if (event.results !== undefined) {
    fields.results = { integerValue: String(event.results) };
  }
  if (event.filter !== undefined) {
    fields.filter = { stringValue: event.filter };
  }
  if (event.companyNo !== undefined) {
    fields.companyNo = { integerValue: String(event.companyNo) };
  }
  if (event.action !== undefined) {
    fields.action = { stringValue: event.action };
  }
  if (event.visitor !== undefined) {
    fields.visitor = { stringValue: event.visitor };
  }
  if (event.uid !== undefined) {
    fields.uid = { stringValue: event.uid };
  }
  if (uaFlag) {
    fields.uaFlag = { booleanValue: true };
  }
  return { fields };
}

/* Tulis satu event ke koleksi analytics_events lewat Firestore REST.
 * Kembalikan true bila tersimpan, false bila gagal apa pun.
 * Jalur utama memakai token service account (SEC-06): request
 * bertoken SA melewati rules, jadi create langsung dari klien bisa
 * ditutup di aturan. Bila SA tidak tersedia, fallback ke tulis API
 * key seperti sebelumnya (berfungsi selama aturan masih mengizinkan
 * create berbentuk benar — mis. sebelum rules baru diterbitkan).
 * Kegagalan dicatat ke log server (ADM-05): route menjawab 202
 * walau tulis gagal, jadi tanpa log ini kegagalan tidak terlihat
 * sama sekali. Log hanya membawa status HTTP, tanpa isi event. */
export async function writeAnalyticsEvent(
  event,
  visitorHash,
  day,
  uaFlag = false,
  { fetchImpl = fetch } = {},
) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId) return false;
  const token = await getServiceAccountAccessToken({ fetchImpl });
  const base =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/analytics_events`;
  let url;
  const headers = { "Content-Type": "application/json" };
  if (token) {
    url = base;
    headers.Authorization = `Bearer ${token}`;
  } else if (apiKey) {
    url = `${base}?key=${apiKey}`;
  } else {
    return false;
  }
  let res;
  try {
    res = await fetchWithTimeout(fetchImpl, url, {
      method: "POST",
      headers,
      body: JSON.stringify(
        buildFirestoreFields(event, visitorHash, day, new Date().toISOString(), uaFlag),
      ),
    });
  } catch {
    console.warn("Tulis event analitik gagal: jaringan/timeout.");
    return false;
  }
  if (!res.ok) {
    console.warn(`Tulis event analitik gagal: HTTP ${res.status}.`);
    return false;
  }
  return true;
}

/* Hapus event mentah yang lebih tua dari retensi (ANALITIK-10, S8:
 * 90 hari). Dijalankan route cron /api/cron/cleanup (wiring milik
 * koordinator/T7 — vercel.json saat ini baru memakai 1 dari 2 cron
 * Vercel Hobby, jadi route kedua masih muat) atau pembersihan
 * oportunistik dari dalam recheck bila route tidak dibuat.
 * Memakai token service account (melewati rules; hapus anonim
 * ditutup aturan). Menghapus maks `maxDelete` dokumen tertua per
 * run; kembalikan { deleted, cutoff, hasMore } supaya pemanggil
 * tahu bila masih ada sisa. MELEMPAR bila SA/token/query/hapus
 * gagal — pemanggil cron wajib mencatat kegagalannya, bukan
 * menelan diam (kegagalan diam adalah pelajaran BE-02/ADM-05). */
export async function cleanupOldEvents({
  retentionDays = ANALYTICS_RETENTION_DAYS,
  maxDelete = CLEANUP_MAX_DELETE,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID belum dipasang.");
  }
  const token = await getServiceAccountAccessToken({ fetchImpl });
  if (!token) {
    throw new Error(
      "Token service account tidak tersedia; pembersihan dibatalkan.",
    );
  }
  const cutoff = new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const base =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const queryRes = await fetchWithTimeout(
    fetchImpl,
    `${base}/documents:runQuery`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "analytics_events" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "ts" },
              op: "LESS_THAN",
              value: { timestampValue: cutoff },
            },
          },
          orderBy: [{ field: { fieldPath: "ts" }, direction: "ASCENDING" }],
          limit: maxDelete,
        },
      }),
    },
  );
  if (!queryRes.ok) {
    throw new Error(`Query event lama gagal: HTTP ${queryRes.status}.`);
  }
  const rows = await queryRes.json().catch(() => []);
  const names = (Array.isArray(rows) ? rows : [])
    .map((r) => r && r.document && r.document.name)
    .filter(Boolean);
  if (names.length === 0) {
    return { deleted: 0, cutoff, hasMore: false };
  }
  const batchRes = await fetchWithTimeout(
    fetchImpl,
    `${base}/documents:batchWrite`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        writes: names.map((name) => ({ delete: name })),
      }),
    },
  );
  if (!batchRes.ok) {
    throw new Error(`Hapus event lama gagal: HTTP ${batchRes.status}.`);
  }
  return { deleted: names.length, cutoff, hasMore: names.length >= maxDelete };
}
