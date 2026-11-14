"use client";

/* FE-13: galat tingkat akar — tampil saat layout akar sendiri gagal,
 * jadi halaman ini tidak memakai layout dan tidak memakai
 * globals.css. Gayanya ditulis sebaris dengan palet situs supaya
 * tetap terbaca walau stylesheet gagal dimuat. Isi mengikuti pola
 * error.js: pesan ramah + tombol coba lagi. */
export default function GlobalError({ error, reset }) {
  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          boxSizing: "border-box",
          background: "#f4f1ea",
          color: "#15140f",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <h1
            style={{ fontSize: 28, lineHeight: 1.25, margin: "0 0 12px" }}
          >
            Karir tidak bisa dibuka.
          </h1>
          <p
            style={{ color: "#55534c", lineHeight: 1.6, margin: "0 0 20px" }}
          >
            Terjadi gangguan saat memuat halaman. Periksa koneksi lalu coba
            lagi. Kalau terus gagal, datanya mungkin sedang diperbarui.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "12px 20px",
              borderRadius: 10,
              border: "none",
              background: "#15140f",
              color: "#f4f1ea",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Coba lagi
          </button>
        </div>
      </body>
    </html>
  );
}
