# Metode pengecekan

Dokumen ini menjelaskan cara daftar ini dibuat, supaya siapa pun bisa menilai sendiri seberapa jauh hasilnya bisa dipercaya.

## Yang dicek

Setiap perusahaan dicek dengan membuka kanal karir resminya langsung di browser, lalu menelusuri navigasi situs resmi perusahaan. Tanggal cek dicatat per baris di kolom `tanggal_cek`.

Repo ini dipakai siapa pun yang cari loker, dengan domisili dan posisi apa pun. Pengecekan mencatat lowongan apa pun yang aktif di portal resmi perusahaan, jadi kolom `posisi` dan `catatan` memuat peran yang terlihat saat dicek. Peran lain bisa dicari lewat aplikasi web di repo ini: aplikasi mencocokkan kata kunci posisi dengan kolom `posisi` dan `catatan`, dan kalau tidak ada yang cocok, perusahaan tetap ditampilkan sebagai rekomendasi kanal dengan label bahwa peran itu belum terverifikasi di data kami. Aplikasi tidak pernah mengarang lowongan.

Peran yang paling sering dicari pengunjung, semuanya setara:

- Helper Gudang
- Staff Gudang
- Cleaning Service
- Office Boy
- Packing
- Operator Produksi
- Helper Produksi
- Crew Store

Lokasi yang diutamakan: Bogor, Depok, Cibinong, Citayam, Bojonggede, Citeureup, Gunung Putri, dan Jabodetabek. Lowongan di luar lokasi itu tetap dicatat, tapi lokasinya ditulis apa adanya supaya pembaca bisa menilai sendiri jaraknya.

## Arti tiap status

| Status | Artinya |
| --- | --- |
| Ada lowongan | Portal menampilkan minimal satu lowongan aktif pada tanggal cek, peran apa pun. Peran yang terlihat dicatat di kolom posisi. Lowongan dihitung bila ada di Indonesia: portal yang hanya punya lowongan di luar negeri berstatus "Tidak ada lowongan". Program magang yang sedang dibuka dihitung sebagai lowongan. Halaman yang hanya berisi pendaftaran kemitraan (misalnya mitra kurir/pengemudi) tanpa peran karyawan atau magang tidak dihitung sebagai lowongan. |
| Tidak ada lowongan | Portal terbuka, tapi tidak menampilkan lowongan apa pun pada tanggal cek. |
| Portal tidak bisa dibuka | Situs atau portal karirnya tidak bisa dibuka saat dicek (misalnya DNS tidak ditemukan, timeout, error server, atau terblokir). Ini kegagalan akses, bukan bukti perusahaan itu tidak membuka lowongan. |
| Tidak dapat diverifikasi | Tidak ada kanal karir yang bisa diperiksa lewat navigasi resmi, atau halaman karirnya terbuka tapi kosong, atau daftar lowongannya hanya terlihat setelah login. Tidak ada login yang dilakukan saat pengecekan. |

## Yang tidak dipakai sebagai bukti

- Cuplikan hasil pencarian.
- Postingan lowongan di media sosial atau job board pihak ketiga.
- Tautan pemendek seperti bit.ly.
- Halaman login Instagram atau LinkedIn.
- Alamat kantor, gerai, atau cabang di footer situs. Alamat itu bukan lokasi lowongan, jadi tidak dicatat sebagai lokasi lowongan.

Pengecualian: kalau kanal resmi perusahaan memang mengarah ke platform rekrutmen pihak ketiga (misalnya portal karir yang dikelola vendor), platform itu dicatat apa adanya, dengan catatan bahwa itu platform, bukan pemberi kerja langsung.

## Standar verifikasi

Satu baris disebut "terverifikasi" bila statusnya ditentukan dari bukti
tingkat 1 di bawah ini, dan buktinya dicatat. Semua ronde pengecekan
memakai standar yang sama.

**Tingkatan sumber bukti:**

1. **Kanal karir resmi perusahaan yang dibuka langsung**: portal karir
   di situs resmi perusahaan, atau halaman karir resmi yang dibuka dan
   dibaca langsung. Ini satu-satunya bukti yang boleh menentukan status
   "Ada lowongan" atau "Tidak ada lowongan".
2. **Kanal resmi perusahaan di platform pihak ketiga**: hanya sah bila
   kanal resmi perusahaan sendiri yang mengarah ke sana (misalnya
   portal karir yang dikelola vendor, atau formulir pendaftaran yang
   ditautkan dari situs resmi). Dicatat apa adanya sebagai platform,
   bukan pemberi kerja langsung.
3. **Petunjuk saja, bukan bukti**: cuplikan hasil pencarian, postingan
   media sosial, job board pihak ketiga, dan agregator lowongan. Sumber
   ini boleh dipakai untuk menemukan perusahaan atau memicu cek ulang,
   tetapi TIDAK BOLEH menentukan status. Status yang hanya bersandar
   pada sumber tingkat 3 adalah "Tidak dapat diverifikasi".

**Bukti yang wajib dicatat untuk tiap baris:**

- Tautan yang dibuka saat dicek (kolom `link_karir`).
- Tanggal pengecekan (kolom `tanggal_cek`).
- Apa yang terlihat saat dicek: judul lowongan, syarat, dan batas
  lamar bila ada (kolom `catatan` dan `posisi`).
- Siapa yang memeriksa (dicatat di log ronde pengecekan).

**Kanal melamar "terverifikasi":** sebuah email, nomor WhatsApp, atau
kontak lain hanya boleh dicantumkan sebagai kanal melamar bila
ditemukan di situs resmi perusahaan, portal karir resminya, atau akun
resmi perusahaan. Kanal yang sumbernya belum jelas ditulis "belum
terverifikasi" dan TIDAK dimasukkan ke kolom kanal. Kolomnya
dikosongkan sampai sumber resminya ditemukan.

**Aturan label WASPADA:** sebuah perusahaan HANYA boleh diberi label
WASPADA setelah investigasi yang JELAS dan LENGKAP: kanal resminya
diperiksa, keberadaan perusahaannya dipastikan, alamatnya dicek,
sumber-sumbernya dicocokkan satu sama lain, DAN semua komentar serta
ulasan dibaca (Google Maps, komentar postingan/portal, forum, dan
pengalaman kandidat), dan investigasi itu membuktikan perusahaan
tersebut bermasalah. Sebelum investigasi selesai, statusnya adalah
"belum terverifikasi", bukan waspada. Label WASPADA bukan status di
kolom `status`; label ini dicatat di `catatan` beserta bukti
investigasinya.

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
| `link_karir` | Kanal karir resmi yang dibuka saat dicek. 76 baris tidak punya tautan: 72 di antaranya punya kanal melamar lain (lihat kolom `email_hrd`, `wa_hrd`, `kontak_lain`), dan 4 baris tidak punya kanal apa pun karena situs resminya tidak ketemu: Olive Fried Chicken (No. 204), PT Dwi Indah (No. 315), PT Cintas Sentul Raya (No. 321), PT Best Logistics Service Indonesia (No. 355). Tautan kosong hanya boleh bila ada kanal lain atau penjelasannya tertulis di `catatan`. Aturan ini dijaga `scripts/validate.py`. |
| `status` | Status sesuai tabel di atas, pada tanggal cek. |
| `tanggal_cek` | Tanggal pengecekan, format `YYYY-MM-DD`. |
| `catatan` | Apa yang terlihat saat dicek, termasuk syarat, tanggal, dan peringatan yang relevan. |
| `lokasi` | Lokasi lowongan yang terlihat di halaman, atau "Tidak tercantum", "Tidak bisa dicek", sesuai keadaan saat dicek. |
| `posisi` | Judul posisi yang terlihat di halaman, atau "Tidak ada posisi terlihat", "Tidak bisa dicek", sesuai keadaan saat dicek. |
| `email_hrd` | Alamat email HRD atau rekrutmen dari situs resmi perusahaan. Beberapa alamat dipisah `;`. Kosong bila tidak ditemukan. |
| `wa_hrd` | Nomor WhatsApp HRD atau rekrutmen dari sumber resmi. Beberapa nomor dipisah `;`. Kosong bila tidak ditemukan. |
| `kontak_lain` | Kontak melamar lain dari sumber resmi (misalnya formulir pendaftaran atau akun resmi perusahaan). Kosong bila tidak ada. |
| `batas_lamar` | Batas akhir melamar yang tercatat, format `YYYY-MM-DD`; kosong bila tidak ada batas yang tercatat. Batas ini diambil dari tanggal yang tertulis di kanal resmi perusahaan, bukan dari perkiraan. |

## Aplikasi web

Aplikasi web yang live adalah aplikasi Next.js di folder `web/` (https://karir-adiprmx.vercel.app/). Aplikasi itu membaca data yang sama dan memberi rekomendasi berdasarkan domisili dan posisi yang dicari. Versi statis lama di folder `docs/` (`docs/index.html`, GitHub Pages) sudah tidak live dan hanya disimpan sebagai versi sebelumnya. Aturan kejujurannya:

- Kecocokan posisi hanya dihitung dari kolom `posisi` dan `catatan`.
- Kalimat penyangkalan di data tidak dihitung sebagai kecocokan. Misalnya lokasi yang berbunyi "tidak ada penyebutan Bogor/Depok" tidak dihitung cocok untuk domisili Depok, dan lokasi yang berbunyi "Bogor hanya muncul pada lowongan yang sudah kedaluwarsa" tidak dihitung cocok untuk domisili Bogor.
- Kalau kata kunci cocok dengan nama perusahaan, pencarian dianggap pencarian perusahaan dan hanya perusahaan itu yang tampil.
- Peran yang tidak cocok dengan data tetap ditampilkan sebagai rekomendasi kanal, dengan label bahwa peran itu belum terverifikasi di data kami.

Aplikasi bisa dipakai tanpa akun: pengunjung yang tidak masuk memakai
tracker yang tersimpan lokal di browser. Pengunjung yang masuk dengan
akun (opsional) mendapat sinkronisasi tracker: data pelacak lamaran
mereka tersimpan di akun supaya tetap ada di perangkat lain. Analitik
pengunjung berjalan secara anonim (halaman yang dibuka, pencarian, klik
portal) dengan ID pengunjung acak; tanpa nama dan tanpa data pribadi.

## Waspada penipuan

Lowongan palsu banyak beredar, dan daftar ini tidak bisa menjamin
setiap perusahaan bebas dari penipuan. Kenali tanda-tandanya sebelum
melamar:

- **Diminta membayar.** Biaya pendaftaran, biaya administrasi, biaya
  pelatihan, seragam, atau jaminan, dalam bentuk apa pun. Jangan
  pernah membayar untuk melamar: perusahaan yang benar tidak pernah
  memungut biaya dari pelamar.
- **Diminta transfer ke rekening pribadi** (bukan rekening perusahaan),
  atau diminta mengirim uang lewat dompet digital/e-wallet seseorang.
- **Dijanjikan pasti diterima** tanpa seleksi, atau gajinya jauh di
  atas wajar untuk peran itu.
- **Hanya bisa dihubungi lewat WhatsApp pribadi**, tanpa situs resmi,
  alamat kantor yang jelas, atau kanal rekrutmen resmi.
- **Diminta data sensitif terlalu dini**: foto KTP, nomor rekening,
  atau kode OTP, sebelum ada proses seleksi yang jelas.
- **Ditekan untuk segera memutuskan atau membayar** ("kuota tinggal
  satu", "bayar hari ini atau hangus").

Bila ragu, berhenti dan cek ulang: cari nama perusahaan di situs
resminya, bandingkan alamat email dan nomor kontaknya, dan baca ulasan
dari pelamar lain. Lihat juga halaman Pertanyaan umum di aplikasi
(`/faq`) untuk penjelasan soal biaya dan cara melamar yang aman.

## Batasan

- Hasil ini berlaku pada tanggal cek. Lowongan bisa dibuka atau ditutup setelah tanggal itu.
- Untuk portal yang tidak bisa dibuka atau tidak dapat diverifikasi, tidak ada kesimpulan tentang lowongan perusahaan itu. Perlu dicek ulang di lain waktu.
- Untuk lowongan yang judulnya setara tapi tidak persis sama dengan peran yang dicari (misalnya Pelaksana Gudang sebagai setara Staff Gudang), hal itu ditulis di catatan supaya pembaca bisa menilai sendiri.
- Daftar ini tidak menjamin lowongan masih ada, dan tidak menjamin pelamar akan diterima.
