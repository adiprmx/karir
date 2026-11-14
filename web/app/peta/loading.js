/* FE-12: skeleton peta — kepala halaman, area peta, dan daftar
 * kota di bawahnya. */
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
      <div className="skeleton" style={{ height: 320 }} />
      <div className="skeleton" style={{ height: 120, marginTop: 14 }} />
      <div className="skeleton" style={{ height: 120, marginTop: 14 }} />
    </div>
  );
}
