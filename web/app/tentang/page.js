import { getStats } from "@/lib/companies";
import { getLocale } from "@/lib/i18n";
import { CountUp } from "@/app/visual";

/* Data di-render saat request, bukan saat build. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tentang Karir",
  description:
    "Karir adalah daftar kanal karir resmi perusahaan Indonesia yang dicek langsung di browser. Tanpa akun, tanpa data pribadi.",
};

const COPY = {
  title: { id: "Tentang Karir", en: "About Karir" },
  lede: {
    id: "Karir mengumpulkan kanal karir resmi perusahaan Indonesia, lalu dicek satu per satu di browser.",
    en: "Karir collects official career channels of Indonesian companies, then checks each one in the browser.",
  },
};

export default async function Tentang() {
  const locale = await getLocale();
  const stats = await getStats();
  const total = stats.total;
  const targets = stats.byStatus["Ada lowongan target"] || 0;
  const notFit = stats.byStatus["Ada lowongan target (tidak cocok)"] || 0;
  const d4 = stats.byDate["2026-11-04"] || 0;
  const d5 = stats.byDate["2026-11-05"] || 0;

  return (
    <div className="wrap">
      <div className="page-head anim-fade-up">
        <h1>{COPY.title[locale]}</h1>
        <p className="lede">{COPY.lede[locale]}</p>
      </div>

      <section className="dash-section anim-fade-up" aria-label="Angka data">
        <p className="section-label">Angka data</p>
        <div className="stat-stack">
          <div className="stat-row">
            <span className="stat-num num">
              <CountUp value={total} />
            </span>
            <span className="stat-label">perusahaan di data</span>
          </div>
          <div className="stat-row">
            <span className="stat-num ok num">
              <CountUp value={targets} />
            </span>
            <span className="stat-label">lowongan target terverifikasi</span>
          </div>
          <div className="stat-row">
            <span className="stat-num warn num">
              <CountUp value={notFit} />
            </span>
            <span className="stat-label">
              lowongan target, syarat tidak cocok
            </span>
          </div>
        </div>
        <p className="fresh-note">
          {d4} perusahaan dicek 4 November 2026 dan {d5} perusahaan dicek 5
          November 2026. Semua angka dihitung langsung dari data, tidak ada
          angka contoh.
        </p>
      </section>

      <section className="dash-section anim-fade-up" aria-label="Apa itu Karir">
        <p className="section-label">Apa itu Karir</p>
        <h2>Karir itu apa</h2>
        <ul className="recheck-list">
          <li>
            Ketik domisili dan posisi yang kamu cari, lalu buka portal resmi
            perusahaan yang paling relevan dan lamar lewat sana.
          </li>
          <li>
            Pengecekan difokuskan ke gudang, produksi, cleaning, office boy,
            packing, dan crew store.
          </li>
          <li>
            Data dan kode ada di{" "}
            <a
              href="https://github.com/adiprmx/karir"
              target="_blank"
              rel="noopener noreferrer"
            >
              repo terbuka
            </a>
            , dan siapa pun bisa mengusulkan koreksi lewat issue dan pull
            request.
          </li>
        </ul>
      </section>

      <section
        className="dash-section anim-fade-up"
        aria-label="Kejujuran data"
      >
        <p className="section-label">Kejujuran data</p>
        <h2>Yang ditulis apa adanya</h2>
        <p>
          Status ditulis sesuai keadaan pada tanggal cek. Portal yang tidak
          bisa dibuka berarti aksesnya gagal, bukan bukti tidak ada lowongan,
          dan skor cuma mengurutkan kanal, bukan janji lowongan masih ada.
        </p>
      </section>
    </div>
  );
}
