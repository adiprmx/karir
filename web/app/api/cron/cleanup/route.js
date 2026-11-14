/* Cron pembersihan retensi (ANALITIK-10, S8; FIN-08): hapus dokumen
 * lama dari empat koleksi Firestore — event analitik mentah lebih
 * tua dari 90 hari (maks 200/run, lewat cleanupOldEvents di
 * lib/analytics-server.js) ditambah tiga koleksi di bawah (lewat
 * cleanupCollection di berkas ini). Dijalankan Vercel Cron tiap
 * Senin 02:00 WIB (vercel.json).
 *
 * Anggaran hapus per run: 200 (analitik) + 200 + 100 + 100 = maks
 * 600 hapus per run, seminggu sekali — jauh di bawah batas hapus
 * Firestore 20.000/hari. Tiap koleksi dihapus dalam satu panggilan
 * batchWrite (maks 500 tulis/panggilan; tiap koleksi <= 200).
 * Bila masih ada sisa (hasMore), run minggu berikutnya melanjutkan.
 *
 * Guard sama seperti recheck: fail-closed bila CRON_SECRET belum
 * dipasang (503 generik), Bearer timing-safe, dan service account
 * wajib ada. Kegagalan hapus dicatat di log dan dijawab 500 — run
 * berikutnya mencoba lagi; tidak ada data pengguna yang hilang
 * bila satu run gagal, hanya dokumen lama yang tertunda dihapus. */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/require-env";
import {
  cleanupOldEvents,
  getServiceAccountAccessToken,
} from "@/lib/analytics-server";

/* Kebijakan retensi per koleksi (FIN-08). analytics_events (90 hari)
 * ditangani cleanupOldEvents; tiga koleksi di bawah ditangani
 * cleanupCollection di berkas ini.
 *
 * - rate_limits (7 hari, field updatedAt timestamp): semua jendela
 *   batas laju adalah 60 detik, jadi dokumen yang tidak disentuh
 *   7 hari hanya berisi hit yang sudah kedaluwarsa — loadKey sudah
 *   mengabaikannya. 7 hari memberi ruang debug pola penyalahgunaan.
 * - alerts (90 hari, field createdAt string ISO): alert deadline
 *   menyangkut batas lamar 0-3 hari dan alert new-target basi dalam
 *   hitungan hari; alert yang belum terkirim berumur 90 hari pun
 *   sudah tidak layak dikirim (batasnya lewat ~3 bulan). Watcher
 *   agent-side membaca seluruh koleksi tiap run, jadi akumulasi
 *   tanpa batas langsung menambah baca watcher.
 * - changes (180 hari, field createdAt string ISO): umpan Yang
 *   berubah hanya menampilkan 10 terbaru (maks 50) dan watchdog
 *   write-back hanya memeriksa 10 terbaru; 180 hari menyimpan
 *   riwayat setengah tahun sebagai jejak audit tanpa menumpuk
 *   tanpa batas.
 * Dokumen tanpa field penanda umur tidak pernah cocok dengan query
 * dan dibiarkan — semua penulis mengisi field itu. */
export const RETENTION_POLICIES = [
  {
    collection: "rate_limits",
    field: "updatedAt",
    valueType: "timestampValue",
    retentionDays: 7,
    maxDelete: 200,
  },
  {
    collection: "alerts",
    field: "createdAt",
    valueType: "stringValue",
    retentionDays: 90,
    maxDelete: 100,
  },
  {
    collection: "changes",
    field: "createdAt",
    valueType: "stringValue",
    retentionDays: 180,
    maxDelete: 100,
  },
];

const CLEANUP_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* Hapus dokumen lama satu koleksi, mengikuti pola cleanupOldEvents
 * (query runQuery + batchWrite lewat token service account).
 * Field timestampValue dibandingkan sebagai timestamp; field
 * stringValue ISO dibandingkan sebagai string — urutan leksikografis
 * ISO 8601 UTC sama dengan urutan kronologis. Menghapus maks
 * `maxDelete` dokumen tertua per run; kembalikan { deleted, cutoff,
 * hasMore } supaya pemanggil tahu bila masih ada sisa. MELEMPAR bila
 * token/query/hapus gagal — pemanggil cron wajib mencatat
 * kegagalannya, bukan menelan diam. */
export async function cleanupCollection(
  { collection, field, valueType, retentionDays, maxDelete },
  { fetchImpl = fetch, now = new Date(), token, projectId } = {},
) {
  if (!projectId) {
    throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID belum dipasang.");
  }
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
  const value =
    valueType === "timestampValue"
      ? { timestampValue: cutoff }
      : { stringValue: cutoff };
  const queryRes = await fetchWithTimeout(
    fetchImpl,
    `${base}/documents:runQuery`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collection }],
          where: {
            fieldFilter: {
              field: { fieldPath: field },
              op: "LESS_THAN",
              value,
            },
          },
          orderBy: [{ field: { fieldPath: field }, direction: "ASCENDING" }],
          limit: maxDelete,
        },
      }),
    },
    CLEANUP_TIMEOUT_MS,
  );
  if (!queryRes.ok) {
    throw new Error(`Query ${collection} lama gagal: HTTP ${queryRes.status}.`);
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
    CLEANUP_TIMEOUT_MS,
  );
  if (!batchRes.ok) {
    throw new Error(`Hapus ${collection} lama gagal: HTTP ${batchRes.status}.`);
  }
  return { deleted: names.length, cutoff, hasMore: names.length >= maxDelete };
}

/* Perbandingan string timing-safe: panjang beda langsung gagal, isi
 * dibandingkan tanpa bocor lewat waktu. */
function secretsEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/* Balasan 503 generik untuk semua kegagalan konfigurasi cron
 * (SEC-05): satu pesan yang sama, tanpa menyebut variabel mana
 * yang hilang — detail itu hanya dicatat di log server. */
function cronUnavailable() {
  return NextResponse.json(
    {
      error: "cron belum diaktifkan",
      detail: "konfigurasi cron belum lengkap",
    },
    { status: 503 },
  );
}

export async function GET(request) {
  /* 1. Keamanan cron: fail-closed. Tanpa CRON_SECRET, rute tidak
   * pernah berjalan — menjawab 503, bukan mengizinkan tanpa auth. */
  let secret;
  try {
    secret = requireEnv("CRON_SECRET");
  } catch {
    console.warn("Cron cleanup ditolak: CRON_SECRET belum dipasang.");
    return cronUnavailable();
  }
  const auth = request.headers.get("authorization") || "";
  if (!secretsEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  /* 2. Service account wajib ada: hapus dokumen ditutup rules untuk
   * klien, jadi penghapusan hanya bisa lewat token service account. */
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.warn("Cron cleanup ditolak: service account belum dipasang.");
    return cronUnavailable();
  }

  /* 3. Hapus event analitik lama (90 hari). cleanupOldEvents melempar
   * bila gagal — catat dan jawab 500 supaya kegagalannya terlihat
   * di log. */
  let analytics;
  try {
    analytics = await cleanupOldEvents();
  } catch (err) {
    console.warn("Cron cleanup gagal:", err && err.message ? err.message : err);
    return NextResponse.json(
      { error: "Pembersihan event gagal." },
      { status: 500 },
    );
  }

  /* 4. Retensi tiga koleksi lain (FIN-08). Satu token service
   * account untuk semua koleksi (sudah di-cache modul saat langkah
   * 3 mengambilnya). Kegagalan satu koleksi menghentikan run —
   * run berikutnya mencoba lagi — supaya kegagalan terlihat, bukan
   * tertelan diam. */
  try {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const token = await getServiceAccountAccessToken();
    if (!token) {
      throw new Error(
        "Token service account tidak tersedia; pembersihan dibatalkan.",
      );
    }
    const retention = {};
    for (const policy of RETENTION_POLICIES) {
      retention[policy.collection] = await cleanupCollection(policy, {
        token,
        projectId,
      });
    }
    return NextResponse.json({ ...analytics, retention });
  } catch (err) {
    console.warn(
      "Cron cleanup retensi gagal:",
      err && err.message ? err.message : err,
    );
    return NextResponse.json(
      { error: "Pembersihan retensi gagal." },
      { status: 500 },
    );
  }
}
