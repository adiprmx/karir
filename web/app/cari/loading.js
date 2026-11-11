export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Memuat halaman Cari">
      <div className="page-head">
        <div className="skeleton" style={{ height: 40, maxWidth: 360 }} />
      </div>
      <div className="skeleton" style={{ height: 64 }} />
      <div className="skeleton" style={{ height: 110, marginTop: 14 }} />
      <div className="skeleton" style={{ height: 110, marginTop: 14 }} />
    </div>
  );
}
