# Arsitektur

## Alur data

Sumber data adalah `data/daftar-link-karir.csv`: 610 perusahaan, 12 kolom, masing-masing kanal karirnya dibuka dan diperiksa langsung di browser pada 4 dan 5 November 2026. File itu sumber kebenaran untuk isi data. Aplikasi live tidak membaca CSV; aplikasi membaca Firestore.

```mermaid
flowchart LR
    CSV[data/daftar-link-karir.csv] --> IMPOR[web/scripts/import-firestore.mjs]
    IMPOR --> FS[(Firestore karir-9d53a)]
    FS --> REST[lib/companies.js dan lib/changes.js\nFirestore REST API]
    REST --> API[Rute /api/*]
    REST --> HAL[Next.js: Beranda, Cari, Dasbor,\ndetail, Peta, Lamaran]
    ADMIN[Panel admin /admin\nFirebase Auth + SDK] --> FS
    CRON[Vercel Cron 01:00 WIB\n/api/cron/recheck] --> FS
    HAL -.-> LS[(localStorage di browser\ntracker, onboarding,\npencarian terakhir)]
```

Impor memakai `web/scripts/import-firestore.mjs`: create per dokumen lewat REST API, 10 dokumen paralel, ID dokumen sama dengan nomor baris. Impor ulang menabrak 409 karena dokumennya sudah ada, jadi tidak terjadi ganda. Skrip memverifikasi sesudah impor dengan menghitung semua dokumen lewat `nextPageToken`.

## Koleksi Firestore

Proyek `karir-9d53a`, region asia-southeast1, paket Spark. Empat koleksi:

| Koleksi | Isi | Baca | Tulis |
| --- | --- | --- | --- |
| `companies` | 610 dokumen, satu per perusahaan | Terbuka | Admin login, dokumen harus lolos validasi (9 kolom wajib, `no` angka, status salah satu dari 6 nilai) |
| `changes` | Perubahan status dari cek ulang harian | Terbuka | Admin login, 6 kolom wajib, `from` dan `to` salah satu dari 6 status; tidak bisa diubah atau dihapus |
| `audit_logs` | Jejak perubahan data oleh admin | Admin login | Admin login; tidak bisa diubah atau dihapus |
| `reports` | Laporan tautan mati dari pengunjung | Admin login | Siapa pun, bentuk divalidasi (`no` angka, `alasan` 1 sampai 499 karakter); tidak bisa diubah atau dihapus |

Aturannya ada di `web/firestore.rules`. Aturan untuk `changes` sudah ditulis di file itu dan menunggu diterbitkan dari Firebase Console.

## Lapisan baca

Aplikasi membaca Firestore lewat REST API (`fetch` biasa) di `lib/companies.js` dan `lib/changes.js`, dengan timeout 10 detik untuk daftar perusahaan dan 5 detik untuk umpan perubahan. Cache memori server 5 menit; admin yang menulis data memanggil `revalidateCompanies()` supaya cache dibersihkan. Daftar perusahaan diambil per halaman 300 dokumen dengan `pageToken` sampai habis.

SDK JS Firestore (gRPC) tidak dipakai untuk baca server karena tidak menembus proxy egress di lingkungan build: request-nya timeout lalu mengembalikan 0 baris tanpa error yang jelas. REST terbukti andal di jalur yang sama, termasuk saat impor 406 dokumen.

Pencarian dan skor tinggal di `lib/search.js`, fungsi murni tanpa DOM: posisi cocok +50, domisili cocok +30, lowongan terverifikasi +20, portal mati -20, tidak dapat diverifikasi -10. Sinonim peran diperluas sebelum dicocokkan (cleaner menemukan Cleaning Service, warehouse menemukan Staff Gudang), dan kalimat penyangkalan dalam radius 60 karakter tidak dihitung sebagai kecocokan.

Cek satu tautan tinggal di `lib/check.js`: HEAD dulu, lanjut GET bila server menolak HEAD dengan 405 atau 501, maksimal 5 redirect, timeout 8 detik (10 detik bila dipanggil rute admin). Dipakai panel admin dan cron, supaya logikanya satu tempat.

## Lapisan tulis

Tulis hanya lewat dua jalur.

Admin di `/admin` login dengan Firebase Auth (Email/Password) lewat SDK di browser (`lib/firebase.js`), lalu menulis langsung ke Firestore. Aturan Firestore yang memvalidasi tulisannya. Setiap perubahan dicatat di `audit_logs`.

Cron harian (`GET /api/cron/recheck`, dijadwalkan Vercel Cron tiap 18:00 UTC, 01:00 WIB, lihat `web/vercel.json`) menulis lewat REST API memakai access token dari service account (`FIREBASE_SERVICE_ACCOUNT`, string JSON di env Vercel). Token dibuat dari JWT RS256 yang ditandatangani `node:crypto`, tanpa dependensi baru. Anggaran waktu 50 detik, cek paralel batch 5. Antrean berisi perusahaan yang ada lowongannya dan portal yang sedang berstatus mati (supaya ada jalan pulih), diurutkan dari yang paling lama tidak dicek supaya cek harian berputar ke seluruh daftar. Bila waktu habis, sisanya dicatat terpotong dan menunggu hari berikut.

Cek tautan hanya membuktikan portal bisa dibuka, bukan lowongannya masih ada. Karena itu pemetaan statusnya hati-hati: perusahaan yang ada lowongannya dan portanya mati jadi `Portal tidak bisa dibuka` dan tercatat di `changes`; perusahaan yang ada lowongannya dan portalnya hidup hanya diperbarui tanggal ceknya; portal mati yang hidup lagi jadi `Tidak dapat diverifikasi` sampai dicek ulang manusia.

## Yang tidak menyentuh server

Tracker lamaran, pilihan onboarding, dan pencarian terakhir hanya tersimpan di `localStorage` browser pengguna. Tidak ada yang dikirim ke server. Halaman `/pengaturan` menunjukkan apa yang tersimpan dan bisa menghapusnya.

## Keputusan arsitektur

- Datanya tinggal di Firestore. Akun Supabase sudah mencapai batas 2 proyek gratis yang aktif, dan keduanya sedang live. Vercel KV tidak dipakai karena data ini butuh database dokumen dengan query dan aturan tulis.
- Tanpa akun pengguna. Aplikasi sengaja tanpa akun: pengunjung bisa mencari dan melacak lamaran tanpa mendaftar, dan tidak ada data pribadi yang dikumpulkan. Satu-satunya akun adalah akun admin.
- Tanpa payment gateway. Aplikasi tidak memungut pembayaran apa pun.
- Hosting di Vercel, proyek `karir`, rootDirectory `web`. Setiap push ke `main` men-deploy otomatis. Deployment Protection dimatikan.
- Tidak ada analytics, tidak ada font eksternal. Angka di semua halaman dihitung dari data, bukan ditulis tangan.
