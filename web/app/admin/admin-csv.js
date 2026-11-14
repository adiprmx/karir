"use client";

/* Seksi impor dan unduh data panel admin (FE-18, dipindah dari
 * page.js): pilih file CSV, ringkasan baris valid dan ditolak,
 * tombol impor, serta tombol unduh CSV dan JSON. */

import { MAX_IMPORT } from "./admin-helpers";

export default function CsvSection({
  csvFileName,
  csvError,
  csvValid,
  csvRejected,
  csvMessage,
  importing,
  onFile,
  onImport,
  onExportCsv,
  onExportJson,
}) {
  return (
    <div className="filters" style={{ marginTop: 24 }}>
      <p className="section-label">Impor dan unduh data</p>
      <p className="section-note">
        Impor menerima file CSV 13 kolom (no, perusahaan, kategori,
        link_karir, status, tanggal_cek, catatan, lokasi, posisi,
        email_hrd, wa_hrd, kontak_lain, batas_lamar) — sama dengan
        format CSV repo — atau 9 kolom lama tanpa 4 kolom terakhir.
        Maksimal 100 baris per impor.
      </p>
      <fieldset>
        <legend>Pilih file CSV</legend>
        <label className="sr-only" htmlFor="admin-csv">
          Pilih file CSV
        </label>
        <input
          id="admin-csv"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFile(e.target.files?.[0] || null)}
        />
      </fieldset>
      {csvFileName && (
        <p className="notice" role="status">
          File: {csvFileName}
        </p>
      )}
      {csvError && (
        <p className="notice" role="alert">
          {csvError}
        </p>
      )}
      {(csvValid.length > 0 || csvRejected.length > 0) && (
        <p className="notice" role="status">
          {csvValid.length} baris valid, {csvRejected.length} baris
          ditolak
          {csvRejected.length > 0
            ? `. Pertama yang ditolak: baris ${csvRejected[0].line}, ${csvRejected[0].reason}`
            : "."}
        </p>
      )}
      {csvValid.length > MAX_IMPORT && (
        <p className="notice" role="alert">
          Terlalu banyak: {csvValid.length} baris valid. Maksimal{" "}
          {MAX_IMPORT} baris per impor. Bagi file jadi beberapa bagian.
        </p>
      )}
      <div className="filter-actions">
        <button
          className="btn"
          type="button"
          onClick={onImport}
          disabled={
            importing ||
            csvValid.length === 0 ||
            csvValid.length > MAX_IMPORT
          }
        >
          {importing ? "Mengimpor…" : `Impor ${csvValid.length} baris`}
        </button>
        <button className="btn ghost" type="button" onClick={onExportCsv}>
          Unduh CSV
        </button>
        <button className="btn ghost" type="button" onClick={onExportJson}>
          Unduh JSON
        </button>
      </div>
      {csvMessage && <p className="notice">{csvMessage}</p>}
    </div>
  );
}
