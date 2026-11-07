<p align="center">
  <img src="assets/banner.svg" alt="Karir" width="100%">
</p>

<p align="center">
  <a href="https://github.com/adiprmx/karir/actions/workflows/validate.yml"><img src="https://github.com/adiprmx/karir/actions/workflows/validate.yml/badge.svg" alt="Validasi data"></a>
  <a href="https://github.com/adiprmx/karir/blob/main/LICENSE"><img src="https://img.shields.io/github/license/adiprmx/karir" alt="Lisensi MIT"></a>
  <img src="https://img.shields.io/badge/perusahaan-406-black" alt="406 perusahaan">
</p>

<p align="center">Karir adalah daftar kanal karir resmi 406 perusahaan Indonesia. Setiap kanal dibuka dan diperiksa langsung di browser pada 4 dan 5 November 2026. Dari 406 perusahaan itu, 22 tercatat ada lowongan target saat dicek, untuk peran gudang, produksi, cleaning, office boy, packing, dan crew store.</p>

<p align="center"><a href="https://karir-adiprmx.vercel.app/">Cari loker di aplikasi web</a></p>

## Cari loker

Buka https://karir-adiprmx.vercel.app/, ketik domisili dan posisi di kolom pencarian, lalu buka halaman perusahaan untuk melihat status, lokasi, posisi, dan tanggal cek. Lamar lewat tombol "Buka portal karir" yang mengarah ke situs resmi perusahaan itu. Rekrutmen yang sah tidak memungut biaya.

Pengunjung baru bisa tekan "Mulai" di header, isi domisili dan posisi, lalu langsung diarahkan ke hasil yang cocok. Jawabannya hanya tersimpan di browser sendiri, tanpa akun dan tanpa login. Bisa dilewati.

## Data

<p align="center">
  <img src="assets/status-bar.svg" alt="Sebaran status 406 perusahaan" width="100%">
</p>

| Status | Jumlah |
| --- | --- |
| Ada lowongan target | 22 |
| Ada lowongan target (tidak cocok) | 5 |
| Tidak ada lowongan target | 152 |
| Tidak ada lowongan terlihat | 77 |
| Tidak dapat diverifikasi | 84 |
| Portal tidak bisa dibuka | 66 |

Empat baris tidak punya tautan karena tidak ditemukan situs resmi perusahaan. Tautannya tidak ditebak.

Setiap kanal dibuka langsung di browser lewat navigasi situs resmi perusahaan. Cuplikan pencarian, postingan pihak ketiga, dan tautan pemendek tidak dipakai sebagai bukti. Pengecekan hanya membuka halaman: tidak ada yang dilamar, tidak ada akun yang dibuat, tidak ada login, dan tidak ada data pribadi yang dimasukkan. Penjelasan lengkap ada di `docs/METODE.md`, daftar lengkap lowongan target ada di `docs/TEMUAN.md`.

Kalau mau mengolah datanya sendiri, buka `data/daftar-link-karir.csv`, saring kolom `status` ke "Ada lowongan target", lalu buka tautan karirnya dan baca syarat lengkapnya sebelum melamar.

```python
import pandas as pd

url = "https://raw.githubusercontent.com/adiprmx/karir/main/data/daftar-link-karir.csv"
df = pd.read_csv(url)
target = df[df.status == "Ada lowongan target"]
print(target[["perusahaan", "link_karir", "lokasi"]].to_string(index=False))
```

## Aplikasi web

Pencarian ada di Beranda: ketik domisili dan posisi, 6 hasil teratas muncul di bawah kolom tanpa pindah halaman, bisa dipilih dengan panah keyboard. Halaman `/cari` menambah filter kategori, status, dan urutan. Hasil diurutkan pakai skor:

| Kecocokan | Skor |
| --- | --- |
| Posisi cocok dengan data | +50 |
| Domisili cocok dengan data | +30 |
| Lowongan terverifikasi | +20 |
| Lowongan target, syarat tidak cocok | +10 |
| Portal tidak bisa dibuka | −20 |
| Tidak dapat diverifikasi | −10 |

Skor bukan janji lowongan. Aplikasi hanya merekomendasikan kanal karir berdasarkan data yang tercatat. Kalau posisi yang dicari tidak tercatat di data sebuah perusahaan, kartunya tetap tampil dengan label peran itu belum terverifikasi, dan pengunjung diminta cek langsung di portalnya. Kalimat penyangkalan di data, misalnya "tidak ada penyebutan Bogor/Depok", tidak dihitung sebagai kecocokan.

Pencarian mengerti sinonim peran: ketik "cleaner" menemukan "Cleaning Service", "warehouse" menemukan "Staff Gudang". Pencocokan nama perusahaan tetap memakai kata yang diketik, bukan sinonimnya.

Lamaran dilacak di `/lamaran` tanpa akun: tandai perusahaan sebagai Ditandai, Sudah dilamar, Dipanggil, atau Ditolak, lengkap tanggal dan catatan. Semuanya tersimpan di browser pengguna saja (localStorage), tidak dikirim ke mana pun. Peta di `/peta` menaruh 18 perusahaan target per kota (4 sisanya tidak punya lokasi spesifik dan tampil di daftar Lokasi lain), klik satu titik untuk melihat daftarnya. Dasbor di `/dasbor` menyapa sesuai pilihan onboarding, menunjukkan langkah berikutnya dan ringkasan lamaran, lalu grafik sebaran status dan daftar target.

Admin ada di `/admin`, khusus pemilik data. Login Firebase, lalu ubah data perusahaan, impor dan ekspor CSV, cek massal 22 tautan target, dan lihat laporan tautan mati dari pengunjung plus audit log. Setiap jam 01:00 WIB, cron mengecek ulang 22 portal target; perubahan status masuk umpan "Yang berubah" di Beranda. Portal yang tadinya mati lalu hidup lagi dicatat sebagai "Tidak dapat diverifikasi" sampai dicek ulang manusia, karena cek tautan hanya membuktikan portal bisa dibuka, bukan lowongannya masih ada.

Aplikasi tidak memakai akun pengguna, tidak mengumpulkan data pribadi pengunjung, dan tidak memakai analytics. Antarmuka tersedia dalam Bahasa Indonesia dan Inggris lewat saklar ID/EN di header. Sitemap otomatis berisi 417 URL (11 halaman + 406 halaman perusahaan), dan tiap halaman detail membawa data terstruktur JSON-LD.

Pencarian juga tersedia sebagai API: `GET /api/companies?domisili=Bogor&posisi=Helper%20Gudang` mengembalikan hasil yang sama dengan halaman Cari, dalam JSON. Ada juga `GET /api/companies/212` (satu perusahaan), `GET /api/companies?q=Novell` (pencarian bebas), `GET /api/stats` (angka ringkas data), `GET /api/changes` (umpan perubahan), dan `POST /api/admin/check-link` (cek apakah tautan karir sebuah perusahaan masih bisa dibuka; hanya menerima nomor perusahaan, URL diambil dari data yang tersimpan).

## Stack

| Teknologi | Status | Keterangan |
| --- | --- | --- |
| Next.js 15 + React 19 | Dipakai | Frontend dan backend, App Router; Beranda dan Dasbor di-render di server, halaman Cari di-render dari parameter URL sehingga tiap pencarian bisa dibagikan lewat tautan |
| Vercel | Dipakai | Hosting, proyek `karir`, rootDirectory `web`; setiap push ke `main` men-deploy otomatis |
| Firestore, proyek `karir-9d53a`, asia-southeast1, paket Spark | Dipakai | Koleksi `companies` berisi 406 dokumen, satu per perusahaan; dibaca aplikasi lewat REST API |
| Firebase Auth | Dipakai | Login admin saja, Email/Password; akun admin dibuat pemilik repo di Firebase Console |
| Leaflet 1.9.4 + OpenStreetMap | Dipakai | Peta 22 lowongan target |
| next/og | Dipakai | Gambar pratinjau dinamis per perusahaan |
| Supabase | Tidak dipakai | Akun sudah mencapai batas 2 proyek gratis yang aktif, dan keduanya sedang live |
| Vercel KV | Tidak dipakai | Data ini butuh database dokumen dengan query dan aturan tulis |
| Payment gateway | Tidak dipakai | Aplikasi tidak memungut pembayaran apa pun |
| Akun pengguna | Tidak dipakai | Aplikasi sengaja tanpa akun; data pribadi pengguna hanya tersimpan di browsernya sendiri |

Aturan Firestore: baca terbuka untuk semua; tulis hanya untuk pengguna yang sudah login dan hanya bila dokumen lolos validasi (9 kolom wajib, nomor bertipe angka, status salah satu dari 6 nilai). Koleksi `audit_logs` mencatat setiap perubahan data oleh admin dan tidak bisa diubah atau dihapus. Koleksi `reports` menampung laporan tautan mati dari pengunjung dalam bentuk yang divalidasi aturan.

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

File `data/daftar-link-karir.xlsx` isinya sama, ditambah sheet Petunjuk. Riwayat perubahan ada di `CHANGELOG.md`.

## Struktur repo

| Folder | Isi |
| --- | --- |
| `data/` | CSV dan XLSX, 406 perusahaan |
| `web/` | Aplikasi Next.js |
| `docs/` | `METODE.md`, `TEMUAN.md`, dan versi statis lama |
| `scripts/` | `validate.py`, validasi CSV |
| `assets/` | Banner dan grafik status |
| `.github/` | Workflow validasi data, template issue dan pull request |

## Menjalankan lokal

```bash
cd web
npm install
npm run dev
```

Buka http://localhost:3000. Aplikasi butuh `web/.env.local` berisi enam variabel `NEXT_PUBLIC_FIREBASE_*`: `API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, dan `APP_ID`. Nilainya dari Firebase Console, proyek `karir-9d53a`.

## Berkontribusi

Usulan perusahaan baru, koreksi tautan, dan hasil cek ulang diterima lewat issue dan pull request. Setiap perubahan data harus dibuktikan dengan tautan halaman resmi yang dibuka langsung. Aturannya ada di `CONTRIBUTING.md`.

## Lisensi

Kode dan skrip: MIT, lihat `LICENSE`. Data di `data/`: CC BY 4.0.
