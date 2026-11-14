"use client";

/* Seksi Laporan tautan mati panel admin (FE-18, dipindah dari
 * page.js): tombol tampilkan, lalu daftar laporan dari komponen
 * SupportReports. Dimuat hanya bila dibuka, supaya hemat kuota
 * baca. */

import SupportReports from "./support-reports";

export default function ReportsSection({ reportsOpen, onOpen, db }) {
  return (
    <div className="filters" style={{ marginTop: 24 }}>
      <p className="section-label">Laporan tautan mati</p>
      <p className="section-note">
        Laporan terbaru dari pengunjung yang menemukan tautan karir
        tidak bisa dibuka. Dimuat hanya bila dibuka, supaya hemat kuota
        baca.
      </p>
      {!reportsOpen ? (
        <button
          type="button"
          className="btn ghost"
          onClick={onOpen}
        >
          Tampilkan laporan tautan mati
        </button>
      ) : (
        <SupportReports db={db} />
      )}
    </div>
  );
}
