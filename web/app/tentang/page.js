import { getStatsWithSource } from "@/lib/companies";
import { getLocale, t } from "@/lib/i18n";
import { CountUp, Icon } from "@/app/visual";
import { formatDate } from "@/app/components";

/* Data di-render saat request, bukan saat build. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tentang",
  description:
    "Karir adalah daftar kanal karir resmi perusahaan Indonesia yang dicek langsung di browser. Masuk akun itu pilihan, bukan kewajiban.",
  /* SEO-05: blok openGraph; SEO-04: kanonis /tentang (W2b). */
  openGraph: {
    title: "Tentang",
    description:
      "Karir adalah daftar kanal karir resmi perusahaan Indonesia yang dicek langsung di browser. Masuk akun itu pilihan, bukan kewajiban.",
    url: "/tentang",
  },
  alternates: { canonical: "/tentang" },
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
  /* INFO-12: angka dari data cadangan ditandai ke pengguna. */
  const { stats, source } = await getStatsWithSource();
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
        {/* INFO-11: isi halaman ini hanya Bahasa Indonesia; beri tahu
          * pengunjung mode Inggris, bukan pura-pura diterjemahkan. */}
        {locale === "en" && (
          <p className="note-line">{t(locale, "info.idOnly")}</p>
        )}
      </div>

      {source === "seed" && (
        <p className="note-line">
          <Icon name="info" size={16} />
          {t(locale, "common.seedNote")}
        </p>
      )}

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
        {/* UX-17: judul lama "Karir itu apa" mengulang label seksi. */}
        <h2>Cara memakai Karir</h2>
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
            , dan siapa pun bisa mengusulkan koreksi lewat{" "}
            <a
              href="https://github.com/adiprmx/karir/issues/new?template=koreksi.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              formulir Koreksi data
            </a>
            .
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

      {/* LEGAL-07: penyebutan lisensi di aplikasi — data boleh dipakai
        * ulang dengan atribusi. Versi dokumennya ada di data/README.md
        * (W1-DOCS). */}
      <section
        className="dash-section anim-fade-up"
        aria-label="Lisensi data"
      >
        <p className="section-label">Lisensi data</p>
        <h2>Data boleh dipakai ulang</h2>
        <p>
          Data kanal karir di situs ini berlisensi{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/deed.id"
            target="_blank"
            rel="noopener noreferrer"
          >
            Creative Commons Atribusi 4.0 (CC BY 4.0)
          </a>
          : siapa pun boleh menyalin, membagikan, dan mengolahnya,
          selama mencantumkan sumbernya — Data kanal karir dari Karir
          (https://github.com/adiprmx/karir) oleh ADIP RMX, berlisensi
          CC BY 4.0.
        </p>
      </section>
    </div>
  );
}
