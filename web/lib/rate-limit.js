/* Batas laju bersama untuk API Karir.
 *
 * Masalah yang diperbaiki: batas laju lama hidup di Map memori tiap
 * route, jadi hilang tiap cold start dan tidak dibagikan antar
 * instance serverless. Modul ini menyediakan satu antarmuka store
 * yang bisa diganti, dan pemilih store yang membaca env saat jalan.
 *
 * Urutan pemakaian store:
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
 * Semua store memakai kunci yang sama: "<cakupan>:<hash IP harian>".
 * Hash dibuat pemanggil (hashVisitor), jadi modul ini tidak pernah
 * melihat, mencatat, atau menyimpan IP mentah.
 *
 * Kegagalan store TIDAK BOLEH mematikan situs: semua store membuka
 * pintu (fail-open) bila backend tidak bisa dijangkau atau menjawab
 * di luar bentuk yang dikenal. Alasan: batas laju adalah pertahanan
 * terhadap penyalahgunaan, bukan syarat halaman tampil; situs yang
 * mati total untuk semua pengunjung lebih merugikan daripada
 * pemeriksaan batas yang terlewat saat backend bermasalah. Risiko
 * ini dicatat di laporan fitur, bukan disembunyikan.
 *
 * Jujur soal token: token /api/index bisa diperoleh browser mana pun
 * yang membuka situs (oleh desain, lewat GET /api/token), jadi token
 * bukan autentikasi dan batas laju tidak boleh bergantung pada
 * kerahasiaan token. Yang membatasi penyalahgunaan adalah batas
 * laju per hash IP di sini ditambah penolakan UA otomatis di
 * api-guard.js, bukan token. */

export const RATE_LIMIT_WINDOW_MS = 60_000;

/* Jumlah hit per kunci yang menumpuk di cache memori sebelum store
 * Firestore ditulis balik. Satu tulis per 10 request, bukan satu
 * tulis per request, supaya kuota tulis Spark tidak cepat habis. */
export const FIRESTORE_SYNC_EVERY = 10;

/* Batas waktu satu panggilan store, supaya request API tidak
 * menggantung menunggu backend batas laju. */
const STORE_TIMEOUT_MS = 3000;

/* Nama dokumen Firestore untuk satu kunci batas laju. Kunci hanya
 * berisi cakupan dan hash heksa, jadi cukup ganti karakter selain
 * huruf, angka, garis bawah, dan strip. */
export function firestoreDocId(key) {
  return String(key).replace(/[^A-Za-z0-9_-]/g, "-");
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
 * Token REST tidak pernah dicatat atau dilempar ke pesan error. */
export function createUpstashStore({ url, token, fetchImpl = fetch } = {}) {
  const base = String(url || "").replace(/\/+$/, "");
  return {
    kind: "upstash",
    async check(key, limit, windowMs = RATE_LIMIT_WINDOW_MS, now = Date.now()) {
      if (!base || !token) return true;
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
      if (!res || !res.ok) return true;
      let data;
      try {
        data = await res.json();
      } catch {
        return true;
      }
      if (!Array.isArray(data) || data.length < 3) return true;
      const count = data[2] && data[2].result;
      if (typeof count !== "number" || !Number.isFinite(count)) return true;
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
 * tidak boleh mati karena backend batas laju bermasalah.
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
    if (!res || !res.ok) return;
    let doc;
    try {
      doc = await res.json();
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
 * env bisa disuntik untuk test; default process.env. */
export function createRateLimiter({ fetchImpl = fetch, env = process.env } = {}) {
  const kvUrl = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const kvToken = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (kvUrl && kvToken) {
    return createUpstashStore({ url: kvUrl, token: kvToken, fetchImpl });
  }
  const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (projectId && apiKey) {
    return createFirestoreStore({ projectId, apiKey, fetchImpl });
  }
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
