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
  bulkCancelled,
  bulkRestoredAt,
  onCheck,
  onCancel,
  onClearLast,
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
        {/* ADM-11: batalkan pemeriksaan yang sedang berjalan —
          * hasil yang sudah didapat tetap disimpan. */}
        {bulkRunning && (
          <button
            className="btn ghost"
            type="button"
            onClick={onCancel}
          >
            Batalkan
          </button>
        )}
        {/* ADM-11: hapus ringkasan terakhir yang tersimpan di
          * perangkat ini. */}
        {!bulkRunning && bulkResults.length > 0 && (
          <button
            className="btn ghost small"
            type="button"
            onClick={onClearLast}
          >
            Hapus riwayat
          </button>
        )}
      </div>
      {bulkDone > 0 && (
        <p className="notice">
          {bulkRunning
            ? `${bulkDone} dari ${targetCompanies.length} sudah diperiksa.`
            : bulkCancelled
              ? `Dibatalkan: ${bulkDone} dari ${targetCompanies.length} sudah diperiksa, ${bulkResults.filter((r) => r.ok).length} bisa dibuka, ${bulkResults.filter((r) => !r.ok).length} gagal.`
              : `Selesai: ${bulkResults.filter((r) => r.ok).length} bisa dibuka, ${bulkResults.filter((r) => !r.ok).length} gagal, dari ${targetCompanies.length} tautan.`}
        </p>
      )}
      {/* ADM-11: hasil di bawah ini dipulihkan dari perangkat, bukan
        * dari jalan saat ini — waktunya ditampilkan supaya tidak
        * dikira hasil baru. */}
      {!bulkRunning && bulkRestoredAt && bulkResults.length > 0 && (
        <p className="section-note">
          Hasil pemeriksaan terakhir, {formatTime(bulkRestoredAt)}.
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
