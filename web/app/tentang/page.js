import { getStats } from "@/lib/companies";
import { getLocale } from "@/lib/i18n";

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
      <div className="page-head">
        <h1>{COPY.title[locale]}</h1>
        <p className="lede">{COPY.lede[locale]}</p>
      </div>

      <section className="dash-section" aria-label="Apa itu Karir">
        <p className="section-label">Apa itu Karir</p>
        <h2>Karir itu apa</h2>
        <p>
          Karir adalah daftar kanal karir resmi perusahaan Indonesia. Kamu
          ketik domisili dan posisi yang kamu cari, aplikasi menunjukkan kanal
          yang paling relevan, lalu kamu buka portal resminya dan lamar lewat
          kanal resmi.
        </p>
        <p>
          Daftar ini dibuat untuk siapa pun yang cari loker, dengan domisili
          dan posisi apa pun. Pengecekannya sendiri difokuskan ke peran gudang,
          produksi, cleaning, office boy, packing, dan crew store.
        </p>
      </section>

      <section className="dash-section" aria-label="Angka data">
        <p className="section-label">Angka data</p>
        <h2>Data dalam angka</h2>
        <div className="stat-stack">
          <div className="stat-row">
            <span className="stat-num num">{total}</span>
            <span className="stat-label">perusahaan di data</span>
          </div>
          <div className="stat-row">
            <span className="stat-num ok num">{targets}</span>
            <span className="stat-label">lowongan target terverifikasi</span>
          </div>
          <div className="stat-row">
            <span className="stat-num warn num">{notFit}</span>
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

      <section className="dash-section" aria-label="Kejujuran data">
        <p className="section-label">Kejujuran data</p>
        <h2>Yang ditulis apa adanya</h2>
        <p>
          Status tiap perusahaan ditulis sesuai keadaan pada tanggal cek.
          Portal yang tidak bisa dibuka ditulis sebagai kegagalan akses, bukan
          bukti perusahaan itu tidak membuka lowongan. Kalau daftar lowongan
          cuma terlihat setelah login, statusnya ditulis tidak dapat
          diverifikasi, karena tidak ada login yang dilakukan saat pengecekan.
        </p>
        <p>
          Lowongan bisa dibuka atau ditutup setelah tanggal cek, jadi selalu
          periksa portal resminya sebelum melamar. Skor di halaman Cari cuma
          mengurutkan kanal berdasarkan kecocokan data, bukan janji lowongan
          masih ada.
        </p>
      </section>

      <section className="dash-section" aria-label="Siapa yang merawat">
        <p className="section-label">Siapa yang merawat</p>
        <h2>Dirawat di repo terbuka</h2>
        <p>
          Data dan kode Karir ada di repo publik{" "}
          <a
            href="https://github.com/adiprmx/karir"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/adiprmx/karir
          </a>
          . Siapa pun bisa mengusulkan perusahaan baru atau koreksi lewat issue
          dan pull request, dengan bukti tautan halaman resmi yang dibuka
          langsung. Pembaruan data dilakukan lewat panel admin.
        </p>
      </section>
    </div>
  );
}
