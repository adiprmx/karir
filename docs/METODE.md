# Metode pengecekan

Dokumen ini menjelaskan cara daftar ini dibuat, supaya siapa pun bisa menilai sendiri seberapa jauh hasilnya bisa dipercaya.

## Yang dicek

Setiap perusahaan dicek dengan membuka kanal karir resminya langsung di browser, lalu menelusuri navigasi situs resmi perusahaan. Tanggal cek dicatat per baris di kolom `tanggal_cek`.

Repo ini dipakai siapa pun yang cari loker, dengan domisili dan posisi apa pun. Tapi pengecekan lowongannya sendiri difokuskan ke peran target di bawah ini, jadi kolom `posisi` dan `catatan` paling lengkap untuk peran-peran itu. Peran lain bisa dicari lewat aplikasi web di repo ini: aplikasi mencocokkan kata kunci posisi dengan kolom `posisi` dan `catatan`, dan kalau tidak ada yang cocok, perusahaan tetap ditampilkan sebagai rekomendasi kanal dengan label bahwa peran itu belum terverifikasi di data kami. Aplikasi tidak pernah mengarang lowongan.

Peran target yang dicari, semuanya setara:

- Helper Gudang
- Staff Gudang
- Cleaning Service
- Office Boy
- Packing
- Operator Produksi
- Helper Produksi
- Crew Store

Lokasi yang diutamakan: Bogor, Depok, Cibinong, Citayam, Bojonggede, Citeureup, Gunung Putri, dan Jabodetabek. Lowongan target di luar lokasi itu tetap dicatat, tapi lokasinya ditulis apa adanya supaya pembaca bisa menilai sendiri jaraknya.

## Arti tiap status

| Status | Artinya |
| --- | --- |
| Ada lowongan target | Judul peran target terlihat di halaman resmi, lengkap dengan lokasinya. |
| Ada lowongan target (tidak cocok) | Judul peran target terlihat, tapi ada syarat yang membuat lowongan itu tidak bisa dipakai. Syaratnya ditulis di kolom catatan. |
| Tidak ada lowongan target | Portal terbuka dan ada lowongan, tapi tidak ada satu pun peran target. Posisi lain yang terlihat dicatat di kolom posisi. |
| Tidak ada lowongan terlihat | Portal terbuka, tapi tidak menampilkan lowongan apa pun pada tanggal cek. |
| Portal tidak bisa dibuka | Situs atau portal karirnya tidak bisa dibuka saat dicek (misalnya DNS tidak ditemukan, timeout, error server, atau terblokir). Ini kegagalan akses, bukan bukti perusahaan itu tidak membuka lowongan. |
| Tidak dapat diverifikasi | Tidak ada kanal karir yang bisa diperiksa lewat navigasi resmi, atau halaman karirnya terbuka tapi kosong, atau daftar lowongannya hanya terlihat setelah login. Tidak ada login yang dilakukan saat pengecekan. |

## Yang tidak dipakai sebagai bukti

- Cuplikan hasil pencarian.
- Postingan lowongan di media sosial atau job board pihak ketiga.
- Tautan pemendek seperti bit.ly.
- Halaman login Instagram atau LinkedIn.
- Alamat kantor, gerai, atau cabang di footer situs. Alamat itu bukan lokasi lowongan, jadi tidak dicatat sebagai lokasi lowongan.

Pengecualian: kalau kanal resmi perusahaan memang mengarah ke platform rekrutmen pihak ketiga (misalnya portal karir yang dikelola vendor), platform itu dicatat apa adanya, dengan catatan bahwa itu platform, bukan pemberi kerja langsung.

## Yang tidak dilakukan selama pengecekan

- Tidak ada lamaran yang dikirim.
- Tidak ada akun yang dibuat.
- Tidak ada login ke situs mana pun.
- Tidak ada formulir yang diisi atau dikirim.
- Tidak ada data pribadi yang dimasukkan.

## Kolom data

| Kolom | Isi |
| --- | --- |
| `no` | Nomor urut. |
| `perusahaan` | Nama perusahaan. |
| `kategori` | Kategori usaha. |
| `link_karir` | Kanal karir resmi yang dibuka saat dicek. Empat baris tidak punya tautan karena tidak ditemukan situs resmi perusahaan: Olive Fried Chicken (No. 204), PT Dwi Indah (No. 315), PT Cintas Sentul Raya (No. 321), PT Best Logistics Service Indonesia (No. 355). |
| `status` | Status sesuai tabel di atas, pada tanggal cek. |
| `tanggal_cek` | Tanggal pengecekan, format `YYYY-MM-DD`. |
| `catatan` | Apa yang terlihat saat dicek, termasuk syarat, tanggal, dan peringatan yang relevan. |
| `lokasi` | Lokasi lowongan yang terlihat di halaman, atau "Tidak tercantum", "Tidak bisa dicek", sesuai keadaan saat dicek. |
| `posisi` | Judul posisi yang terlihat di halaman, atau "Tidak ada posisi terlihat", "Tidak bisa dicek", sesuai keadaan saat dicek. |

## Aplikasi web

Aplikasi web di repo ini (`docs/index.html`) membaca data yang sama dan memberi rekomendasi berdasarkan domisili dan posisi yang dicari. Aturan kejujurannya:

- Kecocokan posisi hanya dihitung dari kolom `posisi` dan `catatan`.
- Kalimat penyangkalan di data tidak dihitung sebagai kecocokan. Misalnya lokasi yang berbunyi "tidak ada penyebutan Bogor/Depok" tidak dihitung cocok untuk domisili Depok, dan lokasi yang berbunyi "Bogor hanya muncul pada lowongan yang sudah kedaluwarsa" tidak dihitung cocok untuk domisili Bogor.
- Kalau kata kunci cocok dengan nama perusahaan, pencarian dianggap pencarian perusahaan dan hanya perusahaan itu yang tampil.
- Peran yang tidak cocok dengan data tetap ditampilkan sebagai rekomendasi kanal, dengan label bahwa peran itu belum terverifikasi di data kami.

Aplikasi tidak memakai akun, tidak mengumpulkan data pribadi, dan tidak mengirim apa pun ke mana pun.

## Batasan

- Hasil ini berlaku pada tanggal cek. Lowongan bisa dibuka atau ditutup setelah tanggal itu.
- Untuk portal yang tidak bisa dibuka atau tidak dapat diverifikasi, tidak ada kesimpulan tentang lowongan perusahaan itu. Perlu dicek ulang di lain waktu.
- Untuk lowongan yang judulnya setara tapi tidak persis sama dengan peran target (misalnya Pelaksana Gudang sebagai setara Staff Gudang), hal itu ditulis di catatan supaya pembaca bisa menilai sendiri.
- Daftar ini tidak menjamin lowongan masih ada, dan tidak menjamin pelamar akan diterima.
