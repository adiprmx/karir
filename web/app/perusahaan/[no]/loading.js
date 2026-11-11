export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Memuat perusahaan">
      <div className="skeleton" style={{ height: 80, width: 140, marginTop: 56 }} />
      <div className="skeleton" style={{ height: 40, maxWidth: 420, marginTop: 20 }} />
      <div className="skeleton" style={{ height: 160, marginTop: 24 }} />
    </div>
  );
}
