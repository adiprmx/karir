# API

Semua rute mengembalikan JSON, kecuali `/api/locale` yang mengembalikan redirect. Basis URL aplikasi live adalah `https://karir-adiprmx.vercel.app`. Tidak ada kunci API dan tidak ada autentikasi untuk rute baca.

## GET /api/companies

Pencarian server. Skor dan logika pencocokannya sama dengan halaman Cari (`lib/search.js`).

Parameter query:

| Parameter | Arti | Bawaan |
| --- | --- | --- |
| `domisili` | Domisili yang dicari, mis. Bogor | kosong |
| `posisi` | Posisi atau nama perusahaan | kosong |
| `q` | Pencarian bebas; bila diisi, `posisi` memakai nilai ini dan hasil disaring ke baris yang menyebut kata kunci di nama, posisi, lokasi, atau catatan | kosong |
| `kategori` | Saring kategori persis, mis. Manufaktur | kosong |
| `status` | Saring satu dari 6 status | kosong |
| `urutan` | `relevansi` atau `nama` | `relevansi` |
| `limit` | Jumlah hasil per halaman, 1 sampai 400 | 20 |
| `offset` | Lewati N hasil pertama | 0 |

Contoh: `GET /api/companies?domisili=Bogor&posisi=Helper%20Gudang`

```json
{
  "total": 610,
  "mode": "semua",
  "limit": 20,
  "offset": 0,
  "results": [
    {
      "company": {
        "no": 190,
        "perusahaan": "Roti O",
        "kategori": "Makanan",
        "link_karir": "https://rotio.id/Career",
        "status": "Ada lowongan target",
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

`total` adalah jumlah hasil sebelum paginasi. `mode` bernilai `perusahaan` bila kata kunci posisi cocok dengan nama perusahaan, sehingga hanya perusahaan itu yang tampil; selain itu `semua`. Skor: posisi cocok +50, domisili cocok +30, lowongan terverifikasi +20, tidak cocok +10, portal mati -20, tidak dapat diverifikasi -10.

Gagal memuat data dari Firestore:

```json
{ "error": "Data perusahaan tidak bisa dimuat." }
```

Status HTTP 503.

## GET /api/companies/[no]

Satu perusahaan berdasarkan nomor baris. Contoh: `GET /api/companies/212`

```json
{
  "company": {
    "no": 212,
    "perusahaan": "PT Novell Pharmaceutical Laboratories",
    "kategori": "Manufaktur",
    "link_karir": "https://novellpharm.com/index.php?mod=professional",
    "status": "Tidak ada lowongan terlihat",
    "tanggal_cek": "2026-11-07",
    "catatan": "Judul persis HELPER dengan penempatan Gunung Putri Bogor, di https://novellpharm.com/career (dialihkan ke URL di atas). Halaman yang sama juga mencantumkan WAREHOUSE STAFF sebagai pilihan posisi, plus OPERATOR PACKAGING OT (SUKABUMI), OPERATOR PRODUKSI OT, PACKING PRODUKSI OT, QUALITY CONTROL STAFF, QUALITY ASSURANCE, ANALIS QC, STAFF PPIC, FINANCE & ACCOUNTING STAFF, dan lain-lain; lokasi untuk posisi selain HELPER tidak dirinci di laporan ini selain daftar lokasi lain di halaman (Sukabumi, Jakarta, Bandung, Semarang, Bali, Makassar, Medan, Palembang, Surabaya, Yogyakarta, Cirebon, Pekanbaru, Pontianak, Banjarmasin). Cek ulang 7 Nov 2026: HELPER dan WAREHOUSE STAFF tidak lagi terlihat di portal maupun kanal resmi terbaru (postingan terbaru: Supervisor Produksi 28 Okt 2026, Staff Teknik HVAC 2 Nov 2026). Daftar lowongan portal tidak terbaca penuh dalam teks halaman (kemungkinan dimuat lewat JavaScript), jadi status ini berarti tidak terlihat, bukan vonis pasti lowongan sudah ditutup.",
    "lokasi": "Gunung Putri Bogor",
    "posisi": "HELPER, WAREHOUSE STAFF"
  }
}
```

Perusahaan tidak ada: `{ "error": "Perusahaan tidak ditemukan." }`, status 404. Firestore tidak bisa dijangkau: `{ "error": "Data perusahaan tidak bisa dimuat." }`, status 503.

## GET /api/stats

Angka ringkas data. Contoh: `GET /api/stats`

```json
{
  "total": 610,
  "byStatus": {
    "Ada lowongan target": 9,
    "Ada lowongan target (tidak cocok)": 7,
    "Tidak ada lowongan target": 153,
    "Tidak ada lowongan terlihat": 80,
    "Tidak dapat diverifikasi": 89,
    "Portal tidak bisa dibuka": 68
  },
  "byCategory": [
    { "label": "Manufaktur", "count": 67 },
    { "label": "Mining", "count": 30 },
    { "label": "Tech", "count": 30 },
    { "label": "Fintech", "count": 23 },
    { "label": "BUMN", "count": 21 },
    { "label": "BANK", "count": 18 },
    { "label": "FMCG", "count": 18 },
    { "label": "Retail", "count": 16 }
  ],
  "byDate": { "2026-11-04": 81, "2026-11-05": 303, "2026-11-07": 22 },
  "targets": 9,
  "stale": 0
}
```

`byCategory` berisi 8 kategori terbanyak. `stale` adalah jumlah baris yang tanggal ceknya sudah lebih dari 30 hari; nilainya 0 saat dokumen ini ditulis karena semua baris dicek 4, 5, dan 7 November 2026. Firestore tidak bisa dijangkau: `{ "error": "Data perusahaan tidak bisa dimuat." }`, status 503.

## GET /api/changes

Umpan perubahan status, 10 terbaru, terbaru dulu. Aturan Firestore untuk koleksi `changes` diterbitkan 7 November 2026, jadi perubahan dari cron harian dan cek massal admin tercatat di sini. Perubahan dalam 48 jam terakhir ditandai chip "Baru" di umpan Yang berubah, daftar target, dan kartu perusahaan. Contoh: `GET /api/changes`

```json
{ "changes": [] }
```

Umpan masih kosong saat dokumen ini ditulis, karena aturan Firestore untuk koleksi `changes` belum diterbitkan, jadi belum ada perubahan yang tercatat. Satu entri perubahan berbentuk:

| Kolom | Isi |
| --- | --- |
| `companyNo` | Nomor baris perusahaan, angka |
| `perusahaan` | Nama perusahaan |
| `from` | Status sebelum, salah satu dari 6 nilai |
| `to` | Status sesudah, salah satu dari 6 nilai |
| `checkedAt` | Tanggal cek, `YYYY-MM-DD` |
| `createdAt` | Waktu tercatat, ISO 8601 |

Bila Firestore tidak bisa dijangkau, rute ini mengembalikan `{ "changes": [] }` dengan status 200, bukan error, supaya halaman tetap tampil.

## GET /api/index

Indeks pencarian untuk halaman Cari. Wajib token valid di header `Authorization: Bearer <token>` (lihat `/api/token` di bawah). Menolak user agent otomatis dengan 403 dan menjawab 429 bila melewati 30 permintaan per menit per hash IP. Respons memakai `Cache-Control: private, no-store`.

## GET /api/token

Memberi token berumur 60 detik untuk `/api/index`. Token hanya diberikan bila `Referer` atau `Origin` request sama dengan origin situs; selain itu jawabannya 403. Tanpa batas laju.

## POST /api/analytics

Satu event analitik pengunjung anonim (pageview, search, detail, portal_click, tracker_mark, filter). IP mentah hanya dipakai untuk hash dan batas laju, lalu dibuang; yang disimpan hanya hash IP 64 heksa. Batas 30 permintaan per menit per hash IP; jawaban 202 walau tulis ke Firestore gagal. Endpoint ini tidak menolak user agent otomatis karena ia alat ukur; request dengan user agent kosong atau berpola bot ditandai field `uaFlag` pada dokumen.

## Batas laju

Satu limiter dipakai `/api/index`, `/api/companies`, `/api/stats`, dan `/api/analytics` (`web/lib/rate-limit.js`). Urutan store: Redis lewat REST Upstash bila env KV terpasang, lalu Firestore (koleksi `rate_limits`, tulis balik tiap 10 hit per kunci), lalu memori bila keduanya tidak ada. Store hanya menyimpan hash IP harian dan waktu hit, bukan IP mentah. Bila store tidak bisa dijangkau, pintu dibuka (fail-open) supaya situs tetap tampil. IP klien dibaca dari header `x-real-ip` dulu, lalu elemen terakhir `x-forwarded-for`; elemen pertama tidak dipakai karena bisa ditulis pengirim.

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

`ok` false bila portal tidak bisa dihubungi atau mengembalikan status 400 ke atas; saat itu balasan menambah `"error": "Tidak bisa dihubungi."` dan `status` menjadi 0 bila URL tidak bisa dihubungi sama sekali (timeout, DNS, koneksi putus). Nilai `ok`, `status`, dan `finalUrl` mengikuti keadaan portal saat dipanggil; angka di contoh di atas mengikuti satu kali panggilan. Timeout 10 detik, maksimal 5 redirect. Rute ini tidak memeriksa login; yang membatasi hanya batas laju di bawah.

| Status | Arti |
| --- | --- |
| 400 | Body tidak valid, atau nomor perusahaan tidak diisi |
| 404 | Perusahaan tidak ditemukan, atau perusahaan tidak punya tautan karir |
| 429 | Lebih dari 10 permintaan dalam 60 detik dari IP yang sama |
| 503 | Data perusahaan tidak bisa dimuat dari Firestore |

## GET /api/cron/recheck

Cek ulang harian portal target. Dijalankan Vercel Cron tiap 18:00 UTC (01:00 WIB). Antrean dimulai dari perusahaan berstatus target, lalu portal yang sedang berstatus mati supaya ada jalan pulih. Anggaran waktu 50 detik; bila habis, sisanya dicatat terpotong.

Bila `CRON_SECRET` terisi di env Vercel, request wajib membawa header `Authorization: Bearer <CRON_SECRET>`, kalau tidak jawabannya 401 `{ "error": "Tidak diizinkan." }`.

Bila service account belum dipasang, jawabannya 503. Itu keadaan saat dokumen ini ditulis:

```json
{ "error": "cron belum diaktifkan", "detail": "service account belum dipasang" }
```

Bila service account ada tapi tidak bisa dibaca atau tidak lengkap, `detail` berubah mengikuti masalahnya. Bila token service account gagal dibuat: 503 `{ "error": "Token service account gagal dibuat." }`. Bila data tidak bisa dimuat: 503 `{ "error": "Data perusahaan tidak bisa dimuat." }`.

Bila cron berjalan, jawabannya 200 dengan bentuk:

```json
{ "checked": 88, "changed": 3, "updated": 85, "skipped": 0, "truncated": false, "alerts": 0, "telegram": "none" }
```

`checked` adalah portal yang sempat dicek, `changed` adalah status yang berbalik dan tercatat di koleksi `changes`, `updated` adalah yang hanya diperbarui tanggal ceknya, `skipped` adalah yang tidak sempat dicek atau tidak punya tautan, `truncated` menandakan waktu 50 detik habis sebelum antrean selesai, `alerts` adalah jumlah alert baru yang dibuat di run ini, dan `telegram` bernilai `sent`, `failed`, `skipped-no-token`, `skipped-timeout`, atau `none` (tidak ada alert baru). Angka di contoh hanya menunjukkan bentuk balasan; nilai sebenarnya mengikuti hasil cek hari itu.

### Notifikasi

Setelah cek selesai, cron membandingkan daftar target sekarang dengan snapshot run sebelumnya di dokumen `meta/targets`: nomor yang baru muncul jadi alert `new-target`, dan perusahaan target yang batas lamarnya tinggal 0-3 hari jadi alert `deadline`. Alert tercatat di koleksi `alerts` dengan id deterministik (`new-target-{no}-{tanggal}` atau `deadline-{no}-{batas_lamar}`), supaya satu kejadian tidak tercatat dua kali. Bila ada alert baru, cron mengirim satu pesan Telegram gabungan ke pemilik. Kegagalan kirim tidak menggagalkan cron. Bila token Telegram belum dipasang di env (`TELEGRAM_BOT_TOKEN`), pengiriman dilewati dan alert tetap tercatat untuk dibaca watcher agent-side.

## Koleksi Firestore yang dipakai API

| Koleksi | Isi | Aturan tulis |
| --- | --- | --- |
| `companies` | 610 dokumen perusahaan; kolom `batas_lamar` ("YYYY-MM-DD", opsional) menyimpan tanggal batas lamar yang diparse dari catatan yang sudah ada | Admin login, 9 kolom wajib, `batas_lamar` harus string bila ada |
| `changes` | Umpan perubahan status | Admin login; entri tidak bisa diubah atau dihapus |
| `alerts` | Alert notifikasi (`new-target` atau `deadline`) dengan field `type`, `companyNo`, `perusahaan`, `sent`, `createdAt` | Admin login; entri tidak bisa diubah atau dihapus |
| `meta` | Snapshot internal cron (`meta/targets`: daftar nomor target run sebelumnya) | Tidak ada akses klien; hanya service account |
| `rate_limits` | Satu dokumen per hash pengunjung harian: larik waktu hit (maks 60 angka) dan `updatedAt` | Bentuk dibatasi ketat oleh aturan; tidak bisa dihapus |
| `audit_logs` | Jejak perubahan data oleh admin | Admin login; entri tidak bisa diubah atau dihapus |
| `reports` | Laporan tautan mati dari pengunjung | Siapa pun boleh membuat satu laporan berbentuk benar; tidak bisa dibaca publik |

## GET /api/locale

Atur bahasa antarmuka lalu kembali ke halaman asal. Contoh: `GET /api/locale?lang=en&next=/cari`

Balasannya redirect 302 ke `next` dan cookie `karir-locale` dengan nilai `en` atau `id`, masa berlaku satu tahun, `sameSite: lax`. Nilai `lang` selain `en` dianggap `id`. Nilai `next` yang tidak diawali `/`, atau diawali `//`, diganti `/`.
