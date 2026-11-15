import { getLocale, t } from "@/lib/i18n";

export const metadata = {
  title: "Riwayat perubahan",
  description:
    "Apa yang berubah di tiap versi Karir, dari versi pertama sampai versi terbaru.",
  /* SEO-05: blok openGraph; SEO-04: kanonis /changelog (W2b). */
  openGraph: {
    title: "Riwayat perubahan",
    description:
      "Apa yang berubah di tiap versi Karir, dari versi pertama sampai versi terbaru.",
    url: "/changelog",
  },
  alternates: { canonical: "/changelog" },
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
    version: "2.16.1",
    date: "15 November 2026",
    points: [
      "Tombol Salin kini tersedia untuk kanal Cara lain melamar: satu tombol untuk setiap tautan formulir atau tautan lainnya; bila kanalnya berupa teks tanpa tautan, tombol menyalin seluruh teks.",
      "Spasi teks penghitung hasil di halaman Cari diperbaiki.",
      "Tampilan label Tampilkan kata sandi di halaman masuk admin diperbaiki; perbaikan yang sama berlaku untuk checkbox di halaman Pengaturan.",
    ],
  },
  {
    version: "2.16.0",
    date: "15 November 2026",
    points: [
      "Banyak perbaikan kecil di seluruh situs: tampilan, tulisan, dan alur yang lebih rapi.",
      "Dua kanal lamaran baru tercatat: email rekrutmen Pertamina dan formulir lamaran Guardian.",
      "Lowongan Train Attendant Angkasa Pura Supports dikonfirmasi masih buka sampai 18 November 2026.",
      "Pengujian otomatis bertambah banyak, supaya perubahan berikutnya lebih aman.",
    ],
  },
  {
    version: "2.15.0",
    date: "15 November 2026",
    points: [
      "Halaman Cari kini menampilkan hasil walau JavaScript gagal dimuat, dan halaman lain menjelaskan dengan jujur bila butuh JavaScript.",
      "Navigasi keyboard dan pembaca layar diperbaiki: fokus pindah ke judul halaman baru, menu dan filter menjebak fokus di dalamnya.",
      "Tombol dan tautan kini lebih besar dan mudah disentuh; batas isian dan teks petunjuk lebih jelas dibaca.",
      "Peta kini mengumumkan nama kota saja saat ganti kota, bukan seluruh daftar perusahaan.",
    ],
  },
  {
    version: "2.14.0",
    date: "15 November 2026",
    points: [
      "Halaman perusahaan kini punya tombol salin untuk alamat email dan nomor WhatsApp.",
      "Pengaturan kini punya pilihan untuk tidak dicatat kunjungannya.",
      "Kebijakan Privasi kini menjelaskan dengan lebih rinci apa yang dicatat soal kunjungan.",
    ],
  },
  {
    version: "2.13.0",
    date: "15 November 2026",
    points: [
      "Mencari kata peran seperti “gudang” kini menampilkan semua lowongan yang cocok, bukan hanya satu perusahaan.",
      "Hasil pencarian nama perusahaan kini dikelompokkan: perusahaan dulu, lalu lowongan.",
      "Filter kota baru di halaman Cari — persempit hasil ke kotamu.",
      "Tombol bagikan hasil pencarian kini tersedia di halaman Cari.",
    ],
  },
  {
    version: "2.12.0",
    date: "15 November 2026",
    points: [
      "Pencatatan kunjungan kini lebih aman: hanya server yang boleh menulis, dan catatan lama dihapus otomatis setelah 90 hari.",
      "Situs lebih tahan saat koneksi bermasalah: halaman tetap tampil dari data cadangan bila server data tidak bisa dijangkau.",
      "Bagian Yang berubah kini menjelaskan bila sedang tidak bisa dimuat, bukan tampil kosong.",
      "Peta kini menandai lebih banyak perusahaan; tanggal cek di dasbor selalu mengikuti data terbaru.",
      "Cek ulang harian kini mendahulukan lowongan yang batas lamarnya sudah dekat.",
      "Laporan tautan mati dari pengunjung kini bisa ditindaklanjuti dari panel admin.",
    ],
  },
  {
    version: "2.11.0",
    date: "15 November 2026",
    points: [
      "Lamaran tersimpan ke akun dalam hitungan detik dan tersinkron otomatis saat kamu kembali online; tiap akun di perangkat yang sama kini terpisah.",
      "Akun: ada lupa kata sandi, verifikasi email, unduh salinan data, dan hapus semua data yang benar-benar membersihkan semuanya.",
      "Halaman Dukungan baru untuk melaporkan tautan mati, koreksi data, dan lowongan mencurigakan.",
      "Halaman perusahaan: kontak ganda kini terpisah rapi, tautan di catatan bisa diklik, dan halaman yang tidak ada benar-benar menampilkan tidak ditemukan.",
      "Judul halaman yang ganda diperbaiki; mesin pencari kini diarahkan dengan benar.",
      "Halaman Mulai dan dasbor kini menjelaskan pilihanmu dengan lebih tepat.",
    ],
  },
  {
    version: "2.10.0",
    date: "15 November 2026",
    points: [
      "Keamanan diperketat: hanya admin yang bisa mengubah data perusahaan; profil akun hanya bisa dibaca pemiliknya dan admin.",
      "Menghapus lamaran kini bertahan di semua perangkat bila kamu masuk akun; peta tidak lagi salah menempatkan perusahaan.",
      "Batas lamar kini tercatat rapi dan tampil di halaman perusahaan, lengkap dengan hitung hari.",
      "Klaim soal akun diluruskan di semua halaman; Kebijakan Privasi dan Syarat Penggunaan baru diterbitkan; ada peringatan penipuan di halaman perusahaan.",
    ],
  },
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
      "Notifikasi lowongan target: setiap hari, daftar target dibandingkan dengan hasil cek sebelumnya. Target baru dan batas lamar yang tinggal 0-3 hari dikirim sekali sebagai satu pesan Telegram.",
      "Tanda Baru menandai perusahaan yang berubah dalam 48 jam terakhir di Beranda, Dasbor, dan daftar target.",
      "Batas akses kini berlaku sama di semua server.",
    ],
  },
  {
    version: "2.8.1",
    date: "7 November 2026",
    points: [
      "22 perusahaan target dicek ulang satu per satu di portal resminya. Yang masih punya lowongan target kini 9, dari sebelumnya 22.",
      "Masuk jadi pilihan, bukan kewajiban. Tanpa masuk pun semua fitur tetap jalan. Yang masuk bisa menyimpan tanda lamaran di akun supaya tidak hilang bila data browser dihapus.",
      "Daftar perusahaan kini dilindungi supaya tidak dipakai diam-diam sebagai layanan data oleh program otomatis.",
      "Halaman tetap tampil dari data cadangan bila basis data lambat atau mati, dan tidak lagi menampilkan halaman galat.",
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
      "Seksi Angka data yang mengulang ringkasan angka di Beranda dihapus.",
      "Daftar 22 target bisa disaring per kelompok (Gudang, Cleaning, Produksi, Toko, Lainnya) dan barisnya dua baris supaya tidak terpotong di HP.",
      "Foto membesar sedikit saat disentuh.",
    ],
  },
  {
    version: "2.6.0",
    date: "6 November 2026",
    points: [
      "Pengecekan ulang otomatis: 22 portal target dicek ulang tiap jam 1 pagi, dan perubahan status masuk ke bagian Yang berubah di Beranda.",
      "Logo asli tiap perusahaan dari domain resminya, di daftar target dan halaman detail.",
      "Tiga foto di Beranda (gudang, produksi, cleaning), hitam-putih.",
      "Penanda Terakhir dicek ulang di Beranda dan Dasbor, dengan status Segar atau Sudah lama.",
      "Cek massal admin ikut mencatat perubahan portal yang mati ke bagian yang sama.",
    ],
  },
  {
    version: "2.5.0",
    date: "6 November 2026",
    points: [
      "Beranda menambah bagian Masalah dan hasil: kanal yang berserakan dan lowongan hasil salinan, dibandingkan dengan 406 kanal resmi yang dicek langsung.",
      "Pencarian terakhir: Beranda, Cari, dan Dasbor mengingat pencarianmu dan bisa diulang dengan satu ketukan.",
      "Pengaturan di /pengaturan: lihat apa yang tersimpan di browsermu dan hapus sebagian atau semuanya.",
      "Dasbor memberi tahu kalau semua langkah sudah selesai, dan FAQ sekarang bisa dicari.",
    ],
  },
  {
    version: "2.4.0",
    date: "6 November 2026",
    points: [
      "Beranda jadi landing page lengkap: angka kepercayaan, cara kerja, fitur, cuplikan FAQ, dan penutup.",
      "Halaman Mulai baru: isi domisili dan posisi, langsung diarahkan ke hasil yang cocok. Pilihan tersimpan di browser saja.",
      "Dasbor jadi ruang kerja pribadi: sapaan sesuai pilihanmu, langkah berikutnya, dan ringkasan lamaran.",
      "Tombol Mulai di bagian atas halaman.",
    ],
  },
  {
    version: "2.3.0",
    date: "6 November 2026",
    points: [
      "Lamaran Saya: lacak lamaran, tersimpan di browser, lengkap tanggal dan catatan.",
      "Peta lowongan: 22 perusahaan target di peta, titik per kota dengan jumlah, klik untuk melihat daftarnya.",
      "Bagikan daftar target lewat WhatsApp dan cetak daftar target.",
      "Pencarian langsung bisa dipilih dengan panah keyboard.",
      "Gambar pratinjau dinamis per perusahaan saat tautan dibagikan.",
      "Pencarian mengerti sinonim peran, dan admin bisa memeriksa 22 tautan target sekaligus.",
    ],
  },
  {
    version: "2.2.0",
    date: "6 November 2026",
    points: [
      "Pencarian langsung di Beranda: ketik domisili dan posisi, 6 hasil teratas muncul di bawah kolom tanpa pindah halaman.",
      "Angka naik saat halaman muncul, grafik donat dan bar tumbuh, titik hijau berdenyut untuk lowongan target, ikon garis per kategori.",
      "Dasbor dirombak jadi visual: donat sebaran status, bar animasi kategori terbanyak, angka besar yang naik.",
      "Tulisan dipangkas: pengantar Beranda jadi satu kalimat, FAQ jadi lipat-buka, Metode memakai keterangan status dengan jumlah asli.",
      "Halaman data kini disiapkan saat dibuka, bukan saat situs dibangun, supaya pembaruan situs tidak gagal bila basis data sedang bermasalah.",
    ],
  },
  {
    version: "2.1.0",
    date: "6 November 2026",
    points: [
      "Halaman detail tiap perusahaan: portal, lokasi, posisi, perusahaan sejenis, bagikan, dan laporkan tautan mati.",
      "Halaman Tentang, Metode, FAQ, dan Riwayat perubahan.",
      "Antarmuka dua bahasa (Indonesia dan Inggris) lewat pilihan bahasa di bagian atas halaman.",
      "Panel admin ditulis ulang: tabel perusahaan, pemeriksaan kualitas data, impor dan ekspor data, catatan perubahan, dan pemeriksaan tautan.",
      "Keamanan data diperketat: setiap perubahan diperiksa sebelum disimpan, laporan tautan mati dicatat, dan semua perubahan terekam.",
    ],
  },
  {
    version: "2.0.0",
    date: "6 November 2026",
    points: [
      "Aplikasi web dibangun ulang dari nol.",
      "Data 406 perusahaan kini tersimpan di basis data, bukan lagi berkas statis.",
      "Pencarian server ditambahkan, dengan urutan hasil yang sama seperti halaman Cari.",
      "Panel admin baru untuk menambah, mengubah, dan menghapus perusahaan.",
      "Penyimpanan data dipindah ke layanan baru karena layanan lama sudah mencapai batas gratisnya.",
      "Versi lama yang statis tidak lagi dipakai.",
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
      "Karir dirombak dari daftar gudang Bogor jadi alat cari loker untuk semua orang.",
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
      "Setiap perusahaan kini mencatat lokasi dan posisi.",
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
        {/* INFO-11: isi halaman ini hanya Bahasa Indonesia; beri tahu
          * pengunjung mode Inggris, bukan pura-pura diterjemahkan. */}
        {locale === "en" && (
          <p className="note-line">{t(locale, "info.idOnly")}</p>
        )}
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
