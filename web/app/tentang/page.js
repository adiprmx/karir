import { getStatsOrSeed } from "@/lib/companies";
import { getLocale } from "@/lib/i18n";
import { CountUp } from "@/app/visual";
import { formatDate } from "@/app/components";

/* Data di-render saat request, bukan saat build. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tentang",
  description:
    "Karir adalah daftar kanal karir resmi perusahaan Indonesia yang dicek langsung di browser. Masuk akun itu pilihan, bukan kewajiban.",
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
  const stats = await getStatsOrSeed();
  const total = stats.total;
  const targets = stats.byStatus["Ada lowongan"] || 0;
  /* Kesegaran data dihitung dari data, bukan tanggal hardcode (S6):
   * tanggal cek terbaru + jumlah yang dicek dalam 7 hari terakhir. */
  const dateKeys = Object.keys(stats.byDate).sort();
  const latestDate = dateKeys.length ? dateKeys[dateKeys.length - 1] : null;
  const latestMs = latestDate ? Date.parse(`${latestDate}T00:00:00Z`) : 0;
  const weekStartMs = latestMs - 6 * 24 * 60 * 60 * 1000;
  const checkedWeek = dateKeys.reduce(
    (sum, d) =>
      Date.parse(`${d}T00:00:00Z`) >= weekStartMs
        ? sum + (stats.byDate[d] || 0)
        : sum,
    0,
  );
  const latestLabel = latestDate ? formatDate(latestDate, locale) : null;

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
            <span className="stat-label">perusahaan ada lowongan</span>
          </div>
        </div>
        {latestDate && (
          <p className="fresh-note">
            {checkedWeek} perusahaan dicek dalam 7 hari terakhir, terakhir{" "}
            {latestLabel}. Semua angka dihitung langsung dari data, tidak ada
            angka contoh.
          </p>
        )}
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
            Pengecekan mencatat lowongan apa pun yang aktif di portal
            resmi perusahaan — dari gudang, produksi, cleaning, dan
            office boy sampai admin, teknisi, dan kasir.
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
