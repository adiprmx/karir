/* Lapisan baca umpan perubahan Karir — sumber: Firestore, koleksi
 * `changes` (proyek karir-9d53a). Dibaca lewat Firestore REST API
 * (fetch biasa), pola yang sama dengan lib/companies.js: SDK JS tidak
 * dipakai karena gRPC-nya tidak bisa menembus proxy egress VM ini.
 * Baca koleksi changes terbuka untuk siapa pun (lihat firestore.rules).
 * Dokumen perubahan bentuknya {companyNo, perusahaan, from, to,
 * checkedAt "YYYY-MM-DD", createdAt ISO}, ditulis cron cek ulang harian
 * (app/api/cron/recheck/route.js).
 *
 * Cache memori server 1 jam + dedup inflight (FIN-05): data perubahan
 * berubah paling banyak 1x sehari (cron harian), jadi tidak ada alasan
 * membaca Firestore tiap request. Bila fetch gagal dan ada cache lama,
 * cache lama dipakai; bila tidak ada, lempar supaya pemanggil bisa
 * memutuskan sendiri (API /api/changes mengembalikan daftar kosong,
 * bukan error). */

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/* TTL 1 jam: perubahan hanya ditulis cron harian (01:00 WIB) dan cek
 * massal admin, jadi data sejam lalu masih segar untuk umpan. */
const CHANGES_TTL_MS = 60 * 60 * 1000;
const cache = new Map();
const inflight = new Map();

export function revalidateChanges() {
  cache.clear();
  inflight.clear();
}

async function fetchJson(url, timeoutMs = 5_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 60 },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/* Baca body JSON dengan timeout sendiri (BE-09): pola yang sama
 * dengan jsonWithTimeout di lib/companies.js — fetch() resolve saat
 * header tiba dan timer AbortController di atas dimatikan saat itu,
 * jadi body yang stall bisa menggantung selamanya tanpa batas ini.
 * Bila timeout, getChanges memperlakukannya sama seperti kegagalan
 * baca: cache basi dipakai, atau lempar bila tidak ada cache. */
async function jsonWithTimeout(res, timeoutMs = 5_000) {
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

function docToChange(d) {
  const f = d.fields || {};
  const s = (k) => (f[k] && f[k].stringValue != null ? f[k].stringValue : "");
  const name = (d.name || "").split("/").pop() || "";
  return {
    id: name,
    companyNo:
      f.companyNo && f.companyNo.integerValue != null
        ? Number(f.companyNo.integerValue)
        : 0,
    perusahaan: s("perusahaan"),
    from: s("from"),
    to: s("to"),
    checkedAt: s("checkedAt"),
    createdAt: s("createdAt"),
  };
}

/* Perubahan terbaru dulu (createdAt menurun). Bila Firestore tidak bisa
 * dijangkau dan tidak ada cache lama, lempar supaya pemanggil bisa
 * memutuskan sendiri (API /api/changes mengembalikan daftar kosong,
 * bukan error). */
export async function getChanges(limit = 10) {
  const n = Math.max(1, Math.min(50, Number(limit) || 10));
  const now = Date.now();
  const cached = cache.get(n);
  if (cached && now - cached.at < CHANGES_TTL_MS) return cached.list;
  const pending = inflight.get(n);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const url =
        `${BASE}/changes?pageSize=${n}` +
        `&orderBy=${encodeURIComponent("createdAt desc")}&key=${API_KEY}`;
      const res = await fetchJson(url);
      if (!res.ok) {
        throw new Error(`Firestore list changes gagal: HTTP ${res.status}`);
      }
      const body = await jsonWithTimeout(res);
      const list = (body.documents || []).map(docToChange);
      /* Urutan cadangan di sisi server bila orderBy tidak diterapkan. */
      list.sort((a, b) =>
        (b.createdAt || "").localeCompare(a.createdAt || ""),
      );
      cache.set(n, { list, at: Date.now() });
      return list;
    } catch (err) {
      /* Gagal total (429/offline): cache basi lebih baik daripada
       * tidak ada data sama sekali. */
      if (cached) return cached.list;
      throw err;
    } finally {
      if (inflight.get(n) === promise) inflight.delete(n);
    }
  })();
  inflight.set(n, promise);
  return promise;
}
