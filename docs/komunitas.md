# Komunitas

Karir hari ini adalah produk satu arah: pengelola menerbitkan data,
pengguna membaca. Tidak ada ruang bagi pengguna untuk berinteraksi
satu sama lain, di dalam aplikasi maupun di luar. Dokumen ini
mencatat jalur kontribusi yang ada, apa yang belum ada, dan
keputusan soal komunitas yang masih menunggu pemilik repo.

## Jalur kontribusi yang ada

- Issue koreksi data. Template `koreksi.md` di
  `.github/ISSUE_TEMPLATE/`: baris yang dikoreksi, yang salah,
  yang benar, dan bukti.
- Issue usulan perusahaan baru. Template `usulan-perusahaan.md`:
  nama perusahaan, tautan kanal karir resmi, tanggal cek, apa
  yang terlihat, dan kanal melamar lain bila ada.
- Pull request. Satu perubahan per pull request, dengan deskripsi
  yang menyebut apa yang berubah, tautan halaman resmi yang
  dibuka, dan tanggal pengecekan. Aturannya di `CONTRIBUTING.md`.
- Laporan tautan mati. Formulir di halaman detail perusahaan,
  dibaca pengelola di panel admin.

Semua jalur di atas adalah kontribusi pengguna ke pengelola, bukan
interaksi antar-pengguna. Laporan pengguna tidak pernah mengubah
data secara otomatis.

## Yang belum ada

- GitHub Discussions. Fitur ini tidak aktif di repo (halamannya
  404). Keputusan koordinator 15 November 2026: Discussions
  ditahan sampai pemilik memutuskan apakah Karir mau punya
  komunitas. Sampai keputusan itu ada, tidak ada ruang tanya
  jawab yang dijanjikan.
- Kanal chat atau grup. Tidak ada grup WhatsApp, Telegram,
  Discord, atau kanal lain yang ditautkan dari aplikasi, README,
  atau halaman Tentang.
- Fitur interaksi di dalam aplikasi. Tidak ada komentar,
  testimoni, forum, atau berbagi pengalaman di halaman mana pun.
- Berkas kode etik mandiri. Aturan perilaku saat ini hanya tiga
  kalimat di `CONTRIBUTING.md` (seksi "Kode etik"). Berkas
  `CODE_OF_CONDUCT.md` mandiri belum ada.
- Template pull request. `CONTRIBUTING.md` mewajibkan isi
  deskripsi tertentu, tetapi belum ada template yang memandu
  pengirimnya.

Dua butir terakhir adalah temuan P2 dari audit dan dikerjakan
menyusul; keduanya bukan penghambat kontribusi hari ini.

## Klaim yang diluruskan

Audit 14 November 2026 menemukan satu rujukan yang salah:
`.github/ISSUE_TEMPLATE/config.yml` mengarahkan pertanyaan umum
ke GitHub Discussions, padahal halamannya 404. Rujukan itu belum
diperbaiki saat dokumen ini ditulis (perbaikannya satu baris di
`config.yml`, menunggu penggabungan koordinator). Di luar itu,
tidak ada klaim komunitas di produk: FAQ dan halaman Tentang
hanya menyebut issue GitHub, dan issue GitHub memang tersedia.

Kehadiran repo di GitHub per audit 14 November 2026: 0 stars,
0 watchers, 0 forks. Angka itu adalah titik awal, bukan target.

## Keputusan yang menunggu pemilik

Apakah Karir mau punya komunitas adalah keputusan produk, bukan
keputusan teknis. Opsi paling ringan bila pemilik memutuskan ya:
satu kanal chat yang sudah dipakai audiens, ditautkan dari footer
dan halaman Tentang, dengan aturan singkatnya. Forum di dalam
aplikasi dan fitur sosial lain membutuhkan identitas pengguna
dan moderasi, jadi diputuskan setelah kanal ringan itu berjalan,
bukan sebelum.

Sampai pemilik memutuskan, dokumen ini dan jalur kontribusi di
atas adalah seluruh cakupan komunitas Karir.
