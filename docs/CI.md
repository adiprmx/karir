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

Lima workflow di `.github/workflows/`:

- `app.yml` — jalan di tiap push dan pull request ke `main`:
  install (`npm ci`), tes unit (`npm test`), lint (`npm run lint`),
  build Next.js (`npm run build`), lalu tes asap (Smoke).
- `validate.yml` — jalan bila data atau skrip validasi berubah:
  `scripts/validate.py` dan `scripts/check-consistency.py` (CSV vs
  seed, tanpa live). Cek live (`--live`) hanya di `main`, karena
  situs produksi menayangkan commit main terbaru, bukan PR.
- `write-back.yml` — bukan gerbang pull request: workflow terjadwal
  yang menyalin status dan tanggal cek terbaru dari Firestore
  kembali ke CSV dan seed tiap hari 03:00 WIB.
- `backup.yml` — bukan gerbang pull request: workflow terjadwal
  mingguan yang mengekspor semua koleksi Firestore ke JSON dan
  mengunggahnya sebagai artifact (retensi 90 hari).
- `release-tag.yml` — bukan gerbang pull request: membuat tag
  `vX.Y.Z` saat versi di `web/package.json` naik di `main`.

Build, tes, lint, dan Smoke tidak memakai secret apa pun: Build dan
Smoke memakai nilai `NEXT_PUBLIC_FIREBASE_*`, `API_TOKEN_SECRET`,
dan `ANALYTICS_SALT` dummy — cukup untuk membangun dan menjalankan
server, dan tidak membuka apa pun. Kunci asli hanya ada di Vercel
dan `.env.local`. Satu-satunya pengecualian adalah `backup.yml`,
yang memakai secret `FIREBASE_SERVICE_ACCOUNT` dari Settings repo
untuk membaca Firestore.

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
