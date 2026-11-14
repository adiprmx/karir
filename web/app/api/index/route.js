/* GET /api/index — seluruh daftar perusahaan dalam satu JSON, supaya
 * browser bisa mengurutkan hasil pencarian sendiri tanpa menunggu
 * server tiap ketukan. Data sama dengan /api/companies, bentuk padat.
 * Gerbang: tolak UA otomatis (403), batas laju 30/menit per hash IP
 * (429), lalu wajib token valid di header Authorization Bearer (401).
 * Respons memakai "private, no-store": data ber-token tidak boleh
 * disajikan dari edge cache tanpa token.
 * Respons membawa `source` ("live" | "seed") + `seedDate`: "seed"
 * berarti daftar berasal dari seed cadangan karena Firestore sedang
 * tidak bisa dibaca (mis. kuota habis) — bukan 503 (arsitektur
 * seed-first S3). Klien menampilkan catatan "data cadangan" bila
 * source=seed.
 * FIN-09/FE-16: tiap perusahaan dipangkas ke 8 field yang dipakai
 * pemakai indeks (lihat INDEX_COMPANY_FIELDS); field yang hanya
 * dipakai halaman detail tidak dikirim di sini. Respons juga membawa
 * `rev` dari marker meta/lastChange (null bila marker tidak bisa
 * dibaca, atau bila daftar berasal dari seed — daftar seed tidak
 * boleh divalidasi sebagai data live). Klien yang menyimpan rev bisa
 * memvalidasi ulang dengan `?rev=N` dan menerima 304 tanpa isi bila
 * data belum berubah, supaya sesi baru tidak mengunduh ulang penuh.
 * Gerbang (bot, batas laju, token) tetap berlaku untuk request
 * validasi ulang. */
import { NextResponse } from "next/server";
import { getCompaniesWithSource } from "@/lib/companies";
import {
  isBotUa,
  getClientIp,
  verifyToken,
  TOKEN_MAX_AGE_SEC,
} from "@/lib/api-guard";
import { getSharedLimiter, scopedKey } from "@/lib/rate-limit";
import { hashVisitor, todayJakarta } from "@/lib/analytics-server";
import { requireEnv } from "@/lib/require-env";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const LIMIT_PER_MINUTE = 30;

/* Field perusahaan yang dikirim ke pemakai indeks (FIN-09/FE-16).
 * Dipakai: no (kunci/tautan), perusahaan, kategori (filter + kartu),
 * link_karir (tombol portal + skor), status (filter + stempel),
 * catatan (pencarian mencocokkan token posisi ke catatan — lihat
 * lib/search.js), lokasi (filter kota + kartu), posisi (kartu +
 * pencarian). TIDAK dipakai pemakai indeks sehingga tidak dikirim:
 * tanggal_cek, batas_lamar, email_hrd, wa_hrd, kontak_lain — kelima
 * field itu hanya dipakai halaman detail, yang memuat satu
 * perusahaan lewat /api/companies/[no]. Menghapus satu field dari
 * daftar ini tanpa memeriksa pemakai indeks akan merusak pencarian.
 * Penghematan terukur dari seed 610 perusahaan: ~511 KB -> ~436 KB
 * (sekitar 15%). */
export const INDEX_COMPANY_FIELDS = [
  "no",
  "perusahaan",
  "kategori",
  "link_karir",
  "status",
  "catatan",
  "lokasi",
  "posisi",
];

export function trimCompanyForIndex(company) {
  if (!company || typeof company !== "object") return {};
  const out = {};
  for (const field of INDEX_COMPANY_FIELDS) {
    if (company[field] !== undefined) out[field] = company[field];
  }
  return out;
}

/* Revisi data (meta/lastChange) untuk validasi ulang klien (FE-16).
 * Dibaca lewat REST API key publik, di-cache 5 menit per instance
 * (jendela yang sama dengan lib/companies.js) supaya tiap request
 * /api/index tidak menambah baca Firestore; kegagalan di-cache
 * 60 detik. Kembalikan rev (angka) atau null bila marker tidak
 * bisa dibaca — null berarti "tidak tahu", klien tetap memvalidasi
 * lewat TTL cache-nya.
 * Catatan balapan: cache marker di sini terpisah dari cache di
 * lib/companies.js, jadi rev yang dilaporkan bisa satu revisi lebih
 * baru dari daftar yang disajikan bila marker naik di antara kedua
 * cache itu (jendela paling lama 5 menit setelah perubahan data).
 * Dampaknya dibatasi TTL cache klien (24 jam): paling buruk, satu
 * perubahan tertunda terlihat sampai TTL habis. */
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const MARKER_TTL_MS = 5 * 60 * 1000;
const MARKER_FAIL_TTL_MS = 60 * 1000;
const MARKER_TIMEOUT_MS = 5_000;
let revCache = null;
let revFailAt = 0;

export function resetIndexRevCache() {
  revCache = null;
  revFailAt = 0;
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonWithTimeout(res, timeoutMs) {
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
          reject(new Error("Timeout membaca marker."));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readIndexRev({
  fetchImpl = fetch,
  now = Date.now(),
} = {}) {
  if (revCache && now - revCache.at < MARKER_TTL_MS) return revCache.rev;
  if (revFailAt && now - revFailAt < MARKER_FAIL_TTL_MS) return null;
  if (!PROJECT_ID || !API_KEY) return null;
  let res;
  try {
    res = await fetchWithTimeout(
      fetchImpl,
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/meta/lastChange?key=${API_KEY}`,
      MARKER_TIMEOUT_MS,
    );
  } catch {
    revFailAt = now;
    return null;
  }
  if (!res.ok) {
    revFailAt = now;
    return null;
  }
  let body;
  try {
    body = await readJsonWithTimeout(res, MARKER_TIMEOUT_MS);
  } catch {
    revFailAt = now;
    return null;
  }
  const rev = Number(body?.fields?.rev?.integerValue);
  if (!Number.isFinite(rev)) {
    revFailAt = now;
    return null;
  }
  revCache = { rev, at: now };
  return rev;
}

/* Baca ?rev=N dari request. NextRequest membawa nextUrl; fallback ke
 * request.url bila nextUrl tidak ada. Kembalikan angka bulat >= 0
 * atau null bila tidak ada / tidak valid. */
function parseClientRev(request) {
  let raw = null;
  try {
    const params =
      request.nextUrl?.searchParams ?? new URL(request.url).searchParams;
    raw = params.get("rev");
  } catch {
    return null;
  }
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function bearerToken(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice("Bearer ".length).trim();
}

export async function GET(request) {
  if (isBotUa(request.headers.get("user-agent") || "")) {
    return NextResponse.json(
      { error: "Permintaan otomatis ditolak." },
      { status: 403 },
    );
  }
  /* Batas laju memakai hash IP; bila garam analitik belum dipasang,
   * hash tidak bisa dibuat dan batas laju dilewati — tidak ada hash
   * lemah dan tidak ada IP mentah yang disimpan. */
  let limited = false;
  try {
    const key = scopedKey(
      "index",
      hashVisitor(getClientIp(request), todayJakarta()),
    );
    limited = !(await getSharedLimiter().check(key, LIMIT_PER_MINUTE, WINDOW_MS));
  } catch {
    console.warn("Batas laju /api/index dilewati: env ANALYTICS_SALT belum dipasang.");
  }
  if (limited) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }
  let secret;
  try {
    secret = requireEnv("API_TOKEN_SECRET");
  } catch {
    return NextResponse.json(
      { error: "Layanan belum dikonfigurasi." },
      { status: 503 },
    );
  }
  const token = bearerToken(request);
  /* Umur token yang diterima sama dengan yang diterbitkan /api/token
   * (TOKEN_MAX_AGE_SEC) — satu sumber kebenaran, bukan angka 60 yang
   * ditulis dua kali (BE-12). */
  if (!token || !verifyToken(token, secret, TOKEN_MAX_AGE_SEC)) {
    return NextResponse.json(
      { error: "Token tidak ada atau tidak valid." },
      { status: 401 },
    );
  }
  /* Validasi ulang klien (FE-16): klien yang menyimpan rev dari
   * respons sebelumnya mengirim ?rev=N; bila rev sama dengan marker
   * sekarang, data belum berubah dan server menjawab 304 tanpa isi
   * — klien memakai cache-nya. */
  const rev = await readIndexRev();
  const clientRev = parseClientRev(request);
  if (rev !== null && clientRev !== null && clientRev === rev) {
    return new NextResponse(null, {
      status: 304,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  try {
    const { companies, source, seedDate } = await getCompaniesWithSource();
    return NextResponse.json(
      {
        companies: companies.map(trimCompanyForIndex),
        source,
        seedDate,
        /* Daftar seed tidak membawa rev: klien tidak boleh
         * memvalidasi data cadangan sebagai data live. */
        rev: source === "live" ? rev : null,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch {
    /* getCompaniesWithSource tidak pernah melempar karena Firestore
     * (jatuh ke seed); 503 di sini hanya untuk kegagalan tak terduga
     * (mis. seed ikut tidak bisa dimuat). */
    return NextResponse.json(
      { error: "Data perusahaan tidak bisa dimuat." },
      { status: 503 },
    );
  }
}
