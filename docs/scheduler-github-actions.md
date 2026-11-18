# Scheduler GitHub Actions (P-05)

Runbook pelaksana cron Karir: GitHub Actions sebagai scheduler
utama, QStash sebagai pemicu cadangan, dan Vercel Cron yang
masih aktif selama masa transisi. Terakhir diperbarui:
18 Nov 2026 (P-05, Fase 2).

## Mengapa pindah

Vercel Cron paket Hobby telat 35–55 menit (perilaku resmi,
presisi ±59 menit) dan memicu alarm palsu harian di watcher;
cleanup mingguan ~110 detik melebihi `maxDuration` fungsi
60 detik sehingga tidak pernah selesai dalam satu panggilan;
dan tidak ada pengaman jalan-ganda bila dua pemicu tiba
bersamaan. GitHub Actions terjadwal presisi hitungan menit,
durasi job sampai 6 jam, dan gratis untuk repo publik.

## Arsitektur

```
GitHub Actions (utama)          QStash (cadangan, +5 menit)
  scheduled-recheck.yml  01:00 ─┐
  scheduled-digest.yml   01:30 ─┼─► /api/cron/* ─► kunci idempotency
  scheduled-cleanup.yml  Sen 02:00 ─┘      (cron-locks, Firestore)
  watcher-monitor.yml    08:00 ─► meta/watcher (heartbeat watcher)
```

| Workflow | Jadwal (WIB) | Cron UTC | Memanggil |
|---|---|---|---|
| `scheduled-recheck.yml` | tiap hari 01:00 | `0 18 * * *` | `GET /api/cron/recheck` |
| `scheduled-digest.yml` | tiap hari 01:30 | `30 18 * * *` | `GET /api/cron/digest` |
| `scheduled-cleanup.yml` | Senin 02:00 | `0 19 * * 0` | `GET /api/cron/cleanup` (loop) |
| `watcher-monitor.yml` | tiap hari 08:00 | `0 1 * * *` | `web/scripts/check-watcher-heartbeat.mjs` |

Pemicu `schedule` HANYA jalan di default branch (main); di
branch fitur workflow inert. `workflow_dispatch` tersedia untuk
jalan manual — aman karena endpoint menolak duplikat.

## Idempotency (kunci `cron-locks`)

Modul `web/lib/cron-idempotency.js`. Setiap job mengambil kunci
di koleksi `cron-locks` SEBELUM bekerja, id dokumen
`{job}-{tanggal-WIB}` (mis. `recheck-2026-11-18`):

- Create atomik (POST `?documentId=`); HTTP 409 = sudah ada.
- Kunci `running` berumur >3 menit (TTL `LOCK_TTL_MS`) dianggap
  basi — fungsi Vercel dibunuh paksa pada 60 detik, jadi kunci
  `running` yang lebih tua pasti dari run yang mati — dan bisa
  diambil alih lewat PATCH dengan prasyarat `updateTime` (CAS;
  412 = kalah balapan).
- Kunci `done` menolak pemicu ulang, KECUALI cleanup
  (`allowRerun: true` — penghapusan retensi idempotent dan
  workflow cleanup memang memanggil berulang).
- Kunci `failed` selalu bisa diambil alih (pemicu cadangan).
- Pemicu duplikat menjawab HTTP 200 `{duplicate: true, reason}`
  — BUKAN error — supaya QStash tidak retry sia-sia dan workflow
  Actions tidak gagal. Penolakan dicatat di log server.
- Kunci diturunkan server-side dari nama job + tanggal WIB;
  pemanggil tidak pernah mengirim idempotency key, jadi
  penyerang tidak bisa mengunci job dengan key palsu.

Koleksi `cron-locks` sengaja TIDAK masuk cadangan Firestore
(dokumen sementara, 1 dokumen/job/hari) dan tidak punya aturan
khusus di `firestore.rules` (default-deny; service account
melewati rules).

## Auth endpoint cron

Modul `web/lib/cron-auth.js` — dua jalur, salah satu cukup:

1. **Bearer `CRON_SECRET`** (jalur utama: GitHub Actions,
   Vercel Cron, manual) — perbandingan timing-safe.
2. **Signature QStash** (jalur cadangan) — JWT HS256 di header
   `Upstash-Signature`, ditandatangani kunci penandatanganan
   akun Upstash; `iss` harus `Upstash`, `sub` harus sama persis
   dengan URL endpoint, `exp`/`nbf` berlaku, klaim `body` =
   base64url(SHA-256(raw body)). Dua kunci (current + next)
   untuk rotasi; tenggang jam 60 detik.

Tanpa `CRON_SECRET` di env → endpoint 503 (fail-closed lama
dipertahankan). Bila kunci QStash belum dipasang di env Vercel,
jalur QStash nonaktif (fail-closed) — GitHub Actions tetap jalan.
Header `X-Karir-Trigger` hanya LABEL pemicu di log dan heartbeat
(`github-actions` / `qstash` / `cron-secret`), dibersihkan ke
`[a-z0-9-]{1,32}`, tidak pernah memengaruhi keputusan auth.

## Cleanup: loop sampai tidak ada sisa (C7)

Job cleanup penuh ~110 detik > `maxDuration` 60 detik. Workflow
`scheduled-cleanup.yml` me-loop endpoint sampai `hasMore` false
di semua koleksi (maks 12 iterasi, jeda 10 detik antar iterasi);
tiap panggilan adalah invokasi fungsi baru dengan anggaran
60 detiknya sendiri. Respons duplikat ditangani dengan tidur
90 detik + retry (maks 10x); gagal transport/5xx dicoba ulang
3x; HTTP 401/403/503 gagal langsung (masalah konfigurasi).
Sesudah batas maks masih ada sisa → run GAGAL supaya masalahnya
diselidiki, bukan berputar tanpa henti.

## Digest mandiri

Endpoint `GET /api/cron/digest` (01:30 WIB) mengambil alert hari
ini yang BELUM `pushed` (tipe `new-target` dan `deadline`) dan
mengirimnya sebagai satu digest push. Recheck menandai
`pushed=true` hanya bila digestnya terkirim penuh; bila
terpotong/gagal, endpoint digest mencoba lagi. Heartbeat:
`cron-runs/digest-{tanggal-WIB}`. Detail di
`docs/monitoring-cron.md`.

## Pemantau watcher (C5)

Watcher menulis heartbeat ke `meta/watcher` (`lastRunAt` +
`lastRunOk`) di akhir setiap run. Workflow `watcher-monitor.yml`
memeriksa kesegarannya tiap hari 08:00 WIB lewat
`web/scripts/check-watcher-heartbeat.mjs` (batas basi 26 jam);
bila basi/hilang, workflow GAGAL dan membuka GitHub issue
berlabel `watcher-down` (dedup: tidak membuat duplikat bila
sudah ada issue terbuka dengan label itu). Ini jalur alarm yang
tidak bergantung pada Telegram maupun VM watcher.
`lastRunOk=false` pada heartbeat segar bukan alarm monitor —
watcher yang berjalan sudah mengabarkan masalahnya sendiri.

## Secret yang dipakai

| Secret | Tempat | Dipakai |
|---|---|---|
| `CRON_SECRET` | GitHub Actions secrets + env Vercel | Auth endpoint cron (Actions, Vercel Cron) |
| `FIREBASE_SERVICE_ACCOUNT` | GitHub Actions secrets | `watcher-monitor.yml` (sudah ada, dipakai backup.yml) |
| `QSTASH_CURRENT_SIGNING_KEY` | env Vercel | Verifikasi signature QStash |
| `QSTASH_NEXT_SIGNING_KEY` | env Vercel | Rotasi kunci QStash |
| Kunci VAPID | env Vercel (+ GitHub Actions secrets bila diperlukan) | Digest push |

Tidak ada nilai secret di repo. Pemasangan kunci VAPID ke
GitHub Secrets dicoba lewat API di P-05; bila gagal, ikuti
langkah manual di laporan akhir P-05.

## Rencana cutover: menonaktifkan Vercel Cron

Vercel Cron TIDAK dinonaktifkan di branch P-05. Langkah
pasca-merge yang terkendali, sesudah scheduler Actions terbukti
jalan di produksi:

1. **Observasi presisi (kriteria 2):** tiga run recheck
   berturut-turut dimulai dalam ±5 menit dari 01:00 WIB
   (dibuktikan dari `created_at` run workflow di halaman
   Actions). Selama observasi, kedua scheduler hidup
   berdampingan; idempotency mencegah jalan-ganda.
2. **Observasi alarm (kriteria 6):** nol alarm palsu
   keterlambatan selama 7 hari.
3. **Satu siklus penuh (kriteria 8):** satu Senin cleanup
   selesai tanpa sisa + satu digest terkirim + monitor watcher
   hijau 7 hari.
4. **Cutover:** hapus entri `crons` dari `web/vercel.json`
   (atau kosongkan daftarnya), commit + deploy. Verifikasi:
   run berikutnya hanya dari Actions (field `trigger` di
   heartbeat = `github-actions`, bukan `cron-secret`).
5. **Rollback:** bila Actions gagal total pasca-cutover,
   kembalikan entri `crons` di `web/vercel.json` (satu commit
   revert) — endpoint tidak berubah, Vercel Cron langsung
   mengambil alih lagi. QStash tetap aktif sebagai cadangan
   selama dan sesudah cutover.

## Rencana observasi pasca-merge

| Kriteria | Yang dicek | Ambang lolos | Ambang gagal |
|---|---|---|---|
| 2 — presisi | `created_at` run `scheduled-recheck.yml` vs 01:00 WIB, 3 run berturut-turut | Semua dalam ±5 menit | Satu run di luar ±5 menit → selidiki antrean runner Actions |
| 6 — nol alarm palsu | Alarm `cron-miss` / `cron-truncated` selama 7 hari | Nol alarm keterlambatan | Alarm palsu muncul → periksa masa tenggang watcher |
| 8 — siklus penuh | Cleanup Senin selesai (ringkasan workflow: tidak ada sisa), digest terkirim, monitor hijau | Satu siklus lengkap tanpa intervensi | Cleanup bersisa sesudah 12 iterasi / digest gagal 2 hari → investigasi |
| Idempotency live | Log server + ringkasan workflow saat Vercel Cron dan Actions bertabrakan | Satu eksekusi, satu jawaban `duplicate` tercatat | Dua eksekusi penuh dalam satu hari → kunci tidak bekerja |

## Troubleshooting

- **Workflow gagal "Secret CRON_SECRET belum dipasang":**
  pasang secret di repo (Settings > Secrets and variables >
  Actions), nilainya sama dengan env `CRON_SECRET` di Vercel.
- **Workflow gagal 401:** `CRON_SECRET` di GitHub tidak sama
  dengan di Vercel — samakan nilainya.
- **Workflow gagal 503 "konfigurasi cron belum lengkap":**
  `CRON_SECRET` belum dipasang di env Vercel (endpoint
  fail-closed), atau Firestore tidak bisa dibaca (kuota habis —
  lihat pesan kuota Telegram).
- **Cleanup "terus menjawab duplikat":** kunci
  `cron-locks/cleanup-{tanggal}` macet — periksa dokumennya di
  Firestore; hapus manual bila statusnya `running` berumur
  >1 jam (TTL 3 menit seharusnya memulihkan otomatis).
- **Digest 500 "tanpa VAPID":** kunci VAPID belum dipasang di
  env Vercel — pasang, lalu dispatch ulang workflow digest.
- **Issue `watcher-down` terbuka:** heartbeat watcher basi
  >26 jam — periksa `notify_watch.py` di VM dan tulis heartbeat
  ke Firestore; tutup issue sesudah heartbeat kembali segar.
- **Dua scheduler bertabrakan:** normal selama transisi —
  jawaban `duplicate` di ringkasan workflow adalah bukti
  idempotency bekerja, bukan kegagalan.
