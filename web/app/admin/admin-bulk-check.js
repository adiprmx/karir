"use client";

/* Seksi cek massal tautan panel admin (FE-18, dipindah dari
 * page.js): tombol cek semua tautan perusahaan yang ada lowongan,
 * progres berjalan, dan daftar hasil per perusahaan. */

import { formatTime } from "./admin-helpers";

export default function BulkCheckSection({
  targetCompanies,
  bulkRunning,
  bulkDone,
  bulkResults,
  bulkChanges,
  onCheck,
}) {
  return (
    <div className="filters" style={{ marginTop: 24 }}>
      <p className="section-label">Cek massal tautan perusahaan yang ada lowongan</p>
      <p className="section-note">
        Memeriksa satu per satu tautan {targetCompanies.length} perusahaan
        yang ada lowongan. Tiap pemeriksaan dijeda beberapa
        detik supaya tidak melewati batas server. Tombol tidak bisa
        ditekan selama pemeriksaan berjalan.
      </p>
      <div className="filter-actions">
        <button
          className="btn"
          type="button"
          onClick={onCheck}
          disabled={bulkRunning || targetCompanies.length === 0}
        >
          {bulkRunning
            ? `Memeriksa ${bulkDone} dari ${targetCompanies.length}…`
            : `Cek ${targetCompanies.length} tautan target`}
        </button>
      </div>
      {bulkDone > 0 && (
        <p className="notice">
          {bulkRunning
            ? `${bulkDone} dari ${targetCompanies.length} sudah diperiksa.`
            : `Selesai: ${bulkResults.filter((r) => r.ok).length} bisa dibuka, ${bulkResults.filter((r) => !r.ok).length} gagal, dari ${targetCompanies.length} tautan.`}
        </p>
      )}
      {bulkResults.length > 0 && (
        <ul className="recheck-list">
          {bulkResults.map((r) => (
            <li key={r.no}>
              {formatTime(r.checkedAt)} · {r.no}. {r.perusahaan} ·{" "}
              {r.ok
                ? `bisa dibuka, kode ${r.status}`
                : `gagal: ${r.error}`}
            </li>
          ))}
        </ul>
      )}
      {bulkChanges > 0 && (
        <p className="notice" role="status">
          Perubahan dicatat di umpan Yang berubah.
        </p>
      )}
    </div>
  );
}
