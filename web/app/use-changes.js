"use client";

/* Umpan perubahan status dari /api/changes, dibaca sekali lalu dibagi ke
 * semua komponen di halaman (umpan "Yang berubah" dan chip Baru di daftar
 * target), supaya satu halaman tidak memanggil API dua kali. Gagal dimuat
 * dilaporkan apa adanya, bukan dianggap "tidak ada perubahan". */
import { useEffect, useState } from "react";

let shared = null;

export function loadChanges() {
  if (!shared) {
    shared = fetch("/api/changes", {
      signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(15_000) : undefined,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((body) => (Array.isArray(body.changes) ? body.changes : []))
      .catch((err) => {
        shared = null;
        throw err;
      });
  }
  return shared;
}

export function useChanges() {
  const [state, setState] = useState({ changes: null, failed: false });
  useEffect(() => {
    let alive = true;
    loadChanges()
      .then((changes) => alive && setState({ changes, failed: false }))
      .catch(() => alive && setState({ changes: null, failed: true }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
