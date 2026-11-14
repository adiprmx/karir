/* Pencarian terakhir Karir: tersimpan di browser saja (localStorage),
 * tidak tersinkron ke akun. Dipakai landing (chip "Terakhir kamu
 * cari"), halaman Cari, dan Dasbor. Bentuk: {domisili, posisi}. */
"use client";

const KEY = "karir-recent-search";

export function loadRecentSearch() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const domisili = typeof data.domisili === "string" ? data.domisili : "";
    const posisi = typeof data.posisi === "string" ? data.posisi : "";
    if (!domisili && !posisi) return null;
    return { domisili, posisi };
  } catch {
    return null;
  }
}

export function saveRecentSearch(domisili, posisi) {
  const d = typeof domisili === "string" ? domisili.trim() : "";
  const p = typeof posisi === "string" ? posisi.trim() : "";
  if (!d && !p) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ domisili: d, posisi: p }));
    window.dispatchEvent(new Event("karir-recent-change"));
  } catch {
    /* Browser menolak tulis: abaikan, pencarian tetap jalan. */
  }
}

export function clearRecentSearch() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("karir-recent-change"));
  } catch {
    /* Abaikan. */
  }
}
