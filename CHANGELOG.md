# Changelog

Semua perubahan penting pada daftar ini dicatat di sini. Format tanggal: `YYYY-MM-DD`.

## 2.8.2 — 2026-11-08

Notifikasi lowongan target dan batas laju API yang dibagikan.

- Cron cek ulang harian kini membandingkan daftar target dengan snapshot run sebelumnya (dokumen `meta/targets`): nomor target yang baru muncul dicatat sebagai alert `new-target`, dan perusahaan target yang batas lamarnya 0-3 hari lagi dicatat sebagai alert `deadline` di koleksi `alerts`.
- Satu pesan Telegram gabungan dikirim per run bila ada alert baru; kegagalan kirim tidak menggagalkan cron. Balasan cron bertambah field `alerts` dan `telegram`.
- Kolom baru `batas_lamar` ("YYYY-MM-DD", opsional) di dokumen `companies`, diparse dari catatan yang sudah ada; aturan Firestore memvalidasinya sebagai string bila ada.
- Chip "Baru" di umpan Yang berubah, daftar target, dan kartu perusahaan untuk perubahan dalam 48 jam terakhir.
- Batas laju API pindah ke limiter bersama (`lib/rate-limit.js`): urutan store Redis REST Upstash, Firestore, lalu memori; dipakai `/api/index`, `/api/companies`, `/api/stats`, dan `/api/analytics`. `getClientIp` diperbaiki: `x-real-ip` dulu, lalu elemen terakhir `x-forwarded-for`.
- Status jujur: Vercel KV belum terpasang karena pembuatan via API gagal saat jaringan egress mati; store yang aktif sementara adalah Firestore. Web push (FCM) ditunda; Telegram dan chip "Baru" sudah mencakup kebutuhan.
- Tes: 121 lolos, 0 gagal (82 lama + 23 rate-limit + 16 notify). Build sukses; lint 0 error, 2 warning lama.

## 2.8.1 — 2026-11-07

Cek ulang 22 perusahaan target di portal resmi masing-masing.

- Super Indo (115): Ada lowongan target → Tidak ada lowongan target (DC Staff Gudang Cikarang tidak lagi terlihat; Staff Gudang hanya di Bawen dan Jawa Timur).
- Novell (212): Ada lowongan target → Tidak ada lowongan terlihat (HELPER/WAREHOUSE STAFF tidak terlihat di portal maupun kanal resmi terbaru).
- Apotek K-24 (230): Ada lowongan target → Portal tidak bisa dibuka (pengambilan halaman gagal total).
- ISS Indonesia (240): Ada lowongan target → Tidak dapat diverifikasi (portal hanya menampilkan kerangka SunFish; daftar lowongan tidak terbaca).
- Ganesha Operation (246): Ada lowongan target → Tidak dapat diverifikasi (halaman tertahan di "Loading..."; daftar lowongan tidak terbaca).
- Pintarnya (266): Ada lowongan target → Tidak ada lowongan terlihat (peran lama tidak tampak di antara 7 lowongan di beranda; beranda hanya sampel).
- Lion Air Group (277): Ada lowongan target → Portal tidak bisa dibuka (permintaan ditolak).
- Hermina Hospitals (287): Ada lowongan target → Ada lowongan target (tidak cocok) (Gudang Umum masih ada, tetapi syarat D3).
- Shopee Indonesia / SPX Express (293): Ada lowongan target → Tidak dapat diverifikasi (daftar lowongan dirender JavaScript dan tidak terbaca; tiga detail lowongan dari pencarian kedaluwarsa).
- Angkasa Pura Supports (299): tetap Ada lowongan target (CLEANING SERVICE batas 10 Nov 2026, TRAIN ATTENDANT batas 18 Nov 2026; CHIEF SECURITY GUARD muncul, SEKRETARIS tidak lagi tampil).
- BASF (301): Ada lowongan target → Tidak ada lowongan terlihat (halaman karir resmi tidak menampilkan daftar lowongan).
- OCS Group Indonesia (364): Ada lowongan target → Tidak dapat diverifikasi (portal hanya menampilkan splash lisensi SunFish; daftar lowongan tidak terbaca).
- Accor (376): Ada lowongan target → Ada lowongan target (tidak cocok) (Receiving & Storekeeper masih ada, tetapi syarat Diploma + pengalaman 1 tahun; Storekeeper baru di Mercure Gatot Subroto juga tidak cocok).
- PT Dexa Medica (386): Ada lowongan target → Tidak dapat diverifikasi (portal tidak berhasil dibaca).
- Tetap Ada lowongan target: Yamaha (150), EY (162), Roti O (190), Richeese Factory (200), MR DIY (235), Staffinc (263), Fore Coffee (330), Ranch Market (342).
- Hitungan baru 406 kanal: 9 Ada lowongan target, 7 tidak cocok, 153 Tidak ada lowongan target, 80 Tidak ada lowongan terlihat, 89 Tidak dapat diverifikasi, 68 Portal tidak bisa dibuka.

## 2.8.0 — 2026-11-07

Rancang ulang tampilan dan pengalaman dari nol.

- Kerangka baru: tab bawah di HP, tema terang/gelap, huruf Plus Jakarta Sans lokal, stempel status sebagai motif.
- Beranda: 406 kotak kanal yang menyala sesuai pencarian; hasil teratas langsung muncul.
- Cari: urutan dihitung di browser dari `/api/index`; animasi FLIP; filter di panel bawah.
- Detail, Lamaran, Peta, Mulai, Dasbor, Pengaturan dirancang ulang. Firebase di halaman detail dimuat malas (First Load JS 290 kB ke 111 kB).
- `lib/search.js`: kata kunci 1-2 huruf hanya cocok sebagai kata utuh.
- Dihapus: `photo-strip.js`, `recent-chip.js`, `cari/recent-saver.js`, `locale-toggle.js` (diganti `site-nav.js`).

## 2.7.0 — 2026-11-06

Rombakan tampilan: halaman bergerak dan tersusun.

- Tiap seksi muncul pelan saat di-scroll (IntersectionObserver, hormati prefers-reduced-motion); angka CountUp baru naik saat terlihat.
- Header menempel saat scroll; navigasi HP jadi satu baris horizontal yang bisa digeser (header tetap hitam sesuai design lock).
- Seksi Angka data dihapus — angkanya sudah ada di trust strip.
- Daftar 22 target: chip filter per kelompok (Gudang 7, Toko 5, Cleaning 4, Produksi 3, Lainnya 3) dan baris dua baris (nama di atas, posisi dan lokasi di bawah) supaya tidak terpotong di HP.
- Foto membesar sedikit saat disentuh; tombol dan baris merespons sentuhan; dropdown pencarian dan FAQ membuka dengan animasi.

## 2.6.0 — 2026-11-06

Karir Hidup: data dicek ulang sendiri tiap hari, dan tampilannya memakai visual asli.

- Cron Vercel mengecek ulang 22 portal target tiap jam 01:00 WIB; portal yang tadinya hidup terus mati dicatat ke umpan Yang berubah, portal mati yang hidup lagi jadi "Tidak dapat diverifikasi" sampai dicek ulang manusia.
- Umpan Yang berubah di Beranda (koleksi `changes`, API /api/changes); cek massal admin ikut mencatat perubahan yang sama.
- Logo asli tiap perusahaan dari domain resminya (layanan favicon Google) di daftar target dan halaman detail; bila favicon gagal, logonya hilang rapi.
- Tiga foto asli di Beranda (gudang, produksi, cleaning), tampil hitam-putih; semua URL foto dan favicon diverifikasi langsung sebelum dipakai.
- Cap "Terakhir dicek ulang" di Beranda dan Dasbor, dengan penanda Segar (dalam 7 hari) atau Sudah lama.
- Versi 2.5.0 tidak dirilis terpisah; isinya ikut rilis ini.

## 2.5.0 — 2026-11-06

Temuan riset alur web besar diterapkan ke Karir.

- Landing nambah seksi Masalah dan hasil setelah angka kepercayaan: kanal karir berserakan dan lowongan copas lawan 406 kanal resmi yang dicek langsung di browser.
- Pencarian terakhir: tersimpan di browser saja, chip "Terakhir" di Beranda, tersimpan juga saat mencari dari /cari, dan baris yang sama di Dasbor.
- Pengaturan di /pengaturan: pilihan onboarding, lamaran yang dilacak, dan pencarian terakhir — masing-masing bisa dihapus, atau hapus semuanya sekaligus.
- Dasbor: keadaan "Semua langkah selesai" kalau ketiga langkah berikutnya sudah beres; halaman Metode menandai dirinya sudah dibaca.
- FAQ sekarang bisa dicari lewat kolom pencarian.
- Sitemap 417 URL (11 halaman + 406 perusahaan).

## 2.4.0 — 2026-11-06

Landing page, onboarding, dan dasbor pribadi — alur pengguna lengkap.

- Beranda jadi landing page: angka kepercayaan (406 dicek, 22 target, 5 tidak cocok, 66 portal mati), cara kerja 3 langkah, fitur (Cari, Lacak lamaran, Peta lowongan), cuplikan FAQ, dan penutup dengan tombol Mulai.
- Onboarding di /mulai: isi domisili dan posisi, langsung diarahkan ke hasil yang cocok; tersimpan di browser saja, tanpa akun.
- Dasbor jadi ruang kerja pribadi: sapaan sesuai pilihan onboarding, langkah berikutnya, ringkasan lamaran, lalu donat dan daftar seperti sebelumnya.
- Tombol Mulai di header dan tautan Mulai di footer. Alur pengguna tertulis di PRODUCT.md.
- Sitemap 416 URL (10 halaman + 406 perusahaan).

## 2.3.0 — 2026-11-06

Aplikasi web dilengkapi jadi alat berburu kerja yang lengkap.

- Lamaran Saya: lacak lamaran tanpa akun (Ditandai, Sudah dilamar, Dipanggil, Ditolak, lengkap tanggal dan catatan), tersimpan di browser saja, ringkasan jumlah per status di /lamaran.
- Peta lowongan: 22 perusahaan target di peta, titik per kota dengan jumlah, klik untuk melihat daftarnya.
- Bagikan daftar 22 target lewat WhatsApp dan cetak daftar target (gaya cetak sendiri, tanpa header dan tombol).
- Pencarian langsung bisa dipilih dengan panah keyboard (Atas/Bawah, Enter, Escape).
- Gambar pratinjau (OG) dinamis per perusahaan, dibuat dengan next/og.
- Pencarian mengerti sinonim peran (cleaner menemukan Cleaning Service, warehouse menemukan Staff Gudang); pencocokan nama perusahaan tetap memakai kata yang diketik.
- Admin: cek massal 22 tautan target satu per satu dengan progres (jeda 6,5 detik antar panggilan karena batas 10 permintaan per menit).
- Sitemap bertambah jadi 415 URL (9 halaman + 406 perusahaan).

## 2.2.0 — 2026-11-06

Aplikasi web dibuat lebih hidup, lebih visual, dan lebih rapi.

- Pencarian langsung di Beranda: ketik domisili dan posisi, 6 hasil teratas muncul di bawah kolom tanpa pindah halaman (Enter tetap mengirim ke halaman Cari).
- Angka naik saat halaman muncul, grafik donat dan bar tumbuh, titik hijau berdenyut untuk lowongan target, ikon garis per kategori, dan satu animasi masuk yang halus per seksi. Semua gerak mati bila pengguna memakai prefers-reduced-motion.
- Dasbor dirombak jadi visual: donat sebaran status, bar animasi kategori terbanyak, angka besar yang naik, dan daftar lowongan target dengan ikon dan titik status.
- Copy dipangkas: lede Beranda jadi satu kalimat, langkah cara kerja masing-masing maksimal 6 kata, Tentang memakai angka besar, Metode memakai legenda status dengan jumlah asli, FAQ jadi lipat-buka.
- Detail perusahaan dan Cari: ikon kategori dan titik status di tiap baris, animasi masuk, kerapian blok di HP.
- Ketahanan build: halaman yang butuh data di-render saat request, bukan saat build, dan hitungan di header tidak menggagalkan build bila Firestore tidak bisa dijangkau dari mesin build. PRODUCT.md diperbarui karena masih menyebut aplikasi statis.

## 2.1.0 — 2026-11-06

Aplikasi web dilengkapi jadi produk yang lebih serius.

- Halaman detail per perusahaan (`/perusahaan/[no]`): tautan portal, lokasi, posisi tercatat, catatan cek, perusahaan sejenis, tombol bagikan (salin tautan dan WhatsApp), form laporkan tautan mati, metadata dan JSON-LD per halaman. Perusahaan yang tidak ada mengembalikan 404.
- Halaman isi: Tentang, Metode, FAQ, dan Perubahan (riwayat versi). Sitemap otomatis (413 URL) dan robots. Manifest web agar situs bisa dipasang sebagai aplikasi.
- API baru: `GET /api/companies/[no]`, `GET /api/stats`, pencarian bebas `q`, paginasi `offset`, dan `POST /api/admin/check-link` untuk mengecek tautan karir sebuah perusahaan (URL hanya dari data tersimpan, ada timeout 10 detik dan batas laju).
- Admin panel ditingkatkan: tabel dengan cari, saring status, urutan, dan paginasi 20 baris; panel kualitas data (tanpa tautan, tanpa lokasi, tanggal cek lebih dari 30 hari); impor CSV (validasi per baris, maks 100 baris) dan ekspor CSV/JSON; jejak perubahan di koleksi `audit_logs`; daftar laporan tautan mati dari koleksi `reports`; tombol cek tautan dan perbarui tanggal cek.
- Antarmuka dua bahasa (Indonesia dan Inggris) lewat saklar ID/EN di header, tersimpan di cookie. Data perusahaan tetap Bahasa Indonesia.
- Aturan Firestore diperketat dan diterbitkan: tulis `companies` hanya untuk pengguna login dan hanya bila dokumen lolos validasi (9 kolom wajib, nomor angka, status salah satu dari 6 nilai); `audit_logs` hanya bisa dibaca dan dibuat admin; `reports` bisa dibuat siapa pun dalam bentuk yang divalidasi, tidak bisa dibaca publik.
- Perbaikan keandalan: semua pengambilan data dari Firestore memakai timeout 10 detik, supaya rute jaringan yang mati membuat halaman menampilkan error dengan jelas, bukan menggantung. Halaman 404 dipindahkan dari loading root karena loading root membuat status halaman tidak ditemukan jadi 200. Header di HP kini membungkus rapi tanpa meluber (terukur: lebar gulir sama dengan lebar layar di 360 piksel dan 1280 piksel).

## 2.0.0 — 2026-11-06

Aplikasi web dibangun ulang jadi full stack.

- Next.js 15 dengan React 19 di Vercel (https://karir-adiprmx.vercel.app/), tiga layar yang sama: Beranda, Cari, Dasbor.
- Database Firebase Firestore (proyek `karir-9d53a`, asia-southeast1, paket Spark gratis): 406 perusahaan di koleksi `companies`, diimpor dari CSV. Aturan: baca terbuka, tulis hanya untuk pengguna yang sudah login.
- API pencarian server `GET /api/companies`, logika skor yang sama dengan halaman Cari (posisi +50, domisili +30, terverifikasi +20, tidak cocok +10, portal mati −20, tidak terverifikasi −10). Hasilnya terverifikasi sama dengan versi sebelumnya: Bogor + Helper Gudang menempatkan Roti O di atas dengan skor 100, PGN tepat satu hasil.
- Admin panel di `/admin`: login Firebase Auth (Email/Password) untuk tambah, ubah, dan hapus perusahaan. Akun admin dibuat pemilik repo di Firebase Console.
- Supabase tidak dipakai karena akun sudah mencapai batas 2 proyek gratis yang aktif. Vercel KV tidak dipakai karena bukan database sungguhan. Versi statis lama di `docs/` (GitHub Pages) tidak lagi jadi aplikasi live.
- Data dibaca aplikasi lewat Firestore REST API, karena SDK gRPC tidak bisa menembus proxy jaringan lingkungan build.

## 1.3.0 — 2026-11-06

Aplikasi web dirombak total jadi tiga layar dengan konsep yang jelas.

- Beranda: pencarian langsung di depan, contoh pencarian yang bisa diketuk, strip angka data, rel 22 lowongan target yang terverifikasi, dan cara kerja dalam tiga langkah.
- Cari: pencarian lengkap dengan filter kategori, status, dan urutan.
- Dasbor: sebaran status, kategori terbanyak, daftar 22 lowongan target, kanal yang perlu dicek ulang, dan kesegaran data — semua angka dihitung langsung dari data.
- Navigasi antar layar lewat tautan `#/beranda`, `#/cari`, `#/dasbor` yang bisa dibagikan.
- Perbaikan tampilan HP: kartu hasil tidak lagi meluber ke samping; kartu rel lowongan tidak lagi meregang kosong.

## 1.2.0 — 2026-11-05

Repo dirombak total dari daftar gudang Bogor menjadi alat cari loker untuk semua orang.

- Aplikasi web baru di `docs/`: cari berdasarkan domisili dan posisi atau perusahaan, dengan rekomendasi berdasarkan skor (posisi cocok +50, domisili cocok +30, lowongan terverifikasi +20, syarat tidak cocok +10, portal tidak bisa dibuka −20, tidak dapat diverifikasi −10). Berjalan tanpa server, tanpa akun, tanpa data pribadi, dan tanpa layanan pihak ketiga. Diterbitkan lewat GitHub Pages dari folder `docs/`.
- Aturan kejujuran aplikasi: kalimat penyangkalan di data tidak dihitung sebagai kecocokan; peran yang tidak cocok tetap tampil sebagai rekomendasi kanal dengan label belum terverifikasi; pencarian nama perusahaan hanya menampilkan perusahaan itu.
- PGN masuk sebagai No. 406 (PT Perusahaan Gas Negara Tbk, BUMN): kanal rekrutmennya lewat E-Recruitment Pertamina dan minta login, jadi statusnya Tidak dapat diverifikasi. Total jadi 406 perusahaan.
- README ditulis ulang untuk cakupan universal, dengan bagian aplikasi web dan penjelasan skor rekomendasi. `docs/METODE.md` diperbarui: cakupan universal, arti status Tidak dapat diverifikasi mencakup portal yang minta login, dan empat baris tanpa tautan dicatat dengan benar.

## 1.1.0 — 2026-11-05

Ronde H: 106 perusahaan tambahan, semuanya dicek langsung di browser pada 5 November 2026. Total jadi 405 perusahaan.

- H1 manufaktur 26, H2 retail kecil 19 (J.CO tidak dicek karena sudah ada di daftar), H3 jasa/logistik 24, H4 perusahaan gede 20, H5 tech/fintech/platform 17. Lima perusahaan yang muncul di riset H3 dan H5 (Lalamove, Waresix, Deliveree, Kargo Technologies, Logisly) hanya dihitung sekali, di H3.
- Status ronde H: 6 Ada lowongan target, 4 Ada lowongan target (tidak cocok), 33 Tidak ada lowongan target, 21 Tidak ada lowongan terlihat, 15 Portal tidak bisa dibuka, 27 Tidak dapat diverifikasi.
- Status keseluruhan 405: 152 Tidak ada lowongan target, 77 Tidak ada lowongan terlihat, 83 Tidak dapat diverifikasi, 66 Portal tidak bisa dibuka, 22 Ada lowongan target, 5 Ada lowongan target (tidak cocok).
- Temuan target baru: BASF Production Operator Jakarta, Fore Coffee Barista (seluruh Indonesia), Ranch Market kasir (Ambon/Malang/Cikarang Barat/Jakarta Selatan), OCS CLEANER Kab. Bogor, Accor Receiving & Storekeeper Jakarta Pusat, Dexa Production Staff A dan Steril Novice Worker Bekasi. Yang tidak cocok: RS Pondok Indah Teknisi MEP (D3 + 3 tahun pengalaman), Marriott Housekeeping Supervisor (level supervisor), Swiss-Belhotel Executive Housekeeper Kota Bogor (S1 + 2 tahun pengalaman), KitaLulus Staff Gudang Cibinong lewat platform (pemberi kerja Titik Seduh Cibinong, minimal D3/D4).
- Tiga baris baru tanpa tautan, karena tidak ditemukan situs resmi perusahaan: PT Dwi Indah (No. 315), PT Cintas Sentul Raya (No. 321), PT Best Logistics Service Indonesia (No. 355). Sama seperti Olive Fried Chicken (No. 204), tautannya tidak ditebak.
- Repo dinamai ulang menjadi `karir` (sebelumnya `daftar-link-karir`, lalu `daftar-link-karir-terverifikasi`, lalu `karir-terverifikasi`).

## 1.0.0 — 2026-11-05

Versi pertama yang diterbitkan.

- 299 perusahaan, semuanya sudah dicek langsung di browser.
- 81 perusahaan dicek 4 November 2026, 218 perusahaan dicek 5 November 2026.
- Status: 119 Tidak ada lowongan target, 56 Tidak ada lowongan terlihat, 56 Tidak dapat diverifikasi, 51 Portal tidak bisa dibuka, 16 Ada lowongan target, 1 Ada lowongan target (tidak cocok).
- Kolom baru di semua 299 baris: LOKASI dan POSISI, berisi lokasi dan judul posisi yang terlihat saat dicek.
- Angkasa Pura Supports dicatat terpisah dari induknya, Angkasa Pura Indonesia, karena portal karirnya terpisah.
- Satu baris tanpa tautan: Olive Fried Chicken (No. 204), karena tidak ditemukan situs resmi perusahaan.
