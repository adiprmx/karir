import { getStatsWithSource } from "@/lib/companies";

/* Data di-render saat request, bukan saat build. */
export const dynamic = "force-dynamic";
import { getLocale, t } from "@/lib/i18n";
import { CountUp, Icon, StatusDot } from "@/app/visual";
import Visited from "@/app/metode/visited";
import { FraudWarning } from "@/app/fraud-warning";

export const metadata = {
  title: "Metode pengecekan",
  description:
    "Cara daftar Karir dibuat: tiap kanal karir resmi dibuka langsung di browser, lewat navigasi situs resmi perusahaan.",
  /* SEO-05: blok openGraph; SEO-04: kanonis /metode (W2b). */
  openGraph: {
    title: "Metode pengecekan",
    description:
      "Cara daftar Karir dibuat: tiap kanal karir resmi dibuka langsung di browser, lewat navigasi situs resmi perusahaan.",
    url: "/metode",
  },
  alternates: { canonical: "/metode" },
};

const COPY = {
  title: { id: "Metode pengecekan", en: "Checking method" },
  lede: {
    id: "Cara daftar ini dibuat, supaya kamu bisa menilai sendiri seberapa jauh hasilnya bisa dipercaya.",
    en: "How this list was made, so you can judge for yourself how far to trust it.",
  },
};

const TARGET_ROLES = [
  "Helper Gudang",
  "Staff Gudang",
  "Cleaning Service",
  "Office Boy",
  "Packing",
  "Operator Produksi",
  "Helper Produksi",
  "Crew Store",
];

const STATUS_MEANINGS = [
  {
    status: "Ada lowongan",
    text: "Portal menampilkan minimal satu lowongan aktif pada tanggal cek, peran apa pun.",
  },
  {
    status: "Tidak ada lowongan",
    text: "Portal terbuka, tapi tidak menampilkan lowongan apa pun pada tanggal cek.",
  },
  {
    status: "Portal tidak bisa dibuka",
    text: "Situsnya tidak bisa dibuka saat dicek, dan ini kegagalan akses, bukan bukti tidak ada lowongan.",
  },
  {
    status: "Tidak dapat diverifikasi",
    text: "Kanalnya tidak ditemukan lewat navigasi resmi, halamannya kosong, atau lowongannya cuma terlihat setelah login.",
  },
];

const NOT_EVIDENCE = [
  "Cuplikan hasil pencarian.",
  "Postingan lowongan di media sosial atau job board pihak ketiga.",
  "Tautan pemendek seperti bit.ly.",
  "Halaman login Instagram atau LinkedIn.",
  "Alamat kantor, gerai, atau cabang di footer situs. Alamat itu bukan lokasi lowongan.",
];

const NOT_DONE = [
  "Tidak ada lamaran yang dikirim.",
  "Tidak ada akun yang dibuat di situs perusahaan.",
  "Tidak ada login ke situs mana pun.",
  "Tidak ada formulir yang diisi atau dikirim.",
  "Tidak ada data pribadi yang dimasukkan ke formulir perusahaan.",
];

/* UX-10: faktor urutan hasil, dari yang paling berpengaruh, tanpa
 * angka skor internal yang tidak membantu pembaca. */
const SCORE_RULES = [
  "Posisi cocok dengan data — yang paling menentukan.",
  "Domisili cocok dengan data.",
  "Lowongan terverifikasi.",
  "Portal tidak bisa dibuka — menurunkan urutan.",
  "Tidak dapat diverifikasi — menurunkan urutan.",
];

function numClass(status) {
  if (status === "Ada lowongan") return "stat-num ok num";
  return "stat-num num";
}

export default async function Metode() {
  const [locale, statsWithSource] = await Promise.all([
    getLocale(),
    getStatsWithSource(),
  ]);
  /* INFO-12: angka dari data cadangan ditandai ke pengguna. */
  const { stats, source } = statsWithSource;

  return (
    <div className="wrap">
      <Visited />
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

      <section className="dash-section anim-fade-up" aria-label="Yang dicek">
        <p className="section-label">Yang dicek</p>
        <h2>Cara pengecekan</h2>
        <p>
          Tiap perusahaan dicek dengan membuka kanal karir resminya langsung
          di browser. Lowongan apa pun yang aktif dicatat — peran di bawah
          ini adalah yang paling sering dicari pengunjung, dan lokasi
          yang diutamakan: Bogor, Depok, Cibinong, Citayam, Bojonggede,
          Citeureup, Gunung Putri, dan Jabodetabek.
        </p>
        <ul className="recheck-list">
          {TARGET_ROLES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {/* INFO-09: sebagian perusahaan mencantumkan email atau
          * WhatsApp HR sebagai kanal melamar; kanal itu tampil di
          * halaman perusahaan sebagai Cara lain melamar. */}
        <p>
          Sebagian perusahaan juga mencantumkan email atau WhatsApp HR
          sebagai kanal melamar. Kanal itu tampil di halaman perusahaan
          sebagai Cara lain melamar.
        </p>
      </section>

      {/* INFO-08: pengecekan ulang harian — kapan jalan, ke mana
        * perubahannya dicatat, dan apa yang diperbarui. */}
      <section
        className="dash-section anim-fade-up"
        aria-label="Pengecekan ulang"
      >
        <p className="section-label">Pengecekan ulang</p>
        <h2>Data dicek ulang setiap hari</h2>
        <p>
          Kanal target dicek ulang setiap hari pukul 01.00 WIB. Bila
          statusnya berubah, perubahan itu dicatat di bagian Yang berubah
          di Beranda, dan tanggal cek perusahaan itu diperbarui.
        </p>
      </section>

      <section
        className="dash-section anim-fade-up"
        aria-label="Arti tiap status"
      >
        <p className="section-label">Arti tiap status</p>
        <h2>Empat status di data</h2>
        <ul className="stat-stack">
          {STATUS_MEANINGS.map((s) => (
            <li className="stat-row" key={s.status}>
              <span className={numClass(s.status)}>
                <CountUp value={stats.byStatus[s.status] || 0} />
              </span>
              <span className="stat-label">
                <StatusDot status={s.status} /> {s.status}. {s.text}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="dash-section anim-fade-up"
        aria-label="Yang tidak dipakai sebagai bukti"
      >
        <p className="section-label">Yang tidak dipakai sebagai bukti</p>
        <h2>Bukti yang tidak diterima</h2>
        <p>
          Kalau kanal resmi memang mengarah ke platform pihak ketiga, platform
          itu dicatat apa adanya.
        </p>
        <ul className="recheck-list">
          {NOT_EVIDENCE.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </section>

      <section
        className="dash-section anim-fade-up"
        aria-label="Yang tidak dilakukan selama pengecekan"
      >
        <p className="section-label">Yang tidak dilakukan</p>
        <h2>Selama pengecekan</h2>
        <ul className="recheck-list">
          {NOT_DONE.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>

      <section
        className="dash-section anim-fade-up"
        aria-label="Skor di halaman Cari"
      >
        <p className="section-label">Skor di halaman Cari</p>
        <h2>Cara hasil diurutkan</h2>
        <p>
          Hasil diurutkan dari yang paling cocok. Urutannya ditentukan
          hal-hal berikut, dari yang paling berpengaruh. Kalimat yang
          bilang tidak ada lowongan tidak dihitung sebagai kecocokan,
          walaupun menyebut nama posisinya.
        </p>
        <ul className="recheck-list">
          {SCORE_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <section className="dash-section anim-fade-up" aria-label="Batasan">
        <p className="section-label">Batasan</p>
        <h2>Yang perlu diingat</h2>
        <p>
          Hasil ini berlaku pada tanggal cek. Lowongan bisa berubah setelah
          itu, dan daftar ini tidak menjamin lowongan masih ada atau pelamar
          akan diterima.
        </p>
      </section>

      <FraudWarning locale={locale} />
    </div>
  );
}
