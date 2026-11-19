# Rencana Dual-Write — P-08 Tahap H2 (19 Nov 2026)

Dokumen ini adalah rencana pelaksanaan dual-write cron
(H2, rencana-migrasi.md §7.2 butir 7–9). Status: **rencana
tertulis, belum dieksekusi** — eksekusi menunggu O-02 (akun
Cloudflare khusus Karir) + impor H1 yang terverifikasi.
Selama H2, situs tetap membaca dari Firestore; D1 belum
melayani trafik baca pengunjung apa pun.

## 1. Prinsip

- **D1 adalah penulis utama, Firestore adalah bayangan.**
  Setiap perubahan katalog ditulis ke D1 dulu, lalu ke
  Firestore. Urutan ini tidak boleh dibalik: D1 adalah sistem
  pencatatan masa depan, dan kegagalan di D1 harus
  menghentikan penulisan (bukan menyembunyikannya di
  bayangan).
- **Kegagalan bayangan tidak menggagalkan run.** Bila tulis
  Firestore gagal setelah D1 berhasil, run tetap sukses,
  kegagalan dicatat di heartbeat (`shadow_failures` + rincian
  per nomor), dan perbaikan dilakukan lewat impor ulang
  kelompok yang terdampak — bukan dengan mengulang run.
- **Marker naik hanya bila kedua sisi konsisten.** Rev
  dinaikkan setelah tulis D1 + tulis bayangan Firestore
  keduanya terverifikasi (atau setelah selisih dijelaskan dan
  diperbaiki). Marker yang naik di atas data yang berbeda
  membuat klien refill dari data setengah sinkron.
- **Selisih apa pun diselidiki hari yang sama.** Tidak ada
  selisih "kecil" yang dibiarkan: satu field berbeda dari 743
  sudah cukup menghentikan hitungan 3 hari (lihat §5).

## 2. Urutan tulis per perubahan

Berlaku untuk cron recheck (GitHub Actions), impor kanonis,
dan tulis admin — ketiganya menulis lewat jalur yang sama
(Worker internal endpoint, §3).

```
1. Tulis ke D1 (utama):
   - Upsert baris companies (status + tanggal_cek + field lain
     yang berubah), rev = rev-baru, updated_at = now.
   - Tambah entri changes (append-only) bila status berubah.
   - BILA GAGAL -> hentikan penulisan nomor ini, catat error
     di heartbeat (last_phase + error), lanjut ke nomor
     berikutnya. JANGAN menulis bayangan untuk nomor yang
     gagal di D1.
2. Tulis bayangan ke Firestore (kedua):
   - PATCH dokumen companies/{no} yang sama (field yang sama).
   - Tambah dokumen changes yang sama (ID deterministik sama).
   - BILA GAGAL -> catat di heartbeat: shadow_failures +1 dan
     nomor yang gagal ke daftar shadow_failed_nos (field
     heartbeat, atau koleksi incidents bila > 5 nomor).
     Run TETAP sukses.
3. Sesudah semua nomor selesai:
   - Bandingkan isi D1 vs Firestore untuk nomor yang ditulis
     run ini (baca-balik 13 field, d1/scripts/compare.mjs).
   - Bila konsisten -> naikkan rev di D1 meta DAN di
     meta/lastChange Firestore (rev+1, updatedAt=now).
   - Bila tidak konsisten -> JANGAN naikkan rev; selisih
     masuk antrean perbaikan hari yang sama (§4).
```

Aturan tambahan:

- Tulis D1 memakai transaksi per kelompok kecil (maks 100
  baris per transaksi, sejalan dengan kelompok impor) supaya
  kegagalan di tengah tidak meninggalkan setengah kelompok.
- Tulis bayangan Firestore memakai pola yang sudah ada
  (REST + service account, `lib/firestore-server.js`) — tidak
  ada SDK baru.
- Idempotensi: upsert D1 (`ON CONFLICT DO UPDATE`) dan PATCH
  Firestore bersifat idempotent; run yang diulang (mis. retry
  GitHub Actions) tidak menggandakan data. Kunci idempotensi
  run: `cron_runs.id = {tanggal}:{nama-job}`.
- Selama H2, cron recheck TIDAK mengubah logika cek portal
  (pembedaan "tidak dapat terhubung" vs "respons HTTP" dari
  P-04 tetap berlaku); yang berubah hanya tujuan tulisnya.

## 3. Endpoint tulis internal Worker (H2)

Endpoint `POST /v1/internal/*` di Worker saat ini adalah stub
501. Spesifikasi pengaktifannya (sesudah O-02):

- **Autentikasi:** secret bersama (header
  `Authorization: Bearer <KARIR_INTERNAL_SECRET>`) yang
  disimpan di GitHub Secrets + Vercel env + Cloudflare
  Workers secret. TIDAK PERNAH dari browser. Secret berbeda
  untuk staging dan produksi.
- **Endpoint:**
  - `POST /v1/internal/companies` — upsert satu kelompok
    (maks 100 baris), body `{companies: [...], rev}`.
  - `POST /v1/internal/changes` — tambah entri changes.
  - `POST /v1/internal/meta/bump` — naikkan rev (hanya
    dipanggil setelah §2 langkah 3 lolos).
  - `POST /v1/internal/cron-runs` — tulis heartbeat run.
- **Validasi:** tolak body tanpa `rev` yang cocok dengan
  `meta.rev + 1` (mencegah dua penulis menaikkan rev
  bersamaan); tolak `no` di luar rentang; tolak status di
  luar 4 nilai taksonomi.
- **Rate limit:** endpoint internal tidak di-rate-limit
  per-IP (pemanggilnya hanya 2: GitHub Actions + Vercel),
  tetapi setiap panggilan tanpa secret yang benar dicatat
  sebagai incident.
- **Gerbang:** endpoint ini TIDAK BOLEH aktif sebelum Red
  Team meloloskan permukaan baru (P-08: nol temuan
  kritis/tinggi/sedang) — lihat paket-fase-2.md P-08.

## 4. Perbandingan isi harian

Setiap hari selama H2 (dan selama 3 hari observasi H3),
workflow terjadwal membandingkan isi D1 vs Firestore:

1. **Hitungan cepat:** total dokumen + hitungan per status
   di kedua sisi (`countByStatus`, `d1/scripts/compare.mjs`).
   Selisih hitungan -> langsung ke langkah 3.
2. **Sampel baca-balik:** 1 kelompok (100 nomor, digilir
   tiap hari sehingga seluruh katalog tercakup dalam 8 hari)
   dibandingkan 13 field per dokumen.
3. **Perbandingan penuh bila ada sinyal:** bila langkah 1
   atau 2 menemukan selisih, bandingkan SELURUH katalog
   (743 dokumen) pada hari yang sama.
4. **Laporan:** hasil ditulis ke log run + ringkasan harian
   (0 selisih / daftar selisih). Laporan "0 selisih" 3 hari
   berturut-turut adalah syarat go ke Fase 4 (§5).

Perbaikan selisih (sumber kebenaran per jenis field):

- Field statis (identitas, tautan, kategori, lokasi):
  CSV kanonis menang; perbaiki di CSV, impor ulang nomor
  yang terdampak ke KEDUA sisi.
- Field live (status, tanggal_cek): sisi yang stempelnya
  lebih baru menang (aturan "yang lebih baru menang");
  bila stempel sama tetapi isi berbeda -> cek ulang portal
  manual, jangan menebak.
- Selisih yang berasal dari tulis bayangan gagal: impor
  ulang nomor yang terdampak dari D1 ke Firestore
  (`--only` nomor tersebut), lalu verifikasi ulang.

## 5. Kriteria go / no-go Fase 3 (H0–H2)

**Go ke Fase 4 (cutover baca, H3) bila SEMUA terpenuhi:**

1. Impor 100% terverifikasi baca-balik (semua kelompok
   lolos, 0 kelompok dihentikan di atas ambang 1%).
2. **3 hari dual-write berturut-turut dengan 0 selisih**
   (hitungan + sampel harian + satu perbandingan penuh
   dalam 3 hari itu).
3. Worker API lolos uji staging termasuk uji fallback
   (Worker dimatikan dalam uji -> situs membaca Firestore
   lalu seed).
4. Kuota D1 terpantau (rows read/written jauh di bawah
   batas; alert 70%/90% aktif).

**No-go bila satu saja terjadi:**

- Satu kelompok impor gagal verifikasi di atas 1%.
- Selisih dual-write muncul dan belum dijelaskan.
- Worker API gagal uji fallback di staging.
- Kuota D1 melonjak tidak wajar selama H2.

Bila no-go: perbaiki akar masalahnya, lalu **ulangi hitungan
3 hari dari nol** — tidak ada "melanjutkan" hitungan yang
terputus.

## 6. Rollback per tahap

| Tahap | Rollback | Dampak produksi |
|---|---|---|
| H0 (persiapan) | Hapus database D1, mulai ulang | Nol — produksi tidak tersentuh |
| H1 (impor + API baca) | Hapus database D1, mulai ulang impor; Worker tidak dipakai situs | Nol — situs belum membaca D1 |
| H2 (dual-write) | Hentikan tulis D1 (cron kembali menulis Firestore saja); D1 dibiarkan sebagai salinan basi atau dihapus dan diimpor ulang nanti | Nol — situs tetap membaca Firestore; tidak ada data pengguna yang terlibat (hanya katalog publik yang sumber kebenarannya tetap CSV + Firestore) |
| H3 (cutover baca) | Balik flag baca ke `firestore` (< 5 menit); bila kode baca-D1 bermasalah, instant rollback Vercel (< 5 menit) | Situs kembali membaca Firestore yang tetap segar karena dual-write |
| H4 (cutover tulis) | Kembalikan tulis bayangan Firestore; koleksi arsip masih ada | Katalog kembali ditulis ke kedua sisi |
| H5 (jembatan alert) | Kembalikan pencocokan alert ke delta Firestore | Alert kembali dari jalur lama |

Kriteria rollback umum (risiko §11.3, satu saja cukup):
verifikasi baca-balik gagal > 1% kelompok; error rate route
API naik tajam 10 menit; kuota baca melonjak tidak wajar;
laporan data hilang/salah dalam 1 jam pertama; cron gagal
2 run berturut-turut.

## 7. Jadwal yang tidak dapat dipersingkat

- H0: 1–2 hari kerja (sesudah O-02).
- H1: 2–3 hari kerja (impor per kelompok + verifikasi).
- H2: minimal 3 hari observasi dual-write (0 selisih).
- Total Fase 3: 4–7 hari kerja (rencana-migrasi §7.5).
  Observasi 3 hari adalah durasi minimum, bukan target
  yang bisa dipangkas dengan "lebih teliti".
