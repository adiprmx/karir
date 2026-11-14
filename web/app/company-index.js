"use client";

/* Indeks perusahaan di browser: diambil sekali dari /api/index lalu
 * dipakai bersama oleh Beranda, Cari, dan Mulai. Pencarian dan skor
 * memakai lib/search.js yang sama dengan server, jadi hasilnya sama,
 * tetapi tanpa menunggu jaringan tiap kali mengetik.
 *
 * Cache persisten (FE-16/FIN-09): daftar disimpan di localStorage
 * dengan TTL 24 jam + kunci versi, supaya sesi baru tidak mengunduh
 * ulang ~450 KB. localStorage dipilih atas IndexedDB karena API-nya
 * sinkron (cocok dengan alur muat di sini), tidak butuh skema atau
 * migrasi, dan muatannya (~435 KB setelah pemangkasan field di
 * /api/index) jauh di bawah kuota localStorage umumnya (5 MB). Bila
 * localStorage tidak tersedia atau penuh, cache dilewati diam-diam
 * dan perilaku kembali ke muat-per-sesi seperti sebelumnya.
 *
 * Invalidasi memakai rev marker meta/lastChange: tiap sesi, cache
 * yang masih dalam TTL divalidasi ulang dengan satu request kecil
 * `GET /api/index?rev=N` — server menjawab 304 tanpa isi bila data
 * belum berubah, atau 200 dengan daftar baru bila berubah. Bila
 * validasi gagal karena jaringan, cache lama tetap dipakai (data
 * basi lebih baik daripada halaman error). Respons seed (rev null)
 * tidak pernah disimpan: cache hanya menyimpan data live yang
 * ber-revisi, supaya gangguan Firestore sesaat tidak menimpa cache
 * live dengan data cadangan. */
import { useCallback, useEffect, useState } from "react";
import { matchedCompanyNos, runSearch } from "@/lib/search";
import {
  createIndexFetcher,
  INDEX_FETCH_TIMEOUT_MS,
} from "@/lib/index-token";

/* Kunci cache memuat versi skema: naikkan angka di kunci DAN
 * INDEX_CACHE_VERSION bila bentuk entri berubah — entri lama
 * otomatis tidak valid dan diunduh ulang. */
export const INDEX_CACHE_KEY = "karir-index-v1";
export const INDEX_CACHE_VERSION = 1;
/* TTL cache 24 jam: cek ulang harian jalan 01:00 WIB dan hanya
 * menaikkan rev bila ada status yang berubah, jadi 24 jam membatasi
 * staleness paling buruk sampai satu hari; kasus umum ditangani
 * validasi rev (304) yang jauh lebih cepat dari TTL. */
export const INDEX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/* Bentuk entri cache: { v, rev, savedAt, companies, meta }.
 * v = versi skema; rev = revisi marker saat daftar diambil (null
 * bila tidak diketahui); savedAt = Date.now() saat simpan; meta =
 * { source, seedDate } dari respons /api/index. */
export function buildIndexCacheEntry(
  { companies, meta, rev },
  now = Date.now(),
) {
  return {
    v: INDEX_CACHE_VERSION,
    rev: typeof rev === "number" ? rev : null,
    savedAt: now,
    companies,
    meta: meta || { source: "live", seedDate: "" },
  };
}

export function isIndexCacheValid(entry, now = Date.now()) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return false;
  }
  if (entry.v !== INDEX_CACHE_VERSION) return false;
  if (!Array.isArray(entry.companies) || entry.companies.length === 0) {
    return false;
  }
  if (!Number.isFinite(entry.savedAt)) return false;
  if (now - entry.savedAt >= INDEX_CACHE_TTL_MS) return false;
  return true;
}

/* Baca entri cache dari storage (localStorage atau stub test).
 * Kembalikan entri yang valid, atau null bila tidak ada / rusak /
 * kedaluwarsa — semua kegagalan berarti "tidak ada cache". */
export function readIndexCache(storage, now = Date.now()) {
  try {
    if (!storage) return null;
    const raw = storage.getItem(INDEX_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    return isIndexCacheValid(entry, now) ? entry : null;
  } catch {
    return null;
  }
}

/* Tulis entri cache. Kembalikan false bila gagal (kuota penuh,
 * storage tidak tersedia) — kegagalan cache tidak pernah
 * menggagalkan pemakaian daftar. */
export function writeIndexCache(storage, entry) {
  try {
    if (!storage || !entry) return false;
    storage.setItem(INDEX_CACHE_KEY, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

function browserStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

let cached = null;
let cachedMeta = null;
let inflight = null;
/* Satu pemakai izin untuk semua pemanggil loadIndex: izin diminta
 * sekali, dipakai ulang sampai hampir habis (lihat lib/index-token).
 * Fetcher dipakai untuk tokennya (getToken); pengambilan /api/index
 * sendiri dilakukan fetchIndexJson di bawah, karena fetcher tidak
 * mendukung parameter ?rev=N untuk validasi ulang. */
const indexFetcher = createIndexFetcher();

/* Hanya untuk test: kosongkan cache memori modul antar test. */
export function resetCompanyIndexForTests() {
  cached = null;
  cachedMeta = null;
  inflight = null;
}

async function fetchWithTimeout(fetchImpl, url, token, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          try {
            controller.abort();
          } catch {
            /* Pembatalan bersifat best-effort. */
          }
          reject(new Error("Timeout memuat data."));
        }, timeoutMs);
      }),
    ]);
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
          reject(new Error("Timeout memuat data."));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/* Ambil /api/index dengan token dari fetcher. rev (bila angka)
 * dikirim sebagai ?rev=N untuk validasi ulang: server menjawab 304
 * tanpa isi bila data belum berubah. Kembalikan { status, json } —
 * json null untuk 304. 401 memicu satu pengambilan token baru +
 * ulang sekali, seperti perilaku lama di lib/index-token. */
async function fetchIndexJson({
  fetchImpl = fetch,
  rev = null,
  timeoutMs = INDEX_FETCH_TIMEOUT_MS,
} = {}) {
  const url = rev === null ? "/api/index" : `/api/index?rev=${rev}`;
  const token = await indexFetcher.getToken();
  let res = await fetchWithTimeout(fetchImpl, url, token, timeoutMs);
  if (res.status === 401) {
    const fresh = await indexFetcher.getToken(true);
    res = await fetchWithTimeout(fetchImpl, url, fresh, timeoutMs);
  }
  if (res.status === 304) return { status: 304, json: null };
  if (!res.ok) throw new Error("gagal");
  return { status: res.status, json: await readJsonWithTimeout(res, timeoutMs) };
}

function parseIndexJson(json) {
  const companies = Array.isArray(json?.companies) ? json.companies : [];
  const meta = {
    source: json?.source === "seed" ? "seed" : "live",
    seedDate: typeof json?.seedDate === "string" ? json.seedDate : "",
  };
  const rev = typeof json?.rev === "number" ? json.rev : null;
  return { companies, meta, rev };
}

function applyToMemory(companies, meta) {
  cached = companies;
  cachedMeta = meta;
  return cached;
}

/* Simpan daftar ke cache persisten — hanya bila ber-revisi (data
 * live). Respons seed (rev null) tidak pernah disimpan. */
function persistIfLive(companies, meta, rev) {
  if (rev === null) return;
  writeIndexCache(
    browserStorage(),
    buildIndexCacheEntry({ companies, meta, rev }),
  );
}

async function loadFresh() {
  const { json } = await fetchIndexJson({ rev: null });
  const { companies, meta, rev } = parseIndexJson(json);
  persistIfLive(companies, meta, rev);
  return applyToMemory(companies, meta);
}

async function loadWithCache() {
  const stored = readIndexCache(browserStorage());
  if (!stored) return loadFresh();
  /* Cache ada dan masih dalam TTL: validasi ulang rev. */
  try {
    const { status, json } = await fetchIndexJson({ rev: stored.rev });
    if (status === 304) {
      /* Data belum berubah: perbarui stempel simpan supaya TTL
       * dihitung dari validasi terakhir, lalu pakai cache. */
      writeIndexCache(browserStorage(), { ...stored, savedAt: Date.now() });
      return applyToMemory(stored.companies, stored.meta);
    }
    const { companies, meta, rev } = parseIndexJson(json);
    persistIfLive(companies, meta, rev);
    return applyToMemory(companies, meta);
  } catch {
    /* Validasi gagal (jaringan putus dsb.): pakai cache lama. */
    return applyToMemory(stored.companies, stored.meta);
  }
}

export function loadIndex() {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = loadWithCache().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/* eager: mulai muat saat mount. Selain itu, dimuat saat browser
 * menganggur (atau saat pengguna mulai mengetik, lewat start()). */
/* meta: {source, seedDate} dari respons /api/index terakhir (null
 * sebelum indeks dimuat). Pemakai menampilkan catatan "data cadangan"
 * bila meta.source === "seed". */
export function useCompanyIndex({ eager = false } = {}) {
  const [index, setIndex] = useState(cached);
  const [meta, setMeta] = useState(cachedMeta);
  const [state, setState] = useState(cached ? "ok" : "idle");

  const start = useCallback(() => {
    if (cached) {
      setIndex(cached);
      setMeta(cachedMeta);
      setState("ok");
      return;
    }
    setState("loading");
    loadIndex()
      .then((list) => {
        setIndex(list);
        setMeta(cachedMeta);
        setState("ok");
      })
      .catch(() => setState("error"));
  }, []);

  useEffect(() => {
    if (cached) return;
    if (eager) {
      /* Muat langsung dijadwalkan sebagai microtask: start() mengatur
       * state, jadi tidak dipanggil sinkron di badan effect. */
      queueMicrotask(start);
      return;
    }
    let id;
    if ("requestIdleCallback" in window) {
      id = window.requestIdleCallback(start, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    id = window.setTimeout(start, 1500);
    return () => window.clearTimeout(id);
  }, [eager, start]);

  return { index, meta, state, start };
}

/* Urutkan dan tandai yang cocok. "Cocok" berarti memenuhi semua isian
 * yang diketik (posisi DAN domisili); skor tetap menentukan urutan. */
export function rank(index, params) {
  const { results, mode, query } = runSearch(index, params);
  const hasD = query.domisiliTokens.length > 0;
  const hasP = query.posisiTokens.length > 0;
  /* Aturan "cocok" yang sama dipakai hasil awal server /cari
   * (AKSES-02) lewat matchedCompanyNos — jangan ditulis ulang. */
  const matched = new Set(matchedCompanyNos(results, query));
  const flat = (groups) => [...new Set(groups.flat())];
  return {
    results,
    mode,
    matched,
    hasD,
    hasP,
    terms: {
      pos: flat(query.posisiTokens),
      loc: flat(query.domisiliTokens),
    },
  };
}
