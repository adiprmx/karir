import Link from "next/link";
import { getStatsOrSeed } from "@/lib/companies";
import { StatusTag } from "@/app/visual";
import Visited from "@/app/metode/visited";

/* Data di-render saat request, bukan saat build. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Metode pengecekan",
  description:
    "Cara daftar Karir dibuat: tiap kanal karir resmi dibuka langsung di browser, lewat navigasi situs resmi perusahaan.",
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

export default async function Metode() {
  const stats = await getStatsOrSeed();
  return (
    <div className="wrap narrow">
      <Visited />
      <div className="page-head">
        <h1>Metode pengecekan</h1>
        <p className="lede">Cara daftar ini dibuat, supaya kamu bisa menilai sendiri seberapa jauh hasilnya bisa dipercaya.</p>
      </div>

      <div className="doc">
        <section aria-labelledby="m-cek">
          <h2 id="m-cek">Cara pengecekan</h2>
          <div className="prose">
            <p>
              Tiap perusahaan dicek dengan membuka kanal karir resminya langsung
              di browser. Pengecekan difokuskan ke peran di bawah ini, dan lokasi
              yang diutamakan: Bogor, Depok, Cibinong, Citayam, Bojonggede,
              Citeureup, Gunung Putri, dan Jabodetabek.
            </p>
            <ul>
              {TARGET_ROLES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="m-status">
          <h2 id="m-status">Arti enam status</h2>
          <ul className="rows">
            {STATUS_MEANINGS.map((s) => (
              <li key={s.status}>
                <b className="num">{stats.byStatus[s.status] || 0}</b>
                <span style={{ display: "grid", gap: 6, justifyItems: "start" }}>
                  <StatusTag status={s.status} />
                  <span>{s.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="m-bukti">
          <h2 id="m-bukti">Bukti yang tidak diterima</h2>
          <div className="prose">
            <p>Kalau kanal resmi memang mengarah ke platform pihak ketiga, platform itu dicatat apa adanya.</p>
            <ul>
              {NOT_EVIDENCE.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="m-tidak">
          <h2 id="m-tidak">Yang tidak dilakukan selama pengecekan</h2>
          <div className="prose">
            <ul>
              {NOT_DONE.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="m-skor">
          <h2 id="m-skor">Cara hasil di halaman Cari diurutkan</h2>
          <div className="prose">
            <p>Hasil diurutkan berdasarkan skor. Kalimat penyangkalan di data tidak dihitung sebagai kecocokan.</p>
            <ul>
              {SCORE_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="m-batas">
          <h2 id="m-batas">Yang perlu diingat</h2>
          <div className="prose">
            <p>
              Hasil ini berlaku pada tanggal cek. Lowongan bisa berubah setelah
              itu, dan daftar ini tidak menjamin lowongan masih ada atau pelamar
              akan diterima.
            </p>
            <p>
              Portal target dicek ulang otomatis tiap hari pukul 01.00 WIB. Cek
              otomatis hanya membuktikan portal bisa dibuka, bukan bahwa
              lowongannya masih ada. <Link href="/faq">Pertanyaan lain ada di FAQ.</Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
