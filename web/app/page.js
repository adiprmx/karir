import Link from "next/link";
import { getCompanies, getTargets, getStats } from "@/lib/companies";

export default function Beranda() {
  const stats = getStats();
  const targets = getTargets();
  const byDate = stats.byDate;
  const d4 = byDate["2026-11-04"] || 0;
  const d5 = byDate["2026-11-05"] || 0;

  return (
    <div className="wrap">
      <section className="hero">
        <h1>Lowongan yang dicek, bukan yang dicopas.</h1>
        <p className="lede">
          {stats.total} kanal karir resmi perusahaan Indonesia. Setiap kanal
          dibuka dan dibaca langsung di browser pada 4 dan 5 November 2026 —
          bukan dari cuplikan pencarian.
        </p>
        <form className="searchbar" method="get" action="/cari">
          <label htmlFor="hero-domisili">Domisili</label>
          <input
            id="hero-domisili"
            name="domisili"
            type="text"
            placeholder="Domisili, misal Depok"
            autoComplete="off"
          />
          <label htmlFor="hero-posisi">Posisi atau perusahaan</label>
          <input
            id="hero-posisi"
            name="posisi"
            type="text"
            placeholder="Posisi, misal Administrasi"
            autoComplete="off"
          />
          <button type="submit">Cari</button>
        </form>
        <div className="examples">
          <span>Coba:</span>
          <a className="example-chip" href="/cari?domisili=Depok&posisi=Administrasi">
            Depok + Administrasi
          </a>
          <a className="example-chip" href="/cari?domisili=Bogor&posisi=Helper+Gudang">
            Bogor + Helper Gudang
          </a>
          <a className="example-chip" href="/cari?posisi=PGN">
            PGN
          </a>
        </div>
      </section>

      <div className="split">
        <section aria-labelledby="target-title">
          <p className="section-label" id="target-title">
            Lowongan target yang terverifikasi
          </p>
          <h2>{targets.length} perusahaan punya lowongan yang kamu cari</h2>
          <ol className="index-list">
            {targets.map((c, i) => (
              <li key={c.no}>
                <a
                  href={c.link_karir}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="index-no">{String(i + 1).padStart(2, "0")}</span>
                  <span className="index-name">{c.perusahaan}</span>
                  <span className="index-meta">
                    {(c.posisi || "").split(",")[0]}
                    {" · "}
                    {c.lokasi || "Tidak tercantum"}
                  </span>
                  <span className="index-arrow" aria-hidden="true">
                    →
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <aside aria-label="Angka">
          <p className="section-label">Angka</p>
          <h2>Keadaan data</h2>
          <div className="stat-stack">
            <div className="stat-row">
              <span className="stat-num num">{stats.total}</span>
              <span className="stat-label">perusahaan dicek</span>
            </div>
            <div className="stat-row">
              <span className="stat-num ok num">
                {stats.byStatus["Ada lowongan target"]}
              </span>
              <span className="stat-label">ada lowongan target</span>
            </div>
            <div className="stat-row">
              <span className="stat-num warn num">
                {stats.byStatus["Ada lowongan target (tidak cocok)"]}
              </span>
              <span className="stat-label">lowongan ada, syarat tidak cocok</span>
            </div>
            <div className="stat-row">
              <span className="stat-num num">
                {stats.byStatus["Tidak dapat diverifikasi"]}
              </span>
              <span className="stat-label">tidak dapat diverifikasi</span>
            </div>
            <div className="stat-row">
              <span className="stat-num num">
                {stats.byStatus["Portal tidak bisa dibuka"]}
              </span>
              <span className="stat-label">portal tidak bisa dibuka</span>
            </div>
          </div>
          <p className="fresh-note">
            {d4} perusahaan dicek 4 November 2026, {d5} perusahaan dicek 5
            November 2026. Lowongan bisa berubah setelah tanggal cek.
          </p>
          <div style={{ marginTop: 32 }}>
            <p className="section-label">Cara kerja</p>
            <ol className="steps">
              <li>Ketik domisili dan posisi yang kamu mau.</li>
              <li>
                Hasil diurutkan berdasarkan kecocokan posisi, domisili, dan
                status verifikasi.
              </li>
              <li>
                Buka kanal karir resminya dan lamar dari sana — aplikasi ini
                tidak menyimpan data kamu.
              </li>
            </ol>
          </div>
          <p style={{ marginTop: 32 }}>
            <Link href="/dasbor">Lihat dasbor →</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
