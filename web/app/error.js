"use client";

export default function Error({ error, reset }) {
  return (
    <div className="wrap">
      <div className="state">
        <strong>Data tidak bisa dimuat.</strong>
        <p>
          Periksa koneksi lalu coba lagi. Kalau terus gagal, datanya mungkin
          sedang diperbarui.
        </p>
        <p style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => reset()}>
            Coba lagi
          </button>
        </p>
      </div>
    </div>
  );
}
