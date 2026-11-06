/* Menyimpan pencarian terakhir ke localStorage, tanpa tampilan.
 * Dipasang di halaman Cari; landing dan Dasbor hanya membaca
 * (lihat app/recent.js). Tidak mengubah hasil pencarian. */
"use client";

import { useEffect } from "react";
import { saveRecentSearch } from "@/app/recent";

export default function RecentSaver({ domisili, posisi }) {
  useEffect(() => {
    if (domisili || posisi) saveRecentSearch(domisili, posisi);
  }, [domisili, posisi]);
  return null;
}
