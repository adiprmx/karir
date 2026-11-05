# Metode pengecekan

Dokumen ini menjelaskan cara daftar ini dibuat, supaya siapa pun bisa menilai sendiri seberapa jauh hasilnya bisa dipercaya.

## Yang dicek

Setiap perusahaan dicek dengan membuka kanal karir resminya langsung di browser, lalu menelusuri navigasi situs resmi perusahaan. Tanggal cek dicatat per baris di kolom `tanggal_cek`.

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
| Tidak dapat diverifikasi | Tidak ada kanal karir yang bisa diperiksa lewat navigasi resmi, atau halaman karirnya terbuka tapi kosong. |

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
| `link_karir` | Kanal karir resmi yang dibuka saat dicek. Satu baris, Olive Fried Chicken (No. 204), tidak punya tautan karena tidak ditemukan situs resmi perusahaan. |
| `status` | Status sesuai tabel di atas, pada tanggal cek. |
| `tanggal_cek` | Tanggal pengecekan, format `YYYY-MM-DD`. |
| `catatan` | Apa yang terlihat saat dicek, termasuk syarat, tanggal, dan peringatan yang relevan. |
| `lokasi` | Lokasi lowongan yang terlihat di halaman, atau "Tidak tercantum", "Tidak bisa dicek", sesuai keadaan saat dicek. |
| `posisi` | Judul posisi yang terlihat di halaman, atau "Tidak ada posisi terlihat", "Tidak bisa dicek", sesuai keadaan saat dicek. |

## Batasan

- Hasil ini berlaku pada tanggal cek. Lowongan bisa dibuka atau ditutup setelah tanggal itu.
- Untuk portal yang tidak bisa dibuka atau tidak dapat diverifikasi, tidak ada kesimpulan tentang lowongan perusahaan itu. Perlu dicek ulang di lain waktu.
- Untuk lowongan yang judulnya setara tapi tidak persis sama dengan peran target (misalnya Pelaksana Gudang sebagai setara Staff Gudang), hal itu ditulis di catatan supaya pembaca bisa menilai sendiri.
- Daftar ini tidak menjamin lowongan masih ada, dan tidak menjamin pelamar akan diterima.
