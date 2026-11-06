/* Menandai halaman Metode sudah pernah dibuka, supaya langkah ketiga
 * Dasbor ("Periksa portal resmi sebelum melamar") bisa selesai.
 * Hanya menulis di browser ini; tidak ada data yang dikirim. */
"use client";

import { useEffect } from "react";

export default function Visited() {
  useEffect(() => {
    try {
      localStorage.setItem("karir-visited-metode", "1");
    } catch {
      /* Browser menolak tulis: abaikan. */
    }
  }, []);
  return null;
}
