# Observabilitas Karir (P-06)

Runbook observabilitas: apa yang dicatat, di mana melihatnya, ambang alarm apa yang berlaku, dan apa yang dilakukan bila alarm berbunyi. Terakhir diperbarui: 18 Nov 2026 (P-06, Fase 2).

Latar belakang: kegagalan Karir berulang kali gagal diam-diam — write-back gagal + CI merah 16–17 Nov 2026 tanpa notifikasi, seed-first tanpa log, alert kuota bergantung pada jalur yang ikut mati, log runtime Vercel Hobby hanya 1 jam. P-06 memastikan tidak ada lagi kegagalan penting yang tidak tercatat, terlihat, dan memicu alarm yang benar.

## Lapisan observabilitas

| Lapisan | Isi | Melihatnya di |
|---|---|---|
| Log terstruktur | Satu baris JSON per kejadian penting (lihat "Kode kejadian") | Log runtime Vercel (1 jam) |
| Insiden Firestore | Satu dokumen per kode per jam WIB (`incidents/{KODE}-{tanggal}-{jam}`) | Firestore Console / ekspor riwayat |
| Sentry | Error server + cron monitor recheck | Dasbor Sentry (perlu akun — lihat `docs/sentry-setup.md`) |
| Heartbeat cron | Dokumen `cron-runs/{job}-{tanggal}` per run | Firestore Console |
| Endpoint kesehatan | `GET /api/health` — status komponen tanpa baca Firestore | Browser / monitor uptime |
| Riwayat harian | `docs/status-history/YYYY-MM-DD.md` | Repo (workflow 03:00 WIB) |
| Watcher + Telegram | Alarm atas sinyal heartbeat/insiden/workflow | Telegram pemilik |

Semua lapisan gagal aman: tanpa DSN Sentry, SDK nonaktif diam-diam; bila Firestore 429/403, log konsol tetap jalan dan flush pengukur/insiden ditahan di memori lalu dicoba lagi.

## Kode kejadian (lib/observability.js)

| Kode | Arti | Pemicu |
|---|---|---|
| `MARKER_READ_FAILED` | Baca marker kuota gagal | `lib/companies.js`, `app/api/index/route.js` |
| `REFILL_FAILED_SEED_FALLBACK` | Refill gagal, jatuh ke seed/cache | `lib/companies.js` |
| `METERING_FAILED` | Flush pengukur baca gagal | `lib/read-meter.js`, `lib/companies.js` |
| `QUOTA_ALERT_FAILED` | Pembuatan alert kuota gagal | `lib/companies.js` |
| `SEED_LOAD_FAILED` | Gagal memuat seed | `lib/companies.js` |
| `COMPANY_READ_FAILED` | Baca satu perusahaan gagal | `lib/companies.js` |
| `API_ROUTE_ERROR` | Error di route API / RSS / changes | Route API, `lib/changes.js` |
| `CRON_WRITE_FAILED` | Kegagalan tulis di cron recheck | `app/api/cron/recheck/route.js` |
| `SA_TOKEN_FAILED` | Penukaran token service account gagal | `lib/service-account-token.js` |
| `CLIENT_ERROR` | Error JavaScript di browser pengunjung | `app/api/client-error/route.js` |
| `PUSH_DIGEST_FAILED` | Pengiriman digest push gagal | (dicadangkan; digest saat ini mencatat lewat heartbeat) |

Aturan sanitasi (ditegakkan di `lib/observability.js` dan diuji): pesan dipotong 500 karakter, alamat email dan kredensial di URL disamarkan, metadata dibatasi 10 kunci dan kunci sensitif (`token`, `password`, `secret`, `apiKey`, dan sejenisnya) disamarkan. **Tidak ada secret, UID, atau email pengguna yang boleh masuk log, insiden, Sentry, atau `/api/health`** — gerbang Red→Blue→Red P-06 memverifikasi ini.

Throttle: log konsol dibatasi 1/menit/kode/instance; sink Sentry dedup 1/jam/kode; pembaruan insiden throttled 15 menit/kode.

## Endpoint kesehatan (GET /api/health)

- **0 baca Firestore per panggilan** — semua nilai dari cache memori instance (`lib/companies.js`, `lib/health-state.js`). Sengaja: endpoint harus tetap menjawab saat Firestore 429 atau mati.
- **Tanpa penolakan bot** (penyimpangan dari rencana awal §1.4, diputuskan P-06): monitor uptime dan skrip ekspor adalah klien otomatis; menolak user-agent curl/python akan mematikan fungsi endpoint ini. Perlindungannya adalah batas laju 60/menit per IP (limiter memori lokal — bukan limiter bersama Firestore, supaya tetap jalan saat Firestore mati).
- Respons: `ok` (true bila sumber live), `degraded`, `source`, `rev`, `seedDate`, `readsEstimate`, `quotaPercent`, `liveAsOf`, `lastMarkerCheck`, `lastCronRun`, `seedModeMinutes`, `cacheAgeMs`, `cacheWarm`, `rateLimitDegraded`, `uptimeMs`. `Cache-Control: public, max-age=60, s-maxage=60`.
- **Keterbatasan instance dingin (jujur):** instance serverless yang baru bangun melaporkan `source: "seed"` sampai refill pertama menghangatkan cache-nya. Itu status instance itu, bukan status situs keseluruhan — jangan menafsirkan satu respons "seed" dari instance dingin sebagai situs sedang mode seed; periksa `seedModeMinutes` dan riwayat harian.

## Sentry

- SDK `@sentry/nextjs` 11.14.0, init di `web/sentry.server.config.js` + `web/instrumentation.js`, hanya bila `SENTRY_DSN` terisi. `tracesSampleRate: 0`, `sendDefaultPii: false`, scrubber `beforeSend` menghapus data pengguna/header/cookie.
- Cron monitor `karir-recheck` (01:00 WIB, margin 15 menit, runtime maks 5 menit): check-in `in_progress` sesudah kunci recheck didapat, `ok` di akhir run normal (termasuk run terpotong — itu hasil normal), `error` pada jalur kegagalan sesudah kunci. Run duplikat tidak check-in.
- **Tanpa SDK browser penuh** (keputusan P-06): anggaran bundle hanya tersisa ~10 KiB (halaman terbesar 1290,2 KiB dari batas 1300 KiB). Klien memakai pelapor ringan (`app/error-reporter.js`: `window.onerror` + `unhandledrejection`, throttle 1/menit, maks 5/sesi, `sendBeacon`) ke `POST /api/client-error` (batas 10/menit, badan maks 4 KiB, tanpa stack trace, URL dipotong jadi path saja). SDK browser penuh ditunda ke perombakan bundle P-10.
- Penyiapan akun: `docs/sentry-setup.md`.

## Ambang alarm watcher

Watcher (`notify_watch.py`, agent-side, jalan 01:30 WIB) membaca sinyal-sinyal ini dan mengirim Telegram ke pemilik. Dedup per alarm per hari (marker lokal).

| Alarm | Pemicu | Tindakan |
|---|---|---|
| `cron-skipped` | Heartbeat recheck `status: "skipped"` | Lihat `skipReason` + `error` di heartbeat; perbaiki penyebab (secret/SA/kunci/seed) |
| `telegram-failed` / `telegram-no-token` | Heartbeat `telegram: "failed"` / `"skipped-no-token"` | Periksa `TELEGRAM_BOT_TOKEN` di Vercel / status Bot API |
| `push-failed` / `push-no-vapid` / `push-truncated` / `push-failed-high` | Sinyal push di heartbeat recheck/digest | Periksa kunci VAPID, langganan push, log digest |
| `alert-phase-truncated` | Fase alert recheck terpotong anggaran waktu | Periksa `phaseMs.alerts` — antrean alert membesar |
| `snapshot-failed` | Snapshot target recheck gagal ditulis | Periksa Firestore + token SA |
| `quota-alert-missing` | Kuota ≥ ambang tetapi tidak ada alert kuota | Periksa jalur alert kuota independen (K2) |
| `seed-mode-1h` | Insiden `MARKER_READ_FAILED` + `REFILL_FAILED_SEED_FALLBACK` di jam WIB ini DAN jam sebelumnya | Periksa kuota Firestore + konektivitas; situs sedang melayani dari seed |
| `retention-backlog` | Cleanup dua Senin berturut-turut dengan `*HasMore` | Jalankan cleanup manual / naikkan anggaran hapus |
| `write-back-failed` / `ci-red` | Workflow write-back gagal / CI merah (jendela 24 jam; backup/cleanup 8 hari) | Periksa run GitHub Actions yang gagal |
| `watcher-down` | Heartbeat watcher basi > 26 jam | Workflow `watcher-monitor.yml` membuka issue GitHub |

Kuota Firestore: alert 70% (35.000 baca) dibuat sisi web saat refill dan sisi cron saat recheck; alert 90% (45.000 baca) HANYA dibuat sisi cron (memakai token service account, tanpa perubahan rules) dan hanya alert 90% — bukan 70% + 90% — supaya pemilik tidak menerima dua pesan.

## Pengukuran baca per sumber (K7)

- Pencatatan: `lib/read-meter.js` menumpuk hitungan per sumber di memori instance; flush malas (delta ≥ 50 atau 10 menit) atau eksplisit di akhir cron, ke `read-stats/{tanggal-WIB}` lewat SATU Write batchWrite (update `updatedAt` + `updateTransforms` increment per sumber).
- Sumber: `web-refill`, `web-marker`, `web-by-id`, `web-changes`, `web-index-rev`, `cron-recheck`, `cron-cleanup`, `watcher`.
- Laporan: `node web/scripts/read-stats-report.mjs [--days N]` (bawaan 14 hari) — mencetak tabel per sumber + sumber terbesar + hari hilang.
- **Rencana observasi 14 hari (pasca-merge):** hari ke-1 periksa dokumen `read-stats/{tanggal}` pertama muncul (bila tidak ada, rules belum diterbitkan — eskalasi ke parent); hari ke-7 jalankan laporan untuk memeriksa kelengkapan (hari hilang < 2); hari ke-14 jalankan laporan final dan catat sumber terbesar + total harian rata-rata di laporan P-06 pasca-merge — angka itu menjadi dasar target penghematan P-08/P-10. Angka laporan adalah batas bawah (lihat catatan di skrip).

## Rencana verifikasi rantai live (K9)

Dilakukan sesudah akun Sentry ada + DSN dipasang + Firestore live:

1. Pemicu uji: jalankan recheck manual satu kali (workflow dispatch) sambil memantau log Vercel — satu kejadian `CRON_WRITE_FAILED` atau error sengaja lain harus muncul sebagai baris JSON.
2. Periksa dokumen `incidents/{KODE}-{tanggal}-{jam}` muncul di Firestore dalam 1 menit.
3. Periksa issue yang sama muncul di Sentry → Issues (dengan scrubbing: tanpa email/UID).
4. Periksa watcher 01:30 WIB berikutnya membaca sinyal terkait (bila pemicunya alarm) dan mengirim Telegram — atau, untuk pemicu non-alarm, periksa riwayat harian 03:00 WIB memuat insiden itu.
5. Tutup K9 bila keempat mata rantai terbukti; catat tanggal + ID issue Sentry + ID dokumen insiden di laporan pasca-merge.

## Aturan Firestore (penerbitan oleh parent)

Aturan baru P-06 (`incidents`, `read-stats`, `cron-runs` eksplisit) ada di `web/firestore.rules` tetapi **hanya berlaku sesudah diterbitkan** (Firebase Console → Firestore → Rules → Publish, atau `firebase deploy --only firestore:rules`). Sampai diterbitkan:

- Flush pengukur baca dan tulis insiden mengembalikan 403 — tumpukan pengukur tertahan di memori (lalu dibuang di batas 10.000) dan insiden tidak tercatat.
- Log konsol, heartbeat (token SA, melewati rules), Sentry, dan `/api/health` tetap jalan penuh.

Periksa penerbitan: sesudah merge + deploy, dokumen `read-stats/{tanggal}` hari pertama harus muncul sebelum akhir hari. Bila tidak muncul, rules belum diterbitkan.

## Penyimpangan yang didokumentasikan (P-06)

1. `/api/health` tanpa penolakan bot (rencana §1.4 mengusulkan penolakan) — alasan di atas.
2. Limiter kesehatan + client-error memakai limiter memori lokal, bukan limiter bersama Firestore — limiter bersama membaca Firestore (1 baca/panggilan) dan fail-open saat Firestore mati; endpoint observabilitas harus jalan justru saat Firestore mati.
3. Heartbeat watcher memperluas dokumen `meta/watcher` yang sudah ada (bukan dokumen baru `cron-runs/watcher-{tanggal}` seperti rencana) — menghindari satu koleksi heartbeat lagi dan memakai jalur yang sudah dipantau `watcher-monitor.yml`.
4. Tanpa SDK browser Sentry penuh — anggaran bundle (di atas).
5. Aturan `count` insiden monoton-naik, bukan +1 eksak — balapan baca-ubah-tulis dua instance bisa menulis angka yang sama.
6. Retensi `cron-runs` tetap 90 hari (nilai interim P-03, menunggu konfirmasi pemilik) — bukan 180 hari seperti yang disetujui K-14.
7. Perbaikan status push `"sent"` dengan 0 langganan menjadi `"none"` (P3) TIDAK dilakukan di P-06 — milik P-07; P-06 hanya mencatat konteks push.
