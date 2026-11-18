# Riwayat kesehatan Karir

Snapshot harian otomatis status situs, insiden, dan heartbeat cron/watcher — satu file per tanggal (`YYYY-MM-DD.md`, tanggal WIB).

Dibuat workflow **Ekspor riwayat kesehatan** (`export-health-history.yml`) tiap hari 03:00 WIB, sesudah recheck (01:00), digest (01:30), dan watcher (01:30). Skripnya: `web/scripts/export-health-history.mjs`.

## Isi tiap file

- **Status situs** dari `/api/health`: sumber data (live/seed), revisi data, estimasi baca Firestore + persen kuota harian, menit berjalan mode seed, run cron terakhir, status cache.
- **Insiden 24 jam terakhir** dari koleksi `incidents`: kode kejadian, jumlah, pertama/terakhir terlihat, pesan (sudah disanitasi — email disamarkan).
- **Heartbeat**: dokumen `cron-runs/recheck-{hari ini}` dan `{kemarin}`, `cron-runs/digest-{hari ini}`, dan `meta/watcher`.

## Keamanan

File di direktori ini **aman di repo publik**: tidak ada token, UID, atau email. Pesan insiden disanitasi di hulu (`lib/observability.js`) dan disamarkan ulang oleh skrip ekspor. Jangan menambahkan field mentah Firestore ke skrip tanpa tinjauan keamanan.

## Bila ada hari yang hilang

- Workflow gagal total (mis. kuota Firestore habis saat ekspor): jalankan manual lewat **Actions → Ekspor riwayat kesehatan → Run workflow** sesudah masalah pulih. Skrip menerima `--date YYYY-MM-DD` untuk mengisi hari yang terlewat (jalankan dari `web/` dengan `FIREBASE_SERVICE_ACCOUNT` di env).
- File hari itu ada tetapi berisi "Tidak bisa diambil": situs tidak bisa dijangkau saat ekspor — itu sinyal yang tercatat sengaja, bukan bug skrip.
