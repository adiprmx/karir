"use client";

export default function Error({ reset }) {
  return (
    <div className="wrap narrow">
      <div className="page-head">
        <h1>Halaman ini gagal dimuat</h1>
      </div>
      <div className="state" role="alert">
        <strong>Ada yang tidak beres saat memuat data.</strong>
        <p>Periksa koneksi lalu coba lagi. Kalau terus gagal, datanya mungkin sedang diperbarui.</p>
        <button className="btn" onClick={() => reset()}>
          Coba lagi
        </button>
      </div>
    </div>
  );
}
