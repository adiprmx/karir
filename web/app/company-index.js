"use client";

/* Indeks perusahaan di browser: diambil sekali dari /api/index lalu
 * dipakai bersama oleh Beranda, Cari, dan Mulai. Pencarian dan skor
 * memakai lib/search.js yang sama dengan server, jadi hasilnya sama,
 * tetapi tanpa menunggu jaringan tiap kali mengetik. */
import { useCallback, useEffect, useState } from "react";
import { matchedCompanyNos, runSearch } from "@/lib/search";
import { createIndexFetcher } from "@/lib/index-token";

let cached = null;
let cachedMeta = null;
let inflight = null;
/* Satu pemakai izin untuk semua pemanggil loadIndex: izin diminta
 * sekali, dipakai ulang sampai hampir habis (lihat lib/index-token). */
const indexFetcher = createIndexFetcher();

export function loadIndex() {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = indexFetcher
      .fetchIndex()
      .then((list) => {
        cached = list;
        cachedMeta = indexFetcher.getIndexMeta();
        return cached;
      })
      .finally(() => {
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
