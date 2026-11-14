"use client";

/* Formulir tambah dan ubah perusahaan panel admin (FE-18, dipindah
 * dari page.js): semua kolom perusahaan, tombol cek tautan, simpan,
 * dan hapus. Nilai kolom dan validasi tetap diatur page.js lewat
 * props; komponen ini hanya menampilkan dan meneruskan perubahan. */

import { STATUS_ORDER } from "@/lib/companies";

export default function CompanyForm({
  form,
  onField,
  selected,
  message,
  saving,
  linkCheck,
  checkingLink,
  onSave,
  onRemove,
  onCheckLink,
  onMarkCheckedToday,
}) {
  return (
    <form className="filters" style={{ position: "static" }} onSubmit={onSave}>
      <fieldset>
        <legend>Nomor</legend>
        <label className="sr-only" htmlFor="admin-no">
          Nomor
        </label>
        <input
          id="admin-no"
          type="number"
          value={form.no}
          onChange={(e) => onField("no", e.target.value)}
          required
        />
      </fieldset>
      <fieldset>
        <legend>Perusahaan</legend>
        <label className="sr-only" htmlFor="admin-perusahaan">
          Perusahaan
        </label>
        <input
          id="admin-perusahaan"
          type="text"
          value={form.perusahaan}
          onChange={(e) => onField("perusahaan", e.target.value)}
          required
        />
      </fieldset>
      <fieldset>
        <legend>Kategori</legend>
        <label className="sr-only" htmlFor="admin-kategori">
          Kategori
        </label>
        <input
          id="admin-kategori"
          type="text"
          value={form.kategori}
          onChange={(e) => onField("kategori", e.target.value)}
        />
      </fieldset>
      <fieldset>
        <legend>Link karir</legend>
        <label className="sr-only" htmlFor="admin-link">
          Link karir
        </label>
        <input
          id="admin-link"
          type="url"
          value={form.link_karir}
          onChange={(e) => onField("link_karir", e.target.value)}
          placeholder="https://…"
        />
      </fieldset>
      <div className="filter-actions">
        <button
          className="btn ghost"
          type="button"
          onClick={onCheckLink}
          disabled={checkingLink || !Number(form.no)}
        >
          {checkingLink ? "Memeriksa…" : "Cek tautan"}
        </button>
        {linkCheck && linkCheck.ok && (
          <button
            className="btn ghost"
            type="button"
            onClick={onMarkCheckedToday}
          >
            Perbarui tanggal cek ke hari ini
          </button>
        )}
      </div>
      {linkCheck && (
        <p className="notice" role="status">
          {linkCheck.ok
            ? `Tautan bisa dibuka, kode ${linkCheck.status}.`
            : `Tautan tidak bisa dibuka: ${linkCheck.detail || linkCheck.error || "tidak diketahui."}`}
        </p>
      )}
      <fieldset>
        <legend>Status</legend>
        <label className="sr-only" htmlFor="admin-form-status">
          Status
        </label>
        <select
          id="admin-form-status"
          value={form.status}
          onChange={(e) => onField("status", e.target.value)}
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </fieldset>
      <fieldset>
        <legend>Tanggal cek (YYYY-MM-DD)</legend>
        <label className="sr-only" htmlFor="admin-tanggal">
          Tanggal cek
        </label>
        <input
          id="admin-tanggal"
          type="text"
          value={form.tanggal_cek}
          onChange={(e) => onField("tanggal_cek", e.target.value)}
          placeholder="2026-11-06"
        />
      </fieldset>
      <fieldset>
        <legend>Batas lamar (YYYY-MM-DD)</legend>
        <label className="sr-only" htmlFor="admin-batas">
          Batas lamar
        </label>
        <input
          id="admin-batas"
          type="date"
          value={form.batas_lamar}
          onChange={(e) => onField("batas_lamar", e.target.value)}
        />
        <p className="section-note">
          Tanggal terakhir melamar, bila ada. Kosongkan bila tidak
          ada batas.
        </p>
      </fieldset>
      <fieldset>
        <legend>Lokasi</legend>
        <label className="sr-only" htmlFor="admin-lokasi">
          Lokasi
        </label>
        <input
          id="admin-lokasi"
          type="text"
          value={form.lokasi}
          onChange={(e) => onField("lokasi", e.target.value)}
        />
      </fieldset>
      <fieldset>
        <legend>Posisi tercatat</legend>
        <label className="sr-only" htmlFor="admin-posisi">
          Posisi tercatat
        </label>
        <input
          id="admin-posisi"
          type="text"
          value={form.posisi}
          onChange={(e) => onField("posisi", e.target.value)}
        />
      </fieldset>
      <fieldset>
        <legend>Catatan</legend>
        <label className="sr-only" htmlFor="admin-catatan">
          Catatan
        </label>
        <input
          id="admin-catatan"
          type="text"
          value={form.catatan}
          onChange={(e) => onField("catatan", e.target.value)}
        />
      </fieldset>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="filter-actions">
        <button className="btn" type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
        {selected && (
          <button
            className="btn ghost"
            type="button"
            onClick={onRemove}
            disabled={saving}
          >
            Hapus
          </button>
        )}
      </div>
    </form>
  );
}
