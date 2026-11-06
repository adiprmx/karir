import { getStats } from "@/lib/companies";

/* Data di-render saat request, bukan saat build. */
export const dynamic = "force-dynamic";
import { getLocale } from "@/lib/i18n";
import { CountUp, StatusDot } from "@/app/visual";
import Visited from "@/app/metode/visited";

export const metadata = {
  title: "Metode pengecekan",
  description:
    "Cara daftar Karir dibuat: tiap kanal karir resmi dibuka langsung di browser, lewat navigasi situs resmi perusahaan.",
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
    status: "Ada lowongan target",
    text: "Judul peran target terlihat di halaman resmi, lengkap dengan lokasinya.",
  },
  {
    status: "Ada lowongan target (tidak cocok)",
    text: "Judulnya terlihat, tapi syaratnya tidak cocok, dan syarat itu ditulis di catatan.",
  },
  {
    status: "Tidak ada lowongan target",
    text: "Portal terbuka dan ada lowongan, tapi tidak ada peran target.",
  },
  {
    status: "Tidak ada lowongan terlihat",
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
  "Tidak ada akun yang dibuat.",
  "Tidak ada login ke situs mana pun.",
  "Tidak ada formulir yang diisi atau dikirim.",
  "Tidak ada data pribadi yang dimasukkan.",
];

const SCORE_RULES = [
  "Posisi cocok dengan data: +50",
  "Domisili cocok dengan data: +30",
  "Lowongan terverifikasi: +20",
  "Lowongan target, syarat tidak cocok: +10",
  "Portal tidak bisa dibuka: -20",
  "Tidak dapat diverifikasi: -10",
];

function numClass(status) {
  if (status === "Ada lowongan target") return "stat-num ok num";
  if (status === "Ada lowongan target (tidak cocok)")
    return "stat-num warn num";
  return "stat-num num";
}

export default async function Metode() {
  const [locale, stats] = await Promise.all([getLocale(), getStats()]);

  return (
    <div className="wrap">
      <Visited />
      <div className="page-head anim-fade-up">
        <h1>{COPY.title[locale]}</h1>
        <p className="lede">{COPY.lede[locale]}</p>
      </div>

      <section className="dash-section anim-fade-up" aria-label="Yang dicek">
        <p className="section-label">Yang dicek</p>
        <h2>Cara pengecekan</h2>
        <p>
          Tiap perusahaan dicek dengan membuka kanal karir resminya langsung
          di browser. Pengecekan difokuskan ke 8 peran di bawah ini, dan
          lokasi yang diutamakan: Bogor, Depok, Cibinong, Citayam, Bojonggede,
          Citeureup, Gunung Putri, dan Jabodetabek.
        </p>
        <ul className="recheck-list">
          {TARGET_ROLES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <section
        className="dash-section anim-fade-up"
        aria-label="Arti tiap status"
      >
        <p className="section-label">Arti tiap status</p>
        <h2>Enam status di data</h2>
        <ul className="stat-stack">
          {STATUS_MEANINGS.map((s) => (
            <li className="stat-row" key={s.status}>
              <span className={numClass(s.status)}>
                <CountUp value={stats.byStatus[s.status] || 0} />
              </span>
              <span
                className="stat-label"
                style={{ textAlign: "left", flex: 1 }}
              >
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
          Hasil diurutkan berdasarkan skor. Kalimat penyangkalan di data tidak
          dihitung sebagai kecocokan.
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
    </div>
  );
}
