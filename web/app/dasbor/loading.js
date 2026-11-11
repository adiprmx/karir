export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Memuat dasbor">
      <div className="page-head">
        <div className="skeleton" style={{ height: 40, maxWidth: 240 }} />
      </div>
      <div className="skeleton" style={{ height: 180 }} />
      <div className="skeleton" style={{ height: 240, marginTop: 16 }} />
    </div>
  );
}
