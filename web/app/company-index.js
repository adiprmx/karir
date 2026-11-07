"use client";

/* Indeks 406 perusahaan di browser: diambil sekali dari /api/index lalu
 * dipakai bersama oleh Beranda, Cari, dan Mulai. Pencarian dan skor
 * memakai lib/search.js yang sama dengan server, jadi hasilnya sama,
 * tetapi tanpa menunggu jaringan tiap kali mengetik. */
import { useCallback, useEffect, useState } from "react";
import { runSearch } from "@/lib/search";

let cached = null;
let inflight = null;

export function loadIndex() {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch("/api/index")
      .then((r) => {
        if (!r.ok) throw new Error("gagal");
        return r.json();
      })
      .then((j) => {
        cached = Array.isArray(j.companies) ? j.companies : [];
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
      start();
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
