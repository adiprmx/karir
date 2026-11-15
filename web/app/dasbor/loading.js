/* SEO-10: skeleton dasbor TANPA h1 — versi sebelumnya merender judul
 * sungguhan ("Dasbor") di shell muat, sehingga ada dua h1 saat
 * halaman selesai dimuat. Pola yang sama dengan loading.js beranda
 * dan peta (FE-12): hanya balok skeleton, tanpa teks judul. */
export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Memuat">
      <div className="page-head">
        <div className="skeleton" style={{ height: 44, maxWidth: 320 }} />
        <div
          className="skeleton"
          style={{ height: 18, maxWidth: 520, marginTop: 14 }}
        />
      </div>
      <div className="skeleton" style={{ height: 160 }} />
      <div className="skeleton" style={{ height: 220, marginTop: 16 }} />
    </div>
  );
}
