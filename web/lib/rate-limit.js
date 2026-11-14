/* Batas laju bersama untuk API Karir.
 *
 * Masalah yang diperbaiki: batas laju lama hidup di Map memori tiap
 * route, jadi hilang tiap cold start dan tidak dibagikan antar
 * instance serverless. Modul ini menyediakan satu antarmuka store
 * yang bisa diganti, dan pemilih store yang membaca env saat jalan.
 *
 * Urutan pemakaian store (dipilih sekali saat limiter dibuat):
 *   1. Redis lewat REST Upstash, bila env KV ada
 *      (KV_REST_API_URL + KV_REST_API_TOKEN, atau
 *      UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
 *      Satu panggilan pipeline per pemeriksaan, tanpa SDK tambahan.
 *   2. Firestore, bila env Firebase ada
 *      (NEXT_PUBLIC_FIREBASE_PROJECT_ID +
 *      NEXT_PUBLIC_FIREBASE_API_KEY, sama seperti analitik).
 *      Cache memori di depan, tulis balik tiap 10 hit per kunci
 *      atau saat mendekati batas, supaya kuota tulis tidak terbakar.
 *   3. Memori, bila keduanya tidak terkonfigurasi (pengembangan).
 *
 * Cadangan runtime (OPS-06): pilihan di atas hanya memilih store
 * UTAMA. Bila Redis gagal saat jalan, pemeriksaan beralih ke
 * Firestore (bila terkonfigurasi); bila Firestore tidak ada, ke
 * batas darurat memori di dalam store Redis. Bila Firestore
 * sendiri tidak terjangkau, store Firestore memutuskan dari cache
 * memorinya. Jadi kegagalan satu backend tidak pernah berarti
 * "tanpa batas sama sekali" di jalur produksi.
 *
 * Semua store memakai kunci yang sama: "<cakupan>:<hash IP harian>".
 * Hash dibuat pemanggil (hashVisitor), jadi modul ini tidak pernah
 * melihat, mencatat, atau menyimpan IP mentah. Cakupan dibuat lewat
 * scopedKey() supaya tiap rute punya embernya sendiri (BE-03).
 *
 * Kegagalan store TIDAK BOLEH mematikan situs: tidak ada store yang
 * fail-closed. Tetapi fail-open murni (membuka pintu tanpa batas)
 * tidak lagi terjadi di jalur produksi: ujung rantai cadangan
 * adalah batas darurat memori yang lebih ketat — separuh batas
 * rute, lantai 5/menit (SEC-12, emergencyLimit). Alasan tetap
 * tidak fail-closed: batas laju adalah pertahanan terhadap
 * penyalahgunaan, bukan syarat halaman tampil; situs yang mati
 * total untuk semua pengunjung lebih merugikan daripada
 * pemeriksaan batas yang terlewat saat backend bermasalah. Setiap
 * kali cadangan dipakai, satu peringatan dicatat (dibatasi sekali
 * per menit per instance store, supaya log tidak dibanjiri) —
 * fail-open tidak lagi diam. Risiko ini dicatat di laporan fitur,
 * bukan disembunyikan.
 *
 * Jujur soal token: token /api/index bisa diperoleh browser mana pun
 * yang membuka situs (oleh desain, lewat GET /api/token), jadi token
 * bukan autentikasi dan batas laju tidak boleh bergantung pada
 * kerahasiaan token. Yang membatasi penyalahgunaan adalah batas
 * laju per hash IP di sini ditambah penolakan UA otomatis di
 * api-guard.js, bukan token. */

import { jsonWithTimeout } from "./companies.js";

export const RATE_LIMIT_WINDOW_MS = 60_000;

/* Jumlah hit per kunci yang menumpuk di cache memori sebelum store
 * Firestore ditulis balik. Satu tulis per 10 request, bukan satu
 * tulis per request, supaya kuota tulis Spark tidak cepat habis. */
export const FIRESTORE_SYNC_EVERY = 10;

/* Batas waktu satu panggilan store, supaya request API tidak
 * menggantung menunggu backend batas laju. */
const STORE_TIMEOUT_MS = 3000;

/* Jeda antar peringatan fail-open per instance store (SEC-12):
 * saat backend mati dan trafik tinggi, peringatan dicatat paling
 * banyak sekali per menit supaya log tidak dibanjiri. */
const FAILOPEN_WARN_INTERVAL_MS = 60_000;

/* Batas darurat memori saat store utama gagal dan tidak ada store
 * cadangan (SEC-12): separuh batas rute, dengan lantai 5/menit.
 * Lebih ketat dari batas normal dengan sengaja — saat backend
 * mati, tiap instance hanya melihat hit-nya sendiri, jadi jatah
 * per instance dipangkas sebagai margin keamanan. Lantai 5 menjaga
 * rute tetap bisa dipakai pemakaian normal selama gangguan. */
export function emergencyLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.max(5, Math.floor(n / 2));
}

/* Pembuat pemberi peringatan yang dibatasi sekali per jeda.
 * Dipakai tiap store untuk mencatat saat ia memakai cadangan,
 * tanpa membanjiri log. Pesan tidak pernah berisi IP, token,
 * atau isi request. */
function createThrottledWarn(message) {
  let lastAt = 0;
  return () => {
    const now = Date.now();
    if (now - lastAt < FAILOPEN_WARN_INTERVAL_MS) return;
    lastAt = now;
    console.warn(message);
  };
}

/* Nama dokumen Firestore untuk satu kunci batas laju. Kunci hanya
 * berisi cakupan dan hash heksa, jadi cukup ganti karakter selain
 * huruf, angka, garis bawah, dan strip. */
export function firestoreDocId(key) {
  return String(key).replace(/[^A-Za-z0-9_-]/g, "-");
}

/* Cakupan batas laju per rute (BE-03). Tanpa cakupan, satu pengunjung
 * yang membanjiri satu rute ikut mengunci rute lain untuk dirinya
 * sendiri, karena semua rute berbagi satu ember dengan kunci yang
 * sama. Setiap rute WAJIB memanggil check() dengan kunci berawalan
 * cakupannya sendiri lewat pembantu ini, misal
 * scopedKey("companies", hash). Cakupan hanya boleh huruf, angka,
 * garis bawah, dan strip; nilai lain ditolak supaya kunci tidak
 * pernah mengandung karakter yang merusak store (mis. ":" ganda
 * atau spasi). */
export function scopedKey(scope, hash) {
  const s = String(scope ?? "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(s)) {
    throw new Error("cakupan batas laju tidak valid");
  }
  return `${s}:${hash}`;
}

/* Jendela geser di memori. Dipakai langsung saat tidak ada backend,
 * dan sebagai cache di depan store Firestore. Bentuk yang sama
 * dengan checkRateLimit lama di api-guard.js. */
export function createMemoryStore() {
  const hits = new Map();
  return {
    kind: "memory",
    check(key, limit, windowMs = RATE_LIMIT_WINDOW_MS, now = Date.now()) {
      const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (list.length >= limit) {
        if (list.length === 0) hits.delete(key);
        else hits.set(key, list);
        return false;
      }
      list.push(now);
      hits.set(key, list);
      return true;
    },
    /* Dipakai test dan dipakai store Firestore untuk membaca dan
     * mengganti isi cache satu kunci. */
    getHits(key) {
      return [...(hits.get(key) || [])];
    },
    setHits(key, list) {
      if (list.length === 0) hits.delete(key);
      else hits.set(key, [...list]);
    },
    reset() {
      hits.clear();
    },
  };
}

/* Satu panggilan fetch dengan batas waktu. Kembalikan null bila
 * gagal apa pun, supaya pemanggil bisa fail-open. */
async function fetchWithTimeout(fetchImpl, url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORE_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* Store Redis lewat REST Upstash, tanpa SDK.
 *
 * Satu pemeriksaan = satu panggilan pipeline berisi empat perintah
 * atas sorted set per kunci:
 *   ZADD kunci <sekarang> <anggota unik>
 *   ZREMRANGEBYSCORE kunci 0 <sekarang - jendela>
 *   ZCARD kunci
 *   EXPIRE kunci 120
 * Skor adalah waktu hit dalam milidetik, jadi anggota lama yang
 * keluar jendela dibuang sebelum dihitung. Anggota unik per hit
 * supaya dua hit di milidetik yang sama tetap dihitung dua kali.
 * EXPIRE 120 detik memberi ruang dua jendela penuh, jadi kunci
 * tidak hilang di tengah jendela yang sedang berjalan.
 *
 * Bila jumlah hit melewati batas, hit itu tetap tercatat di set.
 * Itu sengaja: satu panggilan pipeline lebih hemat daripada
 * memeriksa dulu lalu mencatat, dan kelebihan hitungannya hilang
 * sendiri saat jendela bergeser.
 *
 * Bila Redis gagal (jaringan, respons bukan OK, body tidak bisa
 * dibaca, bentuk tak dikenal), pemeriksaan TIDAK langsung membuka
 * pintu tanpa batas: ia beralih ke store `fallback` bila ada
 * (OPS-06 — dirakit createRateLimiter menjadi store Firestore),
 * lalu ke batas darurat memori dengan emergencyLimit (SEC-12).
 * Setiap kegagalan dicatat satu peringatan (dibatasi sekali per
 * menit). Tanpa url/token, store ini tidak punya backend — itu
 * kesalahan konfigurasi, bukan kegagalan runtime, jadi tidak ada
 * peringatan; keputusan tetap lewat cadangan/darurat.
 *
 * Token REST tidak pernah dicatat atau dilempar ke pesan error. */
export function createUpstashStore({
  url,
  token,
  fetchImpl = fetch,
  fallback,
} = {}) {
  const base = String(url || "").replace(/\/+$/, "");
  /* Batas darurat memori (SEC-12): hanya dipakai bila tidak ada
   * store cadangan dan Redis gagal. */
  const emergency = createMemoryStore();
  const warnFailOpen = createThrottledWarn(
    "[rate-limit] store upstash gagal; batas laju memakai cadangan.",
  );

  /* Jalur cadangan saat Redis gagal: store fallback dulu (batas
   * normal — ia store bersama yang sesungguhnya), lalu batas
   * darurat memori (batas lebih ketat, per instance). */
  async function degraded(key, limit, windowMs, now, { warn = true } = {}) {
    if (warn) warnFailOpen();
    if (fallback) return fallback.check(key, limit, windowMs, now);
    return emergency.check(key, emergencyLimit(limit), windowMs, now);
  }

  return {
    kind: "upstash",
    async check(key, limit, windowMs = RATE_LIMIT_WINDOW_MS, now = Date.now()) {
      if (!base || !token) {
        return degraded(key, limit, windowMs, now, { warn: false });
      }
      const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
      const redisKey = `rl:${key}`;
      const res = await fetchWithTimeout(fetchImpl, `${base}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["ZADD", redisKey, now, member],
          ["ZREMRANGEBYSCORE", redisKey, 0, now - windowMs],
          ["ZCARD", redisKey],
          ["EXPIRE", redisKey, 120],
        ]),
      });
      if (!res || !res.ok) return degraded(key, limit, windowMs, now);
      let data;
      try {
        /* res.json() WAJIB bertimeout (BE-09): fetchWithTimeout
         * mematikan timernya begitu header tiba, jadi tanpa ini
         * body yang stall menggantung pemeriksaan tanpa batas.
         * Timeout jatuh ke catch dan memakai cadangan. */
        data = await jsonWithTimeout(res, STORE_TIMEOUT_MS);
      } catch {
        return degraded(key, limit, windowMs, now);
      }
      if (!Array.isArray(data) || data.length < 3) {
        return degraded(key, limit, windowMs, now);
      }
      const count = data[2] && data[2].result;
      if (typeof count !== "number" || !Number.isFinite(count)) {
        return degraded(key, limit, windowMs, now);
      }
      return count <= limit;
    },
  };
}

/* Body Firestore REST untuk satu dokumen batas laju. Hanya berisi
 * larik waktu hit (milidetik) dan cap waktu tulis balik. Tidak ada
 * IP, tidak ada UA, tidak ada isi request lain. */
export function buildRateLimitFields(hits, nowIso) {
  return {
    fields: {
      hits: {
        arrayValue: {
          values: hits.map((t) => ({ integerValue: String(t) })),
        },
      },
      updatedAt: { timestampValue: nowIso },
    },
  };
}

/* Ambil larik waktu hit dari dokumen Firestore REST. Dokumen yang
 * tidak ada atau berbentuk lain dibaca sebagai larik kosong, supaya
 * pemanggil bisa fail-open tanpa cabang khusus. */
export function parseRateLimitDoc(doc) {
  const values = doc?.fields?.hits?.arrayValue?.values;
  if (!Array.isArray(values)) return [];
  const out = [];
  for (const v of values) {
    const n = Number(v.integerValue);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/* Store Firestore lewat REST, dengan cache memori di depan.
 *
 * Keputusan izin selalu dari cache memori (cepat, tanpa jaringan).
 * Firestore hanya dibaca sekali saat kunci belum pernah terlihat di
 * proses ini, dan ditulis balik tiap FIRESTORE_SYNC_EVERY hit per
 * kunci atau saat hitungan mendekati batas. Jadi satu penyerang
 * yang menembak tanpa henti tetap dibatasi di memori tiap instance,
 * dan tulis Firestore-nya paling banyak satu per 10 request.
 *
 * Semua kegagalan Firestore (jaringan, 403, 404 saat baca, bentuk
 * tak dikenal) ditelan dan keputusan memori tetap dipakai. Situs
 * tidak boleh mati karena backend batas laju bermasalah. Kegagalan
 * jaringan saat memuat kunci dicatat satu peringatan (dibatasi
 * sekali per menit) supaya gangguan terlihat di log; 404 saat baca
 * adalah keadaan normal (dokumen belum ada) dan tidak dicatat.
 *
 * Tulis memakai API key publik yang sama seperti analitik, dan
 * aturan firestore.rules untuk koleksi rate_limits hanya menerima
 * dokumen berbentuk { hits: larik angka maks 60, updatedAt }.
 * Itu tetap membuka permukaan bakar kuota: siapa pun bisa menulis
 * dokumen berbentuk benar. Batching di atas yang menahan laju
 * bakar dari jalur normal; aturan bentuk menahan dokumen sampah
 * berukuran besar. Bila kuota tulis jadi masalah, jalannya adalah
 * pindah ke Redis, bukan menutup endpoint ini. */
export function createFirestoreStore({
  projectId,
  apiKey,
  fetchImpl = fetch,
  syncEvery = FIRESTORE_SYNC_EVERY,
} = {}) {
  const memory = createMemoryStore();
  const loaded = new Set();
  const sinceSync = new Map();
  /* Peringatan saat Firestore tidak terjangkau (SEC-12): keputusan
   * tetap jalan dari cache memori, tetapi operator perlu tahu
   * bahwa hitungan antar instance sedang tidak dibagikan. */
  const warnUnreachable = createThrottledWarn(
    "[rate-limit] store firestore tidak terjangkau; keputusan batas laju memakai cache memori.",
  );
  const base =
    projectId && apiKey
      ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/rate_limits`
      : "";
  const headers = { "Content-Type": "application/json" };

  async function loadKey(key, now, windowMs) {
    if (!base || loaded.has(key)) return;
    loaded.add(key);
    const res = await fetchWithTimeout(
      fetchImpl,
      `${base}/${encodeURIComponent(firestoreDocId(key))}?key=${apiKey}`,
      { headers },
    );
    /* res null = jaringan/timeout: Firestore tidak terjangkau,
     * catat peringatan (sekali per menit) lalu putuskan dari
     * cache memori. Respons bukan OK (mis. 404 = dokumen belum
     * ada) adalah keadaan normal dan tidak dicatat. */
    if (!res) {
      warnUnreachable();
      return;
    }
    if (!res.ok) return;
    let doc;
    try {
      /* Lihat catatan di store Redis: res.json() tanpa timeout
       * bisa menggantung karena timer fetch sudah dimatikan. */
      doc = await jsonWithTimeout(res, STORE_TIMEOUT_MS);
    } catch {
      return;
    }
    const fresh = parseRateLimitDoc(doc).filter((t) => now - t < windowMs);
    const merged = [...memory.getHits(key), ...fresh]
      .filter((t, i, arr) => arr.indexOf(t) === i)
      .sort((a, b) => a - b);
    memory.setHits(key, merged);
  }

  async function syncKey(key) {
    if (!base) return;
    const hits = memory.getHits(key);
    const body = JSON.stringify(
      buildRateLimitFields(hits, new Date().toISOString()),
    );
    const docUrl = `${base}/${encodeURIComponent(firestoreDocId(key))}?key=${apiKey}`;
    const patch = await fetchWithTimeout(fetchImpl, docUrl, {
      method: "PATCH",
      headers,
      body,
    });
    /* PATCH 404 berarti dokumen belum ada: buat dengan POST ke
     * koleksi beserta documentId. Kegagalan lain ditelan saja. */
    if (patch && patch.status === 404) {
      await fetchWithTimeout(
        fetchImpl,
        `${base}?documentId=${encodeURIComponent(firestoreDocId(key))}&key=${apiKey}`,
        { method: "POST", headers, body },
      );
    }
  }

  return {
    kind: "firestore",
    async check(key, limit, windowMs = RATE_LIMIT_WINDOW_MS, now = Date.now()) {
      await loadKey(key, now, windowMs);
      const allowed = memory.check(key, limit, windowMs, now);
      if (!base) return allowed;
      const count = (sinceSync.get(key) || 0) + 1;
      sinceSync.set(key, count);
      const nearLimit = memory.getHits(key).length >= limit - 5;
      if (count >= syncEvery || nearLimit) {
        sinceSync.set(key, 0);
        await syncKey(key);
      }
      return allowed;
    },
    reset() {
      memory.reset();
      loaded.clear();
      sinceSync.clear();
    },
  };
}

/* Pilih store dari env. Urutan: Redis, Firestore, memori.
 * fetchImpl bisa disuntik untuk test; di produksi pakai fetch global.
 * env bisa disuntik untuk test; default process.env.
 *
 * Rantai cadangan runtime (OPS-06): bila Redis DAN Firestore
 * terkonfigurasi, store Firestore dipasang sebagai `fallback`
 * store Redis — Redis yang gagal saat jalan beralih ke Firestore
 * (batas normal), dan hanya bila Firestore tidak terkonfigurasi
 * pemeriksaan jatuh ke batas darurat memori di dalam store Redis
 * (SEC-12). `kind` yang dilaporkan adalah store UTAMA, sama
 * seperti sebelum rantai ini ada. */
export function createRateLimiter({ fetchImpl = fetch, env = process.env } = {}) {
  const kvUrl = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const kvToken = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const firestore =
    projectId && apiKey
      ? createFirestoreStore({ projectId, apiKey, fetchImpl })
      : null;
  if (kvUrl && kvToken) {
    return createUpstashStore({
      url: kvUrl,
      token: kvToken,
      fetchImpl,
      fallback: firestore,
    });
  }
  if (firestore) return firestore;
  return createMemoryStore();
}

let sharedLimiter = null;

/* Satu limiter untuk semua route API dalam satu instance. Dibuat
 * malas saat pertama dipakai, supaya env sudah termuat. */
export function getSharedLimiter(options) {
  if (!sharedLimiter) sharedLimiter = createRateLimiter(options);
  return sharedLimiter;
}

/* Dipakai test saja, supaya tiap test mulai dari limiter baru. */
export function resetSharedLimiter() {
  sharedLimiter = null;
}
