# Monitoring cron recheck & notifikasi owner

Dokumen ini menjelaskan cara kerja cron cek ulang harian, antrean
ceknya, koordinasi notifikasi Telegram, dan pemantauan kesehatan
cron. Terakhir diperbarui: 15 Nov 2026 (T11, Fase 4).

## Jadwal

| Komponen | Jadwal | Tempat |
|---|---|---|
| Cron recheck `GET /api/cron/recheck` | tiap hari 18:00 UTC (01:00 WIB) | Vercel Cron (`web/vercel.json`) |
| Watcher `notify_watch.py` | tiap hari 01:30 WIB | cron agent-side (`~/workspace/.claude-v280/`) |

Cron menulis alert ke Firestore; watcher meneruskan alert yang
belum terkirim ke Telegram owner. Bila token bot Telegram dipasang
di Vercel, cron juga mengirim langsung — lihat "Satu sumber
kebenaran status terkirim" di bawah.

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
markerBumped, heartbeatWritten}`

- `openSkipped` — perusahaan tier mendesak/terbuka yang tidak
  sempat dicek karena terpotong. Ini sinyal utama pemantauan:
  tier mati yang terpotong adalah rotasi yang disengaja, bukan
  kegagalan.
- `queue` — `{urgent, open, dead, total}`.
- `telegram` — `sent` | `failed` | `skipped-no-token` | `none`;
  `telegramMarked` — alert yang berhasil ditandai terkirim
  sesudah kirim langsung.

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

Watcher memeriksa heartbeat tiap pagi (01:30 WIB):

| Kondisi | Tindakan watcher |
|---|---|
| Dokumen hari ini tidak ada (dicek ulang sekali sesudah 180 detik) | Kirim alarm "cron belum tercatat berjalan", sekali per hari (penanda `cron-miss-{tanggal}`) |
| `openSkipped > 0` hari ini DAN kemarin | Kirim alarm "tidak sempat mengecek semua perusahaan yang ada lowongan 2 hari berturut-turut", sekali per hari (penanda `cron-truncated-{tanggal}`) |
| Dokumen ada, `openSkipped = 0` | Tidak ada pesan |
| Baca heartbeat gagal (mis. 429 kuota) | Tidak ada alarm (kegagalan baca bukan bukti cron tidak jalan); coba lagi besok |

Penanda alarm ditulis di koleksi `alerts` dengan `sent=true`
sehingga tidak pernah diteruskan sebagai alert perusahaan, dan
watcher mengabaikan tipe selain `new-target` / `deadline` /
`quota` saat meneruskan.

## Tipe alert

| Tipe | Penulis | Isi |
|---|---|---|
| `new-target` | cron | Perusahaan yang baru ada lowongan (dibanding snapshot) |
| `deadline` | cron | Batas lamar 0–3 hari lagi; `daysLeft` dihitung ulang watcher saat kirim dari `batasLamar` (NOTIF-09), alert yang sudah lewat batas dilewati + ditandai terkirim |
| `quota` | lapisan data web (`lib/companies.js`, T15) | Pemakaian baca Firestore mencapai 70% kuota harian (35.000/50.000); satu per hari, id `quota-70-{tanggal}` |
| `cron-miss`, `cron-truncated` | watcher (penanda dedup) | Bukan alert perusahaan; tidak diteruskan |

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
  Vercel Cron tidak jalan, atau konfigurasi cron belum lengkap.
  Periksa log Vercel / panel admin; run besok mencoba lagi
  otomatis.
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
