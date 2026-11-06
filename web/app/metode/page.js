import { getLocale } from "@/lib/i18n";

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
    text: "Judulnya terlihat, tapi ada syarat yang membuat lowongan itu tidak bisa dipakai. Syaratnya ditulis di catatan.",
  },
  {
    status: "Tidak ada lowongan target",
    text: "Portal terbuka dan ada lowongan, tapi tidak ada satu pun peran target. Posisi lain yang terlihat dicatat di kolom posisi.",
  },
  {
    status: "Tidak ada lowongan terlihat",
    text: "Portal terbuka, tapi tidak menampilkan lowongan apa pun pada tanggal cek.",
  },
  {
    status: "Portal tidak bisa dibuka",
    text: "Situs atau portal karirnya tidak bisa dibuka saat dicek. Ini kegagalan akses, bukan bukti perusahaan itu tidak membuka lowongan.",
  },
  {
    status: "Tidak dapat diverifikasi",
    text: "Tidak ada kanal karir yang bisa diperiksa lewat navigasi resmi, atau halaman karirnya terbuka tapi kosong, atau daftar lowongannya hanya terlihat setelah login. Tidak ada login yang dilakukan saat pengecekan.",
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

export default async function Metode() {
  const locale = await getLocale();

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>{COPY.title[locale]}</h1>
        <p className="lede">{COPY.lede[locale]}</p>
      </div>

      <section className="dash-section" aria-label="Yang dicek">
        <p className="section-label">Yang dicek</p>
        <h2>Cara pengecekan</h2>
        <p>
          Tiap perusahaan dicek dengan membuka kanal karir resminya langsung di
          browser, lalu menelusuri navigasi situs resmi perusahaan. Tanggal cek
          dicatat di tiap baris data.
        </p>
        <p>
          Pengecekan lowongan difokuskan ke peran target di bawah ini, jadi
          kolom posisi dan catatan paling lengkap untuk peran-peran itu. Lokasi
          yang diutamakan: Bogor, Depok, Cibinong, Citayam, Bojonggede,
          Citeureup, Gunung Putri, dan Jabodetabek. Lowongan target di luar
          lokasi itu tetap dicatat, tapi lokasinya ditulis apa adanya supaya
          kamu bisa menilai sendiri jaraknya.
        </p>
        <ul className="recheck-list">
          {TARGET_ROLES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <section className="dash-section" aria-label="Arti tiap status">
        <p className="section-label">Arti tiap status</p>
        <h2>Enam status di data</h2>
        <ul className="recheck-list">
          {STATUS_MEANINGS.map((s) => (
            <li key={s.status}>
              {s.status}: {s.text}
            </li>
          ))}
        </ul>
      </section>

      <section className="dash-section" aria-label="Yang tidak dipakai sebagai bukti">
        <p className="section-label">Yang tidak dipakai sebagai bukti</p>
        <h2>Bukti yang tidak diterima</h2>
        <p>
          Pengecualian: kalau kanal resmi perusahaan memang mengarah ke platform
          rekrutmen pihak ketiga, platform itu dicatat apa adanya, dengan
          catatan bahwa itu platform, bukan pemberi kerja langsung.
        </p>
        <ul className="recheck-list">
          {NOT_EVIDENCE.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </section>

      <section className="dash-section" aria-label="Yang tidak dilakukan selama pengecekan">
        <p className="section-label">Yang tidak dilakukan</p>
        <h2>Selama pengecekan</h2>
        <ul className="recheck-list">
          {NOT_DONE.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>

      <section className="dash-section" aria-label="Skor di halaman Cari">
        <p className="section-label">Skor di halaman Cari</p>
        <h2>Cara hasil diurutkan</h2>
        <p>
          Hasil di halaman Cari diurutkan berdasarkan skor. Kecocokan posisi
          hanya dihitung dari kolom posisi dan catatan. Kalimat penyangkalan di
          data tidak dihitung sebagai kecocokan, misalnya lokasi yang berbunyi
          tidak ada penyebutan Bogor atau Depok tidak dihitung cocok untuk
          domisili Depok.
        </p>
        <ul className="recheck-list">
          {SCORE_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <section className="dash-section" aria-label="Batasan">
        <p className="section-label">Batasan</p>
        <h2>Yang perlu diingat</h2>
        <p>
          Hasil ini berlaku pada tanggal cek. Lowongan bisa dibuka atau ditutup
          setelah tanggal itu. Untuk portal yang tidak bisa dibuka atau tidak
          dapat diverifikasi, tidak ada kesimpulan tentang lowongan perusahaan
          itu, dan perlu dicek ulang di lain waktu.
        </p>
        <p>
          Untuk lowongan yang judulnya setara tapi tidak persis sama dengan
          peran target, hal itu ditulis di catatan supaya kamu bisa menilai
          sendiri. Daftar ini tidak menjamin lowongan masih ada, dan tidak
          menjamin pelamar akan diterima.
        </p>
      </section>
    </div>
  );
}
