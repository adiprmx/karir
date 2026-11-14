"use client";

/* Indeks perusahaan di browser: diambil sekali dari /api/index lalu
 * dipakai bersama oleh Beranda, Cari, dan Mulai. Pencarian dan skor
 * memakai lib/search.js yang sama dengan server, jadi hasilnya sama,
 * tetapi tanpa menunggu jaringan tiap kali mengetik. */
import { useCallback, useEffect, useState } from "react";
import { runSearch } from "@/lib/search";
import { createIndexFetcher } from "@/lib/index-token";

let cached = null;
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
export function useCompanyIndex({ eager = false } = {}) {
  const [index, setIndex] = useState(cached);
  const [state, setState] = useState(cached ? "ok" : "idle");

  const start = useCallback(() => {
    if (cached) {
      setIndex(cached);
      setState("ok");
      return;
    }
    setState("loading");
    loadIndex()
      .then((list) => {
        setIndex(list);
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

  return { index, state, start };
}

/* Urutkan dan tandai yang cocok. "Cocok" berarti memenuhi semua isian
 * yang diketik (posisi DAN domisili); skor tetap menentukan urutan. */
export function rank(index, params) {
  const { results, mode, query } = runSearch(index, params);
  const hasD = query.domisiliTokens.length > 0;
  const hasP = query.posisiTokens.length > 0;
  const matched = new Set();
  if (hasD || hasP) {
    for (const e of results) {
      const okP = !hasP || e.positionMatched || e.nameMatched;
      const okD = !hasD || e.reasons.includes("Lokasi cocok");
      if (okP && okD) matched.add(e.company.no);
    }
  }
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
