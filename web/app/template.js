"use client";

/* Template (bukan layout): dibuat ulang tiap pindah halaman, jadi isi
 * halaman masuk dengan satu gerak singkat. Cuma opacity dan geser 6px.
 *
 * AKSES-01: template juga yang memindahkan fokus saat rute berubah —
 * navigasi client-side Next.js tidak memindahkan fokus secara bawaan,
 * sehingga fokus tertinggal di tautan yang sudah tidak ada (jatuh ke
 * <body>) dan pembaca layar tidak mengumumkan halaman baru. Saat
 * halaman baru mount (bukan saat muat pertama), fokus dipindah ke
 * <h1> pertama di dalam <main> (atau ke <main> bila tidak ada h1).
 * Satu sistem dengan Sheet (visual.js): bila navigasi terjadi dari
 * dalam sheet (tautan menu), efek ini jalan sesudah Sheet
 * mengembalikan fokus ke pemicunya, jadi judul halaman yang menang.
 * Percobaan diulang singkat karena konten streaming bisa tiba
 * sesudah mount. */
import { useEffect } from "react";

let firstMount = true;

function focusPageHeading(attempt = 0) {
  const main = document.querySelector("main");
  if (!main) return;
  const h1 = main.querySelector("h1");
  if (h1) {
    if (h1.tabIndex !== -1) h1.tabIndex = -1;
    h1.focus({ preventScroll: true });
    if (document.activeElement === h1) return;
  }
  if (attempt < 3) {
    setTimeout(() => focusPageHeading(attempt + 1), 120);
    return;
  }
  /* h1 tidak kunjung ada (halaman tanpa h1): fokus ke <main>. */
  if (main.tabIndex !== -1) main.tabIndex = -1;
  main.focus({ preventScroll: true });
}

export default function Template({ children }) {
  useEffect(() => {
    if (firstMount) {
      /* Muat pertama: jangan curi fokus — pengguna harus tetap bisa
       * mencapai skip link dan navigasi dengan Tab pertama. */
      firstMount = false;
      return;
    }
    focusPageHeading();
  }, []);
  return <div className="page">{children}</div>;
}
