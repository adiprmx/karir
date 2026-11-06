import { getLocale } from "@/lib/i18n";

export const metadata = {
  title: "Riwayat perubahan",
  description:
    "Apa yang berubah di tiap versi Karir, dari versi pertama sampai versi full stack.",
};

const COPY = {
  title: { id: "Riwayat perubahan", en: "Changelog" },
  lede: {
    id: "Apa yang berubah di tiap versi Karir.",
    en: "What changed in each version of Karir.",
  },
};

const VERSIONS = [
  {
    version: "2.0.0",
    date: "6 November 2026",
    points: [
      "Aplikasi web dibangun ulang jadi full stack: Next.js 15 dengan React 19 di Vercel.",
      "Database Firebase Firestore: 406 perusahaan di koleksi companies, diimpor dari CSV.",
      "API pencarian server di /api/companies, dengan logika skor yang sama seperti halaman Cari.",
      "Admin panel di /admin untuk tambah, ubah, dan hapus perusahaan.",
      "Supabase tidak dipakai karena akun sudah mencapai batas 2 proyek gratis yang aktif.",
      "Versi statis lama di folder docs tidak lagi jadi aplikasi live.",
    ],
  },
  {
    version: "1.3.0",
    date: "6 November 2026",
    points: [
      "Aplikasi web dirombak jadi tiga layar: Beranda, Cari, dan Dasbor.",
      "Tiap layar bisa dibagikan lewat tautan.",
      "Perbaikan tampilan HP: kartu hasil tidak lagi meluber ke samping.",
    ],
  },
  {
    version: "1.2.0",
    date: "5 November 2026",
    points: [
      "Repo dirombak dari daftar gudang Bogor jadi alat cari loker untuk semua orang.",
      "Aplikasi web baru dengan rekomendasi berdasarkan skor.",
      "PGN masuk sebagai No. 406, kanal rekrutmennya lewat E-Recruitment Pertamina dan minta login.",
      "README ditulis ulang untuk cakupan universal.",
    ],
  },
  {
    version: "1.1.0",
    date: "5 November 2026",
    points: [
      "Ronde H: 106 perusahaan tambahan, total jadi 405 perusahaan.",
      "Temuan target baru: BASF, Fore Coffee, Ranch Market, OCS, Accor, dan Dexa.",
      "Repo dinamai ulang jadi karir.",
    ],
  },
  {
    version: "1.0.0",
    date: "5 November 2026",
    points: [
      "Versi pertama: 299 perusahaan, semuanya dicek langsung di browser.",
      "81 perusahaan dicek 4 November 2026, 218 perusahaan dicek 5 November 2026.",
      "Kolom baru di semua baris: lokasi dan posisi.",
    ],
  },
];

export default async function Changelog() {
  const locale = await getLocale();

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>{COPY.title[locale]}</h1>
        <p className="lede">{COPY.lede[locale]}</p>
      </div>

      {VERSIONS.map((v) => (
        <section
          className="dash-section"
          aria-label={`Versi ${v.version}`}
          key={v.version}
        >
          <p className="section-label">{v.date}</p>
          <h2>
            <span className="num">{v.version}</span>
          </h2>
          <ul className="recheck-list">
            {v.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
