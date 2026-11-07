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
  "total": 406,
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
        "tanggal_cek": "2026-11-05",
        "catatan": "Dibuka lewat menu KARIR di rotio.id (bukan URL lama job-vacancy.html yang 404 di riset). Judul target yang tercatat adalah judul SETARA, bukan persis: Pelaksana Gudang (Kalideres, Jakarta Barat, setara Staff Gudang/Helper Gudang), Produksi Buns & Pastry (Kalideres, setara staf produksi), Office Girl (Kalideres, setara Office Boy/Girl). Daftar lengkap juga: Kasir & Baker (Jakarta, Bogor, Depok, Tangerang, Bekasi, Cikarang - bukan judul target), Teknisi Listrik/pendingin, Driver B1/BII Jakarta, Teknisi Listrik/building, Admin Gudang, Staff Finance & Accounting, Staff QC Pabrik, Security, Staff Payroll, Staff Pajak.",
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
    "status": "Ada lowongan target",
    "tanggal_cek": "2026-11-05",
    "catatan": "Judul persis HELPER, penempatan Gunung Putri Bogor",
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
  "total": 406,
  "byStatus": {
    "Ada lowongan target": 22,
    "Ada lowongan target (tidak cocok)": 5,
    "Tidak ada lowongan target": 152,
    "Tidak ada lowongan terlihat": 77,
    "Tidak dapat diverifikasi": 84,
    "Portal tidak bisa dibuka": 66
  },
  "byCategory": [
    { "label": "Manufaktur", "count": 67 },
    { "label": "Tech", "count": 30 },
    { "label": "Mining", "count": 30 },
    { "label": "Fintech", "count": 23 },
    { "label": "BUMN", "count": 21 },
    { "label": "FMCG", "count": 18 },
    { "label": "BANK", "count": 18 },
    { "label": "Retail", "count": 16 }
  ],
  "byDate": { "2026-11-04": 81, "2026-11-05": 325 },
  "targets": 22,
  "stale": 0
}
```

`byCategory` berisi 8 kategori terbanyak. `stale` adalah jumlah baris yang tanggal ceknya sudah lebih dari 30 hari; nilainya 0 saat dokumen ini ditulis karena semua baris dicek 4 dan 5 November 2026. Firestore tidak bisa dijangkau: `{ "error": "Data perusahaan tidak bisa dimuat." }`, status 503.

## GET /api/changes

Umpan perubahan status, 10 terbaru, terbaru dulu. Contoh: `GET /api/changes`

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

Cek ulang harian 22 portal target. Dijalankan Vercel Cron tiap 18:00 UTC (01:00 WIB). Antrean dimulai dari perusahaan berstatus target, lalu portal yang sedang berstatus mati supaya ada jalan pulih. Anggaran waktu 50 detik; bila habis, sisanya dicatat terpotong.

Bila `CRON_SECRET` terisi di env Vercel, request wajib membawa header `Authorization: Bearer <CRON_SECRET>`, kalau tidak jawabannya 401 `{ "error": "Tidak diizinkan." }`.

Bila service account belum dipasang, jawabannya 503. Itu keadaan saat dokumen ini ditulis:

```json
{ "error": "cron belum diaktifkan", "detail": "service account belum dipasang" }
```

Bila service account ada tapi tidak bisa dibaca atau tidak lengkap, `detail` berubah mengikuti masalahnya. Bila token service account gagal dibuat: 503 `{ "error": "Token service account gagal dibuat." }`. Bila data tidak bisa dimuat: 503 `{ "error": "Data perusahaan tidak bisa dimuat." }`.

Bila cron berjalan, jawabannya 200 dengan bentuk:

```json
{ "checked": 88, "changed": 3, "updated": 85, "skipped": 0, "truncated": false }
```

`checked` adalah portal yang sempat dicek, `changed` adalah status yang berbalik dan tercatat di koleksi `changes`, `updated` adalah yang hanya diperbarui tanggal ceknya, `skipped` adalah yang tidak sempat dicek atau tidak punya tautan, `truncated` menandakan waktu 50 detik habis sebelum antrean selesai. Angka di contoh hanya menunjukkan bentuk balasan; nilai sebenarnya mengikuti hasil cek hari itu.

## GET /api/locale

Atur bahasa antarmuka lalu kembali ke halaman asal. Contoh: `GET /api/locale?lang=en&next=/cari`

Balasannya redirect 302 ke `next` dan cookie `karir-locale` dengan nilai `en` atau `id`, masa berlaku satu tahun, `sameSite: lax`. Nilai `lang` selain `en` dianggap `id`. Nilai `next` yang tidak diawali `/`, atau diawali `//`, diganti `/`.
