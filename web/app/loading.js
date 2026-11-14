/* FE-12: skeleton beranda — meniru susunan hero, kotak cari,
 * strip foto, dan daftar target supaya tidak ada lompatan tata
 * letak saat data datang. */
export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Memuat">
      <section className="hero">
        <div className="hero-copy">
          <div className="skeleton" style={{ height: 44, maxWidth: 520 }} />
          <div
            className="skeleton"
            style={{ height: 18, maxWidth: 640, marginTop: 14 }}
          />
          <div
            className="skeleton"
            style={{ height: 18, maxWidth: 480, marginTop: 8 }}
          />
        </div>
        <div className="skeleton" style={{ height: 120, marginTop: 20 }} />
      </section>
      <div className="skeleton" style={{ height: 140, marginTop: 24 }} />
      <div
        className="skeleton"
        style={{ height: 32, maxWidth: 360, marginTop: 32 }}
      />
      <div className="skeleton" style={{ height: 120, marginTop: 14 }} />
      <div className="skeleton" style={{ height: 120, marginTop: 14 }} />
      <div className="skeleton" style={{ height: 120, marginTop: 14 }} />
    </div>
  );
}
