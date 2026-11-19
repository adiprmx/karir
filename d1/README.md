# D1 Karir — Arsitektur Data Hybrid (P-08)

Status: **persiapan Tahap 3 (19 Nov 2026)** — skema, Worker API,
skrip impor, dan rencana dual-write selesai dan teruji TANPA akun
Cloudflare. Akun Cloudflare KHUSUS Karir (O-02) **belum dibuat**,
jadi tidak ada database D1, tidak ada deploy, dan tidak ada
perubahan perilaku produksi. Semua yang ada di direktori ini
adalah persiapan H0–H2 yang menunggu O-02.

Skala saat ditulis: **743 perusahaan** (CSV kanonis, hunting
19 Nov 2026), 4 status taksonomi. Angka di dokumen ini yang
berasal dari workdir pra-sinkron (715) ditandai demikian.

## 1. Isi direktori

| Berkas | Isi |
|---|---|
| `schema.sql` | Skema D1: `companies`, `meta`, `changes`, `cron_runs`, `analytics_daily` + indeks |
| `worker/src/index.js` | Worker API baca katalog (`karir-data`) |
| `worker/src/delta.js` | Logika murni delta by marker + pemetaan baris D1 |
| `worker/src/client.mjs` | Rantai fallback D1 → Firestore → seed (referensi integrasi H3) |
| `worker/wrangler.toml` | Konfigurasi Worker (tanpa `account_id`; `database_id` placeholder) |
| `worker/worker.test.js` | Tes Worker (mock binding D1 di atas SQLite nyata) |
| `worker/client.test.js` | Tes rantai fallback (mock ketiga lapisan) |
| `scripts/import.mjs` | Impor Firestore/CSV → D1, per kelompok 100 nomor |
| `scripts/import.test.js` | Tes impor round-trip + ambang gagal |
| `scripts/compare.mjs` | Perbandingan divergensi D1 vs Firestore (pemeriksaan harian H2) |
| `scripts/compare.test.js` | Tes divergensi |
| `rencana-dual-write.md` | Rencana dual-write H2 + kriteria go/no-go Fase 3 |
| `go-no-go.md` | Daftar prasyarat §11.1 + rekomendasi koordinator |

## 2. Skema

### `companies` — katalog publik

Satu baris per perusahaan, kunci utama `no` (sama dengan ID
dokumen Firestore `companies/{no}` dan nomor baris CSV). 13 kolom
CSV dipertahankan apa adanya, ditambah 3 kolom operasional:

| Kolom | Tipe | Asal |
|---|---|---|
| `no` | INTEGER PK | CSV `no` / Firestore `no` |
| `perusahaan` | TEXT | CSV / Firestore |
| `kategori` | TEXT | CSV / Firestore |
| `link_karir` | TEXT | CSV / Firestore |
| `status` | TEXT | CSV / Firestore |
| `tanggal_cek` | TEXT (`YYYY-MM-DD`) | CSV / Firestore |
| `catatan` | TEXT | CSV / Firestore |
| `lokasi` | TEXT | CSV / Firestore |
| `posisi` | TEXT | CSV / Firestore |
| `email_hrd` | TEXT | CSV / Firestore |
| `wa_hrd` | TEXT | CSV / Firestore |
| `kontak_lain` | TEXT | CSV / Firestore |
| `batas_lamar` | TEXT | CSV / Firestore |
| `gagal_cek` | INTEGER, default 0 | Firestore saja (P-04; tidak ada di CSV) |
| `rev` | INTEGER, default 0 | Internal D1: rev saat baris terakhir berubah |
| `updated_at` | TEXT (ISO) | Internal D1: stempel tulis terakhir |

Indeks: `status`, `kategori`, `lokasi` (kolom filter), `rev`
(kueri delta), `tanggal_cek` (antrean recheck). D1 menghitung
baris yang DIPINDAI — tanpa indeks, satu filter memindai 743
baris dan kuota 5.000.000 baris/hari terkikis sia-sia.

### `meta` — cermin `meta/lastChange`

Pasangan kunci-nilai: `rev`, `updatedAt`, `counterDay`,
`refillsToday`, `readsEstimate`. Nilai disimpan sebagai teks;
pembaca mengurai angka dari teks (sama seperti `parseMarker` di
`web/lib/companies.js`).

### `changes` — log perubahan status (append-only)

Cermin koleksi Firestore `changes`: `id`, `company_no`,
`perusahaan`, `from_status`, `to_status`, `checked_at`,
`created_at`, ditambah `source` (cron | hunting | admin | impor)
untuk audit konflik. Indeks: `company_no`, `created_at`.

### `cron_runs` — heartbeat + detail run cron

`id` = `{tanggal}:{nama-job}` (kunci idempotensi, mis.
`2026-11-19:recheck`). Kolom hitungan: `checked`, `changed`,
`updated`, `skipped`, `unreachable`, `open_skipped`, ditambah
`shadow_failures` (jumlah tulis bayangan Firestore yang gagal
pada run ini — H2) dan `error` + `last_phase` untuk diagnosis.
Menggantikan dokumen Firestore `cron-runs` pada H4.

### `analytics_daily` — agregat analitik harian

Satu baris per (tanggal, event). Event mentah TIDAK PERNAH
ditulis ke D1 per event — agregasi per jam wajib (riset §11.1),
hasil agregasi harian masuk ke tabel ini.

### Lokasi primary

Hint `apac`, dipilih saat pembuatan database:

```
wrangler d1 create karir-data --location apac
wrangler d1 create karir-data-staging --location apac
```

Opsi kota spesifik belum terverifikasi — catat pilihan yang
tersedia saat pembuatan (riset-database.md §13 butir 8).

## 3. Pemetaan field Firestore → D1

| Firestore `companies/{no}` | D1 `companies` | Catatan |
|---|---|---|
| ID dokumen (= `no`) | `no` (PK) | Identitas yang sama di ketiga sistem |
| `no` (integer) | `no` | — |
| 12 field string CSV | 12 kolom TEXT yang sama namanya | Nama kolom identik supaya verifikasi baca-balik membandingkan apel dengan apel |
| `gagal_cek` (integer, opsional) | `gagal_cek` (default 0) | Hanya ada di dokumen yang pernah gagal cek |
| — | `rev`, `updated_at` | Internal D1, tidak ada di Firestore |
| `meta/lastChange` (dokumen) | tabel `meta` | `rev`, `updatedAt`, `counterDay`, `refillsToday`, `readsEstimate` |
| Koleksi `changes` | tabel `changes` | `from`/`to` menjadi `from_status`/`to_status` (`from` adalah kata kunci SQL); `companyNo` menjadi `company_no` |
| Koleksi `cron-runs` | tabel `cron_runs` | `openSkipped` menjadi `open_skipped`; tambah `shadow_failures` |

Yang TIDAK pindah ke D1 (tetap di Firestore): Auth, tracker
(`user_trackers`), profil, langganan push, laporan, alert
per-pengguna, `incidents`, `audit_logs`, dan event analitik
mentah (retensi 90 hari).

## 4. Worker API baca katalog

Nama Worker: `karir-data`. Binding D1: `DB`. Semua GET publik
(data katalog adalah data publik).

| Endpoint | Respons |
|---|---|
| `GET /v1/meta` | `{rev, updatedAt, source:"d1"}` |
| `GET /v1/delta?rev=N` | `{rev, updatedAt, changed:[...], removed:[], total, source:"d1"}` |
| `GET /v1/companies?status=&kategori=&kota=&limit=&offset=` | `{companies:[...], total, limit, offset, source:"d1"}` |
| `GET /v1/companies/:no` | `{company, source:"d1"}` (404 bila tidak ada) |
| `GET /v1/changes?limit=` | `{changes:[...], source:"d1"}` (terbaru dulu) |
| `GET /v1/stats` | `{total, byStatus, source:"d1"}` |
| `POST /v1/internal/*` | `501` — stub H2 (lihat §6) |

Kontrak delta:

- `rev=N` mengembalikan hanya baris dengan `rev > N`.
  `N` sama dengan rev saat ini → `changed: []` (0 baris data).
- Tanpa parameter (atau `rev=0`) = snapshot awal: seluruh baris.
  Ini satu-satunya pembacaan penuh dan terjadi sekali per masa
  hidup cache klien — bukan refill penuh per kunjungan.
- `removed` selalu `[]` (katalog tidak pernah menghapus baris);
  dipertahankan di kontrak untuk kompatibilitas ke depan.
- `rev` per baris dan `updated_at` TIDAK diekspos (metadata
  internal); `gagal_cek` hanya disertakan bila > 0.
- D1 gagal → `502` + `{source:"unavailable", error:{code:
  "D1_UNAVAILABLE"}}` (pesan internal tidak dibocorkan). Klien
  memakai sinyal ini untuk jatuh ke Firestore lalu seed.
- Paling banyak 3 kueri D1 per request (batas Free: 50/invokasi);
  kueri adalah I/O, tidak memakan jatah CPU 10 ms.

## 5. Fallback berlapis + integrasi ke `web/lib/companies.js`

Rantai fallback hidup di SISI VERCEL (bukan di Worker):
Worker hanya melayani D1 dan melaporkan kegagalannya secara
jujur. Implementasi referensi ada di
`worker/src/client.mjs` (`resolveCatalog`):

1. **D1** — `GET /v1/delta?rev=N` (Worker). Berhasil → gabungkan
   delta ke salinan lokal, `source: "d1"`.
2. **Firestore** — refill lama (`refillFromFirestore()`).
   Berhasil → `source: "live"`.
3. **Seed** — `web/data/companies.json`. Selalu tersedia,
   `source: "seed"`.

Aturan yang dipertahankan dari seed-first: fungsi tidak pernah
melempar karena lapisan data; `source` selalu jujur; delta
kosong berarti salinan lokal masih berlaku.

Integrasi pada H3 (cutover baca, BUKAN di Tahap 3 ini):

1. Tambah flag sumber baca (`d1` | `firestore`, nilai awal
   `firestore`) yang dapat dibalik tanpa deploy ulang kode.
2. Di `web/lib/companies.js`, ganti isi `resolveCompanies()`
   dengan pemanggilan `resolveCatalog()`: `fetchDelta` memanggil
   Worker, `refillFirestore` memanggil `refillFromFirestore()`
   yang sudah ada, `loadSeed` memanggil `loadSeed()` yang sudah
   ada. Cache `liveCache`/`liveRev` yang sudah ada menjadi
   parameter `cached`.
3. `readMarker()` (cek `meta/lastChange` Firestore) digantikan
   oleh `GET /v1/meta` pada jalur D1; jalur Firestore tetap
   memakai marker seperti sekarang.
4. Deploy ke preview dengan flag `d1`; verifikasi daftar,
   detail, pencarian, filter, statistik; matikan Worker dalam
   uji preview dan pastikan fallback ke Firestore lalu seed
   bekerja. Baru setelah itu cutover produksi (rencana-migrasi
   §8.2).

## 6. Skrip impor

```
# Dry-run (tanpa akun): impor ke SQLite in-memory + verifikasi
node d1/scripts/import.mjs --source csv --mode dry-run
node d1/scripts/import.mjs --source seed --mode dry-run
node d1/scripts/import.mjs --source ekspor-firestore.json --mode dry-run

# Mode live (sesudah O-02): hasilkan berkas SQL per kelompok,
# TIDAK mengeksekusi apa pun
node d1/scripts/import.mjs --source ekspor-firestore.json --mode live
node d1/scripts/import.mjs --source ekspor-firestore.json --mode live --only 201-300
```

- Sumber kanonis impor adalah **ekspor Firestore** (baseline
  live); CSV/seed untuk dry-run dan verifikasi silang.
- Kelompok 100 nomor berdasarkan urutan `no` (743 → 8 kelompok:
  7×100 + 43). Resume satu kelompok dengan `--only AWAL-AKHIR`.
- Verifikasi baca-balik membandingkan 13 field per dokumen.
  Ambang gagal: **> 1%** dokumen kelompok gagal → hentikan
  kelompok itu, kelompok berikutnya tidak dijalankan (kode
  keluar 1). 1% persis lolos dengan peringatan.
- Impor awal memakai `rev=1` untuk semua baris + `meta rev=1`
  (supaya `delta?rev=0` mengembalikan snapshot awal).
- Berkas live ditulis ke `d1/out/` (di-gitignore): satu berkas
  per kelompok + `zz-meta-rev.sql` yang diterapkan TERAKHIR,
  hanya sesudah semua kelompok terverifikasi baca-balik.
  Perintah eksekusi dicetak skrip (wrangler per kelompok).
- Upsert idempotent (`ON CONFLICT(no) DO UPDATE`): kelompok
  yang gagal dapat diulang tanpa duplikat.

Perbandingan divergensi harian (H2):

```
node d1/scripts/compare.mjs <snapshot-a.json> <snapshot-b.json>
# keluar 0 = identik, 1 = ada selisih (selisih apa pun diselidiki
# hari yang sama; hitungan 3 hari 0-selisih diulang dari nol)
```

## 7. Tes

```
node --test "d1/**/*.test.js"   # dari akar repo; tanpa akun
```

38 tes (19 Nov 2026): impor round-trip + ambang gagal + grup
+ SQL live (13), Worker delta/filter/stats/error (13), rantai
fallback (7), divergensi (5). Semua memakai SQLite in-memory
atau mock — tidak ada jaringan. Tes TIDAK dilonggarkan demi
hijau: dua bug nyata ditemukan dan diperbaiki lewat tes ini
(`return` tanpa `await` di handler Worker membuat 502 tidak
pernah terkirim; `Number(null) === 0` membuat limit default
menjadi 1).

## 8. Ambang monitor kuota (riset-database §12)

| Metrik | Batas Free | Peringatan 70% | Kritis 90% |
|---|---|---|---|
| D1 rows read/hari | 5.000.000 | 3.500.000 | 4.500.000 |
| D1 rows written/hari | 100.000 | 70.000 | 90.000 |
| D1 ukuran database | 500 MB | 350 MB | 450 MB |
| Workers requests/hari | 100.000 | 70.000 | 90.000 |
| Firestore reads/hari | 50.000 | 35.000 | 45.000 |
| Firestore writes/hari | 20.000 | 14.000 | 18.000 |

Beban target pasca-migrasi: D1 ~150.000 baris baca/hari (3%
batas, skenario 5.000 kunjungan/hari pola delta) dan
±200–300 baris tulis/hari. Monitoring aktif adalah kriteria
selesai P-08 nomor 6 — implementasinya (P-06) menunggu O-02
karena metrik D1 hanya tersedia sesudah database ada.
