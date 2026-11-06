<p align="center">
  <img src="assets/banner.svg" alt="Karir" width="100%">
</p>

<p align="center">
  <a href="https://github.com/adiprmx/karir/actions/workflows/validate.yml"><img src="https://github.com/adiprmx/karir/actions/workflows/validate.yml/badge.svg" alt="Validasi data"></a>
  <a href="https://github.com/adiprmx/karir/blob/main/LICENSE"><img src="https://img.shields.io/github/license/adiprmx/karir" alt="Lisensi MIT"></a>
  <img src="https://img.shields.io/badge/perusahaan-406-black" alt="406 perusahaan">
</p>

<p align="center">Kanal karir resmi 406 perusahaan Indonesia, masing-masing dibuka dan diperiksa langsung di browser pada 4 dan 5 November 2026.</p>

<p align="center"><a href="https://karir-adiprmx.vercel.app/">Cari loker di aplikasi web</a> — masukkan domisili dan posisi yang kamu mau, lalu lihat rekomendasinya.</p>

## Daftar isi

- [Sekilas](#sekilas)
- [Aplikasi web](#aplikasi-web)
- [Cara pakai](#cara-pakai)
- [Skema data](#skema-data)
- [Status](#status)
- [Contoh lowongan target](#contoh-lowongan-target)
- [Metode](#metode)
- [Berkontribusi](#berkontribusi)
- [Lisensi](#lisensi)

## Sekilas

<p align="center">
  <img src="assets/status-bar.svg" alt="Sebaran status 406 perusahaan" width="100%">
</p>

| Perusahaan | Lowongan target | Syarat tidak cocok | Terakhir dicek |
| --- | --- | --- | --- |
| 406 | 22 | 5 | 5 Nov 2026 |

Repo ini buat siapa pun yang cari loker. Kamu berdomisili di mana dan mau posisi apa, aplikasi webnya yang mencarikan kanal karir yang relevan dari 406 perusahaan ini. Link di sini mengarah ke halaman karir perusahaan. Halaman itu belum tentu sedang menampilkan lowongan, dan statusnya ditulis sesuai tanggal cek.

## Aplikasi web

Aplikasi webnya ada di repo ini juga, di folder `web/`, dan berjalan di https://karir-adiprmx.vercel.app/. Isinya tiga layar:

- **Beranda.** Pencariannya langsung di depan: ketik domisili dan posisi, lalu lihat rekomendasinya. Di bawahnya ada angka data dan 22 lowongan target yang terverifikasi.
- **Cari.** Pencarian lengkap dengan filter kategori, status, dan urutan.
- **Dasbor.** Gambaran data: sebaran status, kategori terbanyak, daftar 22 lowongan target, dan kanal yang perlu dicek ulang. Semua angka dihitung langsung dari data.

Hasil diurutkan berdasarkan skor rekomendasi:

| Kecocokan | Skor |
| --- | --- |
| Posisi cocok dengan data | +50 |
| Domisili cocok dengan data | +30 |
| Lowongan terverifikasi | +20 |
| Lowongan target, syarat tidak cocok | +10 |
| Portal tidak bisa dibuka | −20 |
| Tidak dapat diverifikasi | −10 |

Skor bukan janji lowongan. Aplikasi hanya merekomendasikan kanal karir berdasarkan data yang tercatat. Kalau posisi yang kamu cari tidak tercatat di data sebuah perusahaan, kartu perusahaannya tetap tampil dengan label "Peran ini belum terverifikasi di data kami — cek langsung di portalnya". Kalimat penyangkalan di data, misalnya "tidak ada penyebutan Bogor/Depok", tidak dihitung sebagai kecocokan.

Aplikasi tidak memakai akun pengguna, tidak mengumpulkan data pribadi pengunjung, dan tidak memakai analytics. Ada satu akun admin (dibuat pemilik repo di Firebase Console) untuk memperbarui data lewat panel admin di `/admin`. Kendali atas data dan kode ada di repo ini.

Pencarian juga tersedia sebagai API: `GET /api/companies?domisili=Bogor&posisi=Helper%20Gudang` mengembalikan hasil yang sama dengan halaman Cari, dalam JSON.

## Stack

Stack aplikasi web ini, lengkap:

- Hosting: Vercel, proyek `karir`, dari repo ini branch `main` folder `web/`, HTTPS aktif. Setiap push ke `main` men-deploy otomatis.
- Frontend dan backend: Next.js 15 dengan React 19 (App Router). Beranda dan Dasbor di-render di server, halaman Cari di-render di server dari parameter URL, jadi tiap pencarian bisa dibagikan lewat tautan.
- Database: Firebase Firestore, proyek `karir-9d53a`, lokasi asia-southeast1, paket Spark gratis. Koleksi `companies` berisi 406 dokumen, satu per perusahaan, diimpor dari `data/daftar-link-karir.csv` lewat `web/scripts/import-firestore.mjs`. Aturan Firestore: baca terbuka untuk semua, tulis hanya untuk pengguna yang sudah login.
- API pencarian server: `GET /api/companies`, logika skor yang sama dengan halaman Cari, berjalan di server.
- Admin panel: halaman `/admin`, login Firebase Auth (Email/Password), untuk tambah, ubah, dan hapus perusahaan. Akun admin dibuat pemilik repo di Firebase Console, bukan dari aplikasi.
- Data baca aplikasi: lewat Firestore REST API, bukan SDK gRPC.
- Validasi data: GitHub Actions menjalankan `scripts/validate.py` (Python) setiap ada perubahan pada CSV.
- Yang tidak dipakai, dan kenapa: Supabase tidak dipakai karena akun sudah mencapai batas 2 proyek gratis yang aktif, dan keduanya sedang live sehingga tidak bisa di-pause atau dipakai untuk repo ini. Vercel KV tidak dipakai karena bukan database sungguhan. Versi statis lama di folder `docs/` (GitHub Pages, HTML/CSS/JS polos) sudah tidak dipakai lagi sebagai aplikasi live; foldernya tetap ada di repo sebagai versi sebelumnya.
- Alasan stack ini: semuanya gratis selamanya, tanpa server yang harus dirawat, dan tanpa data pengguna yang bisa bocor.

## Cara pakai

Pakai aplikasi web di https://karir-adiprmx.vercel.app/ untuk mencari. Kalau mau mengolah datanya sendiri, buka `data/daftar-link-karir.csv`, saring kolom `status` ke "Ada lowongan target", lalu buka tautan karirnya dan baca syarat lengkapnya sebelum melamar. Lamar hanya lewat kanal resmi di daftar ini. Rekrutmen yang sah tidak memungut biaya.

Dengan Python:

```python
import pandas as pd

url = "https://raw.githubusercontent.com/adiprmx/karir/main/data/daftar-link-karir.csv"
df = pd.read_csv(url)
target = df[df.status == "Ada lowongan target"]
print(target[["perusahaan", "link_karir", "lokasi"]].to_string(index=False))
```

## Skema data

Satu baris per perusahaan, 9 kolom:

| Kolom | Isi | Contoh |
| --- | --- | --- |
| no | Nomor urut | 212 |
| perusahaan | Nama perusahaan | PT Novell Pharmaceutical Laboratories |
| kategori | Jenis perusahaan | Manufaktur |
| link_karir | Tautan kanal karir resmi | https://novellpharm.com/index.php?mod=professional |
| status | Hasil cek | Ada lowongan target |
| tanggal_cek | Tanggal pengecekan | 2026-11-05 |
| catatan | Catatan hasil cek | Judul persis HELPER, penempatan Gunung Putri Bogor |
| lokasi | Lokasi perusahaan atau lowongan | Gunung Putri Bogor |
| posisi | Peran target yang ditemukan | HELPER, WAREHOUSE STAFF |

File `data/daftar-link-karir.xlsx` isinya sama, ditambah sheet Petunjuk. Daftar lengkap lowongan target ada di `docs/TEMUAN.md`, riwayat perubahan di `CHANGELOG.md`.

## Status

| Status | Jumlah |
| --- | --- |
| Tidak ada lowongan target | 152 |
| Tidak ada lowongan terlihat | 77 |
| Tidak dapat diverifikasi | 84 |
| Portal tidak bisa dibuka | 66 |
| Ada lowongan target | 22 |
| Ada lowongan target (tidak cocok) | 5 |

Portal tidak bisa dibuka berarti situs atau portal karirnya tidak bisa diakses saat dicek. Itu kegagalan akses, bukan bukti perusahaan tidak membuka lowongan. Tidak dapat diverifikasi berarti tidak ada kanal karir yang ditemukan lewat navigasi resmi perusahaan, atau daftar lowongannya hanya terlihat setelah login.

## Contoh lowongan target

Lowongan target yang terverifikasi dan lokasinya di Bogor dan sekitarnya:

| Perusahaan | Peran | Lokasi | Catatan |
| --- | --- | --- | --- |
| [OCS Group Indonesia](https://recruitment.dataon.com/ocsindonesia/) | CLEANER | Kab. Bogor | Min. SMA, maks. 40 tahun, min. 1 tahun pengalaman cleaning service |
| [PT Novell Pharmaceutical Laboratories](https://novellpharm.com/index.php?mod=professional) | HELPER | Gunung Putri, Bogor | Judul persis HELPER; WAREHOUSE STAFF juga tercantum di halaman yang sama |
| [Ganesha Operation](https://career.ganeshaoperation.com/lowongan?posisi=Office+Boy&kota=47%2C48) | Office Boy | Bogor dan Cibinong | Detail menulis umur maksimal 25 tahun sampai Oktober 2025, tapi lowongan tampil live |
| [PT Dexa Medica (Dexa Group)](https://www.dexagroupcareer.com) | Production Staff A, Steril Novice Worker | Bekasi | Production Staff A diposting 28 Okt 2026; Steril Novice Worker untuk pengemasan finished good |
| [Swiss-Belhotel International](https://jobs.talentics.id/swiss-belhotel-international/hotel-executive-housekeeper-housekeeping-manager-copy-1) | Hotel Executive Housekeeper | Kota Bogor | Tidak cocok: butuh S1 dan pengalaman 2 tahun |
| [KitaLulus](https://www.kitalulus.com/) | Staff Gudang, lewat platform | Cibinong | Tidak cocok: minimal D3/D4, pemberi kerja Titik Seduh Cibinong |

## Metode

Setiap kanal dibuka langsung di browser lewat navigasi situs resmi perusahaan. Cuplikan pencarian, postingan pihak ketiga, dan tautan pemendek tidak dipakai sebagai bukti. Pengecekan ini hanya membuka halaman: tidak ada yang dilamar, tidak ada akun yang dibuat, tidak ada login, dan tidak ada data pribadi yang dimasukkan.

Pengecekan lowongan di data ini difokuskan ke peran gudang, produksi, cleaning, office boy, packing, dan crew store. Peran lain belum tentu tercatat, jadi aplikasi web merekomendasikan kanal berdasarkan data yang ada dan menandai peran yang belum terverifikasi. Penjelasan lengkap ada di `docs/METODE.md`.

## Berkontribusi

Usulan perusahaan baru, koreksi tautan, dan hasil cek ulang diterima lewat issue dan pull request. Setiap perubahan data harus dibuktikan dengan tautan halaman resmi yang dibuka langsung. Aturannya ada di `CONTRIBUTING.md`.

## Lisensi

Kode dan skrip: MIT, lihat `LICENSE`. Data di `data/`: CC BY 4.0.
