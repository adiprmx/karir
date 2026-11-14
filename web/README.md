# Aplikasi web Karir

Aplikasi web Karir: Next.js 16 + React 19, hosting di Vercel, database
Firestore (proyek `karir-9d53a`). Situs live:
https://karir-adiprmx.vercel.app/

Dokumen ini panduan developer untuk folder `web/`. Arsitektur data
end-to-end ada di `../docs/ARCHITECTURE.md`, tiap endpoint di
`../docs/API.md`, dan gerbang CI di `../docs/CI.md`.

## Persiapan

Node 24.x (dipin — lihat `../docs/CI.md`; field `engines` di
`package.json`, `.nvmrc` di root repo, dan workflow CI harus sama).

```bash
cd web
npm ci
cp .env.example .env.local
```

Isi `.env.local` dengan nilai dari Firebase Console, proyek
`karir-9d53a`. Enam variabel `NEXT_PUBLIC_FIREBASE_*` adalah
konfigurasi klien publik — nilainya bisa dilihat siapa pun yang
membuka aplikasi, jadi jangan mengandalkannya sebagai rahasia.
Keamanan data datang dari aturan Firestore (`firestore.rules`) dan
Firebase Auth, bukan dari nilai-nilai ini.

Variabel server (hanya di Vercel, jangan ditulis di `.env.local`
atau di repo):

- `FIREBASE_SERVICE_ACCOUNT` — kunci service account untuk cron.
- `CRON_SECRET` — rahasia pemanggil cron.
- `API_TOKEN_SECRET` — secret penanda token `/api/index`.
- `ANALYTICS_SALT` — garam hash IP untuk analitik anonim.

Jangan pernah menulis nilai asli ke `.env.example`; file itu hanya
berisi placeholder.

## Perintah

Dari folder `web/`:

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server pengembangan |
| `npm test` | Tes unit (Node test runner) |
| `npm run lint` | ESLint |
| `npm run build` | Build produksi Next.js |
| `npm start` | Server produksi dari hasil build |

Sebelum mengirim pull request untuk perubahan kode, jalankan
`npm test`, `npm run lint`, dan `npm run build` sampai lolos.
CI menjalankan ketiganya ditambah tes asap di tiap push dan pull
request ke `main` (lihat `.github/workflows/app.yml`).

## Struktur folder

```
web/
  app/            Halaman dan rute API (App Router).
                  app/api/* = endpoint; app/admin/ = panel admin;
                  app/perusahaan/[no]/ = halaman detail.
  lib/            Logika bersama: baca data (companies.js),
                  pencarian (search.js), cek tautan (check.js),
                  analitik (analytics-server.js), gerbang API
                  (api-guard.js), batas laju (rate-limit.js).
  data/
    companies.json  Seed cadangan: salinan CSV (610 entri, 13 field).
                    Jangan diedit dengan tangan — regenerasi dari CSV
                    (lihat docs/PEMULIHAN.md, Skenario 2).
  scripts/
    import-firestore.mjs  Impor seed ke Firestore (create per dokumen).
    smoke-check.mjs       Tes asap pasca-build untuk CI.
  public/         Aset statis.
  firestore.rules Aturan baca/tulis Firestore (diterbitkan dari
                  Firebase Console; file ini sumber kebenarannya).
  next.config.mjs Konfigurasi Next.js.
  vercel.json     Jadwal Vercel Cron (recheck 01:00 WIB) dan
                  pengaturan deploy.
```

## Alur data (ringkas)

Aplikasi membaca Firestore lewat REST API di `lib/companies.js`
dengan pola seed-first: seed (`data/companies.json`) adalah default,
marker kecil `meta/lastChange` dicek 1 baca per 5 menit, dan refill
daftar penuh dari Firestore hanya bila rev marker berubah. Bila baca
marker atau refill gagal (kuota habis, offline), aplikasi menyajikan
seed atau cache lama dengan catatan "data cadangan" — API tetap
menjawab 200, bukan 503. Respons membawa `source: "live" | "seed"` +
`seedDate` supaya klien tahu data mana yang ditampilkan.

Tulis hanya lewat dua jalur: panel admin `/admin` (Firebase Auth,
menulis langsung ke Firestore) dan cron harian `/api/cron/recheck`
(service account). CSV di `../data/` adalah sumber kebenaran abadi;
perubahan live disalin kembali ke CSV oleh write-back harian.
Rincinya di `../docs/ARCHITECTURE.md`.

## Analitik

Event pengunjung anonim (pageview, pencarian, klik portal, tandaan
pelacak, dan sejenisnya) dikirim lewat `/api/analytics` dan disimpan
di koleksi `analytics_events`. Tanpa nama, tanpa email, tanpa IP
mentah (IP hanya masuk ke hash SHA-256 dengan garam server).
Penulisan dari klien ditutup aturan Firestore; hanya server yang
menulis lewat token service account. Retensi 90 hari, dibersihkan
cron tiap Senin 02:00 WIB. Ringkasan 30 hari terakhir tampil di
panel admin.

## Aturan yang perlu diingat

- Ikuti `../docs/DESIGN.md`: monokrom hitam, abu, putih; warna hanya
  untuk fungsi dan status; tanpa gradasi, tanpa font baru.
- Jangan menambah dependensi tanpa alasan yang ditulis di deskripsi
  pull request.
- Semua `fetch()` ke backend wajib pakai timeout; `res.json()` yang
  membaca body jaringan juga dibungkus timeout (lihat `jsonWithTimeout`
  di `lib/companies.js`).
- Angka di semua halaman dihitung dari data, bukan ditulis tangan.
- Bahasa antarmuka ada dua (Indonesia dan Inggris) lewat cookie
  `karir-locale`; kunci i18n baru ditulis di `lib/i18n.js`.
