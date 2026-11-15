/* Token visual untuk gambar pratinjau tautan (UX-13).
 *
 * Gambar OG di-render server (next/og + satori), jadi variabel CSS
 * tidak berlaku di sini. Nilai di bawah ini MENIRU token tema terang
 * di app/globals.css (:root) — bila token berubah, ubah juga di sini:
 * background = --surface, ink = --ink, muted = --muted. Huruf memakai
 * tumpukan sistem karena huruf Plus Jakarta Sans (token --font) tidak
 * bisa dimuat satori tanpa mengemas berkas hurufnya. */
export const OG_COLORS = {
  background: "#fffdf9",
  ink: "#15140f",
  muted: "#5f5c51",
};

export const OG_FONT = "system-ui, sans-serif";
