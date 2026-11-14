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
    version: "2.9.0",
    date: "14 November 2026",
    points: [
      "Status perusahaan kini netral: Ada lowongan, Tidak ada lowongan, Tidak dapat diverifikasi, Portal tidak bisa dibuka. Istilah target dan tidak cocok tidak dipakai lagi — Karir untuk semua pencari kerja, bukan satu profil.",
      "228 perusahaan dicek ulang satu per satu; 196 di antaranya ternyata sedang ada lowongan. Total perusahaan yang ada lowongannya kini 288 dari 610.",
      "Notifikasi kini mengabarkan perusahaan yang baru ada lowongan, lengkap dengan peran lowongannya.",
    ],
  },
  {
    version: "2.8.2",
    date: "8 November 2026",
    points: [
      "Notifikasi lowongan target: cron harian membandingkan daftar target dengan hasil cek sebelumnya. Target baru dan batas lamar yang tinggal 0-3 hari tercatat sebagai alert dan dikirim sekali sebagai satu pesan Telegram.",
      "Chip Baru menandai perusahaan yang berubah dalam 48 jam terakhir di Beranda, Dasbor, dan daftar target.",
      "Batas laju API kini dibagikan antar instance: Redis Upstash dulu, lalu Firestore, lalu memori. IP klien dibaca dari x-real-ip, lalu elemen terakhir x-forwarded-for.",
    ],
  },
  {
    version: "2.8.1",
    date: "7 November 2026",
    points: [
      "22 perusahaan target dicek ulang satu per satu di portal resminya. Yang masih punya lowongan target kini 9, dari sebelumnya 22.",
      "Masuk jadi pilihan, bukan kewajiban. Tanpa masuk pun semua fitur tetap jalan. Yang masuk bisa menyimpan tanda lamaran di akun supaya tidak hilang bila data browser dihapus.",
      "Indeks perusahaan kini dijaga token dan batas akses, supaya situs tidak dipakai diam-diam sebagai layanan data oleh program otomatis.",
      "Halaman tetap tampil dari data cadangan bila basis data lambat atau mati, dan tidak lagi menampilkan galat 500.",
    ],
  },
  {
    version: "2.8.0",
    date: "7 November 2026",
    points: [
      "Rancang ulang dari nol: tampilan, navigasi, dan gerak baru. HP kini punya tab bawah, tema terang dan gelap, dan huruf Plus Jakarta Sans.",
      "Beranda: 406 kanal tampil sebagai 406 kotak yang menyala sesuai domisili dan posisi yang diketik, dengan hasil teratas langsung di bawahnya.",
      "Cari: hasil diurutkan langsung di browser tanpa menunggu server, kartu meluncur ke urutan baru, filter di panel bawah, dan kartu bisa ditandai tanpa membuka halaman detail.",
      "Detail: status dijelaskan satu kalimat, pelacak lamaran satu ketukan, bagikan lewat menu bagikan HP.",
      "Peta: pilih kota dari chip atau titik di peta untuk melihat perusahaannya. Lamaran: saring per status dan ganti status dari kartu.",
      "Perbaikan pencarian: kata pendek seperti ob dan og dari sinonim office boy tidak lagi cocok di dalam kata lain (logistik, robot).",
    ],
  },
  {
    version: "2.7.0",
    date: "6 November 2026",
    points: [
      "Halaman hidup: tiap seksi muncul pelan saat di-scroll, angka naik saat terlihat, tombol dan baris merespons sentuhan.",
      "Header menempel saat scroll, navigasi HP jadi satu baris yang bisa digeser, tidak melipat lagi.",
      "Seksi Angka data yang menduplikasi trust strip dihapus.",
      "Daftar 22 target bisa disaring per kelompok (Gudang, Cleaning, Produksi, Toko, Lainnya) dan barisnya dua baris supaya tidak terpotong di HP.",
      "Foto membesar sedikit saat disentuh.",
    ],
  },
  {
    version: "2.6.0",
    date: "6 November 2026",
    points: [
      "Karir Hidup: cron mengecek ulang 22 portal target tiap jam 1 pagi, dan perubahan status masuk umpan Yang berubah.",
      "Logo asli tiap perusahaan dari domain resminya, di daftar target dan halaman detail.",
      "Tiga foto asli di Beranda (gudang, produksi, cleaning), hitam-putih.",
      "Cap Terakhir dicek ulang di Beranda dan Dasbor, dengan penanda Segar atau Sudah lama.",
      "Cek massal admin ikut mencatat perubahan portal yang mati ke umpan yang sama.",
    ],
  },
  {
    version: "2.5.0",
    date: "6 November 2026",
    points: [
      "Landing nambah seksi Masalah dan hasil: kanal berserakan dan lowongan copas lawan 406 kanal resmi yang dicek langsung.",
      "Pencarian terakhir: Beranda, Cari, dan Dasbor mengingat pencarianmu dan bisa diulang dengan satu ketukan.",
      "Pengaturan di /pengaturan: lihat apa yang tersimpan di browsermu dan hapus sebagian atau semuanya.",
      "Dasbor bilang kalau semua langkah sudah selesai, dan FAQ sekarang bisa dicari.",
    ],
  },
  {
    version: "2.4.0",
    date: "6 November 2026",
    points: [
      "Beranda jadi landing page lengkap: angka kepercayaan, cara kerja, fitur, cuplikan FAQ, dan penutup.",
      "Onboarding di /mulai: isi domisili dan posisi, langsung diarahkan ke hasil yang cocok. Tersimpan di browser saja.",
      "Dasbor jadi ruang kerja pribadi: sapaan sesuai pilihanmu, langkah berikutnya, dan ringkasan lamaran.",
      "Tombol Mulai di header, dan alur pengguna tertulis di PRODUCT.md.",
    ],
  },
  {
    version: "2.3.0",
    date: "6 November 2026",
    points: [
      "Lamaran Saya: lacak lamaran tanpa akun, tersimpan di browser saja, lengkap tanggal dan catatan.",
      "Peta lowongan: 22 perusahaan target di peta, titik per kota dengan jumlah, klik untuk melihat daftarnya.",
      "Bagikan daftar target lewat WhatsApp dan cetak daftar target.",
      "Pencarian langsung bisa dipilih dengan panah keyboard.",
      "Gambar pratinjau dinamis per perusahaan saat tautan dibagikan.",
      "Pencarian mengerti sinonim peran, dan admin bisa cek massal 22 tautan target.",
    ],
  },
  {
    version: "2.2.0",
    date: "6 November 2026",
    points: [
      "Pencarian langsung di Beranda: ketik domisili dan posisi, 6 hasil teratas muncul di bawah kolom tanpa pindah halaman.",
      "Angka naik saat halaman muncul, grafik donat dan bar tumbuh, titik hijau berdenyut untuk lowongan target, ikon garis per kategori.",
      "Dasbor dirombak jadi visual: donat sebaran status, bar animasi kategori terbanyak, angka besar yang naik.",
      "Copy dipangkas: lede Beranda satu kalimat, FAQ jadi lipat-buka, Metode memakai legenda status dengan jumlah asli.",
      "Build tidak lagi gagal bila Firestore tidak bisa dijangkau dari mesin build: halaman data di-render saat request.",
    ],
  },
  {
    version: "2.1.0",
    date: "6 November 2026",
    points: [
      "Halaman detail tiap perusahaan: portal, lokasi, posisi, perusahaan sejenis, bagikan, dan laporkan tautan mati.",
      "Halaman Tentang, Metode, FAQ, dan Riwayat perubahan, plus sitemap dan robots.",
      "Antarmuka dua bahasa (Indonesia dan Inggris) lewat saklar di header.",
      "Admin panel ditulis ulang: tabel, kualitas data, impor dan ekspor CSV, jejak perubahan, dan cek tautan.",
      "Aturan Firestore diperketat: validasi 9 kolom, laporan tautan mati, dan jejak audit.",
    ],
  },
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
