"use client";

/* Panel daftar perusahaan panel admin (FE-18, dipindah dari
 * page.js): filter cari dan status, urutan, tombol tambah, tabel
 * hasil dengan paginasi, serta status muat dan galat muat. */

import { STATUS_ORDER } from "@/lib/companies";

export default function CompaniesPanel({
  filter,
  statusFilter,
  sortBy,
  onFilterChange,
  onStatusFilterChange,
  onSortByChange,
  onAddNew,
  loadError,
  loadingCompanies,
  pageRows,
  selected,
  onPick,
  safePage,
  totalPages,
  shownCount,
  onPrevPage,
  onNextPage,
}) {
  return (
    <div>
      <div className="filters" style={{ position: "static" }}>
        <fieldset>
          <legend>Cari perusahaan</legend>
          <label className="sr-only" htmlFor="admin-filter">
            Cari perusahaan
          </label>
          <input
            id="admin-filter"
            type="text"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="Nama atau nomor"
            autoComplete="off"
          />
        </fieldset>
        <fieldset>
          <legend>Status</legend>
          <label className="sr-only" htmlFor="admin-status-filter">
            Status
          </label>
          <select
            id="admin-status-filter"
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
          >
            <option value="">Semua status</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </fieldset>
        <fieldset>
          <legend>Urutan</legend>
          <label className="sr-only" htmlFor="admin-sort">
            Urutan
          </label>
          <select
            id="admin-sort"
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value)}
          >
            <option value="no">Nomor</option>
            <option value="nama">Nama A sampai Z</option>
          </select>
        </fieldset>
        <button className="btn" type="button" onClick={onAddNew}>
          Tambah perusahaan
        </button>
      </div>

      {loadError && (
        <p className="notice" role="alert">
          {loadError}
        </p>
      )}
      {loadingCompanies && (
        <div className="state" role="status">
          <strong>Memuat data perusahaan…</strong>
        </div>
      )}

      <table className="results-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Perusahaan</th>
            <th>Status</th>
            <th>Tanggal cek</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((c) => (
            <tr
              key={c.no}
              onClick={() => onPick(c)}
              style={{
                cursor: "pointer",
                background:
                  selected && Number(selected.no) === Number(c.no)
                    ? "#f4f4f5"
                    : undefined,
              }}
            >
              <td data-label="No">{c.no}</td>
              <td data-label="Perusahaan">{c.perusahaan}</td>
              <td data-label="Status">{c.status}</td>
              <td data-label="Tanggal cek">{c.tanggal_cek || "-"}</td>
            </tr>
          ))}
          {pageRows.length === 0 && !loadingCompanies && (
            <tr>
              <td colSpan={4}>Tidak ada perusahaan yang cocok.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="filter-actions" style={{ marginTop: 16 }}>
        <button
          className="btn ghost"
          type="button"
          disabled={safePage <= 1}
          onClick={onPrevPage}
        >
          Sebelumnya
        </button>
        <span className="result-count">
          Halaman {safePage} dari {totalPages} · {shownCount} perusahaan
        </span>
        <button
          className="btn ghost"
          type="button"
          disabled={safePage >= totalPages}
          onClick={onNextPage}
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}
