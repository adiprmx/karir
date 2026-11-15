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

## Kolom kanal melamar

Selain tautan karir utama (`link_karir`), tiap baris punya tiga kolom kanal melamar lain. Ketiganya hanya diisi dari sumber resmi perusahaan (situs resmi, portal karir resmi, atau akun resmi perusahaan). Kanal yang sumbernya belum jelas tidak dimasukkan — kolomnya dikosongkan sampai sumber resminya ditemukan (aturan lengkapnya di `docs/METODE.md`, seksi "Standar verifikasi").

- **`email_hrd`** — alamat email HRD atau rekrutmen. Bila lebih dari satu, pisahkan dengan `;` (titik koma). Kosong bila tidak ditemukan.
- **`wa_hrd`** — nomor WhatsApp HRD atau rekrutmen. Bila lebih dari satu, pisahkan dengan `;`. Kosong bila tidak ditemukan.
- **`kontak_lain`** — kontak melamar lain, misalnya formulir pendaftaran atau akun resmi perusahaan. Tautan pemendek (bit.ly dan sejenisnya) boleh dicantumkan di sini hanya bila tautan itu sendiri berasal dari sumber resmi perusahaan dan sumbernya ditulis di `catatan` (lihat `docs/METODE.md`, seksi "Tautan pemendek sebagai kanal melamar"). Kosong bila tidak ada.

Baris tanpa `link_karir` hanya diterima bila punya kanal lain di salah satu dari tiga kolom ini, atau penjelasannya tertulis di `catatan`. Aturan ini dijaga `scripts/validate.py`.

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
npm test
npm run lint
npm run build
```

Pull request yang gagal di salah satu langkah ini tidak digabungkan sampai diperbaiki. Jangan pernah menulis nilai Firebase asli ke `web/.env.example`; file itu hanya berisi placeholder.

## CI

Setiap pull request ke `main` diperiksa otomatis oleh GitHub Actions (rincinya di `docs/CI.md`):

- **App** (`.github/workflows/app.yml`) — jalan di tiap push dan pull request: install, tes unit (`npm test`), lint (`npm run lint`), build Next.js (`npm run build`), lalu tes asap. Pull request yang gagal di salah satu langkah ini tidak digabungkan.
- **Validate data** (`.github/workflows/validate.yml`) — jalan bila data, README, atau skrip validasi berubah: `scripts/validate.py` dan `scripts/check-consistency.py` (CSV vs seed dan angka README). Cek live (`--live`) hanya jalan di `main`, bukan di pull request.
- **Write-back harian** (`.github/workflows/write-back.yml`) — bukan gerbang pull request: workflow terjadwal yang menyalin status dan tanggal cek terbaru dari Firestore kembali ke CSV dan seed tiap hari 03:00 WIB.
- **Backup Firestore** (`.github/workflows/backup.yml`) — bukan gerbang pull request: workflow terjadwal mingguan yang mengekspor semua koleksi Firestore ke JSON dan mengunggahnya sebagai artifact (retensi 90 hari). Satu-satunya workflow yang memakai secret (`FIREBASE_SERVICE_ACCOUNT`, dipasang di Settings repo).
- **Release tag** (`.github/workflows/release-tag.yml`) — bukan gerbang pull request: membuat tag `vX.Y.Z` saat versi di `web/package.json` naik di `main`.

Build, tes, lint, dan smoke tidak memakai secret apa pun; semuanya memakai nilai dummy. Satu-satunya pengecualian adalah workflow Backup Firestore di atas, yang memakai secret `FIREBASE_SERVICE_ACCOUNT` dari Settings repo (bukan dari kode) untuk membaca Firestore. Sebelum mengirim pull request, jalankan gerbang yang relevan secara lokal (validasi data dari root repo, tes/lint/build dari folder `web/`) supaya tidak menunggu CI menemukan kesalahan yang bisa ditemukan sendiri.

## Kebijakan pengujian

Kebijakan ini melanjutkan seksi CI di atas: gerbang CI hanya berguna bila tesnya sendiri bisa dipercaya. Rincian gerbang ada di `docs/CI.md`.

- **Logika baru wajib ditemani tes.** Perubahan pada logika di `web/lib/`, route API, atau skrip di `web/scripts/` harus membawa tes yang membuktikan perilaku barunya, termasuk kasus gagalnya (bukan hanya kasus sukses). Perbaikan bug membawa tes yang gagal sebelum perbaikan dan lolos sesudahnya.
- **Berkas tes wajib didaftarkan.** Skrip `test` di `web/package.json` mencantumkan berkas tes satu per satu — berkas tes baru yang tidak didaftarkan di sana tidak jalan di CI. Daftarkan di perubahan yang sama dengan tesnya.
- **Stub wajib meniru bentuk respons asli.** Stub fetch atau stub data di tes harus membawa field yang sama dengan sumber aslinya: stub dokumen Firestore REST membawa bentuk `{name, fields, ...}`, stub respons API membawa field yang sama dengan route aslinya (mis. `source`, `seedDate`). Stub yang salah bentuk membuat tes hijau padahal produksi gagal.
- **Jangan pernah melonggarkan gerbang supaya hijau.** Bila tes, lint, atau validasi gagal, perbaiki kodenya. Tes yang memang salah boleh diperbaiki, dengan alasan yang ditulis di deskripsi pull request — tetapi menghapus asersi, mengendurkan aturan lint, atau melewati validasi demi hijau tidak diterima.
- **Tes asap: kelima cek wajib lolos.** Smoke test (`web/scripts/smoke-check.mjs`) tidak mengenal cek yang dilewati — jawaban 503 dari rute data adalah gagal, bukan dilewati, karena arsitektur seed-first membuat rute data menjawab 200 dari seed saat Firestore mati. Jangkar versi di cek `/changelog` dibaca dari `web/package.json`, jadi menaikkan versi wajib dibarengi entri changelog untuk versi itu di perubahan yang sama.
- **Tes tidak boleh bergantung pada jam dinding atau timing.** Tes yang melibatkan waktu memakai waktu yang disuntik (parameter, bukan `Date.now()` langsung), dan tes yang melibatkan jeda tidak boleh bergantung pada urutan milidetik yang rapuh.
- **Menjalankan tes asap secara lokal:** dari folder `web/`, jalankan `npm run build`, lalu jalankan server dengan `npx next start -p 3000` dan `node scripts/smoke-check.mjs` dengan env yang sama seperti langkah Smoke di `.github/workflows/app.yml` (nilai dummy). Jangan menjalankan smoke test terhadap situs produksi.

## Kode etik

Diskusi yang kasar, spam lowongan palsu, dan promosi berbayar tidak diterima. Pelanggaran dilaporkan lewat issue; pengelola bisa menghapus komentar, menutup issue atau pull request, dan memblokir akun yang berulang kali melanggar. Jangan menyebarkan data pribadi siapa pun di issue atau pull request.
