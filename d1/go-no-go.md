# Go / No-Go P-08 — Persiapan Tahap 3 (19 Nov 2026)

Penilaian kesiapan eksekusi H0 (persiapan D1) berdasarkan
prasyarat `risiko-kepatuhan.md` §11.1 dan syarat
`riset-database.md` §11.1. Dokumen ini ditulis pada Tahap 3,
SEBELUM akun Cloudflare Karir (O-02) ada.

## Rekomendasi koordinator: BELUM SIAP EKSEKUSI H0

Satu-satunya penahan adalah **O-02 (akun Cloudflare khusus
Karir belum dibuat)** — H0 secara definisi dimulai dengan
pembuatan database D1 di akun itu. Semua persiapan yang dapat
dikerjakan tanpa akun sudah selesai dan teruji (lihat §3).
Begitu O-02 terpenuhi, H0 dapat dimulai hari yang sama
(buat database + terapkan `d1/schema.sql` + jalankan impor
staging).

## 1. Prasyarat §11.1 risiko-kepatuhan

| # | Prasyarat | Status | Bukti / catatan |
|---|---|---|---|
| 1 | Cadangan Firestore terbaru + manifest cocok | **SEBAGIAN** | Backup terakhir 18 Nov 20:48 WIB (run 44317373761, sukses; artifact 196.636 byte; manifest 12 koleksi, 967 dokumen — companies 715). Hunting 19 Nov (+28 perusahaan, 715 → 743) BELUM tercakup. Drill restore penuh masih berjalan (Tim C Tahap 3, eksekusi sesudah reset kuota 15:00 WIB); drill 6 dokumen lolos 18 Nov. SEBELUM impor H1: jalankan backup baru via `workflow_dispatch` dan catat ID run (rencana-migrasi §7.1). |
| 2 | CSV terbaru valid + di-commit | **TERPENUHI** | CSV remote main 743 baris (HEAD 64d7560). Sesudah sinkron workdir Tahap 3: `scripts/validate.py` OK (743 baris; Ada 355, Tidak ada 174, Tidak dapat diverifikasi 146, Portal 68) dan `check-consistency.py` OK (CSV vs seed + README, 0 selisih). |
| 3 | Migrasi penuh di proyek Firebase staging + verifikasi baca-balik | **BELUM** | Menunggu O-02 (database D1 staging) + proyek Firebase staging. Dry-run impor (SQLite in-memory, 715 baris, 8 kelompok, 0 gagal) sudah lolos — BUKAN pengganti uji staging. |
| 4 | Rencana rollback dibaca pelaksana; penanggung jawab rollback ditunjuk | **BELUM** | Rencana rollback tertulis di `d1/rencana-dual-write.md` §6 (per tahap) + risiko §11.4. Pembacaan oleh pelaksana dan penunjukan penanggung jawab menunggu koordinator. |
| 5 | Jendela migrasi di jam sepi, di luar 01:00 WIB | **BELUM** | Belum dijadwalkan. Cron recheck tidak boleh berjalan bersamaan dengan impor. |
| 6 | Kanal komunikasi darurat siap | **SEBAGIAN** | Telegram (watcher + notifikasi cron) dan changelog sudah ada. Pengumuman khusus migrasi belum disiapkan. |

Aturan §11.1: bila satu prasyarat tidak terpenuhi — **no-go**.
Saat ini 3 belum + 2 sebagian + 1 terpenuhi (CSV valid).

## 2. Syarat §11.1 riset-database

| Syarat | Status | Catatan |
|---|---|---|
| Akun Cloudflare KHUSUS Karir | **BELUM (O-02)** | Blocker utama. Kuota D1/Workers per akun; dilarang berbagi dengan proyek lain. |
| Refill penuh dihapus; hanya delta by marker | **DESAIN + KODE SIAP, BELUM DIIMPLEMENTASI** | Worker delta + `client.mjs` + tes sudah ada. Implementasi ke `web/lib/companies.js` adalah pekerjaan H3 (butuh flag baca + integrasi) — sengaja tidak dilakukan di Tahap 3 agar produksi tidak berubah. |
| Analitik dibatch/agregasi per jam sebelum tulis D1 | **DESAIN SIAP** | Tabel `analytics_daily` (agregat harian) + aturan "event mentah tidak pernah ditulis per event" tertulis di skema dan README. Implementasi agregasi adalah H4. |
| Fallback seed dipertahankan permanen | **SUDAH** | Seed-first live di produksi (`web/lib/companies.js`); seed dipertahankan di semua tahap, termasuk pasca-cutover. |
| Monitoring kuota harian kedua sistem, alert 70%/90% | **SEBAGIAN** | Firestore: alert 70% di `companies.js` + P-06 (rules + panel). D1: ambang tertulis di `d1/README.md` §8; monitor aktif menunggu database ada (P-06). |

## 3. Yang sudah selesai tanpa akun (Tahap 3)

- Skema D1 (`d1/schema.sql`): 5 tabel + 9 indeks; lokasi
  primary hint `apac` terdokumentasi.
- Worker API baca katalog (`d1/worker/`): 6 endpoint GET +
  stub 501 internal; `wrangler.toml` tanpa `account_id`,
  `database_id` placeholder.
- Skrip impor (`d1/scripts/import.mjs`): dry-run 715 baris
  (workdir pra-sinkron) 8 kelompok, 0 gagal; mode live
  menghasilkan SQL per kelompok tanpa mengeksekusi.
- Perbandingan divergensi (`d1/scripts/compare.mjs`).
- Rencana dual-write (`d1/rencana-dual-write.md`):
  urutan D1-dulu, heartbeat gagal bayangan, perbandingan
  harian, kriteria go/no-go 3 hari 0 selisih, rollback
  per tahap.
- 38 tes `node --test` lolos (impor, Worker, fallback,
  divergensi). Dua bug nyata ditemukan lewat tes dan
  diperbaiki (bukan tes yang dilonggarkan).

## 4. Status kriteria selesai P-08 (paket-fase-2.md)

| # | Kriteria | Status |
|---|---|---|
| 1 | Semua prasyarat §11.1 terpenuhi tertulis | BELUM (lihat §1) |
| 2 | H0–H5 berurutan, tiap tahap dapat di-rollback via flag | RENCANA TERTULIS (H0–H2 siap dieksekusi; H3–H5 dirancang) |
| 3 | Migrasi per kelompok 100 + baca-balik; rollback > 1% | SKRIP + TES SIAP; eksekusi menunggu O-02 |
| 4 | Refill penuh dihapus; hanya delta | DESAIN + KODE SIAP; implementasi H3 |
| 5 | Fallback berlapis terbukti (simulasi D1 mati → Firestore → seed) | TES MOCK LOLOS; simulasi staging + produksi menunggu O-02 |
| 6 | Monitoring kuota harian kedua sistem, alert 70%/90% | SEBAGIAN (Firestore ya; D1 menunggu akun) |
| 7 | Analitik batch/agregasi per jam ke D1 | DESAIN SIAP; implementasi H4 |
| 8 | Verifikasi live 7 hari dari D1, baca Firestore katalog ≈ 0 | BELUM (pasca-cutover) |

## 5. Langkah berikut (berurutan)

1. **Owner/koordinator: buat akun Cloudflare khusus Karir
   (O-02)** dan serahkan akses ke tim. Tanpa ini, tidak ada
   langkah berikut yang dapat dimulai.
2. Jalankan backup Firestore baru (`workflow_dispatch`),
   catat ID run; pastikan drill restore penuh Tim C lolos.
3. H0: buat database D1 produksi + staging (`--location
   apac`), terapkan `d1/schema.sql`, isi `database_id` di
   `wrangler.toml`.
4. H1: ekspor Firestore → impor staging per kelompok +
   verifikasi baca-balik; uji Worker di staging termasuk
   uji fallback; lalu impor produksi.
5. H2: aktifkan dual-write (endpoint internal + secret,
   sesudah Red Team) + perbandingan harian; hitung 3 hari
   0 selisih.
6. Tunjuk penanggung jawab rollback + jadwalkan jendela
   jam sepi sebelum H1 produksi dimulai.
