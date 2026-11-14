# Riset pengguna

Dokumen ini adalah titik awal riset pengguna Karir. Sampai 15 November
2026 belum ada satu pun artefak riset pengguna di repo ini: belum ada
wawancara, survei, persona yang divalidasi, atau hasil uji kegunaan.
Dokumen ini mencatat apa yang sudah diketahui dari data yang ada, apa
yang masih asumsi, dan apa rencana risetnya. Semua yang berlabel asumsi
tetap asumsi sampai ada bukti dari pengguna nyata.

## Siapa penggunanya

Segmen pengguna dinyatakan di `docs/PRODUCT.md` (seksi "Audience and
job"): pencari kerja pertama kali, pencari kerja yang sudah biasa
melamar, pencari kerja yang melamar ke banyak tempat sekaligus, dan
pencari kerja di wilayah fokus daftar ini (Bogor, Depok, Cibinong,
Citayam, Bojonggede, Citeureup, Gunung Putri, dan Jabodetabek).
Peran yang datanya paling sering dicek: Helper Gudang, Staff Gudang,
Cleaning Service, Office Boy, Packing, Operator Produksi, Helper
Produksi, dan Crew Store.

Segmen-segmen itu disusun dari peran dan wilayah yang datanya dicek,
bukan dari pengamatan pengguna. Belum ada yang memvalidasi apakah
segmen itu cocok dengan orang yang benar-benar memakai aplikasi ini,
perangkat apa yang mereka pakai, atau seberapa paham mereka soal
melamar kerja lewat internet. Validasi itu adalah langkah pertama
rencana riset di bawah.

## Yang sudah diketahui dari data yang ada

Satu-satunya sumber perilaku pengguna saat ini adalah analitik
pengunjung anonim. Enam jenis event didefinisikan di
`web/lib/analytics-server.js`: `pageview`, `search`, `detail`,
`portal_click`, `tracker_mark`, dan `filter`. Event dikirim dari
halaman cari, pencarian di beranda, pelacak lamaran, dan pelacak
klik portal. ID pengunjung acak disimpan di browser; tidak ada nama,
email, atau alamat IP yang tersimpan.

Per 15 November 2026, pipa analitik belum menyimpan event apa pun,
karena tiga hal:

1. Aturan Firestore menuntut field `ts` berupa string, sementara
   kode menulis timestamp. Event ditolak aturan.
2. Variabel `ANALYTICS_SALT` belum dipasang di Vercel Production,
   sehingga route analitik menjawab `{skipped: true}` dan tidak
   menulis apa pun.
3. Event `portal_click` mengirim nomor perusahaan sebagai string,
   sementara validator menuntut angka. Event itu ditolak.

Perbaikan ketiganya adalah pekerjaan tim Analitik di Fase 4
implementasi. Sampai ketiganya selesai, tidak ada data perilaku
pengguna yang bisa dibaca, dan dokumen ini tidak membuat klaim
apa pun soal berapa orang memakai aplikasi atau fitur apa yang
paling dipakai.

Yang sudah bisa dibaca panel admin setelah pipa berjalan:
kunjungan per hari, halaman yang paling dibuka, kata kunci yang
paling dicari, perusahaan yang paling dibuka, dan hitungan status
pelacak. Dua jenis event belum masuk ringkasan admin: `portal_click`
dan `filter`. Ringkasan hanya memuat 30 hari terakhir dan paling
banyak 1000 event terbaru.

Yang belum terukur sama sekali: alur onboarding di `/mulai`
(tidak ada event di sana), interaksi peta, jumlah hasil tiap
pencarian, dan filter apa yang dipakai. Pertanyaan soal hal-hal
itu belum bisa dijawab dari data sampai instrumentasinya
ditambahkan.

## Hipotesis yang belum divalidasi

Daftar di bawah ini adalah hipotesis dari audit 14 November 2026,
disusun dari penelusuran struktur halaman dan kode, bukan dari
pengamatan pengguna. Tiap butir perlu diuji sebelum dijadikan
fakta.

1. Mengetik kata peran umum seperti "gudang" menampilkan satu
   hasil karena mode nama pencarian membajak kata itu. Pengguna
   baru bisa menyimpulkan situs ini tidak punya lowongan untuknya,
   lalu pergi.
2. Tanpa filter kota, pengguna harus menggulir ratusan kartu
   dari seluruh Indonesia; domisili hanya mengurutkan ulang hasil.
3. Tombol "Mulai" tersembunyi di HP di bawah 900px, sehingga
   pengguna HP tidak pernah ditawari alur terpandu.
4. Pesan yang bertentangan merusak kepercayaan: `/mulai` bilang
   pilihan tersimpan, Dasbor bilang belum ada; pelacak bilang
   tersimpan di browser saja padahal tersinkron ke akun bila
   pengunjung masuk.
5. Halaman detail belum menjawab "masih bisa melamar?": batas
   lamar tidak tampil dan tombol portal tetap tampil untuk portal
   yang diketahui mati.
6. Pengguna yang tersandung tidak punya tempat bertanya: tidak
   ada jalur masukan umum dan tidak ada bantuan di dalam alur
   utama.

Butir 4 dan 5 sebagian sudah diperbaiki setelah audit (klaim
pelacak diluruskan, batas lamar ditampilkan di halaman detail).
Sisanya menunggu perbaikan di tim pemiliknya masing-masing.

## Jalur masukan pengguna hari ini

- Formulir "Laporkan tautan mati" di halaman detail perusahaan.
  Fungsinya sempit: hanya soal tautan, bukan masukan umum.
- Issue GitHub: template koreksi data dan template usulan
  perusahaan baru (lihat `.github/ISSUE_TEMPLATE/`).
- Pull request, mengikuti aturan di `CONTRIBUTING.md`.

Tidak ada formulir masukan umum, alamat email kontak pengelola,
atau survei di dalam aplikasi. Jalur GitHub menuntut akun GitHub
dan pengetahuan cara memakai issue tracker, dan tidak ada bukti
audiens produk ini memakainya. Perluasan formulir laporan menjadi
masukan umum berjenis adalah pekerjaan tim Dukungan Pengguna.

## Rencana riset

Semua langkah di bawah ini tanpa biaya, mengikuti prinsip pemilik:
keterbatasan dana bukan alasan; gantikan dengan cara kerja yang
lebih pintar.

1. Validasi segmen. Ajak bicara pengguna nyata dan cocokkan
   dengan segmen di `docs/PRODUCT.md`: apakah pembagiannya
   tepat, perangkat apa yang mereka pakai, dan apa yang
   membingungkan mereka. Pemilik memutuskan siapa yang diajak
   bicara dan bagaimana caranya.
2. Uji kegunaan ringan berkala. Satu sesi cukup memakai tiga
   tugas: cari lowongan gudang di Depok, tandai satu perusahaan
   di pelacak, dan laporkan satu tautan mati. Catat di mana
   pengguna berhenti atau salah paham; jangan membantu di tengah
   tugas.
3. Hidupkan pengukuran perilaku. Setelah pipa analitik berjalan,
   jawab empat pertanyaan ini dari data: kata kunci apa yang
   tidak menghasilkan apa-apa; apakah pengguna membuka portal
   setelah membuka halaman detail; di langkah mana pengguna
   berhenti di alur `/mulai`; filter mana yang dipakai dan mana
   yang tidak pernah disentuh.
4. Buka jalur masukan umum. Perluas formulir laporan dengan
   pilihan jenis (tautan mati, data salah, sulit dipakai,
   lainnya) supaya masukan yang masuk bisa dipilah. Sampai
   formulir itu ada, template issue adalah jalur masukan yang
   tersedia.

## Aturan pencatatan

- Setiap temuan yang ditambahkan ke dokumen ini wajib menyebut
  sumbernya: rentang tanggal data analitik, tanggal uji dan
  jumlah peserta, atau tautan issue.
- Kutipan pengguna hanya dicatat bila ada rekaman atau catatan
  tertulisnya; kutipan tanpa sumber tidak ditulis.
- Asumsi diberi label asumsi sampai ada bukti. Labelnya dicabut
  hanya bila buktinya dicatat di sini.
