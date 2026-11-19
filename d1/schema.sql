-- Skema D1 Karir — P-08, tahap H0 (persiapan, 19 Nov 2026).
--
-- Database: karir-data (Cloudflare D1, akun KHUSUS Karir — O-02).
-- Lokasi primary: hint `apac` (dipilih saat pembuatan database:
-- `wrangler d1 create karir-data --location apac`). Opsi kota
-- spesifik belum terverifikasi; catat pilihan yang tersedia saat
-- pembuatan (riset-database.md §13 butir 8).
--
-- Cara pakai (sesudah O-02, akun tersedia):
--   wrangler d1 execute karir-data --file=d1/schema.sql
--   wrangler d1 execute karir-data-staging --file=d1/schema.sql
--
-- Konvensi:
-- - Satu baris = satu perusahaan, kunci utama `no` (nomor baris CSV,
--   sama dengan ID dokumen Firestore `companies/{no}`).
-- - 13 kolom CSV dipertahankan apa adanya (nama kolom = nama field
--   Firestore/CSV, snake_case) supaya verifikasi baca-balik impor
--   membandingkan apel dengan apel.
-- - `rev` per baris = rev marker saat baris terakhir berubah; dipakai
--   endpoint delta (`WHERE rev > ?`). Rev global tinggal di tabel
--   `meta` (kunci `rev`), cermin dari dokumen Firestore
--   `meta/lastChange`.
-- - Tanggal memakai teks ISO (`YYYY-MM-DD` untuk tanggal_cek,
--   ISO 8601 untuk stempel waktu) — sama seperti Firestore.
-- - D1 menghitung baris yang DIPINDAI, bukan yang dikembalikan:
--   setiap kolom yang dipakai filter WAJIB punya indeks (lihat
--   rencana-migrasi.md §7.2 butir 1).

-- ------------------------------------------------------------------
-- companies — katalog publik (sistem pencatatan pasca-cutover).
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  no            INTEGER PRIMARY KEY,
  perusahaan    TEXT NOT NULL DEFAULT '',
  kategori      TEXT NOT NULL DEFAULT '',
  link_karir    TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT '',
  tanggal_cek   TEXT NOT NULL DEFAULT '',
  catatan       TEXT NOT NULL DEFAULT '',
  lokasi        TEXT NOT NULL DEFAULT '',
  posisi        TEXT NOT NULL DEFAULT '',
  email_hrd     TEXT NOT NULL DEFAULT '',
  wa_hrd        TEXT NOT NULL DEFAULT '',
  kontak_lain   TEXT NOT NULL DEFAULT '',
  batas_lamar   TEXT NOT NULL DEFAULT '',
  -- Field live Firestore yang TIDAK ada di CSV (P-04): kegagalan
  -- jangkau beruntun, direset ke 0 saat cek definitif berhasil.
  gagal_cek     INTEGER NOT NULL DEFAULT 0,
  -- Rev marker saat baris ini terakhir berubah (0 = dari impor awal).
  rev           INTEGER NOT NULL DEFAULT 0,
  -- Stempel waktu ISO saat baris ini terakhir ditulis.
  updated_at    TEXT NOT NULL DEFAULT ''
);

-- Indeks pada kolom filter + kolom delta. Tanpa indeks ini, kueri
-- filter memindai seluruh tabel dan rows read membengkak.
CREATE INDEX IF NOT EXISTS idx_companies_status
  ON companies (status);
CREATE INDEX IF NOT EXISTS idx_companies_kategori
  ON companies (kategori);
CREATE INDEX IF NOT EXISTS idx_companies_lokasi
  ON companies (lokasi);
CREATE INDEX IF NOT EXISTS idx_companies_rev
  ON companies (rev);
CREATE INDEX IF NOT EXISTS idx_companies_tanggal_cek
  ON companies (tanggal_cek);

-- ------------------------------------------------------------------
-- meta — pasangan kunci-nilai kecil; cermin meta/lastChange.
-- Kunci yang dipakai: rev, updatedAt, counterDay, refillsToday,
-- readsEstimate. Nilai disimpan sebagai teks; pembaca mengurai
-- angka dari teks (sama seperti parseMarker di lib/companies.js).
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO meta (key, value) VALUES
  ('rev', '0'),
  ('updatedAt', ''),
  ('counterDay', ''),
  ('refillsToday', '0'),
  ('readsEstimate', '0');

-- ------------------------------------------------------------------
-- changes — log perubahan status (append-only). Cermin koleksi
-- Firestore `changes`: {companyNo, perusahaan, from, to,
-- checkedAt, createdAt}. Kolom `source` mencatat asal perubahan
-- (cron | hunting | admin | impor) untuk audit konflik.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS changes (
  id          TEXT PRIMARY KEY,
  company_no  INTEGER NOT NULL,
  perusahaan  TEXT NOT NULL DEFAULT '',
  from_status TEXT NOT NULL DEFAULT '',
  to_status   TEXT NOT NULL DEFAULT '',
  checked_at  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_changes_company_no
  ON changes (company_no);
CREATE INDEX IF NOT EXISTS idx_changes_created_at
  ON changes (created_at);

-- ------------------------------------------------------------------
-- cron_runs — heartbeat + detail run cron (recheck, cleanup,
-- digest, write-back). Menggantikan dokumen Firestore `cron-runs`
-- pada H4; selama transisi 7 hari ditulis ke kedua tempat.
-- id = "{tanggal}:{nama-job}" (kunci idempotensi, mis.
-- "2026-11-19:recheck") — mencegah run ganda.
-- shadow_failures = jumlah tulis bayangan Firestore yang gagal
-- pada run ini (H2; kegagalan bayangan dicatat, tidak
-- menggagalkan run).
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cron_runs (
  id               TEXT PRIMARY KEY,
  job              TEXT NOT NULL,
  date             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'running',
  started_at       TEXT NOT NULL DEFAULT '',
  finished_at      TEXT NOT NULL DEFAULT '',
  checked          INTEGER NOT NULL DEFAULT 0,
  changed          INTEGER NOT NULL DEFAULT 0,
  updated          INTEGER NOT NULL DEFAULT 0,
  skipped          INTEGER NOT NULL DEFAULT 0,
  unreachable      INTEGER NOT NULL DEFAULT 0,
  open_skipped     INTEGER NOT NULL DEFAULT 0,
  shadow_failures  INTEGER NOT NULL DEFAULT 0,
  error            TEXT NOT NULL DEFAULT '',
  last_phase       TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_date
  ON cron_runs (date);
CREATE INDEX IF NOT EXISTS idx_cron_runs_job
  ON cron_runs (job);

-- ------------------------------------------------------------------
-- analytics_daily — agregat analitik HARIAN per jenis event.
-- Event mentah TIDAK PERNAH ditulis ke D1 per event (riset
-- §11.1: agregasi per jam wajib; tabel ini menampung hasil
-- agregasi harian). Satu baris per (tanggal, event).
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_daily (
  date   TEXT NOT NULL,
  event  TEXT NOT NULL,
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, event)
);
