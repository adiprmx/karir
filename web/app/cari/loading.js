export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Memuat">
      <div className="page-head">
        <div className="skeleton" style={{ height: 44, maxWidth: 420 }} />
        <div className="skeleton" style={{ height: 18, maxWidth: 520, marginTop: 14 }} />
      </div>
      <div className="skeleton" style={{ height: 76 }} />
      <div className="skeleton" style={{ height: 120, marginTop: 14 }} />
      <div className="skeleton" style={{ height: 120, marginTop: 14 }} />
    </div>
  );
}
