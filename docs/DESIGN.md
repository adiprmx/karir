# DESIGN.md — Karir web app (rancang ulang v2.8.0, 7 Nov 2026)

## Pembacaan desain

Produk: alat cari lowongan untuk pencari kerja lulusan SMK, hampir semuanya
membuka dari HP. Isinya konten dan keputusan ("kanal mana yang layak
dibuka?"), jadi temanya terang, dengan tema gelap sebagai pilihan.
Motif identitas: **stempel cek**. Janji produk ini adalah "dicek, bukan
dicopas", jadi status terverifikasi tampil sebagai stempel yang jatuh sekali,
dan 610 kanal tampil sebagai 610 kotak yang menyala sesuai pencarianmu.

## Token

- Warna inti: kertas `#f4f1ea`, permukaan `#fffdf9`, tinta `#15140f`.
- Aksen tunggal: hijau `#0b7a43` yang artinya hanya "terverifikasi".
  Kuning `#8f5200` hanya untuk "syarat tidak cocok". Selain itu netral.
- Mode gelap: kertas `#12120f`, tinta `#f2efe6`, hijau `#4cd484`. Dipilih
  dengan saklar, awalnya mengikuti pengaturan perangkat.
- Huruf: Plus Jakarta Sans (variabel, 200–800), rancangan Tokotype (Indonesia),
  berkas lokal di `app/fonts`, lisensi OFL. Angka tabular.
- Radius: 10 (isian, tombol), 16 (kartu), 24 (panel pencarian, sheet), pil
  hanya untuk chip dan stempel.
- Elevasi: datar. Bayangan hanya di sheet dan toast. Tanpa kaca, glow,
  gradien, strip samping, atau badge di atas judul.
- Ikon: set gambar sendiri di `app/visual.js` (garis lurus, sudut tegas).
- Fokus: outline 3px tinta, offset 2px. Sasaran sentuh minimal 40px, tombol
  utama 48–56px.

## Struktur

- HP: bilah atas tipis + tab bawah 5 tujuan (Beranda, Cari, Peta, Lamaran,
  Menu). Layar lebar: navigasi di bilah atas, tab bawah hilang.
- Beranda: pencarian (hero) → 52 lowongan terverifikasi → bukti (angka besar,
  dua kolom tak simetris) → perubahan → FAQ. Tanpa blok CTA penutup.
- Cari: bilah isian menempel di atas (HP) / panel filter di kiri (desktop).
- Detail: judul, arti status, tombol portal, lalu dua panel (hasil cek,
  pelacak lamaran).

## Gerak (semua mati di prefers-reduced-motion)

1. Halaman masuk: opacity + geser 6px, 0,38 dtk.
2. Seksi masuk saat di-scroll: sekali, lalu observer dilepas.
3. Kotak 610 kanal menyapu masuk diagonal sekali; saat mengetik, yang cocok
   menyala dan sisanya meredup.
4. Stempel hijau jatuh sekali saat muncul.
5. Hasil Cari: kartu yang sudah ada meluncur ke posisi baru (FLIP, 340 ms).
6. Kontrol status lamaran: thumb bergeser; tombol tanda memantul.
7. Sheet filter/menu naik dari bawah; toast muncul 3,6 dtk.
Tidak ada animasi yang berulang terus selain rangka muat yang berhenti
setelah 6 putaran.

## Keadaan

- Memuat: rangka (skeleton) atau "Memuat N kanal…". Kosong: sebut sebabnya dan
  beri satu tindakan. Gagal: sebut apa yang gagal dan tombol Coba lagi.
- Kartu selalu menampilkan stempel status dan catatan jujur "peran ini belum
  terverifikasi" bila posisi yang dicari tidak cocok di data.
