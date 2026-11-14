# Kepercayaan & Keamanan — Karir

Dokumen ini mengatur dua hal: peringatan penipuan yang tampil ke
pengunjung, dan mekanisme label peringatan per perusahaan. Keduanya
dibuat karena audiens utama daftar ini adalah pencari kerja — termasuk
lulusan baru — yang paling rentan terhadap penipuan rekrutmen.

## 1. Peringatan penipuan untuk pengunjung

Peringatan umum soal lowongan palsu tampil di tiga tempat, lewat satu
komponen yang dipakai ulang (`web/app/fraud-warning.js`,
`FraudWarning`):

- Halaman FAQ (`/faq`): satu entri tanya jawab "Bagaimana mengenali
  lowongan palsu?" ditambah komponen varian lengkap di bawah daftar
  tanya jawab.
- Halaman Metode (`/metode`): komponen varian lengkap sebagai seksi
  terakhir halaman.
- Halaman detail perusahaan (`/perusahaan/[no]`): komponen varian
  singkat, tepat di bawah tombol portal dan di atas kanal melamar.

Isi peringatan: tanda-tanda lowongan palsu (diminta membayar, diminta
foto KTP/rekening di awal, gaji jauh di atas wajar, kontak dari nomor
pribadi atau email gratisan, proses terburu-buru), aturan utama
"jangan pernah membayar untuk melamar", dan ajakan melapor lewat
issue di repo GitHub Karir bila menemukan yang mencurigakan. Nada
peringatan menenangkan — memberi tahu tandanya, bukan menakut-nakuti.

Peringatan ini bersifat umum dan tampil di semua halaman detail. Ia
BUKAN penilaian atas perusahaan yang sedang dibuka halamannya.

## 2. Label peringatan per perusahaan

### 2.1 Aturan pemilik (berlaku mutlak)

Aturan ini ditetapkan pemilik repo pada 23 Oktober 2026 dan tidak
boleh dilanggar oleh siapa pun:

> JANGAN tandai perusahaan 'WASPADA' hanya dari pola (template
> massal, gaji tinggi, dan sebagainya). WAJIB investigasi JELAS dan
> LENGKAP dulu: kanal resmi, keberadaan perusahaan, alamat, cek
> silang sumber, DAN baca SEMUA komentar/ulasan (Google Maps,
> komentar postingan/portal, forum, thread pengalaman kandidat).
> Label 'WASPADA' HANYA setelah investigasi selesai DAN terbukti
> bermasalah; sebelumnya statusnya 'belum terverifikasi', bukan
> waspada.

Artinya: sinyal saja tidak cukup. Email HRD berdomain gratis, gaji
yang terlihat tinggi, atau poster lowongan yang tersebar massal
masing-masing hanyalah sinyal untuk diselidiki — bukan bukti, dan
bukan dasar label.

### 2.2 Proses investigasi (sebelum label apa pun)

Investigasi dilakukan ronde hunting (tim riset & hunting) dan
hasilnya dicatat tertulis sebelum keputusan apa pun diambil. Setiap
investigasi WAJIB mencakup seluruh langkah ini:

1. Kanal resmi — buka kanal karir resmi perusahaan langsung di
   browser; catat apa yang tampil (lowongan, peringatan penipuan
   dari perusahaan itu sendiri, atau tidak ada apa-apa).
2. Keberadaan perusahaan — periksa perusahaan itu benar-benar ada:
   situs resmi, badan hukum, dan jejak usaha yang bisa ditemukan.
3. Alamat — periksa alamat kantor yang tercantum dan apakah
   alamat itu cocok dengan sumber lain.
4. Cek silang sumber — bandingkan kanal resmi dengan sedikitnya
   dua sumber independen lain (portal lowongan, media, situs
   pemerintah, atau profil perusahaan).
5. Baca SEMUA komentar/ulasan — Google Maps, komentar di
   postingan/portal lowongan, forum, dan thread pengalaman
   kandidat. Catat pengalaman yang dilaporkan, baik yang
   menguatkan maupun yang membantah dugaan.
6. Kesimpulan tertulis — nyatakan dengan bukti: terbukti
   bermasalah, atau tidak terbukti. Bila bukti tidak cukup
   menyimpulkan, hasilnya "belum terverifikasi", bukan waspada.

Investigasi yang tidak menyelesaikan keenam langkah di atas belum
dianggap selesai, dan tidak boleh menjadi dasar label.

### 2.3 Siapa yang memutuskan

- Ronde hunting melakukan investigasi dan menyerahkan catatan
  bukti tertulis.
- Pemilik repo yang memutuskan: memberi label, tidak memberi
  label, atau menghapus perusahaan dari daftar (lihat 2.5).
- Tanpa keputusan pemilik, tidak ada label yang dipasang —
  meskipun investigasi sudah selesai.

### 2.4 Spesifikasi field `waspada`

Label diwujudkan sebagai satu kolom baru di data. Kolom ini
BELUM diimplementasikan di data maupun tampilan saat dokumen ini
ditulis; spesifikasi di sini adalah acuan bagi tim Data dan tim
Detail Perusahaan saat mengimplementasikannya.

- Nama kolom CSV/seed: `waspada`, ditambahkan sebagai kolom
  terakhir setelah `kontak_lain`.
- Nilai yang diizinkan: kosong (bawaan — tidak ada peringatan)
  atau `ya` (ada peringatan). Nilai lain tidak valid dan harus
  ditolak skrip validasi (`scripts/validate.py`).
- Firestore: dokumen `companies` memakai field `waspada` dengan
  nilai `true` hanya bila CSV bernilai `ya`; bila kosong, field
  tidak ditulis.
- Tampilan di halaman detail: bila `waspada` bernilai `ya`,
  tampilkan badge peringatan di dekat nama perusahaan, dengan
  teks yang menjelaskan alasannya dalam bahasa sehari-hari dan
  merujuk ke catatan perusahaan. Bentuk visual badge diputuskan
  bersama tim UI/UX dan tim Detail Perusahaan.
- Kolom `catatan` perusahaan yang berlabel WAJIB mencantumkan
  ringkasan bukti investigasi dan tanggal investigasinya, supaya
  pengunjung bisa menilai sendiri.
- Nilai `waspada` tidak boleh diisi dari pola atau dugaan —
  hanya dari investigasi lengkap yang sudah diputuskan pemilik
  (lihat 2.1–2.3).

### 2.5 Bila perusahaan terbukti penipuan

Bila investigasi membuktikan perusahaan itu penipuan (bukan
sekadar bermasalah), pemilik memutuskan salah satu dari dua
tindakan:

- Hapus perusahaan dari daftar, dengan catatan penghapusan
  di CHANGELOG (nomor, nama, tanggal, dan alasan singkat).
- Pertahankan dengan label `waspada` bernilai `ya` dan catatan
  bukti yang jelas, bila kehadirannya di daftar justru membantu
  pengunjung mengenalinya sebagai penipuan.

Keputusan mana pun dicatat tertulis bersama bukti investigasinya.

## 3. Status saat ini: belum ada label pada perusahaan mana pun

Audit 14 November 2026 menemukan 12 baris data yang catatannya
bertema penipuan — contohnya No. 276 Perum BULOG, No. 322 PT
Bukaka Teknik Utama Tbk, No. 569 PT PAL Indonesia, No. 575 PT
Jakarta International Container Terminal (JICT), dan No. 586 PT
Bukit Makmur Mandiri Utama (BUMA). Sebagian catatan itu justru
adalah peringatan penipuan yang diterbitkan perusahaan itu
sendiri di halaman resminya — itu sinyal untuk diselidiki,
bukan bukti perusahaan itu bermasalah.

Investigasi atas ke-12 baris tersebut BELUM DILAKUKAN. Sampai
investigasi lengkap (2.2) selesai dan pemilik memutuskan (2.3),
tidak satu pun dari perusahaan itu diberi label apa pun, dan
statusnya tetap "belum terverifikasi" untuk soal ini.

Daftar lengkap ke-12 baris dikonfirmasi ronde hunting saat
investigasi dimulai; dokumen ini tidak mengarang daftarnya dari
pencarian kata kunci, karena pencarian kata kunci juga menangkap
catatan yang tidak berhubungan dengan penipuan.

## 4. Dokumen terkait

- `docs/METODE.md` — cara pengecekan kanal karir (apa yang
  dicek, bukti apa yang diterima, dan apa yang tidak dilakukan
  selama pengecekan).
- `SECURITY.md` — jalur pelaporan celah keamanan repo/aplikasi
  (berbeda dari pelaporan lowongan mencurigakan di seksi 1).
