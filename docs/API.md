# API

Semua rute mengembalikan JSON, kecuali `/api/locale` yang mengembalikan redirect. Basis URL aplikasi live adalah `https://karir-adiprmx.vercel.app`. Rute baca umumnya tidak butuh autentikasi, dengan dua pengecualian: `/api/index` wajib membawa token dari `/api/token`, dan rute `/api/admin/*` wajib membawa token login admin. Rute cron wajib membawa `CRON_SECRET`.

Kontrak balasan: respons sukses berbentuk per rute (lihat tiap bagian di bawah); respons error berbentuk `{ "error": "..." }` dengan status HTTP yang sesuai. Field `error` tidak pernah muncul di respons 2xx — penjelasan kegagalan operasi di dalam respons sukses memakai field `detail` (lihat `/api/admin/check-link`).

## GET /api/companies

Pencarian server. Skor dan logika pencocokannya sama dengan halaman Cari (`lib/search.js`).

Parameter query:

| Parameter | Arti | Bawaan |
| --- | --- | --- |
| `domisili` | Domisili yang dicari, mis. Bogor | kosong |
| `posisi` | Posisi atau nama perusahaan | kosong |
| `q` | Pencarian bebas; bila diisi, `posisi` memakai nilai ini dan hasil disaring ke baris yang menyebut kata kunci di nama, posisi, lokasi, atau catatan | kosong |
| `kota` | Saring kota persis, mis. Depok (aturan pemetaan kota yang sama dengan peta) | kosong |
| `kategori` | Saring kategori persis, mis. Manufaktur | kosong |
| `status` | Saring satu dari 4 status | kosong |
| `urutan` | `relevansi` atau `nama` | `relevansi` |
| `limit` | Jumlah hasil per halaman, 1 sampai 400 | 20 |
| `offset` | Lewati N hasil pertama | 0 |

Contoh: `GET /api/companies?domisili=Bogor&posisi=Helper%20Gudang`

```json
{
  "source": "live",
  "seedDate": "2026-11-14",
  "total": 610,
  "mode": "semua",
  "groups": null,
  "limit": 20,
  "offset": 0,
  "results": [
    {
      "company": {
        "no": 190,
        "perusahaan": "Roti O",
        "kategori": "Makanan",
        "link_karir": "https://rotio.id/Career",
        "status": "Ada lowongan",
        "tanggal_cek": "2026-11-07",
        "catatan": "Dibuka lewat menu KARIR di rotio.id (bukan URL lama job-vacancy.html yang 404 di riset). Judul target yang tercatat adalah judul SETARA, bukan persis: Pelaksana Gudang (Kalideres, Jakarta Barat, setara Staff Gudang/Helper Gudang), Produksi Buns & Pastry (Kalideres, setara staf produksi), Office Girl (Kalideres, setara Office Boy/Girl). Daftar lengkap juga: Kasir & Baker (Jakarta, Bogor, Depok, Tangerang, Bekasi, Cikarang - bukan judul target), Teknisi Listrik/pendingin, Driver B1/BII Jakarta, Teknisi Listrik/building, Admin Gudang, Staff Finance & Accounting, Staff QC Pabrik, Security, Staff Payroll, Staff Pajak. Cek ulang 7 Nov 2026: Pelaksana Gudang, Kasir & Baker, dan Office Girl masih tercantum di tabel karier, status tetap.",
        "lokasi": "Kalideres (Jakarta Barat); Kasir & Baker: Jakarta, Bogor, Depok, Tangerang, Bekasi, Cikarang",
        "posisi": "Pelaksana Gudang, Produksi Buns & Pastry, Office Girl, Kasir & Baker, Admin Gudang, Teknisi Listrik/pendingin, Driver B1/BII Jakarta, Staff Finance & Accounting, Staff QC Pabrik, Security, Staff Payroll, Staff Pajak"
      },
      "score": 100,
      "reasons": ["Posisi cocok", "Lokasi cocok", "Lowongan terverifikasi", "Portal terbuka"]
    }
  ]
}
```

`total` adalah jumlah hasil sebelum paginasi. `mode` bernilai `perusahaan` bila kata kunci cocok dengan nama perusahaan dan bukan kata peran umum; hasilnya dikelompokkan (kecocokan nama dulu, lalu kecocokan peran) dan `groups` membawa hitungan per kelompok (`{ "companies": n, "roles": m }`, null bila mode `semua`). Kata peran umum (mis. "gudang") tidak pernah memicu mode perusahaan. Skor: posisi cocok +50, domisili cocok +30, lowongan terverifikasi +20, portal mati -20, tidak dapat diverifikasi -10.

`source` bernilai `live` bila hasil dihitung dari Firestore, `seed` bila dihitung dari seed cadangan karena Firestore sedang tidak bisa dibaca (mis. kuota baca harian habis — insiden 15 Nov 2026). `seedDate` adalah tanggal cek terbaru di seed. Saat `source` = `seed`, rute ini tetap menjawab 200 dengan data cadangan, bukan 503 (arsitektur seed-first S3, lihat `ARCHITECTURE.md` dan bagian Marker di bawah). 503 hanya bila seed ikut tidak bisa dimuat:

```json
{ "error": "Data perusahaan tidak bisa dimuat." }
```

## GET /api/companies/[no]

Satu perusahaan berdasarkan nomor baris. Contoh: `GET /api/companies/212`

```json
{
  "source": "live",
  "seedDate": "2026-11-14",
  "company": {
    "no": 212,
    "perusahaan": "PT Novell Pharmaceutical Laboratories",
    "kategori": "Manufaktur",
    "link_karir": "https://novellpharm.com/index.php?mod=professional",
    "status": "Tidak ada lowongan",
    "tanggal_cek": "2026-11-07",
    "catatan": "Judul persis HELPER dengan penempatan Gunung Putri Bogor, di https://novellpharm.com/career (dialihkan ke URL di atas). Halaman yang sama juga mencantumkan WAREHOUSE STAFF sebagai pilihan posisi, plus OPERATOR PACKAGING OT (SUKABUMI), OPERATOR PRODUKSI OT, PACKING PRODUKSI OT, QUALITY CONTROL STAFF, QUALITY ASSURANCE, ANALIS QC, STAFF PPIC, FINANCE & ACCOUNTING STAFF, dan lain-lain; lokasi untuk posisi selain HELPER tidak dirinci di laporan ini selain daftar lokasi lain di halaman (Sukabumi, Jakarta, Bandung, Semarang, Bali, Makassar, Medan, Palembang, Surabaya, Yogyakarta, Cirebon, Pekanbaru, Pontianak, Banjarmasin). Cek ulang 7 Nov 2026: HELPER dan WAREHOUSE STAFF tidak lagi terlihat di portal maupun kanal resmi terbaru (postingan terbaru: Supervisor Produksi 28 Okt 2026, Staff Teknik HVAC 2 Nov 2026). Daftar lowongan portal tidak terbaca penuh dalam teks halaman (kemungkinan dimuat lewat JavaScript), jadi status ini berarti tidak terlihat, bukan vonis pasti lowongan sudah ditutup.",
    "lokasi": "Gunung Putri Bogor",
    "posisi": "HELPER, WAREHOUSE STAFF"
  }
}
```

Perusahaan tidak ada: `{ "error": "Perusahaan tidak ditemukan." }`, status 404. Respons sukses juga membawa `source` (`live` | `seed`) dan `seedDate`: saat Firestore tidak bisa dijangkau, perusahaan diambil dari seed cadangan (`source: "seed"`), bukan 503 — sama seperti rute daftar (arsitektur seed-first S3). Rute ini memakai limiter bersama yang sama dengan rute baca lain (cakupan `company`, 60 permintaan per menit per hash IP).

## GET /api/stats

Angka ringkas data. Contoh: `GET /api/stats`

```json
{
  "source": "live",
  "seedDate": "2026-11-14",
  "total": 610,
  "byStatus": {
    "Ada lowongan": 288,
    "Tidak ada lowongan": 156,
    "Tidak dapat diverifikasi": 111,
    "Portal tidak bisa dibuka": 55
  },
  "byCategory": [
    { "label": "Mining", "count": 71 },
    { "label": "Manufaktur", "count": 67 },
    { "label": "Tech", "count": 30 },
    { "label": "Retail", "count": 27 },
    { "label": "Maritim", "count": 24 },
    { "label": "Fintech", "count": 23 },
    { "label": "Minuman", "count": 22 },
    { "label": "Makanan", "count": 22 }
  ],
  "byDate": { "2026-11-04": 39, "2026-11-05": 176, "2026-11-07": 19, "2026-11-13": 96, "2026-11-14": 280 },
  "targets": 288,
  "stale": 0
}
```

`byCategory` berisi 8 kategori terbanyak. `stale` adalah jumlah baris yang tanggal ceknya sudah lebih dari 30 hari; nilainya 0 saat dokumen ini ditulis karena semua baris dicek pada 4–14 November 2026, kurang dari 30 hari sebelum dokumen ini ditulis. `source` dan `seedDate` sama seperti di `/api/companies`: saat Firestore tidak bisa dijangkau, rute ini menjawab 200 dengan angka dari seed cadangan (`source: "seed"`), bukan 503.

## GET /api/changes

Umpan perubahan status, 10 terbaru, terbaru dulu. Perubahan dalam 48 jam terakhir ditandai chip "Baru" di umpan Yang berubah, daftar perusahaan yang ada lowongannya, dan kartu perusahaan. Contoh: `GET /api/changes`

```json
{ "changes": [], "degraded": false }
```

Rute ini menolak user agent otomatis dengan 403 dan menjawab 429 bila melewati 60 permintaan per menit per hash IP (cakupan `changes`). Bila Firestore tidak bisa dijangkau dan tidak ada cache, rute ini mengembalikan 200 `{ "changes": [], "degraded": true }` — bukan daftar kosong polos — supaya umpan bisa membedakan "belum ada perubahan" dari "umpan sedang tidak bisa dimuat". Respons sehat membawa `degraded: false` secara eksplisit. Satu entri perubahan berbentuk:

| Kolom | Isi |
| --- | --- |
| `companyNo` | Nomor baris perusahaan, angka |
| `perusahaan` | Nama perusahaan |
| `from` | Status sebelum, salah satu dari 4 status |
| `to` | Status sesudah, salah satu dari 4 status |
| `checkedAt` | Tanggal cek, `YYYY-MM-DD` |
| `createdAt` | Waktu tercatat, ISO 8601 |

## GET /api/index

Indeks pencarian untuk halaman Cari, Beranda, Mulai, dan Lamaran. Wajib token valid di header `Authorization: Bearer <token>` (lihat `/api/token` di bawah). Menolak user agent otomatis dengan 403 dan menjawab 429 bila melewati 30 permintaan per menit per hash IP (cakupan `index`). Respons memakai `Cache-Control: private, no-store`. Bila env `API_TOKEN_SECRET` belum dipasang, jawabannya 503.

Respons berbentuk `{ "companies": [...], "source": "live", "seedDate": "2026-11-14", "rev": 12 }`. `source` dan `seedDate` sama seperti di `/api/companies`: saat Firestore tidak bisa dijangkau, rute ini menjawab 200 dengan daftar dari seed cadangan (`source: "seed"`), dan klien menampilkan catatan "data cadangan" di halaman Cari dan Beranda.

Tiap perusahaan hanya membawa 8 field yang dipakai pemakai indeks: `no`, `perusahaan`, `kategori`, `link_karir`, `status`, `catatan`, `lokasi`, `posisi` (`catatan` dipakai pencarian: token posisi dicocokkan ke catatan). Field `tanggal_cek`, `batas_lamar`, `email_hrd`, `wa_hrd`, dan `kontak_lain` tidak dikirim — kelimanya hanya dipakai halaman detail, yang memuat satu perusahaan lewat `/api/companies/[no]`. Pemangkasan ini mengecilkan respons dari ~511 KB menjadi ~436 KB (sekitar 15%, diukur dari seed 610 perusahaan).

`rev` adalah revisi data dari marker `meta/lastChange` (lihat bagian Marker di bawah). Klien menyimpan daftar di localStorage (TTL 24 jam) beserta `rev`-nya; di sesi berikutnya klien memvalidasi ulang dengan `GET /api/index?rev=N` dan menerima 304 tanpa isi bila data belum berubah — tanpa mengunduh ulang daftar. Bila `rev` berubah, server menjawab 200 dengan daftar baru. Gerbang (bot, batas laju, token) tetap berlaku untuk request validasi ulang. Bila marker tidak bisa dibaca, atau bila daftar berasal dari seed, `rev` bernilai null dan klien tidak memakai validasi rev (daftar seed tidak pernah disimpan sebagai cache).

## GET /api/token

Memberi token berumur 60 detik untuk `/api/index`. Responsnya `{ "token": "...", "expiresIn": 60 }`. Token hanya diberikan bila `Referer` atau `Origin` request sama dengan origin situs; selain itu jawabannya 403. Rute ini menolak user agent otomatis dengan 403 dan menjawab 429 bila melewati 60 permintaan per menit per hash IP (cakupan `token`). Bila env `API_TOKEN_SECRET` belum dipasang, jawabannya 503 dan tidak ada token yang dikeluarkan.

## POST /api/analytics

Satu event analitik pengunjung anonim (pageview, search, detail, portal_click, tracker_mark, filter, onboarding, report, channel_copy, share). IP mentah hanya dipakai untuk hash dan batas laju, lalu dibuang; yang disimpan hanya hash IP 64 heksa. Batas 30 permintaan per menit per hash IP (cakupan `analytics`); jawaban 429 berbentuk `{ "error": "Terlalu banyak permintaan. Coba lagi sebentar." }`. Jawaban 202 walau tulis ke Firestore gagal. Endpoint ini tidak menolak user agent otomatis karena ia alat ukur; request dengan user agent kosong atau berpola bot ditandai field `uaFlag` pada dokumen. Bila env `ANALYTICS_SALT` belum dipasang, event tidak disimpan dan jawabannya 200 `{ "skipped": true }`.

## Batas laju

Tiap rute baca punya ember batas lajunya sendiri lewat `scopedKey()` (`web/lib/rate-limit.js`, BE-03), semuanya memakai satu limiter bersama (`getSharedLimiter()`). Batas dihitung per hash IP harian, per menit:

| Cakupan | Rute | Batas per menit |
| --- | --- | --- |
| `analytics` | POST /api/analytics | 30 |
| `changes` | GET /api/changes | 60 |
| `companies` | GET /api/companies | 60 |
| `company` | GET /api/companies/[no] | 60 |
| `index` | GET /api/index | 30 |
| `stats` | GET /api/stats | 60 |
| `token` | GET /api/token | 60 |

Rute admin check-link memakai limiter sendiri (10 per menit, lihat bagiannya).

Urutan store: Redis lewat REST Upstash bila env KV terpasang, lalu Firestore (koleksi `rate_limits`, tulis balik tiap 10 hit per kunci), lalu memori bila keduanya tidak ada. Store hanya menyimpan hash IP harian dan waktu hit, bukan IP mentah. Bila store tidak bisa dijangkau, pintu dibuka (fail-open) supaya situs tetap tampil. IP klien dibaca dari header `x-real-ip` dulu, lalu elemen terakhir `x-forwarded-for`; elemen pertama tidak dipakai karena bisa ditulis pengirim.

## POST /api/admin/check-link

Cek apakah tautan karir sebuah perusahaan masih bisa dibuka. Dipakai panel admin. Body JSON hanya menerima nomor perusahaan; URL diambil dari data yang tersimpan di Firestore, tidak pernah dari request, jadi rute ini tidak bisa dipakai untuk menembak URL sembarangan.

Contoh: `POST /api/admin/check-link` dengan body `{ "no": 212 }`

```json
{
  "no": 212,
  "url": "https://novellpharm.com/index.php?mod=professional",
  "ok": true,
  "status": 200,
  "finalUrl": "https://novellpharm.com/index.php?mod=professional",
  "checkedAt": "2026-11-07T00:00:00.000Z"
}
```

`ok` false bila portal tidak bisa dihubungi atau mengembalikan status 400 ke atas; saat itu balasan menambah `"detail": "Tidak bisa dihubungi."` dan `status` menjadi 0 bila URL tidak bisa dihubungi sama sekali (timeout, DNS, koneksi putus). Field `error` tidak pernah muncul di respons 200; `error` hanya untuk respons error (4xx/5xx). Nilai `ok`, `status`, dan `finalUrl` mengikuti keadaan portal saat dipanggil; angka di contoh di atas mengikuti satu kali panggilan. Timeout 10 detik, maksimal 5 redirect. Rute ini memeriksa login admin: request wajib membawa token ID Firebase akun admin di header `Authorization: Bearer <idToken>`; tanpa token atau token tidak valid jawabannya 401, token valid tanpa klaim admin jawabannya 403. Selain itu batas laju 10 permintaan per menit per IP tetap berlaku.

| Status | Arti |
| --- | --- |
| 400 | Body tidak valid, atau nomor perusahaan tidak diisi |
| 401 | Token admin tidak ada atau tidak valid |
| 403 | Token valid, tapi akun bukan admin |
| 404 | Perusahaan tidak ditemukan, atau perusahaan tidak punya tautan karir |
| 429 | Lebih dari 10 permintaan dalam 60 detik dari IP yang sama |
| 503 | Data perusahaan tidak bisa dimuat dari Firestore |

## GET /api/cron/recheck

Cek ulang harian portal perusahaan yang ada lowongannya. Dijalankan Vercel Cron tiap 18:00 UTC (01:00 WIB). Antrean disusun tiga tier (BE-05): (1) mendesak — perusahaan yang ada lowongan dan batas lamarnya tinggal 0–7 hari, dicek pertama tiap run; (2) terbuka — perusahaan yang ada lowongan lainnya, dari yang paling lama tidak dicek; (3) mati — portal yang sedang berstatus mati, dicek bergilir dengan sisa anggaran. Dalam tiap tier, tanggal cek tertua dulu supaya cek harian berputar ke seluruh daftar. Perusahaan tanpa tautan karir tidak masuk antrean. Portal dicek paralel batch 8. Anggaran waktu 50 detik (fungsi dibatasi 60 detik); bila habis, sisanya dicatat terpotong.

Request wajib membawa header `Authorization: Bearer <CRON_SECRET>`; tanpa header yang cocok jawabannya 401 `{ "error": "Tidak diizinkan." }`. Bila `CRON_SECRET` belum dipasang di env, jawabannya 503 dan cron tidak berjalan sama sekali.

Bila service account belum dipasang, jawabannya 503:

```json
{ "error": "cron belum diaktifkan", "detail": "service account belum dipasang" }
```

Bila service account ada tapi tidak bisa dibaca atau tidak lengkap, `detail` berubah mengikuti masalahnya. Bila token service account gagal dibuat: 503 `{ "error": "Token service account gagal dibuat." }`. Bila data tidak bisa dimuat: 503 `{ "error": "Data perusahaan tidak bisa dimuat." }`.

Cron adalah penulis, jadi ia tidak boleh berjalan dari seed: bila Firestore tidak bisa dibaca dan data yang dimuat berasal dari seed cadangan, run dilewati dengan 503 `{ "error": "Data live tidak bisa dimuat, cron dilewati." }` supaya tidak ada alert palsu atau tulis berdasarkan data basi.

Bila cron berjalan, jawabannya 200 dengan bentuk:

```json
{ "checked": 88, "changed": 3, "updated": 85, "skipped": 0, "openSkipped": 0, "truncated": false, "alerts": 0, "alertsFailed": 0, "telegram": "none", "telegramMarked": 0, "alertPhaseTruncated": false, "snapshotKnown": true, "snapshotWritten": true, "queue": { "urgent": 1, "open": 237, "dead": 55, "total": 293 }, "markerBumped": true, "heartbeatWritten": true }
```

`checked` adalah portal yang sempat dicek, `changed` adalah status yang berbalik dan tercatat di koleksi `changes`, `updated` adalah yang hanya diperbarui tanggal ceknya, `skipped` adalah yang tidak sempat dicek atau tidak punya tautan, `openSkipped` adalah perusahaan tier mendesak/terbuka yang tidak sempat dicek karena terpotong, `truncated` menandakan waktu 50 detik habis sebelum antrean selesai, `alerts` adalah jumlah alert baru yang dibuat di run ini, `alertsFailed` adalah alert yang gagal ditulis, `telegram` bernilai `sent`, `failed`, `skipped-no-token`, atau `none` (tidak ada alert baru), `telegramMarked` adalah alert yang berhasil ditandai terkirim sesudah kirim langsung, `alertPhaseTruncated` menandakan fase alert kehabisan anggarannya sendiri (15 detik), `snapshotKnown`/`snapshotWritten` menandakan snapshot target run sebelumnya dibaca/ditulis, `queue` adalah ukuran antrean per tier (`urgent` + `open` + `dead` = `total`), `markerBumped` menandakan marker kesegaran `meta/lastChange` dinaikkan di run ini (true bila ada status perusahaan yang berubah), dan `heartbeatWritten` menandakan ringkasan run tercatat di `cron-runs/{tanggal-WIB}`. Angka di contoh hanya menunjukkan bentuk balasan; nilai sebenarnya mengikuti hasil cek hari itu.

### Notifikasi

Fase alert jalan DULU, sebelum loop cek portal (anggaran 15 detik, tulis paralel batch 5), supaya alert tidak pernah terlewat bila loop cek menghabiskan anggaran. Fase ini membandingkan daftar target sekarang dengan snapshot run sebelumnya di dokumen `meta/targets`: nomor yang baru muncul jadi alert `new-target`, dan perusahaan target yang batas lamarnya tinggal 0-3 hari jadi alert `deadline`. Alert tercatat di koleksi `alerts` dengan id deterministik (`new-target-{no}-{tanggal}` atau `deadline-{no}-{batas_lamar}`), supaya satu kejadian tidak tercatat dua kali. Bila ada alert baru, cron mengirim satu pesan Telegram gabungan ke pemilik. Kegagalan kirim tidak menggagalkan cron. Alert yang berhasil dikirim ditandai `sent: true` + `sentAt`. Bila token Telegram belum dipasang di env (`TELEGRAM_BOT_TOKEN`), pengiriman dilewati dan alert tetap tercatat untuk dibaca watcher agent-side. Di akhir run, ringkasan ditulis sebagai heartbeat ke dokumen `cron-runs/{tanggal-WIB}` supaya watcher bisa mendeteksi run yang terlewat.

## GET /api/cron/cleanup

Hapus dokumen lama dari empat koleksi Firestore sesuai kebijakan retensi di bawah. Dijalankan Vercel Cron tiap Senin 02:00 WIB (`0 19 * * 0` UTC).

| Koleksi | Disimpan | Alasan | Maks per run |
| --- | --- | --- | --- |
| `analytics_events` | 90 hari | Dasbor admin hanya memakai 30 hari terakhir; 90 hari memberi ruang melihat tren (retensi analitik S8) | 200 |
| `rate_limits` | 7 hari | Semua jendela batas laju adalah 60 detik; dokumen yang tidak disentuh 7 hari hanya berisi hit kedaluwarsa yang sudah diabaikan | 200 |
| `alerts` | 90 hari | Alert deadline menyangkut batas lamar 0-3 hari dan alert baru basi dalam hitungan hari; alert 90 hari sudah tidak layak dikirim, dan watcher membaca seluruh koleksi tiap run | 100 |
| `changes` | 180 hari | Umpan hanya menampilkan 10 terbaru (maks 50); 180 hari menyimpan riwayat setengah tahun sebagai jejak audit | 100 |

Anggaran hapus per run: maksimal 600 hapus (200 + 200 + 100 + 100), seminggu sekali — jauh di bawah batas hapus Firestore 20.000/hari. Tiap koleksi dihapus dalam satu panggilan batchWrite (maks 500 tulis/panggilan). Dokumen tanpa field penanda umur (`ts` untuk analitik, `updatedAt` untuk rate_limits, `createdAt` untuk alerts/changes) tidak pernah cocok dengan query dan dibiarkan.

Request wajib membawa header `Authorization: Bearer <CRON_SECRET>`; tanpa header yang cocok jawabannya 401 `{ "error": "Tidak diizinkan." }`. Bila `CRON_SECRET` atau service account belum dipasang di env, jawabannya 503 dan rute tidak berjalan. Penghapusan hanya bisa lewat token service account, karena aturan Firestore menutup hapus dari klien.

Bila berjalan, jawabannya 200 dengan bentuk:

```json
{ "deleted": 12, "cutoff": "2026-08-17T00:00:00.000Z", "hasMore": false, "retention": { "rate_limits": { "deleted": 3, "cutoff": "2026-11-08T19:00:00.000Z", "hasMore": false }, "alerts": { "deleted": 0, "cutoff": "2026-08-17T19:00:00.000Z", "hasMore": false }, "changes": { "deleted": 0, "cutoff": "2026-05-19T19:00:00.000Z", "hasMore": false } } }
```

`deleted`, `cutoff`, dan `hasMore` di tingkat atas adalah hasil analitik: `deleted` adalah event yang dihapus di run ini, `cutoff` adalah batas umur (90 hari sebelum run), `hasMore` menandakan masih ada event lama yang tersisa (batas 200 per run tercapai). `retention` membawa hasil yang sama per koleksi (batas umur mengikuti retensi tiap koleksi). Bila penghapusan analitik gagal, jawabannya 500 `{ "error": "Pembersihan event gagal." }`; bila penghapusan salah satu koleksi retensi gagal, jawabannya 500 `{ "error": "Pembersihan retensi gagal." }` — run berikutnya mencoba lagi dari awal (penghapusan bersifat idempotent).

## Marker kesegaran `meta/lastChange`

Satu dokumen kecil yang menjadi sinyal kesegaran data live (arsitektur seed-first S3). Server web membacanya 1 baca per jendela 5 menit; refill daftar penuh dari Firestore hanya terjadi bila `rev` berubah sejak refill terakhir.

| Field | Isi |
| --- | --- |
| `rev` | Angka revisi, naik 1 tiap ada perubahan data |
| `updatedAt` | Waktu revisi terakhir naik, ISO 8601 |
| `counterDay` | Hari (WIB, `YYYY-MM-DD`) yang dihitung pencacah |
| `refillsToday` | Jumlah refill daftar penuh hari ini |
| `readsEstimate` | Estimasi baca dokumen hari ini (refill × jumlah dokumen) |

Yang menaikkan `rev` (tulis tidak kena kuota baca):

| Penulis | Kapan |
| --- | --- |
| Cron cek ulang (`/api/cron/recheck`, service account) | Bila ada status perusahaan yang berubah di run itu; bila tidak ada, marker tidak disentuh |
| Impor kanonis (`import_canonical.py`, service account) | Setelah impor menulis dokumen apa pun |
| Panel admin (akun admin login) | Setelah simpan, hapus, atau impor CSV yang mengubah data |

Yang menaikkan pencacah: tiap refill daftar penuh yang sukses oleh server web (PATCH `refillsToday` +1, `readsEstimate` += jumlah dokumen; ganti hari memulai lagi dari 1). Aturan Firestore membatasi tulis pencacah dari API key publik: `rev` dan `updatedAt` tidak boleh berubah lewat jalur itu. Panel admin menampilkan estimasi pemakaian dari marker (1 baca).

Alert kuota: begitu `readsEstimate` mencapai 70% kuota harian (35.000 dari 50.000 baca), satu alert tipe `quota` dibuat di koleksi `alerts` dengan id deterministik `quota-70-{tanggal}` (satu per hari), supaya watcher agent-side bisa meneruskannya. Field tambahannya: `readsEstimate` dan `percent`.

## Koleksi Firestore yang dipakai API

| Koleksi | Isi | Aturan tulis |
| --- | --- | --- |
| `companies` | 610 dokumen perusahaan; kolom terstruktur `batas_lamar` ("YYYY-MM-DD", opsional) menyimpan tanggal batas lamar (17 nilai di-backfill dari catatan saat migrasi 14 November 2026) | Admin login, 9 kolom wajib, `batas_lamar` harus string bila ada |
| `changes` | Umpan perubahan status | Admin login; entri tidak bisa diubah atau dihapus |
| `audit_logs` | Jejak perubahan data oleh admin | Admin login; entri tidak bisa diubah atau dihapus |
| `reports` | Laporan tautan mati dari pengunjung | Siapa pun boleh membuat satu laporan berbentuk benar; tidak bisa dibaca publik |
| `alerts` | Alert notifikasi (`new-target`, `deadline`, atau `quota`) dengan field `type`, `companyNo`, `perusahaan`, `sent`, `createdAt`; alert `quota` menambah `readsEstimate` dan `percent` | Admin login; entri tidak bisa diubah atau dihapus; alert `quota` boleh dibuat server lewat API key publik dengan bentuk terkekang |
| `meta` | Snapshot internal cron (`meta/targets`: daftar nomor perusahaan yang ada lowongannya run sebelumnya) dan marker kesegaran (`meta/lastChange`, baca terbuka, lihat bagian Marker di atas) | `meta/targets`: tidak ada akses klien, hanya service account; `meta/lastChange`: rev hanya admin/service account, pencacah hanya naik 1 per tulis |
| `rate_limits` | Satu dokumen per hash pengunjung harian: larik waktu hit (maks 60 angka) dan `updatedAt` | Bentuk dibatasi ketat oleh aturan; tidak bisa dihapus |
| `user_trackers` | Subkoleksi `user_trackers/{uid}/items`: satu dokumen per perusahaan yang ditandai pengunjung yang masuk | Hanya pemilik akun; bentuk divalidasi |
| `user_profiles` | Profil akun: email dan nama tampilan | Hanya pemilik akun; tidak bisa dihapus |
| `analytics_events` | Event analitik pengunjung anonim (pageview, pencarian, klik portal, dan sejenisnya) | Server saja yang menulis, lewat token service account; penulisan dari klien ditutup total; ubah dan hapus hanya admin |

## GET /api/locale

Atur bahasa antarmuka lalu kembali ke halaman asal. Contoh: `GET /api/locale?lang=en&next=/cari`

Balasannya redirect 302 ke `next` dan cookie `karir-locale` dengan nilai `en` atau `id`, masa berlaku satu tahun, `sameSite: lax`. Nilai `lang` selain `en` dianggap `id`. Nilai `next` divalidasi `safeNext()`: harus path relatif di situs ini — nilai yang mengandung backslash, diawali `//`, atau mengarah ke origin lain diganti `/`.
