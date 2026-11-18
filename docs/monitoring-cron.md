# Monitoring cron recheck & notifikasi owner

Dokumen ini menjelaskan cara kerja cron cek ulang harian, antrean
ceknya, koordinasi notifikasi Telegram, dan pemantauan kesehatan
cron. Terakhir diperbarui: 18 Nov 2026 (P-06, Fase 2).

Untuk gambaran observabilitas menyeluruh (log terstruktur,
insiden, Sentry, `/api/health`, riwayat harian, ambang alarm),
lihat `docs/observability.md`.

## Jadwal

| Komponen | Jadwal | Tempat |
|---|---|---|
| Recheck `GET /api/cron/recheck` | tiap hari 01:00 WIB | GitHub Actions `scheduled-recheck.yml` (utama, P-05); Vercel Cron (`web/vercel.json`) masih aktif sampai cutover pasca-merge — lihat `docs/scheduler-github-actions.md` |
| Digest push `GET /api/cron/digest` | tiap hari 01:30 WIB | GitHub Actions `scheduled-digest.yml` (P-05) |
| Cleanup `GET /api/cron/cleanup` | Senin 02:00 WIB | GitHub Actions `scheduled-cleanup.yml` (utama, P-05); Vercel Cron masih aktif sampai cutover |
| Monitor watcher | tiap hari 08:00 WIB | GitHub Actions `watcher-monitor.yml` (P-05) |
| Watcher `notify_watch.py` | tiap hari 01:30 WIB | cron agent-side (`~/workspace/.claude-v280/`) |
| Ekspor riwayat kesehatan | tiap hari 03:00 WIB | GitHub Actions `export-health-history.yml` (P-06) — snapshot `/api/health` + insiden + heartbeat ke `docs/status-history/` |
| Cron monitor Sentry `karir-recheck` | tiap hari 01:00 WIB | Sentry (P-06, perlu akun + DSN — lihat `docs/sentry-setup.md`); check-in hanya oleh pemegang kunci recheck |
| Pemicu cadangan QStash | recheck 01:05, digest 01:35, cleanup Senin 02:05 WIB | Upstash QStash (Free) — lihat `docs/qstash-setup.md` |

Cron menulis alert ke Firestore; watcher meneruskan alert yang
belum terkirim ke Telegram owner. Bila token bot Telegram dipasang
di Vercel, cron juga mengirim langsung — lihat "Satu sumber
kebenaran status terkirim" di bawah.

Dua pemicu bersamaan (mis. GitHub Actions + QStash, atau Actions +
Vercel Cron selama masa transisi) menghasilkan SATU eksekusi:
endpoint mengambil kunci idempotency di koleksi `cron-locks`
sebelum bekerja; pemicu kedua menjawab HTTP 200
`{duplicate: true, reason}` tanpa efek samping. Detail di
`docs/scheduler-github-actions.md`.

## Antrean cek (BE-05)

Antrean disusun `buildCheckQueue` (`web/lib/check.js`) dalam tiga
tier, berurutan:

1. **Mendesak** — status "Ada lowongan" + `batas_lamar` 0–7 hari
   lagi. Dicek pertama di tiap run karena owner mungkin melamar
   sebelum batasnya. Urutan: batas terdekat dulu, lalu yang paling
   lama tidak dicek.
2. **Terbuka** — status "Ada lowongan" lainnya. Urutan: tanggal
   cek tertua dulu (tanpa tanggal cek paling dulu).
3. **Mati** — status "Portal tidak bisa dibuka", dicek untuk
   mendeteksi pulih. Hanya terjangkau bila anggaran tersisa
   sesudah tier 1–2; urutan tanggal cek tertua membuatnya bergilir
   antar run.

Perusahaan tanpa tautan karir tidak masuk antrean. Status lain
("Tidak ada lowongan", "Tidak dapat diverifikasi") tidak dicek
ulang oleh cron.

Ukuran antrean pada 15 Nov 2026: 293 URL (238 terbuka + 55 mati).
Anggaran run 50 detik (`DEADLINE_MS`) dengan batch 8 paralel
tidak cukup untuk seluruh antrean dalam satu run — karena itu
tier dan rotasi tanggal cek menjadi penentu mana yang dicek hari
ini dan mana yang menunggu besok. Perusahaan yang baru dicek
(tanggal cek diperbarui tiap run) otomatis pindah ke belakang
antrean.

## Anggaran & batas fungsi (OPS-07)

- `maxDuration = 60` dinyatakan eksplisit di route (paket Hobby:
  maks 60 detik), supaya anggaran internal 50 detik selalu punya
  margin 10 detik untuk tulis heartbeat + balasan.
- Batas waktu dicek di awal tiap batch DAN sebelum fase tulis tiap
  batch: batch yang selesai cek sesudah batas tidak dipaksa tulis
  (hasil ceknya dibuang, dicoba lagi besok) supaya Vercel tidak
  mematikan fungsi di tengah tulis.
- Fase alert punya anggaran sendiri 15 detik dan menulis alert
  paralel batch 5 (NOTIF-15), supaya tidak memakan jatah loop cek.

## Urutan fase dalam satu run

1. Auth fail-closed (`CRON_SECRET` wajib, perbandingan
   timing-safe; tanpa secret menjawab 503 — NOTIF-02/SEC-05/
   OPS-04, diperbaiki Fase 1 + masking pesan 503 di T11).
   Sejak P-05, signature QStash (JWT HS256, header
   `Upstash-Signature`) diterima sebagai jalur auth kedua;
   tanpa `CRON_SECRET` maupun kunci QStash, endpoint tetap
   503. Header `X-Karir-Trigger` hanya label pemicu di log
   dan heartbeat, tidak memengaruhi auth.
1b. Ambil kunci idempotency `cron-locks/recheck-{tanggal-WIB}`
   (P-05): bila job sedang berjalan/sudah selesai hari ini,
   jawab 200 `{duplicate: true}` tanpa bekerja. Kunci basi
   (>3 menit, dari run yang mati) diambil alih otomatis.
2. Muat perusahaan — HANYA dari live. Bila Firestore tidak bisa
   dibaca (source seed), run dilewati dengan 503 supaya tidak ada
   alert palsu atau tulis dari data basi.
3. Susun antrean (tiga tier di atas).
4. Tukar token service account; baca snapshot `meta/targets`.
5. **Fase alert dulu**, sebelum loop cek (perbaikan insiden
   9 Nov 2026): bandingkan daftar yang ada lowongan dengan
   snapshot → alert new-target; batas lamar 0–3 hari → alert
   deadline. Alert ditulis dengan id deterministik (idempotent).
   Bila tulis alert new-target gagal (atau anggaran fase habis
   sebelum mencoba), nomor itu dikeluarkan dari snapshot supaya
   run berikut mencoba lagi (NOTIF-06). Kegagalan tulis snapshot
   dicatat di log + ringkasan (NOTIF-07).
6. Kirim satu pesan Telegram gabungan bila ada alert baru (pesan
   di atas 4096 karakter dipecah otomatis, NOTIF-08), lalu tandai
   tiap alert `sent=true` + `sentAt` (NOTIF-01).
7. Loop cek portal per batch sampai anggaran habis.
8. Naikkan marker kesegaran `meta/lastChange` bila ada status
   yang berubah atau tanggal cek diperbarui (T15 — JANGAN diubah
   sembarangan: kondisi bump `statusPatched > 0 ||
   summary.updated > 0`).
9. Tulis dokumen heartbeat `cron-runs/{tanggal-WIB}` (OPS-01).
10. Balas ringkasan JSON.

## Ringkasan balasan cron

`{checked, changed, updated, skipped, openSkipped, truncated,
alerts, alertsFailed, telegram, telegramMarked,
alertPhaseTruncated, snapshotKnown, snapshotWritten, queue,
markerBumped, heartbeatWritten, trigger, pushedMarked,
pushedFailed, push, pushSent, pushFailed, pushPruned,
pushTruncated, pushTotal, pushHasMore, pushMalformed,
pushConfigError, pushPages, pushStaleKey, pushUnknownKey}`

- `openSkipped` — perusahaan tier mendesak/terbuka yang tidak
  sempat dicek karena terpotong. Ini sinyal utama pemantauan:
  tier mati yang terpotong adalah rotasi yang disengaja, bukan
  kegagalan.
- `queue` — `{urgent, open, dead, total}`.
- `telegram` — `sent` | `failed` | `skipped-no-token` | `none`;
  `telegramMarked` — alert yang berhasil ditandai terkirim
  sesudah kirim langsung.
- `trigger` (P-05) — pemicu run: `github-actions` | `qstash` |
  `cron-secret` (Vercel Cron/manual); tercatat juga di heartbeat.
- `pushedMarked` / `pushedFailed` (P-05) — alert yang berhasil /
  gagal ditandai `pushed` sesudah digest push terkirim penuh.
  Bila digest terpotong/gagal, penanda tidak ditulis dan endpoint
  digest 01:30 WIB mencoba lagi.
- `push` (P-07) — `sent` | `failed` | `none` | `skipped-no-vapid`.
  `none` berarti tidak ada alert yang belum pushed ATAU nol
  langganan — keduanya hasil normal, bukan kegagalan. Sejak
  P-07, nol langganan TIDAK PERNAH dicatat `sent`.
- Konteks push (P-06 + P-07): `pushTotal` (langganan dibaca),
  `pushSent` / `pushFailed` / `pushPruned` (terkirim / gagal /
  dihapus karena 404/410), `pushHasMore` + `pushTruncated`
  (run terpotong — alert tidak ditandai pushed), `pushMalformed`
  (dokumen dilewati karena bentuknya tidak bisa dikirim),
  `pushPages` (halaman langganan yang dibaca — paginasi 500 per
  halaman, tanpa batas total langganan), `pushConfigError`
  (kunci VAPID tidak berpasangan / ditolak 401-403 — langganan
  TIDAK dihapus), `pushStaleKey` (langganan berkunci lama
  sesudah rotasi) / `pushUnknownKey` (langganan lama tanpa
  sidik kunci).

## Endpoint digest mandiri (P-05)

`GET /api/cron/digest` (dipicu 01:30 WIB oleh
`scheduled-digest.yml`) mengambil alert hari ini yang BELUM
`pushed` (tipe `new-target` dan `deadline` saja) dan mengirimnya
sebagai satu digest push. Bila recheck sudah mengirim digest
penuh, tidak ada yang ditemukan dan endpoint menjawab tanpa
mengirim. Heartbeat-nya sendiri: `cron-runs/digest-{tanggal-WIB}`.
Run gagal (kueri gagal / push gagal / tanpa VAPID) menjawab 500
+ kunci idempotency `failed` supaya pemicu cadangan (QStash
01:35) bisa mengambil alih. Sejak P-07, alert yang ada tapi nol
langganan menjawab 200 `push: "none"` dan alert ditandai pushed
— tidak ada yang perlu dikirimi ulang.

## Satu sumber kebenaran status terkirim (NOTIF-01)

Dua jalur kirim Telegram (cron langsung + watcher) berkoordinasi
lewat field `sent` di dokumen alert:

- Cron, sesudah kirim langsung berhasil, PATCH tiap alert
  `sent=true` + `sentAt`.
- Watcher hanya mengirim alert dengan `sent != true`, lalu
  menandainya `sent=true` sesudah terkirim.
- Bila penandaan cron gagal untuk sebagian alert, alert itu tetap
  `sent=false` dan watcher mengirimnya — duplikat sesekali lebih
  baik daripada alert yang hilang.

## Heartbeat & alarm kesehatan cron (OPS-01)

Tiap run yang selesai menulis dokumen `cron-runs/{tanggal-WIB}`
(koleksi `cron-runs`, id dokumen tanggal WIB) berisi status
(`ok`/`truncated`), durasi, hitungan cek/ubah/alert, `openSkipped`,
dan komposisi antrean. Dokumen ditulis lewat service account
(mengabaikan rules); tidak ada aturan publik untuk koleksi ini.

Sejak P-06, heartbeat recheck diperluas: `error` (kesalahan
pertama yang tersanitasi, maks 300 karakter), `lastPhase` +
`phaseMs` (durasi tiap fase: alerts/checks/writes/heartbeat),
`skipReason` + jejak jalur 503 awal (heartbeat `status:
"skipped"` ditulis bila token service account tersedia — alasan:
`no-secret`, `no-service-account`, `seed-only`,
`token-failed`, `lock-failed`, `load-failed`), `seedModeMinutes`
(menit berjalan dari seed saat run), `readsEstimate` +
`quotaPercent` + `quotaAlert` (`none`/`70`/`90`/`70-failed`/
`90-failed`), dan konteks push (`pushTotal`, `pushHasMore`,
`pushMalformed`). Field P-04 (`unreachable`/`blocked`/
`serverError` + `*Nos`) dan P-05 (`trigger`, `pushedMarked`,
`pushedFailed`) tidak berubah.

Sejak P-07, heartbeat recheck + digest menambah
`pushConfigError`, `pushPages`, `pushStaleKey`,
`pushUnknownKey`; heartbeat cleanup menambah
`pushCleanupExamined`, `pushCleanupMalformed`,
`pushCleanupCleaned`, `pushCleanupFailed`,
`pushCleanupHasMore`, `pushCleanupSkipped` +
`pushCleanupSkipReason` (fase pembersihan langganan malformed
dipagari flag `PUSH_MALFORMED_CLEANUP_ENABLED` — tanpa flag,
fase dilewati dan `pushCleanupSkipped: true`; lihat
`docs/runbook-rotasi-vapid.md` bagian K3).

Watcher memeriksa heartbeat tiap pagi (01:30 WIB). Sejak P-05,
toleransi keterlambatan memakai masa tenggang 15 menit sesudah
jadwal (01:00 → 01:15): watcher yang tiba sebelum akhir tenggang
dan belum menemukan heartbeat MENUNGGU sampai akhir tenggang lalu
cek ulang sekali; watcher yang tiba sebelum 01:00 melewati
pemeriksaan (run belum dijadwalkan); sesudah tenggang lewat,
heartbeat hilang langsung alarm tanpa tidur. Ini menggantikan
jeda cek-ulang 180 detik lama yang tidak cukup menoleransi
Vercel Cron yang molor 35–55 menit (C1).

| Kondisi | Tindakan watcher |
|---|---|
| Dokumen hari ini tidak ada, sesudah masa tenggang (01:15) | Kirim alarm "cron belum tercatat berjalan", sekali per hari (penanda `cron-miss-{tanggal}`) |
| Dokumen hari ini tidak ada, masih dalam masa tenggang | Tunggu sampai akhir tenggang, cek ulang sekali; alarm hanya bila tetap tidak ada |
| Watcher tiba sebelum 01:00 | Pemeriksaan dilewati (run belum dijadwalkan) |
| `openSkipped > 0` hari ini DAN kemarin | Kirim alarm "tidak sempat mengecek semua perusahaan yang ada lowongan 2 hari berturut-turut", sekali per hari (penanda `cron-truncated-{tanggal}`) |
| Dokumen ada, `openSkipped = 0` | Tidak ada pesan |
| Baca heartbeat gagal (mis. 429 kuota) | Tidak ada alarm (kegagalan baca bukan bukti cron tidak jalan); coba lagi besok |
| `status: "skipped"` (P-06) | Kirim alarm "cron dilewati" dengan `skipReason` + `error`, sekali per hari (penanda `cron-skipped-{tanggal}`) |
| `telegram: "failed"` / `"skipped-no-token"` (P-06) | Kirim alarm Telegram gagal / tanpa token, sekali per hari |
| Sinyal push bermasalah (P-06): `push` gagal, tanpa VAPID, terpotong, atau `pushFailed` tinggi | Kirim alarm push sesuai jenisnya, sekali per hari |
| `pushConfigError: true` (P-07) — kunci VAPID tidak berpasangan / ditolak 401-403 | Kirim alarm "konfigurasi push bermasalah" sekali per hari; langganan tidak dihapus, periksa pasangan kunci (runbook rotasi) |
| `pushCleanupFailed > 0` di heartbeat cleanup (P-07) | Kirim alarm "pembersihan langganan push gagal sebagian", sekali per hari |
| `alertsTruncated` / fase alert terpotong (P-06) | Kirim alarm "fase alert terpotong", sekali per hari |
| Snapshot target gagal ditulis (P-06) | Kirim alarm "snapshot gagal", sekali per hari |
| Kuota ≥ ambang tetapi tidak ada alert kuota (P-06) | Kirim alarm "alert kuota hilang", sekali per hari |
| Insiden mode seed di jam ini DAN jam sebelumnya (P-06) | Kirim alarm "mode seed > 1 jam", sekali per hari (penanda `seed-mode-1h-{tanggal}`) |

Penanda alarm ditulis di koleksi `alerts` dengan `sent=true`
sehingga tidak pernah diteruskan sebagai alert perusahaan, dan
watcher mengabaikan tipe selain `new-target` / `deadline` /
`quota` saat meneruskan.

## Heartbeat watcher (P-05, C5)

Watcher menulis heartbeat-nya sendiri ke dokumen
`meta/watcher` (`lastRunAt` + `lastRunOk`) di akhir setiap run
(best-effort; kegagalan menulis tidak menggagalkan run).
Sejak P-06, heartbeat diperluas: `readsUsed` (total baca
Firestore run itu), `alertsFound`, `alertsRelayed`, `checks`
(jumlah pemeriksaan yang dijalankan), `alarmsSent`, dan `error`
(pesan kegagalan pertama, kosong bila sukses). Hitungan baca
watcher juga dicatat ke `read-stats/{tanggal}` sumber `watcher`
(P-06/K7).
Workflow `watcher-monitor.yml` memeriksa kesegaran heartbeat
itu tiap hari 08:00 WIB (batas basi 26 jam); bila basi/hilang,
workflow gagal dan membuka GitHub issue berlabel `watcher-down`
— jalur alarm yang tidak bergantung pada Telegram maupun VM
watcher. `lastRunOk=false` pada heartbeat segar BUKAN alarm
monitor: watcher yang berjalan sudah mengabarkan masalahnya
sendiri lewat Telegram.

## Heartbeat cron cleanup (S8/C-02)

Cron cleanup (Senin 02:00 WIB) menulis heartbeatnya sendiri ke
dokumen `cron-runs/cleanup-{tanggal-WIB}` di akhir run — berhasil
(`status: "ok"`) maupun gagal (`status: "failed"`, dengan pesan
error dan hasil parsial). Isi: `job: "cleanup"`, durasi,
`deleted` total, hitungan per koleksi (`analyticsDeleted`,
`rateLimitsDeleted`, `alertsDeleted`, `changesDeleted`,
`reportsDeleted`, `auditLogsDeleted`, `cronRunsDeleted`,
`incidentsDeleted` sejak P-06), `*HasMore` per koleksi (sejak
P-06 — sebelumnya hanya `analyticsHasMore`), `phaseMs` (durasi
tiap fase, sejak P-06), dan `error` (kosong bila sukses). Id dokumen
memakai awalan `cleanup-` supaya tidak menimpa heartbeat recheck
hari yang sama (PATCH tanpa updateMask mengganti seluruh
dokumen; kedua cron jalan di pagi yang sama tiap Senin). Sejak
P-06, koleksi `incidents` ikut dibersihkan (retensi 90 hari,
maks 100/run) dan watcher memberi alarm bila cleanup dua Senin
berturut-turut melaporkan `*HasMore` (backlog retensi).

Watcher agent-side (`notify_watch.py`, v2.16.3) memantau heartbeat
ini tiap run, terhadap **Senin terakhir yang run-nya sudah
seharusnya selesai**: Senin sebelum 02:00 WIB memeriksa Senin
seminggu sebelumnya; Senin jam 02:00 ke atas memeriksa hari ini;
Selasa–Minggu memeriksa Senin terakhir (`last_cleanup_monday`).
Bila dokumen tidak ada (masa tenggang 15 menit sesudah 02:00
berlaku seperti recheck, P-05) atau `status` bukan `"ok"`,
watcher mengirim alarm sekali per Senin (penanda
`cron-cleanup-miss-{tanggal}` / `cron-cleanup-failed-{tanggal}`);
baca gagal (mis. 429) dilewati tanpa alarm, seperti recheck.
Senin sebelum 23 November 2026 tidak diperiksa: heartbeat cleanup
baru ditulis kode v2.16.3, jadi run lama tidak pernah punya
heartbeat dan "tidak ada" di sana bukan kegagalan (cutoff
`CLEANUP_HEARTBEAT_START`).

Sejak P-05, cleanup dipicu workflow `scheduled-cleanup.yml` yang
me-loop endpoint sampai tidak ada sisa (C7 — satu panggilan
~110 detik melebihi `maxDuration` 60 detik, jadi tiap panggilan
menghapus satu batch dan melaporkan `hasMore`; workflow
mengulang sampai `hasMore` false di semua koleksi, maks
12 iterasi).

## Tipe alert

| Tipe | Penulis | Isi |
|---|---|---|
| `new-target` | cron | Perusahaan yang baru ada lowongan (dibanding snapshot) |
| `deadline` | cron | Batas lamar 0–3 hari lagi; `daysLeft` dihitung ulang watcher saat kirim dari `batasLamar` (NOTIF-09), alert yang sudah lewat batas dilewati + ditandai terkirim |
| `quota` | lapisan data web (`lib/companies.js`, T15) | Pemakaian baca Firestore mencapai 70% kuota harian (35.000/50.000); satu per hari, id `quota-70-{tanggal}` |
| `cron-miss`, `cron-truncated` | watcher (penanda dedup) | Bukan alert perusahaan; tidak diteruskan |
| `cron-cleanup-miss`, `cron-cleanup-failed` | watcher (penanda dedup) | Heartbeat cleanup Senin terakhir tidak ada / run gagal; sekali per Senin; tidak diteruskan |

## Keamanan jalur cron

- `CRON_SECRET` kosong → 503, tidak pernah berjalan tanpa auth
  (fail-closed, Fase 1). Semua kegagalan konfigurasi menjawab
  satu pesan 503 generik yang sama ("konfigurasi cron belum
  lengkap"); detail spesifik hanya di log server (SEC-05).
- SSRF `checkUrl` (T6/ADM-04/SEC-10): diverifikasi T11 — guard
  W-P0-03 (Fase 1) sudah menutup semua jalur: hanya skema
  http/https, resolve DNS + tolak IP privat/loopback/link-local
  di tiap hop redirect (HEAD maupun GET manual), DNS gagal =
  fail-closed. Satu-satunya pemanggil `checkUrl` adalah route
  check-link (wajib klaim admin) dan cron recheck (URL dari
  Firestore). Tidak ada jalur cek lain di repo. Keterbatasan
  TOCTOU/DNS rebinding didokumentasikan di `lib/check.js`.
- Garam hash pengunjung (SEC-08): diperbaiki Fase 1
  (`requireEnv("ANALYTICS_SALT")`, tanpa fallback) — bukan
  bagian T11, dicatat di sini supaya tidak dicari lagi.

## Zona waktu (T11d)

Bug UTC di penanda hari halaman detail (fix WIB 15 Nov 2026
00:15) TIDAK ada di jalur alert: `todayWib()` di `lib/notify.js`
dan route cron memakai zona `Asia/Jakarta`, dan `daysUntil`
membandingkan tanggal kalender ISO (bukan milidetik). Regresi
terkunci test: pada 00:30 WIB hari tenggat, alert deadline
menyebut "hari ini" (0 hari), bukan "1 hari lagi".

## Runbook owner (pesan Telegram)

- **"Lowongan target di Karir"** — ada lowongan baru / batas
  lamar dekat. Buka tautan perusahaannya; bila batasnya hari
  ini, prioritaskan melamar.
- **"Pemakaian baca Firestore sudah 70%"** — kuota harian
  hampir habis. Situs tetap jalan dari data cadangan; data live
  berhenti diperbarui sampai reset 15:00 WIB. Tidak ada tindakan
  darurat; hindari pengecekan berulang yang memakan kuota.
- **"Cron recheck belum tercatat berjalan"** — run 01:00 WIB
  tidak selesai. Kemungkinan: kuota habis (lihat pesan kuota),
  workflow GitHub Actions tidak jalan, atau konfigurasi cron
  belum lengkap. Periksa log run di GitHub repo adiprmx/karir >
  Actions / panel admin; run besok mencoba lagi otomatis.
- **"Cron cleanup belum tercatat berjalan / tercatat gagal"** —
  run Senin 02:00 WIB tidak selesai. Periksa log workflow
  Cleanup Terjadwal di GitHub Actions; data lama dibersihkan
  pada run berikutnya.
- **Issue GitHub "Watcher Karir tidak memberi kabar"** (label
  `watcher-down`) — heartbeat watcher basi >26 jam. Periksa
  apakah `notify_watch.py` di VM masih jalan sesuai jadwal
  01:30 WIB dan apakah tulis heartbeat ke Firestore gagal.
  Tutup issue sesudah heartbeat kembali segar.
- **"Tidak sempat mengecek semua perusahaan 2 hari
  berturut-turut"** — antrean lebih besar dari anggaran. Bukan
  darurat satu hari, tapi bila berulang, antrean perlu
  dikecilkan (mis. naikkan batch atau bagi ke dua run).

## Verifikasi pasca-merge (hanya bisa live)

1. Run cron 01:00 WIB pertama pasca-deploy: dokumen
   `cron-runs/{tanggal}` ada, `heartbeatWritten: true` di log
   Vercel, ringkasan memuat `queue` + `openSkipped`.
2. Watcher 01:30 WIB: tidak ada alarm palsu bila run sehat;
   log watcher menyebut "cron {tanggal} sehat".
3. Bila ada alert baru + token Telegram terpasang: satu pesan
   terkirim, dokumen alert `sent=true`, watcher tidak mengirim
   ulang (cek tidak ada pesan ganda 01:30).
4. Bila kuota menyentuh 70%: alert `quota-70-{tanggal}` dibuat
   lapisan web, watcher meneruskannya sebagai blok kuota di
   pesan 01:30.
5. Antrean: `queue.urgent` terisi bila ada batas lamar ≤7 hari;
   `checked` per run naik dibanding batch 5 (amati 2–3 run).
