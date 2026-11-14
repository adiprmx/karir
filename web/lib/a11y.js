/* Pembantu aksesibilitas murni (tanpa DOM) untuk Karir — T13.
 * Fungsi di sini sengaja tanpa DOM supaya bisa diuji unit
 * (lib/a11y.test.js); komponen yang memakai DOM (jebakan fokus Sheet,
 * roving focus tab/radio) memanggil pembantu ini untuk keputusan
 * murninya dan mengurus DOM-nya sendiri. */

/* Durasi toast (AKSES-08): toast yang berisi tautan diberi waktu
 * lebih lama (9 detik) supaya pengguna keyboard sempat mencapai
 * tautannya; toast tanpa tautan tetap 3,6 detik. */
export const TOAST_MS = 3600;
export const TOAST_LINK_MS = 9000;

export function toastDurationMs(hasLink) {
  return hasLink ? TOAST_LINK_MS : TOAST_MS;
}

/* Navigasi roving tabindex (UX-15): tombol panah/Home/End di dalam
 * tablist (Lamaran) dan radiogroup (pelacak detail). Mengembalikan
 * indeks berikutnya (membungkus di ujung), atau null bila tombol
 * bukan tombol navigasi. Indeks di luar jangkauan dijepit dulu,
 * supaya pemanggil yang belum punya pilihan (indeks -1) tetap
 * mendapat indeks yang sah. */
export function rovingIndex(current, count, key) {
  if (!count || count < 1) return null;
  const c = Math.min(Math.max(current, 0), count - 1);
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (c + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (c - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/* Luminans relatif WCAG 2.x dari satu warna hex "#rrggbb". */
export function relativeLuminance(hex) {
  const c = String(hex).replace("#", "");
  const channel = (i) => {
    const v = parseInt(c.substr(i, 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  );
}

/* Rasio kontras WCAG 2.x dari dua warna hex. Dipakai test untuk
 * mengunci token (UX-06 border >= 3:1, AKSES-07 placeholder
 * >= 4,5:1): bila token di globals.css berubah jadi gagal, test
 * ikut gagal. */
export function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/* Durasi animasi peta (AKSES-14): 0 bila pengguna meminta
 * reduced-motion — pemanggil memakai setView tanpa animasi — dan
 * 800 mdtk bila tidak. */
export const MAP_FLY_MS = 800;

export function mapFlyDurationMs(reducedMotion) {
  return reducedMotion ? 0 : MAP_FLY_MS;
}

/* Apakah dua state pencarian /cari sama (AKSES-02): hasil awal yang
 * di-render server hanya dipakai selama pengguna belum mengubah
 * apa pun; begitu ada perubahan, hasil dihitung ulang dari indeks
 * klien (atau menampilkan "Memuat..." sampai indeks siap). */
const QUERY_FIELDS = [
  "domisili",
  "posisi",
  "kategori",
  "kota",
  "status",
  "urutan",
];

export function sameSearchQuery(a, b) {
  if (!a || !b) return false;
  return QUERY_FIELDS.every((k) => (a[k] || "") === (b[k] || ""));
}
