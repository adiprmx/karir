# Karir v3.0.0: catatan desain

Dibangun ulang dari nol (10 Nov 2026). Arah visual diputuskan oleh pembangun karena brief menyerahkannya.

## Pembacaan desain
Alat cari lowongan untuk lulusan SMK di Android layar kecil, bergaya buku daftar dengan papan peringatan oranye hi-vis.
Dial: ENERGY 2, RHYTHM 3, MOTION 2 (MOTION 2 karena pemilik pernah minta tampilan yang hidup).

## Keputusan dan alasannya
- **Nomor urut sebagai motif.** Tiap perusahaan punya nomor asli di data (`no`). Nomor itu jadi lajur kiri baris daftar dan angka besar di halaman detail. Bukan hiasan, karena itu juga alamat halamannya.
- **Warna.** Inti: tinta hijau-hitam dan kertas kehijauan. Satu aksen: oranye hi-vis (warna rompi gudang dan pabrik). Oranye hanya berarti "ada lowongan terverifikasi" dan dipakai di tag status, slab angka Beranda, dan tombol portal pada perusahaan yang sedang buka. Kotak kecil di logo adalah penanda "buka" yang sama.
- **Status dibedakan lewat bentuk dan teks, bukan warna.** Persegi penuh = ada lowongan; setengah = ada tetapi tidak cocok; kosong = tidak ada; putus-putus = tidak bisa diverifikasi; silang dan dicoret = portal mati.
- **Huruf.** Archivo variabel (lebar 62-125%, tebal 100-900), satu berkas lokal 90 KB, lisensi OFL (`app/fonts/Archivo-OFL.txt`). Angka dan judul dipadatkan, teks bacaan lebar normal.
- **Bentuk.** Tag persegi 2px, chip bulat (bisa dipilih), panel 10px, daftar tanpa kartu (garis tipis seperti buku register). Bayangan hanya untuk sheet dan toast.
- **Navigasi.** HP: bilah atas tipis dan dock bawah 5 tujuan berlabel (Beranda, Cari, Peta, Lamaran, Menu). Layar lebar: tautan di bilah atas dan panel Menu dari kanan.
- **Gerak.** Hanya yang menjelaskan perubahan: sheet, toast, thumb pemilih status, tanda lamaran, urutan hasil yang bergeser di Cari, reveal sekali untuk seksi di bawah layar pertama. Mati bila `prefers-reduced-motion`.
- **Tema.** Terang dan gelap, mengikuti sistem, bisa diganti dari bilah atas. Panel admin selalu terang (`.force-light`).
- **Tanpa aset luar.** Tidak ada foto stok, tidak ada logo perusahaan di daftar (hanya di halaman detail), tidak ada font dari server luar.
- **Ikon.** Set gambar sendiri (garis 2,5, ujung rata, sudut tegas) di `app/visual.js`. Ikon aplikasi `public/icon.svg` berupa tanda sementara (kotak oranye dengan centang di atas tinta), bukan identitas final.

## Berkas
- `app/globals.css`: token, dasar, kerangka, komponen. Alasan per keputusan ada di komentar atas berkas.
- `app/visual.js`: ikon, tag status, reveal, sheet, toast.
- `app/admin/admin.css`: gaya admin, dibatasi di `.adm`.
