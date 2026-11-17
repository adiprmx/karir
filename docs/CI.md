# CI & versi Node

## Versi Node dipin: 24.x

Versi Node dinyatakan di tiga tempat, dan ketiganya harus sama:

- `web/package.json` — field `engines: {"node": "24.x"}`
- `.nvmrc` di root repo — `24`
- `.github/workflows/app.yml` — `setup-node` dengan `node-version: "24.x"`

Workflow `backup.yml` juga memakai `setup-node` 24.x; bila versi
Node berubah, ubah juga pin di sana.

Alasan: Node 20 mencapai end-of-life 30 Apr 2026 dan Vercel
menonaktifkannya untuk build/function baru sejak 1 Okt 2026, sementara
Vercel menjadikan Node 26 sebagai default sejak 29 Okt 2026. Tanpa pin,
CI menguji di Node 20 sedangkan produksi berjalan di default Vercel —
runtime yang diuji bukan runtime yang dipakai pengguna. Node 24.x
dipilih karena LTS dan terbukti jalan di repo ini (seluruh gerbang
Fase 1–3 lolos di Node v24.22.1). Vercel memakai field `engines`,
jadi produksi ikut memakai 24.x.

Mengubah versi Node berarti mengubah ketiga tempat di atas, lalu
menjalankan seluruh gerbang (di bawah) sampai lolos sebelum merge.

## Gerbang CI

Enam workflow di `.github/workflows/`:

- `app.yml` — jalan di tiap push ke `main` dan `fase2/**` serta
  pull request ke `main`: install (`npm ci`), tes unit
  (`npm test`), cakupan (`npm run test:coverage`, dengan ambang —
  lihat di bawah), lint (`npm run lint`), kunci VAPID sekali pakai
  untuk build ini saja, build Next.js (`npm run build`), anggaran
  bundle (`npm run check:bundle`), tes asap (Smoke), lalu tes E2E
  (Playwright, `npm run test:e2e`). Branch `fase2/**` ikut
  menjalankan CI penuh supaya paket Fase 2 terbukti hijau sebelum
  push ke main, bukan sesudahnya.
- `e2e-preview.yml` — manual (`workflow_dispatch`): menjalankan
  suite E2E yang sama melawan URL deployment pratinjau Vercel
  (input `base_url`), tanpa server lokal. Dipakai tiap paket Fase 2
  untuk membuktikan pratinjaunya lolos E2E sebelum merge.
- `validate.yml` — jalan bila data atau skrip validasi berubah:
  `scripts/validate.py` dan `scripts/check-consistency.py` (CSV vs
  seed, tanpa live). Cek live (`--live`) hanya di `main`, karena
  situs produksi menayangkan commit main terbaru, bukan PR.
  Di `main` juga berjalan cek jumlah seed vs live
  (`scripts/check-seed-live.py`, mode laporan — lihat di bawah).
- `write-back.yml` — bukan gerbang pull request: workflow terjadwal
  yang menyalin status dan tanggal cek terbaru dari Firestore
  kembali ke CSV dan seed tiap hari 03:00 WIB.
- `backup.yml` — bukan gerbang pull request: workflow terjadwal
  mingguan yang mengekspor semua koleksi Firestore ke JSON dan
  mengunggahnya sebagai artifact (retensi 90 hari).
- `release-tag.yml` — bukan gerbang pull request: membuat tag
  `vX.Y.Z` saat versi di `web/package.json` naik di `main`.

Build, tes, lint, Smoke, dan E2E tidak memakai secret apa pun:
Build, Smoke, dan E2E memakai nilai `NEXT_PUBLIC_FIREBASE_*`,
`API_TOKEN_SECRET`, dan `ANALYTICS_SALT` dummy — cukup untuk
membangun dan menjalankan server, dan tidak membuka apa pun.
Kunci VAPID untuk build CI dibuat baru tiap run dan hanya kunci
PUBLIK yang dipakai (`web/scripts/ci-vapid-public-key.mjs`);
kunci privatnya tidak pernah dicetak atau disimpan. Kunci asli
hanya ada di Vercel dan `.env.local`. Satu-satunya pengecualian
adalah `backup.yml`, yang memakai secret
`FIREBASE_SERVICE_ACCOUNT` dari Settings repo untuk membaca
Firestore.

## Tes unit: penemuan otomatis (DX-12)

Perintah `npm test` memakai glob node:test
(`"lib/**/*.test.js" "app/**/*.test.js" "scripts/**/*.test.js"`),
bukan daftar berkas satu per satu. Berkas tes baru otomatis ikut
berjalan tanpa mengubah `package.json` — dibuktikan P-01 dengan
menambahkan satu berkas tes dummy (1187 → 1188 tes) lalu
menghapusnya (kembali 1187). Jangan pernah kembali ke daftar
manual: daftar manual membusuk (berkas baru terlupa) tanpa ada
yang menyadari.

## Hitungan tes: berbasis data, bukan angka tetap (DX-14)

Jumlah tes node:test BERUBAH mengikuti data: sebagian tes
dibangkitkan dari isi seed (mis. `lib/companies-seed.test.js`
membaca `web/data/companies.json` dan menegaskan perilaku per
perusahaan target). Karena itu selisih hitungan antara CHANGELOG
dan hitungan statis di satu waktu BUKAN kesalahan — CHANGELOG
mencatat hitungan pada saat versinya ditulis, dan hitungan kini
adalah keluaran run CI terakhir. Angka otoritatif selalu keluaran
`npm test` di CI, bukan angka di dokumen mana pun. Jangan
"memperbaiki" CHANGELOG lama supaya cocok dengan hitungan kini.

## Cakupan tes (DX-11)

`npm run test:coverage` menjalankan suite yang sama dengan
pelaporan cakupan bawaan Node (`--experimental-test-coverage`)
dan ambang yang menggagalkan CI bila tidak tercapai:

| Metrik | Ambang awal (P-01) | Terukur 17 Nov 2026 |
|---|---|---|
| Baris (lines) | 90% | 91,13% |
| Fungsi (functions) | 89% | 90,45% |
| Cabang (branches) | 87% | 88,36% |

Ambang awal dipasang 1–1,5 poin DI BAWAH cakupan terukur, supaya
menahan penurunan tanpa membuat CI merah karena variasi kecil.
Paket berikutnya MENAIKKAN ambang seiring bertambahnya tes — tidak
pernah menurunkannya untuk membuat CI hijau. Cakupan dihitung
untuk `lib/`, `app/`, dan `scripts/` non-tes; berkas tes, stub
tes, dan loader tes dikecualikan (lihat `test:coverage` di
`web/package.json`). Laporan teks tercetak di log CI; JSON mentah
V8 diunggah sebagai artifact `coverage-v8` (retensi 30 hari).

Catatan mesin lokal: Node menulis sebagian JSON cakupan ke direktori
sementara sistem (`TMPDIR`). Bila `/tmp` mesin hampir penuh, jalankan
dengan `TMPDIR` yang mengarah ke direktori beruang kosong, misal
`TMPDIR=~/workspace/.tmp-node npm run test:coverage`. Di runner CI
masalah ini tidak ada (`/tmp` runner berkapasitas besar).

## Anggaran bundle (DX-11)

`npm run check:bundle` (skrip `web/scripts/check-bundle-budget.mjs`)
dijalankan sesudah build di CI dan gagal bila ada chunk atau halaman
yang melewati anggaran. Anggaran awal (diukur dari build 17 Nov
2026, sebelum P-01):

- Satu chunk: maks 580 KiB (chunk Firebase terukur 579,3 KiB —
  sesuai PERF-01 yang mencatat 580 KB).
- Total JS satu halaman: maks 1300 KiB (terukur maks 1290,2 KiB
  di `/admin`; beranda 1264,5 KiB).

Anggaran ini menahan bundle di ukuran saat ini sampai P-10
menurunkannya secara struktural. Jangan menaikkan batas untuk
membuat CI hijau — bila build melewati batas, kecilkan bundle
atau minta keputusan tercatat di laporan paket yang mengubahnya.

## Tes E2E (DX-07/QA-03)

Suite Playwright di `web/e2e/` (konfigurasi
`web/playwright.config.mjs`):

- `alur-utama.spec.js` — satu perjalanan penuh: beranda → cari
  perusahaan → buka detail → daftar → tambah pelacak → aktifkan
  push → ekspor data. Perusahaan target dibaca dari kartu pertama
  daftar target di beranda (tidak dikode keras).
- `halaman-utama.spec.js` — tiap halaman publik utama menjawab
  200 dan menampilkan judulnya, plus konsistensi total
  `/api/stats` dengan beranda.

Mock (semua hidup di proses tes, tidak menyentuh kode produksi
dan tidak menulis ke layanan mana pun):

- Firebase Auth (`e2e/helpers/firebase-auth-mock.js`): panggilan
  REST Identity Toolkit dicegat dan dijawab pengguna palsu
  (`penguji-e2e@karir-e2e.test`, domain `.test`). Tidak ada akun
  yang dibuat di proyek Firebase mana pun.
- Firestore klien: dijawab 503 cepat supaya jalur gagal-cepat
  aplikasi bekerja dan tes tidak menggantung menunggu jaringan.
- Analitik (`e2e/helpers/analytics-mock.js`, temuan Red Team R1):
  `POST /api/analytics` dicegat dan dijawab 200 — tanpa ini,
  pageview/search/detail dari tes melawan pratinjau akan menulis
  event ke koleksi analitik Firestore produksi.
- Push (`e2e/helpers/push-mock.js`): `PushManager.subscribe` di-stub
  dan `POST /api/push/subscribe` dicegat (200); pendaftaran
  service worker asli, izin notifikasi, dan token akun tetap nyata.

Menjalankan lokal (butuh build dulu):

```
cd web
npm run build   # dengan env dummy seperti langkah Build di app.yml
npm run test:e2e
```

Melawan pratinjau Vercel: `E2E_BASE_URL=https://<pratinjau> npm run
test:e2e`, atau lewat workflow `e2e-preview.yml` (lebih andal dari
mesin yang egress-nya terbatas — runner CI punya internet penuh).

Catatan race yang ditemukan P-01 (untuk P-14, bukan diperbaiki di
sini): `/cari` menjalankan `history.replaceState` (sinkronisasi URL,
debounce 600 mdtk sesudah mount — `app/cari/search-app.js`) dan
Next.js mencegat `replaceState` itu sebagai sinyal navigasi,
sehingga navigasi Link yang sedang berjalan dibatalkan (RSC
dibatalkan, URL tetap `/cari`). Pengguna sungguhan yang mengeklik
hasil dalam 600 mdtk pertama sesudah halaman muncul juga kena —
klik keduanya berhasil. Tes mengatasinya dengan menunggu 1,5 detik
sesudah hasil terlihat lalu mencoba klik sampai 3 kali
(`e2e/alur-utama.spec.js`). Perbaikan aplikasi yang benar (mis.
jangan `replaceState` bila URL sudah sama, atau tunda sampai ada
perubahan filter dari pengguna) adalah pekerjaan P-14.

## Aturan ESLint proyek (DX-10)

Selain `core-web-vitals`, dua aturan proyek aktif di
`web/eslint.config.mjs` dan menggagalkan CI bila dilanggar:

- `no-console` (hanya `warn`/`error` yang boleh) di `app/` dan
  `lib/`: `console.log` tanpa level dilarang. Berkas `scripts/`
  dikecualikan — perkakas CLI memang mencetak ke stdout.
- `karir/no-hardcoded-company-count` (aturan lokal di
  `web/eslint-rules/`): literal bilangan bulat 639/685 dilarang di
  kode sumber non-tes — jumlah perusahaan wajib dibaca dari seed,
  API, atau props. Berkas tes dikecualikan. Bilangan desimal
  (mis. koordinat) tidak kena aturan ini.

## Cek jumlah seed vs live (BE2-03)

`scripts/check-seed-live.py` membandingkan panjang seed
(`web/data/companies.json`) dengan total `/api/stats` situs live
(satu panggilan, murah kuota). Di CI `main` (langkah terakhir
`validate.yml`) ia berjalan dalam MODE LAPORAN: mencetak selisih
tanpa menggagalkan CI. Ambang penegakan (`--max-drift N`, keluar 1
bila `|live - seed| > N`) ditetapkan di P-02 sesudah drift
ditutup — sampai saat itu selisih yang sudah diketahui tidak boleh
membuat CI merah. Keluar 2 bila situs tidak bisa dijangkau atau
seed tidak bisa dibaca (kerusakan yang wajib terlihat).

## Batas verifikasi: workdir tanpa riwayat git (DX-13)

Workdir pengembangan (`~/workspace/karir-impl/`) adalah salinan
file tanpa riwayat git (`git log` kosong, branch `master` tanpa
commit). Ini dicatat sebagai BATAS VERIFIKASI, bukan sesuatu yang
diperbaiki dengan merekayasa riwayat: riwayat kanonis hanya ada di
GitHub (`adiprmx/karir`). Konsekuensinya: perbandingan "apa yang
berubah" selalu dilakukan terhadap remote (via API GitHub /
`compare_workdir.py`), bukan terhadap `git log`/`git status`
lokal — keduanya menyesatkan di workdir ini. Push memakai
`gh_push.py` (API GitHub, tanpa git lokal) dan diverifikasi dari
state remote (HEAD maju, isi berkas via API), bukan dari pesan
push semata.

## Tes asap (Smoke)

Langkah Smoke menjalankan server production dari hasil build, lalu:

1. `web/scripts/smoke-check.mjs` — 5 cek: beranda, `/api/stats`,
   `/api/companies`, `/api/index` (dengan token), dan `/changelog`.
   Kelima cek wajib lolos, termasuk di CI: arsitektur seed-first
   membuat rute data jatuh ke seed dan menjawab 200 saat Firestore
   tak terjangkau (kunci dummy), jadi cek data benar-benar menguji
   jalur data. Jawaban 503 adalah gagal, bukan dilewati — 503 hanya
   terjadi bila seed ikut tidak bisa dimuat. Jangkar versi di cek
   `/changelog` dibaca dari `web/package.json`, bukan dikode keras.
2. Cek halaman dari seed — smoke-check.mjs memeriksa API dan status
   halaman, tetapi tidak memeriksa isi halaman yang di-render.
   Beranda dan halaman detail di-render dari seed saat Firestore
   mati, jadi isinya dicek langsung: beranda harus memuat total
   perusahaan dan satu perusahaan target dari seed, dan halaman
   detail perusahaan itu harus memuat namanya. Total, nomor, dan
   nama dibaca dari seed saat run, bukan dikode keras.

## Menjalankan gerbang secara lokal

Dari root repo:

```
python3 scripts/validate.py
python3 scripts/check-consistency.py
cd web && npm test && npm run lint && npm run build
```

Jangan menjalankan `check-consistency.py --live` dari mesin lokal
tanpa keperluan — setiap run membaca seluruh daftar perusahaan dari
Firestore dan menghabiskan kuota baca harian. Cek live adalah tugas
CI di `main`.
