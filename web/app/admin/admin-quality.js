"use client";

/* Seksi Kualitas data panel admin (FE-18, dipindah dari page.js):
 * tiga tombol hitung baris bermasalah (tanpa tautan karir, tanpa
 * lokasi, sudah lama tidak dicek). Ketuk tombol memfilter tabel;
 * ketuk lagi mengembalikan semua data. */

export default function QualitySection({ qualityButtons, qualityFilter, onToggle }) {
  return (
    <div className="filters">
      <p className="section-label">Kualitas data</p>
      <p className="section-note">
        Ketuk salah satu angka untuk melihat baris yang bermasalah. Ketuk
        lagi untuk kembali ke semua data.
      </p>
      <div className="chip-row">
        {qualityButtons.map((b) => (
          <button
            key={b.key}
            type="button"
            className="btn ghost"
            aria-pressed={qualityFilter === b.key}
            onClick={() => onToggle(b.key)}
            style={
              qualityFilter === b.key
                ? { background: "#0a0a0a", color: "#fff" }
                : undefined
            }
          >
            <span className="num">{b.count}</span> {b.label}
          </button>
        ))}
      </div>
      {qualityFilter && (
        <p className="notice">
          Menampilkan baris yang bermasalah saja. Ketuk angka yang sama
          untuk melihat semua data lagi.
        </p>
      )}
    </div>
  );
}
