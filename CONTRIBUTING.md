# Berkontribusi

Repo ini menerima usulan perusahaan baru, koreksi tautan, dan hasil cek ulang. Semua perubahan data harus bisa dibuktikan. Aturannya di bawah ini.

## Cara mengusulkan perubahan

1. Buat issue dulu, pakai template yang sesuai di `.github/ISSUE_TEMPLATE/`.
2. Kalau mau langsung mengirim perubahan, buat pull request dari branch baru, satu perubahan per pull request.
3. Tulis di deskripsi pull request: apa yang berubah, tautan halaman resmi yang dibuka, dan tanggal pengecekan.

## Aturan data

- **Satu perusahaan, satu baris.** Jangan menduplikasi perusahaan yang sudah ada, termasuk anak perusahaan yang portal karirnya sama dengan induknya. Anak perusahaan dengan portal karir sendiri dicatat terpisah, dengan catatan yang menjelaskan pemisahan itu.
- **Tautan harus kanal resmi.** Tautan yang dicantumkan harus ditemukan lewat navigasi situs resmi perusahaan. Jangan memakai cuplikan pencarian, postingan media sosial, job board pihak ketiga, atau tautan pemendek sebagai tautan karir.
- **Status harus sesuai `docs/METODE.md`.** Pakai salah satu dari enam status yang ada di sana. Jangan membuat status baru tanpa diskusi di issue dulu.
- **Tanggal cek harus tanggal pengecekan yang sebenarnya**, format `YYYY-MM-DD`. Jangan memakai tanggal hari ini kalau pengecekannya dilakukan hari lain.
- **Lokasi dan posisi harus yang tertulis di halaman.** Kalau halaman tidak mencantumkan lokasi atau posisi, tulis "Tidak tercantum". Kalau kanal tidak bisa dibuka, tulis "Tidak bisa dicek". Jangan menebak.
- **Jangan mengubah data lama tanpa bukti.** Kalau hasil cek ulang berbeda dengan yang tercatat, sertakan tautan dan tanggal cek ulang di deskripsi pull request.

## Aturan pengecekan

Pengecekan ulang mengikuti metode yang sama seperti versi pertama:

- Buka kanal karir resmi langsung di browser.
- Jangan melamar, jangan membuat akun, jangan login, jangan mengisi formulir, dan jangan memasukkan data pribadi.
- Catat apa yang terlihat, bukan apa yang diduga.

## Menjalankan validasi

Sebelum mengirim pull request, jalankan:

```bash
python3 scripts/validate.py
```

Skrip ini memeriksa jumlah baris, nama kolom, kosakata status, format tanggal, dan duplikat nama perusahaan di `data/daftar-link-karir.csv`. Pull request yang gagal validasi tidak digabungkan sampai diperbaiki.

## Perubahan kode

Perubahan pada aplikasi web di `web/` mengikuti aturan yang sama seperti data: satu perubahan per pull request, dan deskripsinya menjelaskan apa yang berubah dan kenapa.

- Ikuti `docs/DESIGN.md`: monokrom hitam, abu, putih; warna hanya untuk fungsi dan status; tanpa gradasi dan tanpa font baru.
- Jangan menambah dependensi tanpa alasan yang ditulis di deskripsi pull request.
- Sebelum mengirim pull request untuk perubahan kode, jalankan dari folder `web/`:

```bash
npm run build
```

Pull request yang gagal build tidak digabungkan sampai diperbaiki. Jangan pernah menulis nilai Firebase asli ke `web/.env.example`; file itu hanya berisi placeholder.

## Kode etik

Diskusi yang kasar, spam lowongan palsu, dan promosi berbayar tidak diterima. Pelanggaran dilaporkan lewat issue; pengelola bisa menghapus komentar, menutup issue atau pull request, dan memblokir akun yang berulang kali melanggar. Jangan menyebarkan data pribadi siapa pun di issue atau pull request.
