# Daftar Link Karir Terverifikasi

Daftar kanal karir resmi dari 299 perusahaan, masing-masing sudah dibuka dan diperiksa langsung di browser pada 4–5 November 2026. Daftar ini dibuat untuk pencari kerja yang mencari peran gudang, produksi, cleaning, office boy, packing, dan crew store di Bogor, Depok, Cibinong, dan sekitarnya.

## Yang perlu dipahami dulu

- **Ini daftar kanal karir, bukan daftar lowongan yang sedang buka.** Link di sini mengarah ke halaman karir perusahaan. Halaman itu bisa saja sedang tidak menampilkan lowongan.
- **Status ditulis sesuai tanggal cek.** Lowongan bisa berubah besok. Sebelum melamar, buka lagi linknya dan baca syaratnya sendiri.
- **Tidak ada lowongan yang dilamar atas nama siapa pun.** Semua yang ada di sini hanya hasil pengecekan. Tidak ada akun yang dibuat, tidak ada formulir yang diisi, dan tidak ada data pribadi yang dimasukkan selama pengecekan.
- **Hanya kanal resmi yang dicatat.** Postingan lowongan di media sosial, job board pihak ketiga, dan tautan pemendek (bit.ly dan sejenisnya) tidak dipakai sebagai bukti lowongan.

## Isi daftar

| File | Isi |
| --- | --- |
| `data/daftar-link-karir.csv` | Seluruh 299 baris, format CSV. Ini sumber data utama. |
| `data/daftar-link-karir.xlsx` | File spreadsheet yang sama, dengan sheet Petunjuk dan List Link Karir. |
| `docs/METODE.md` | Cara pengecekan, arti tiap status, dan batasan daftar ini. |
| `docs/TEMUAN.md` | Lowongan target yang terverifikasi, lengkap dengan tautan, lokasi, dan catatannya. |
| `CHANGELOG.md` | Perubahan tiap versi. |

## Ringkasan hasil

Tanggal cek: 4 November 2026 (81 perusahaan) dan 5 November 2026 (218 perusahaan). Total 299 perusahaan, semuanya sudah dicek, tidak ada yang berstatus "Belum dicek".

| Status | Jumlah | Artinya |
| --- | --- | --- |
| Tidak ada lowongan target | 119 | Portal terbuka dan ada lowongan, tapi tidak ada peran target. |
| Tidak ada lowongan terlihat | 56 | Portal terbuka, tapi tidak menampilkan lowongan apa pun. |
| Tidak dapat diverifikasi | 56 | Tidak ada kanal karir yang bisa diperiksa di navigasi resmi, atau halamannya kosong. |
| Portal tidak bisa dibuka | 51 | Situs atau portal karirnya tidak bisa dibuka saat dicek. Ini kegagalan akses, bukan bukti tidak ada lowongan. |
| Ada lowongan target | 16 | Ada peran target yang terlihat di halaman resmi. Lihat `docs/TEMUAN.md`. |
| Ada lowongan target (tidak cocok) | 1 | Ada peran target, tapi syaratnya tidak cocok. Lihat `docs/TEMUAN.md`. |

Peran target yang dicari: Helper Gudang, Staff Gudang, Cleaning Service, Office Boy, Packing, Operator Produksi, Helper Produksi, dan Crew Store. Lokasi yang diutamakan: Bogor, Depok, Cibinong, Citayam, Bojonggede, Citeureup, Gunung Putri, dan Jabodetabek.

## Cara memakai daftar ini

1. Buka `data/daftar-link-karir.csv` atau file `.xlsx`, lalu saring berdasarkan kolom `status`.
2. Mulai dari yang berstatus **Ada lowongan target** di `docs/TEMUAN.md`. Baca catatan di tiap baris, terutama lokasi dan tanggalnya.
3. Buka tautan karirnya, baca syarat lengkapnya, dan pastikan lowongannya masih ada sebelum melamar.
4. Untuk baris berstatus **Portal tidak bisa dibuka** atau **Tidak dapat diverifikasi**, jangan anggap perusahaan itu tidak membuka lowongan. Coba buka lagi di lain waktu, atau cari kanal resminya lewat situs perusahaan.

## Lowongan target yang terverifikasi

Ada 16 lowongan target dan 1 lowongan target yang tidak cocok. Yang lokasinya paling dekat dengan Bogor dan sekitarnya:

- **Novell Pharmaceutical Laboratories** — HELPER, penempatan Gunung Putri, Bogor.
- **Ganesha Operation** — Office Boy, di Bogor dan Cibinong.
- **Roti O** — Pelaksana Gudang, Produksi Buns & Pastry, dan Office Girl, di Kalideres, Jakarta Barat. Judulnya setara dengan peran target, bukan persis sama.
- **Richeese Factory** — Crew Outlet, di seluruh outlet, tanpa kota spesifik yang tercantum.
- **MR DIY Indonesia** — Store Crew Seluruh Indonesia, lokasi tertulis "Indonesia".
- **ISS Indonesia** — Cleaning Services, lokasi tidak tercantum di halaman detail.
- **Angkasa Pura Supports** — Cleaning Service di Jakarta, batas 10 November 2026.

Daftar lengkapnya, termasuk yang lokasinya di luar prioritas dan yang syaratnya tidak cocok, ada di `docs/TEMUAN.md`. Baca catatan di sana sebelum melamar apa pun.

## Cara melamar yang aman

- Lamar hanya lewat kanal resmi yang tercantum di daftar ini.
- Jangan membayar apa pun untuk melamar. Rekrutmen yang sah tidak memungut biaya.
- Jangan mengirim KTP, nomor rekening, atau kode OTP ke siapa pun yang mengaku dari perusahaan.
- Kalau ada pihak yang meminta biaya atau kode verifikasi, berhenti dan laporkan ke perusahaan lewat kanal resminya.

## Berkontribusi

Usulan perusahaan baru, koreksi tautan, dan hasil cek ulang diterima lewat issue dan pull request. Aturannya ada di `CONTRIBUTING.md`. Setiap perubahan data harus bisa dibuktikan dengan tautan halaman resmi yang dibuka langsung, bukan cuplikan pencarian atau postingan pihak ketiga.

## Lisensi

- Kode dan skrip di repo ini: MIT, lihat `LICENSE`.
- Data daftar (`data/`): CC BY 4.0. Boleh dipakai ulang, disebarkan, dan diubah, selama sumbernya disebutkan dan tanggal ceknya tetap dicantumkan.
