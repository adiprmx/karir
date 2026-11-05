# Changelog

Semua perubahan penting pada daftar ini dicatat di sini. Format tanggal: `YYYY-MM-DD`.

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
