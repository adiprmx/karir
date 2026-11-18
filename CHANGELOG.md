# Changelog

Semua perubahan penting pada daftar ini dicatat di sini. Format tanggal: `YYYY-MM-DD`.

## Belum dirilis

Push digest & langganan (P-07, Fase 2 — paket terakhir Tahap 2): batas 500 langganan dihapus lewat paginasi, status pengiriman jujur, pembersihan langganan malformed terjadwal (dipagari flag), TOCTOU subscribe ditutup, dan rotasi VAPID punya prosedur + migrasi klien.

- Paginasi digest (`lib/push.js`): daftar langganan dibaca halaman demi halaman (500/halaman) tanpa batas total — simulasi 600 langganan membuktikan seluruh 600 masuk antrean kirim (2 halaman, bukti kejadian observabilitas per halaman). Kegagalan daftar di tengah paginasi menjawab `"failed"` dengan pencacah parsial supaya endpoint digest mencoba lagi; kunci VAPID tidak valid dideteksi sebelum daftar dibaca (hemat baca Firestore).
- Status jujur (P3): nol langganan dicatat `push: "none"`, bukan `"sent"` — di recheck maupun digest, dan alert ditandai pushed pada `"none"` karena tidak ada yang perlu dikirimi ulang. Heartbeat recheck + digest menambah `pushConfigError` (kunci VAPID ditolak 401/403 — langganan TIDAK dihapus), `pushPages`, `pushStaleKey`, `pushUnknownKey`.
- Pembersihan malformed (K3): fase baru di cron cleanup mingguan (Senin 02:00 WIB) dengan kriteria TERCATAT — dihapus hanya dokumen yang tidak bisa menerima push sama sekali (endpoint bukan https/valid, `p256dh`/`auth` tidak berbentuk benar); dokumen tanpa UID dan dokumen yang id-nya bukan SHA-256 endpoint sengaja dipertahankan. Batas 100 hapus / 1000 diperiksa / 30 detik per run; hasil di heartbeat (`pushCleanupExamined`/`Malformed`/`Cleaned`/`Failed`/`HasMore`/`Skipped`). Fase DIPAGARI flag `PUSH_MALFORMED_CLEANUP_ENABLED=1` — tanpa flag, dilewati; flag hanya diaktifkan sesudah cadangan `push_subscriptions` Fase B terverifikasi. Kode + tes mock saja; eksekusi live ditunda (lihat runbook).
- TOCTOU subscribe ditutup (K4): simpan memakai create atomik Firestore (`POST ?documentId=...`, satu pemenang) + klaim dokumen tanpa UID lewat CAS `updateTime` (412 = kalah balapan, baca ulang lalu putuskan lagi); dokumen tanpa UID tidak lagi terkunci 409. DELETE memakai prasyarat CAS yang sama; dokumen milik UID lain dijawab 200 tanpa hapus dan tanpa bocor. Tes konkurensi: dua subscribe bersamaan (UID sama maupun beda) menghasilkan SATU dokumen konsisten.
- Rotasi VAPID (K5): runbook lengkap di `docs/runbook-rotasi-vapid.md` (buat pasangan baru → simpan privat di Vercel + GitHub Secrets `VAPID_PRIVATE_KEY` + salinan offline pemilik → deploy kunci publik → umumkan → migrasi → verifikasi → rollback; tanpa nilai kunci di dokumen mana pun). Secret GitHub `VAPID_PRIVATE_KEY` sudah ada (dibuat 17 Nov 2026; keberadaan diverifikasi lewat API, nama saja). Tiap langganan mencatat `vapidKeyHash` (12 karakter awal SHA-256 kunci publik) supaya digest menghitung `pushStaleKey`; klien mendeteksi kunci basi (`getPushStatus` → `"stale-key"`, halaman Pengaturan menampilkan tombol "Aktifkan ulang notifikasi" → `resubscribePush`). Uji staging penuh didokumentasikan sebagai utang (tidak ada proyek Firebase staging).
- Kejadian observabilitas per halaman digest memakai level baru `"info"` (kode `PUSH_DIGEST_PAGE`) — sink Sentry + incidents kini mengabaikan level `"info"` supaya kabar rutin tidak menjadi exception/insiden.
- Tes: 1643 total node:test (59 baru P-07) + 74 pytest; lint 0 error (3 warning lama); coverage lines 91,97 / branches 87,09 / funcs 89,81 (ambang 90/87/89). Verifikasi live (digest pertama pasca-merge, satu pelanggan uji di perangkat nyata, aktivasi flag pembersihan) didokumentasikan sebagai observasi pasca-merge di `docs/observasi-pasca-merge-p07.md`.

Observabilitas & alarm (P-06, Fase 2): kegagalan penting tidak lagi diam — log terstruktur dengan dedup, insiden Firestore, endpoint kesehatan, dan alarm watcher yang diperluas.

- Log terstruktur: modul baru `lib/observability.js` — 11 kode kejadian (`OBS_CODES`), sanitasi pesan (email + kredensial URL disamarkan, pesan dipotong 500 karakter) dan metadata (kunci sensitif disamarkan, batas 10 kunci), throttle 1/menit/kode/instance untuk log konsol; sink menerima SEMUA kejadian. Ketujuh titik tanpa log di `lib/companies.js` (BE2-02) kini mencatat saat jatuh ke seed, kedelapan titik catch tanpa log (BE2-10) + kegagalan tulis cron (BE2-11) mencatat pesan + `err.message`, dan lima titik kegagalan token service account mencatat jenis kegagalannya tanpa pernah menulis `client_email`.
- Insiden Firestore: modul baru `lib/incidents.js` — satu dokumen per kode per jam WIB di koleksi `incidents` (id `{KODE}-{tanggal}-{jam}`), create lalu PATCH throttled 15 menit (count + lastSeen). Pengukur baca: modul baru `lib/read-meter.js` — hitungan baca per sumber per hari ke `read-stats/{tanggal}` lewat SATU Write batchWrite (update `updatedAt` + `updateTransforms` increment per sumber, semantik set-with-merge: membuat dokumen bila belum ada, tanpa baca dulu); laporan 14 hari di `web/scripts/read-stats-report.mjs`.
- Sentry (fail-safe tanpa DSN): paket `@sentry/nextjs` 11.14.0, init di `sentry.server.config.js` + `instrumentation.js` (hanya bila `SENTRY_DSN` terisi; tanpa DSN SDK nonaktif diam-diam), scrubber `beforeSend` menghapus data pengguna/header/cookie dan menyamarkan kunci sensitif, sink Sentry dedup 1/jam/kode. Cron monitor recheck (`karir-recheck`, 01:00 WIB) check-in `in_progress`/`ok`/`error` hanya oleh pemegang kunci — duplikat tidak check-in. Klien memakai pelapor error ringan (`app/error-reporter.js` + `POST /api/client-error`, tanpa SDK browser penuh demi anggaran bundle — lihat `docs/observability.md`). Akun Sentry belum ada: langkah pembuatannya di `docs/sentry-setup.md`, verifikasi live ditunda pasca-merge (K9).
- Endpoint kesehatan baru `GET /api/health` (0 baca Firestore, limiter memori lokal 60/menit, tanpa penolakan bot supaya monitor uptime bisa memakainya): status sumber data, mode seed (menit berjalan), estimasi baca + persen kuota, run cron terakhir, `Cache-Control` 60 detik. Riwayat harian diekspor workflow baru `export-health-history.yml` (03:00 WIB) ke `docs/status-history/`.
- Heartbeat recheck diperluas: `error` (kesalahan pertama, tersanitasi), `lastPhase` + `phaseMs`, `skipReason` + jejak jalur 503 awal (heartbeat "dilewati" ditulis bila token tersedia), `seedModeMinutes`, `readsEstimate` + `quotaPercent` + `quotaAlert`, konteks push (`pushTotal`/`pushHasMore`/`pushMalformed`). Alert kuota independen (K2): recheck memeriksa kuota tiap run dan membuat alert 70% / 90% sendiri (90% hanya membuat alert 90, tanpa duplikat 70) dengan verifikasi baca-balik. Cleanup kini meretensi `incidents` 90 hari dan mencatat `phaseMs` + `*HasMore` per koleksi.
- Aturan Firestore baru: `incidents` (create tervalidasi bentuk + id deterministik, update hanya `count` monoton + `lastSeen`), `read-stats` (id tanggal, kunci hanya `sources` + `updatedAt`, nama sumber dari daftar izin), `cron-runs` eksplisit (baca admin, tulis ditutup). Aturan baru WAJIB diterbitkan parent sebelum flush pengukur/insiden bekerja (sampai saat itu 403 dan data ukur tertahan di memori).
- Watcher agent-side (`notify_watch.py`, di luar repo): daftar alert tak terkirim kini memakai kueri berfilter `sent == false` + paginasi kursor (menutup C10/C11 — tidak lagi membaca seluruh koleksi `alerts`); alarm baru dari sinyal heartbeat (cron dilewati, Telegram gagal/tanpa token, push gagal/tanpa VAPID/terpotong/tinggi, fase alert terpotong, snapshot gagal, alert kuota hilang), alarm mode seed > 1 jam dari dokumen `incidents`, dan alarm backlog retensi dua Senin berturut-turut; heartbeat watcher diperluas (`readsUsed`, `alertsFound`, `alertsRelayed`, `checks`, `alarmsSent`, `error`) dan hitungan bacanya dicatat ke `read-stats` sumber `watcher`.
- Tes: 1584 total node:test (164 baru P-06) + 73 unittest watcher (24 baru); lint 0 error; coverage lines 91,74 / branches 87,35 / funcs 89,51 (ambang 90/87/89). Verifikasi live (Sentry, pengukuran 14 hari, alarm mode seed) didokumentasikan sebagai observasi pasca-merge.

Migrasi scheduler ke GitHub Actions (P-05, Fase 2): recheck harian, cleanup mingguan, dan digest push kini dipicu GitHub Actions (presisi hitungan menit) menggantikan Vercel Cron Hobby yang telat 35–55 menit; QStash Free sebagai pemicu cadangan; idempotency mencegah jalan-ganda.

- Empat workflow baru: `scheduled-recheck.yml` (01:00 WIB), `scheduled-digest.yml` (01:30 WIB), `scheduled-cleanup.yml` (Senin 02:00 WIB, me-loop endpoint sampai tidak ada sisa — menutup C7: job ~110 detik melebihi `maxDuration` 60 detik), dan `watcher-monitor.yml` (08:00 WIB, memeriksa heartbeat watcher dan membuka issue `watcher-down` bila basi — C5). Semua memakai `CRON_SECRET` dari GitHub Secrets; respons duplikat dianggap sukses.
- Idempotency: modul baru `lib/cron-idempotency.js` — kunci `cron-locks/{job}-{tanggal-WIB}` diambil sebelum bekerja (create atomik, TTL 3 menit dengan takeover CAS, `allowRerun` hanya untuk cleanup); pemicu duplikat menjawab 200 `{duplicate: true}` tanpa efek samping. Kunci diturunkan server-side, tidak pernah dari input pemanggil.
- Auth QStash: modul baru `lib/qstash-verify.js` (JWT HS256, `iss`/`sub`/`exp`/`nbf`/hash body, dua kunci rotasi) + `lib/cron-auth.js` (Bearer `CRON_SECRET` dulu, lalu signature QStash; tanpa secret tetap 503 fail-closed). Header `X-Karir-Trigger` hanya label pemicu (`github-actions`/`qstash`/`cron-secret`) di log dan heartbeat.
- Endpoint digest mandiri baru `GET /api/cron/digest` (`lib/cron-digest.js`): mengirim alert hari ini yang belum `pushed` (tipe `new-target`/`deadline`); recheck menandai `pushed` hanya bila digest terkirim penuh, bila tidak endpoint digest mencoba lagi. Heartbeat `cron-runs/digest-{tanggal-WIB}`.
- Watcher agent-side (`notify_watch.py`, di luar repo): toleransi keterlambatan memakai masa tenggang 15 menit sesudah jadwal (menggantikan jeda 180 detik — C1), memantau keempat workflow baru (cleanup berjendela 8 hari), dan menulis heartbeat-nya sendiri ke `meta/watcher` di akhir setiap run. Teks alarm menyebut GitHub Actions.
- Vercel Cron TIDAK dinonaktifkan di branch ini — penonaktifan adalah langkah pasca-merge terkendali sesudah tiga run Actions terbukti presisi (rencana cutover + observasi di `docs/scheduler-github-actions.md`; penyiapan QStash di `docs/qstash-setup.md`).
- Tes: 1420 total node:test (120 baru P-05) + 49 unittest watcher (10 baru); lint 0 error; coverage lines 91,59 / branches 88,11 / funcs 89,94 (ambang 90/87/89); 4 workflow YAML valid + 5 skenario loop cleanup teruji terhadap server mock. Verifikasi live (presisi 3 run, nol alarm palsu 7 hari, satu siklus penuh) didokumentasikan sebagai observasi pasca-merge.

Perbaikan cron recheck (P-04, Fase 2): cron berhenti membalik status perusahaan dari kegagalan jangkau sesaat — penyebab 26 dari 28 flip salah pada 16–17 Nov 2026 (verifikasi manual O-01).

- Portal yang tidak bisa dihubungi (`status: null` sesudah retry 1x) kini diperlakukan sebagai "tidak diketahui": status tidak diubah, tanggal cek tidak diperbarui, dihitung `skipped` + pencacah `unreachable` di heartbeat, dan pencacah `gagal_cek` perusahaan naik 1 (K-10). Portal yang menjawab 403/diblokir tidak pernah di-flip (K-11): dihitung `blocked`, nomornya masuk `blockedNos` (antrean tinjau manual) di heartbeat. Hanya 404/410 (sesudah retry) dan 5xx (two-strike 2 run berturut-turut, dibaca dari dokumen `cron-runs` kemarin) yang boleh membalik status ke "Portal tidak bisa dibuka".
- Entri `changes` dari recheck kini membawa `sumber: "recheck"` (K-10), membedakannya dari flip manusia ("admin"). `checkUrl` menghapus kredensial dari URL sebelum fetch dan membatalkan badan respons GET fallback (BE2-26). Penukaran token service account dikonsolidasikan ke satu modul `lib/service-account-token.js` dengan satu cache yang dipakai bersama semua jalur (BE2-24).
- Throughput antrean: paralelisme batch 8 → 16, timeout cek 8 → 5 detik (baseline run 18 Nov 2026 01:36 WIB: checked=48, openSkipped=185, queueTotal=317). Skrip ukur baru `web/scripts/ukur-antrean-recheck.mjs` membaca dokumen `cron-runs` dan memutus target openSkipped = 0 pada tiga run berturut-turut; pengukuran nyata ditunda ke observasi pasca-merge (kuota Firestore habis saat implementasi).
- Tes: 1300 total (49 baru P-04, termasuk regresi gagal-jangkau-lalu-pulih dan portal benar-benar mati). Lint 0 error, build sukses. Verifikasi live (tiga run tanpa flip palsu) didokumentasikan sebagai observasi pasca-merge.

Cadangan & pemulihan (P-03, Fase 2): semua koleksi Firestore tercakup cadangan, restore drill otomatis, retensi tiga koleksi baru, arsip changes bulanan, skrip impor/write-back berversi, dan ekspor Auth bulanan terenkripsi.

- Cadangan Firestore kini mencakup `cron-runs` dan `push_subscriptions` (menutup celah D2); workflow backup melaporkan ukuran artifact terhadap batas 500 MB dengan peringatan di atas 70% (D5).
- Skrip drill restore baru `web/scripts/restore-firestore.mjs`: memulihkan cadangan ke koleksi uji `restore_drill_*` (tidak pernah menulis ke produksi), memverifikasi hitungan terhadap manifest + bentuk dokumen push_subscriptions, dan membersihkan koleksi uji sesudah drill. Runbook pemulihan lengkap di `docs/PEMULIHAN.md` (Skenario 5–7).
- Retensi baru di cron cleanup: `reports` 180 hari, `audit_logs` 365 hari, `cron-runs` 90 hari (nilai INTERIM ditetapkan koordinator 18 Nov 2026, menunggu konfirmasi pemilik sebelum P-09); heartbeat cleanup mencatat hitungan hapus ketiga koleksi. Anggaran hapus per run naik dari 600 menjadi 900 — tetap jauh di bawah batas 20.000/hari.
- Arsip bulanan `changes` (D4): workflow baru `archive-changes.yml` mengarsipkan dokumen berumur >150 hari ke `data/archives/` tiap tanggal 1, sebelum cleanup menghapus dokumen berumur >180 hari.
- Skrip impor kanonis, write-back, dan token service account kini berversi di `scripts/` (menutup T11/DX-08): jalur secret lewat environment variable, tanpa nilai default yang mengarah ke mesin tertentu; dibuktikan dengan salinan bersih yang menjalankan `--help`/dry-run.
- Ekspor Firebase Auth bulanan terenkripsi (D6): skrip baru `web/scripts/export-auth.mjs` (tanpa hash kata sandi) + workflow `export-auth.yml` (enkripsi gpg AES-256, passphrase dari secret `AUTH_EXPORT_PASSPHRASE`; hanya berkas .gpg yang menjadi artifact).
- Watcher agent-side kini memantau kegagalan `backup.yml` (jendela 8 hari, karena cadangan hanya jalan mingguan) selain write-back dan validate.

## 2.17.0 — 2026-11-16

Notifikasi web push (T10, S8): pelanggan yang masuk akun bisa mengaktifkan pemberitahuan lowongan baru langsung di perangkatnya.

- Tombol "Aktifkan notifikasi" di /pengaturan (tanpa auto-prompt): izin hanya diminta dari ketukan pengguna. Status aktif/nonaktif tampil di halaman, dengan penjelasan bila belum masuk akun, browser tidak mendukung, atau izin ditolak di browser. Langganan terikat akun; tamu tetap memakai semua fitur yang ada.
- Endpoint baru `POST / DELETE /api/push/subscribe`: UID hanya dari ID token Firebase terverifikasi; bentuk langganan divalidasi server-side (endpoint https, kunci p256dh 65 byte + auth 16 byte); batas laju 5/menit per IP; satu dokumen per langganan di koleksi baru `push_subscriptions` (ID dokumen = SHA-256 endpoint, subscribe idempotent). Aturan Firestore menutup koleksi ini total untuk klien dan admin — akses hanya lewat service account.
- Digest harian: cron recheck mengirim satu notifikasi ke semua pelanggan sesudah pesan Telegram, hanya bila ada lowongan baru (paling banyak satu pesan sehari). Anggaran sendiri 10 detik, konkurensi 10, best-effort — gagal kirim tidak menggagalkan run. Langganan 410/404 dihapus otomatis; 401/403 dicatat sebagai alarm konfigurasi VAPID (langganan tidak dihapus); 429/5xx dicoba lagi besok. Ringkasan cron-runs bertambah field `push`, `pushSent`, `pushFailed`, `pushPruned`, `pushTruncated`.
- Service worker baru `public/sw.js` (hanya handler `push` + `notificationclick`, tanpa caching) dengan header `Cache-Control: max-age=0, must-revalidate` + `Service-Worker-Allowed: /`. Kunci VAPID sudah dipasang di env Vercel Production oleh Tim B1; kunci privat hanya dibaca dari env server, tidak pernah masuk repo.
- /privasi kini menyebut data langganan push (alamat push + kunci enkripsi perangkat, cara mematikan); 13 kunci i18n baru `settings.push*` (paritas id↔en). Helper Firestore server (`getAccessToken`, `firestoreFetch`, `firestoreGet`) diekstrak dari route recheck ke `lib/firestore-server.js` tanpa mengubah perilaku; dependensi baru `web-push` 4.0.0 (server saja).
- Perbaikan keamanan Blue Team (B3b): service worker membaca tag/url/date dari payload bertingkat (notifikasi beda hari tidak lagi saling menimpa) dan klik notifikasi hanya membuka URL same-origin; hapus langganan kedaluwarsa kini dihitung ke anggaran 10 detik; subscribe atas langganan milik akun lain ditolak 409; langganan browser dibatalkan bila token gagal didapat.
- Tes: 1264 total (1187 node:test + 48 pytest + 29 unittest watcher, termasuk 96 test baru T10: 48 unit lib/push.js + 28 wiring route subscribe + 12 kontrak service worker + 4 wiring recheck→push + 4 klien push). Lint 0 error, build sukses.

## 2.16.3 — 2026-11-16

Ekspor data akun lengkap + heartbeat cleanup dan pemantauan mingguan (S8).

- Endpoint baru `GET /api/akun/export`: pengguna yang masuk akun bisa mengunduh catatan kunjungannya (maks 500 event; tanpa indeks komposit baru, query equality UID saja). Tombol unduh di /pengaturan menggabungkan event itu ke berkas ekspor. Tanpa token → 401; batas laju 5/menit per IP.
- Ekspor di perangkat baru tidak lagi parsial diam-diam: unduhan menunggu sinkron akun selesai (maks 15 detik), dan bila sinkron belum selesai, berkas tetap dibuat dengan catatan penjelasan + peringatan di halaman.
- Halaman /privasi kini menyebut hak mengunduh salinan data (tautan ke /pengaturan); tanggal kebijakan dimajukan ke 16 November 2026.
- Cron cleanup (Senin 02:00 WIB) kini menulis heartbeat `cron-runs/cleanup-{tanggal}` di akhir run (sukses maupun gagal, dengan hasil parsial) dan memakai `maxDuration = 60`; watcher agent-side memantau heartbeat itu tiap run terhadap Senin terakhir (alarm sekali per Senin bila tidak ada atau gagal; Senin sebelum 23 Nov 2026 tidak diperiksa karena run lama memakai kode tanpa heartbeat).
- Perbaikan pembersihan: penghitung sisa (`hasMore`) tidak lagi salah lapor saat jumlah tepat di batas, dan balasan gagal retensi kini menyertakan hasil yang sempat selesai.
- Tes: 1168 total (1091 node:test + 48 pytest + 29 unittest watcher, termasuk 8 test baru logika tanggal Senin dan pemeriksaan cleanup).

## 2.16.2 — 2026-11-15

Perbaikan footer halaman pendek di HP yang tertutup bilah navigasi bawah.

- Footer halaman pendek di HP tidak lagi tertutup bilah navigasi bawah: /admin dan /mulai kini menampilkan footer secara utuh, dan perbaikan yang sama berlaku untuk semua halaman pendek lainnya.
- Akar masalah: bilah bawah tingginya 67px (66px + garis batas 1px) tetapi ruang bawah halaman hanya 66px; `main` halaman pendek juga terlalu pendek sehingga footer menjulur ke belakang bilah. Perbaikan: variabel `--tabbar` (67px) dipakai untuk ruang bawah halaman dan posisi toast, dan `main` di HP memakai `min-height: calc(100dvh - var(--bar))` sehingga tepi atas footer selalu jatuh di bawah lipatan viewport. Desktop tidak berubah.

## 2.16.1 — 2026-11-15

Perbaikan tombol Salin kanal lain + dua perbaikan tampilan.

- Tombol "Salin" kini muncul untuk kanal "Cara lain melamar" di halaman perusahaan: satu tombol per tautan (formulir/lainnya); bila kanalnya teks tanpa tautan, tombol menyalin seluruh teks.
- Spasi teks penghitung hasil di halaman /cari diperbaiki.
- Tampilan label "Tampilkan kata sandi" di halaman masuk admin diperbaiki; perbaikan yang sama berlaku untuk checkbox di /pengaturan.

## 2.16.0 — 2026-11-15

Poles Fase 5 (125 temuan P2) + terapan kanal baris lama (HUNT-10) + pengujian menyeluruh (T16). Satu bump konsolidasi untuk seluruh Fase 5, tanpa bump per batch.

- Poles: dokumen produk dan pemulihan data, lisensi, template kontribusi; panel admin dipecah dari 2476 menjadi 884 baris (+11 modul); header keamanan dan gerbang API; shell/PWA (noindex /lamaran + /mulai, pemulihan global, kartu pasang); data dan validator (catatan 421 baris, dokumen perusahaan 406 → 610 entri); dasbor dan pelacak (ubin bertaut, persentase, sinkron batch, status "Diterima"); kuota dan retensi (pembersihan 4 koleksi, /api/index terpangkas 13 → 8 field); berbagi dan throttle laporan; beranda (foto lokal, satu pemuatan perubahan, penanganan error).
- Copy dan bahasa: 207 kunci i18n baru, laporan masalah 3 jenis, 4 halaman info hanya bahasa Indonesia saat locale=en, lisensi CC BY 4.0 di Tentang; SEO (canonical per halaman, JSON-LD, /feed.xml); admin dan akun (timeout cek tautan 20 dtk, lupa kata sandi, muat bertahap per 200, pengukur kekuatan kata sandi); DevOps/CI (cadangan Firestore mingguan, smoke tanpa SKIP, tag versi otomatis, .env.example 17 variabel).
- Kunci i18n dibersihkan 435 → 391 (44 kunci mati dihapus, paritas id↔en 0 selisih); peta kini menjelaskan saat memuat dan saat kosong; canonical ditambahkan untuk /dukungan, /privasi, /syarat.
- Data (W2d/HUNT-10): kanal baru Pertamina (email rekrutmen resmi + Instagram @pertaminacareer, status tetap) dan Guardian (formulir Store Crew Festive Nataru-Lebaran, status → Ada lowongan); cek ulang langsung Angkasa Pura Supports — TRAIN ATTENDANT masih buka sampai 18 Nov 2026 (batas_lamar diperbarui). Total 639 perusahaan, 301 ada lowongan.
- Tes (T16): 243 test baru — 1039 node:test (796 + 243), 48 pytest untuk scripts/validate.py, 21 unittest untuk watcher notifikasi; 2 test rapuh waktu diperbaiki (parameter jam di verifyToken, gerbang janji di dedup); offset zona waktu todayJakarta dikunci (17:00Z vs 18:00Z); kontrak batas_lamar non-ISO ditegaskan (yang bisa diparse dinormalisasi, yang tidak dilewati); validate.py tidak lagi crash pada CSV kosong. Smoke kini 8 cek (+/peta, /pengaturan, /api/changes).
- Catatan: rules reports ketat (kolom `jenis` wajib) diterbitkan SETELAH deploy kode ini live (16 Nov), bukan sebelumnya — klien produksi lama belum mengirim kolom itu.

## 2.15.0 — 2026-11-15

Aksesibilitas (T13, Fase 4): manajemen fokus, ketahanan tanpa JavaScript, umpan balik pembaca layar, kontras, dan target sentuh.

- Fokus: template memindahkan fokus ke h1 halaman saat rute berubah (bukan muat pertama); Sheet di-portal ke body dengan jebakan fokus, latar inert, dan pemulihan fokus ke pemicu.
- Tanpa JavaScript: /cari me-render hasil awal di server dari query URL (runSearch yang sama, mode S5 + filter kota); formulir GET asli + tombol Cari noscript; pesan jujur di /lamaran, /mulai, /pengaturan; konten .reveal tampil secara default (kelas .js hanya ditambah JS saat mount).
- Pembaca layar: live region peta dipindah ke h2 kota; toast ganti status lamaran; role status/alert pada pesan akun, laporan, admin, dan skeleton muat; label di semua isian akun + admin (16 kontrol); keterangan tab baru di semua tautan target _blank; lang="id" pada blok Indonesia kode-keras; h2 sr-only "Hasil pencarian" di /cari.
- Sentuh + kontras: target sentuh 44px (.btn.small, .icon-btn, .chip-btn, .locale a, .foot-links a); border --line-strong 3,31-3,76:1 (target 3:1); placeholder memakai --muted penuh (6,59:1 terang, 7,06:1 gelap).
- Topbar HP: saklar bahasa disembunyikan di bawah 900px (ada di Menu) + overflow-x clip; aritmetika 360px sekitar 265px dalam ruang 328px — perlu konfirmasi visual.
- Pola ARIA: tab Lamaran + radiogroup pelacak lengkap (roving tabindex, panah/Home/End); strip foto bisa difokus keyboard; peta role region, marker 40px berlabel, flyTo menghormati reduced-motion, zoom Leaflet 40px.
- Tes: 544 lolos (523 + 21 a11y baru). Build sukses; lint 0 error.

## 2.14.0 — 2026-11-15

Susulan analitik (T1-followup): UID terverifikasi di event, agregasi admin, pengirim event baru, opt-out, dan cek angka README.

- Analitik: event kini membawa UID terverifikasi dari ID token Firebase (route membaca idToken dari body atau header; token tidak valid → tamu, bukan 400); klien mengambil token malas saat masuk; `verifyAdminToken` kini wrapper di atas verifier umum `verifyIdToken` (kontrak requireAdmin tidak berubah).
- Panel admin: agregasi pengunjung baru — klik portal per perusahaan + kanal (portal/WA/email), filter yang dipakai, pencarian tanpa hasil; definisi "serius" disamakan (cari + detail + tandai/klik lamar) dengan penyebut kunjungan unik harian; `eventDay` menangani Timestamp Firestore.
- Pengirim event: onboarding selesai/dilewati, laporan tautan mati terkirim, salin kanal WA/email (tombol "Salin" baru per kanal di halaman detail, label dua bahasa).
- Privasi: toggle "Jangan catat kunjungan saya" di /pengaturan (sengaja tidak ikut "Hapus semua data"); /privasi menjelaskan jenis event, penyamaran email/telepon di kata pencarian, dan cara menolak.
- Filter analitik kini mencakup kota (`kota:Z` di string filter, agregasi menghitungnya otomatis).
- DOK-01: `check-consistency.py` kini menegaskan 14 angka README terhadap CSV (total, status, tanpa tautan + nomor perusahaan) dan gagal bila tidak cocok; CI memicu saat README berubah.

## 2.13.0 — 2026-11-15

Pencarian (T2, Fase 4 gelombang 3): mode nama tidak lagi membajak kata peran, filter kota, dan tombol bagikan.

- Pencarian: kata peran umum (mis. "gudang") tidak pernah lagi memicu mode nama — "gudang" kini menampilkan 59 kecocokan peran; kata kunci nama asli menampilkan kedua kelompok berlabel ("Perusahaan" lalu "Lowongan"); 15 kata peran satu kata ditambahkan ke daftar sinonim.
- Filter kota di /cari (dropdown sidebar + Sheet HP, `?kota=` di URL, chip aktif, validasi nilai URL); API `/api/companies` menerima `kota` + mengembalikan hitungan `groups` per kelompok; pra-filter `q` kini per-field (`matchesFreeText`, CARI-05).
- Tombol "Bagikan hasil ini" di /cari (berbagi sistem atau salin tautan).
- Analitik: event `search` membawa jumlah hasil, event `filter` membawa string `kategori:X|status:Y`.
- Copy: "carianmu" → "pencarianmu"; hint kosong diluruskan (filter, bukan kata kunci, yang mengosongkan hasil).
- Tes: 510 lolos, 0 gagal. Build sukses; lint 0 error.

## 2.12.0 — 2026-11-15

Fase 4 gelombang 3 hasil audit full-stack 32 tim: analitik, ketahanan baca, gerbang rute, kualitas data, dokumen, dan notifikasi.

- Analitik: 9 jenis event (`pageview`, `search`, `detail`, `portal_click`, `tracker_mark`, `filter`, `onboarding`, `report`, `channel_copy`) dengan field `results` + `filter` di skema; aturan Firestore menutup penulisan event dari klien total — hanya server yang menulis lewat token service account; event lama dihapus otomatis (retensi 90 hari, maks 200 per run, cron mingguan Senin 02:00 WIB); pengunjung bisa menolak pencatatan (`karir-tanpa-analitik`); nomor perusahaan di `portal_click` kini angka; pageview `/admin` tidak dicatat. Pipa masih menunggu `ANALYTICS_SALT` di Vercel Production.
- Ketahanan baca: semua pembacaan body JSON server kini bertimeout (`jsonWithTimeout`, 5 detik) — timeout jatuh ke seed/cache basi, bukan 503; pembacaan izin + indeks di browser bertimeout 15 detik; batas laju dan cek ulang memakai timeout yang sama untuk body JSON.
- Gerbang rute: tiap rute baca punya ember batas laju sendiri (7 cakupan: analytics 30, changes/companies/company/stats/token 60, index 30 per menit); `/api/changes` menolak user agent otomatis + menjawab `{changes, degraded}` saat umpan tidak bisa dimuat; `/api/token` menjawab `{token, expiresIn: 60}` + batas laju 60/menit; `/api/companies/[no]` memakai limiter bersama; `/api/admin/check-link` memakai `detail` (bukan `error`) di respons 200; pesan 429 analitik diseragamkan; `/api/locale` menolak redirect ke luar situs (`safeNext`).
- Kualitas data: 18 kota baru di peta (terpetakan 216 dari 288 perusahaan yang ada lowongan); validator data memakai pola ratchet (angka masalah hanya boleh turun dari baseline 15 November 2026); impor Firestore kini 13 field; write-back harian Firestore ke CSV (cron 03:00 WIB) + watchdog di cek konsistensi; panel admin: field `batas_lamar` + perbaikan bug simpan yang menghapus kanal (kini `merge: true`).
- Notifikasi + cron: antrean cek ulang tiga tier (mendesak batas lamar 0–7 hari, terbuka rotasi tanggal cek tertua, mati bergilir), batch 8, fase alert jalan dulu (anggaran 15 detik); heartbeat run di `cron-runs/{tanggal-WIB}` + alarm run terlewat; alert yang terkirim ditandai `sent` + `sentAt`; pesan Telegram panjang dipecah; relay alert kuota.
- Dokumen: angka di README/arsitektur/metode/roadmap diselaraskan data (76 tanpa tautan, 72 punya kanal lain, 4 tanpa kanal); `docs/API.md` ditulis ulang mengikuti kode (kontrak balasan, 7 ember batas laju, 10 koleksi, antrean 3 tier, route cleanup); tanggal hardcode 4–5 November dihilangkan dari dasbor/tentang (dihitung dari data); klaim privasi soal pencarian anonim diluruskan; panel admin kini memakai komponen laporan tautan mati (filter + ubah status).
- Tes: 486 lolos, 0 gagal. Build sukses; lint 0 error.

## 2.11.0 — 2026-11-15

Fase 4 gelombang 2 hasil audit full-stack 32 tim: sinkron pelacak, siklus hidup akun, dukungan, SEO, onboarding, produk, dan CI.

- Pelacak lamaran: perubahan tersimpan ke akun dalam hitungan detik (push-on-change, debounce 800 md); sinkron otomatis saat kembali online atau kembali fokus, plus tombol manual; status sinkron jujur di halaman Lamaran (`tamu`/`sinkron`/`mengirim`/`tertunda` + waktu terakhir sinkron); data tiap akun terpisah di perangkat bersama (kunci per akun + tombstone per akun, tawaran gabung data tamu); tombol hapus di halaman perusahaan kini ikut menghapus dari akun; perbaikan bug penghitung sinkron (`Object.keys` pada `Map` selalu 0).
- Akun: tombol masuk Google yang mati dihapus (provider tidak aktif di Firebase Auth); lupa kata sandi; verifikasi email saat daftar + kirim ulang + periksa lagi; "Hapus semua data" kini membersihkan kunci semua akun di perangkat ini dan tanda lamaran di akun (integrasi koordinator: tombstone per akun + urutan hapus yang benar); unduh salinan data (JSON, dibuat di perangkat); penjelasan nomor pengunjung `karir-visitor`; panduan tutup akun lewat GitHub Issues (hapus akun ujung-ke-ujung butuh route server Admin SDK — belum dibangun).
- Dukungan: halaman `/dukungan` baru (lapor tautan mati, koreksi data, usulan perusahaan, lowongan mencurigakan, tanpa janji waktu respons); jawaban FAQ soal laporan diluruskan + 2 tanya baru; tautan footer + sitemap; `config.yml` tidak lagi mengarah ke Discussions yang tidak aktif; komponen seksi laporan admin siap (`support-reports.js`, filter + status baru/ditangani) — wiring ke panel admin dan aturan Firestore-nya menyusul bersama T8/T1.
- SEO: `robots.txt` melarang `/api/` + `/admin`; `/admin` + `/pengaturan` memakai meta noindex; sitemap tanpa `/lamaran` + `/pengaturan`, `lastModified` dinamis dari tanggal cek terbaru, plus `/dukungan`; favicon + kartu Twitter besar; judul ganda diperbaiki (`Cari - Karir — Karir` menjadi `Cari — Karir`).
- Onboarding: definisi "pilihan tersimpan" disatukan — dasbor kini benar untuk pilihan sebagian (domisili saja atau posisi saja, tanpa kata gantung); baris status sinkron di "Lamaran saya"; lede `/mulai` menjelaskan apa yang Karir lakukan.
- Detail perusahaan: email/WA HRD ganda dipecah jadi satu tautan per nilai; `kontak_lain`/`catatan` kini jadi tautan yang bisa diklik (URL/email/domain, tanpa HTML mentah); status portal-mati tampil peringatan + tombol "Tetap coba buka portal" (akses tetap ada); halaman perusahaan yang tidak ada kini 404 nyata (akar soft 404: `loading.js` rute detail membuat Next.js mengirim shell 200 sebelum `notFound()` jalan — file itu dihapus, skeleton loading detail ikut hilang).
- Produk dan dokumen: template issue usulan perusahaan; dokumen riset pengguna (6 hipotesis berlabel asumsi, tanpa angka karangan) + komunitas (keputusan S9: Discussions ditahan); proses investigasi sinyal penipuan + syarat masuk daftar di `docs/TRUST-SAFETY.md` (aturan WASPADA tidak berubah); dokumen dukungan internal + CI.
- Node dipin ke 24.x (`engines` + `.nvmrc` + CI); CI kini memverifikasi jalur data dari seed (beranda + detail dari seed, total/nama dibaca dari seed saat run); `package-lock.json` disinkronkan ke versi proyek.

## 2.10.0 — 2026-11-15

Perbaikan menyeluruh hasil audit full-stack 32 tim: keamanan, kebenaran data, dan kejujuran klaim produk.

- Keamanan: peran admin nyata (klaim `admin` Firebase); profil hanya bisa dibaca pemilik atau admin; panel admin digerbang klaim admin; `/api/admin/check-link` kini wajib token admin + pelindung SSRF (tolak URL privat/localhost, validasi tiap hop redirect); rahasia fallback dihapus — API menjawab 503 bila `API_TOKEN_SECRET`/`CRON_SECRET` belum dipasang, dan cron tidak lagi fail-open.
- Pelacak lamaran: penghapusan kini bertahan — menghapus di satu perangkat ikut menghapus di akun (tombstone + propagasi hapus); klaim "tersimpan di browser saja" diluruskan.
- Peta: pemetaan kota memakai kata utuh + negasi (Fore Coffee tidak lagi salah petakan di Depok; 4 positif palsu dicabut).
- Data: kolom baru `batas_lamar` di CSV + seed (17 nilai), tampil di halaman detail dengan penanda hari (WIB); impor kanonis 13 field (`import_canonical.py`, updateMask lengkap); cek konsistensi CSV vs seed (+ vs live di main) di CI; standar verifikasi 3 tingkatan bukti tertulis di `docs/METODE.md`.
- Kepercayaan: klaim "tanpa akun" diluruskan di semua halaman dan dokumen; Kebijakan Privasi (`/privasi`) + Syarat Penggunaan (`/syarat`) baru, ditaut di footer; peringatan penipuan di halaman detail, FAQ, dan Metode + dokumen `docs/TRUST-SAFETY.md` (aturan label WASPADA).
- Tes: 241 lolos, 0 gagal. Build sukses; lint 0 error.

## 2.8.2 — 2026-11-08

Notifikasi lowongan target dan batas laju API yang dibagikan.

- Cron cek ulang harian kini membandingkan daftar target dengan snapshot run sebelumnya (dokumen `meta/targets`): nomor target yang baru muncul dicatat sebagai alert `new-target`, dan perusahaan target yang batas lamarnya 0-3 hari lagi dicatat sebagai alert `deadline` di koleksi `alerts`.
- Satu pesan Telegram gabungan dikirim per run bila ada alert baru; kegagalan kirim tidak menggagalkan cron. Balasan cron bertambah field `alerts` dan `telegram`.
- Kolom baru `batas_lamar` ("YYYY-MM-DD", opsional) di dokumen `companies`, diisi lewat skrip operasional di luar repo; aturan Firestore memvalidasinya sebagai string bila ada.
- Chip "Baru" di umpan Yang berubah, daftar target, dan kartu perusahaan untuk perubahan dalam 48 jam terakhir.
- Batas laju API pindah ke limiter bersama (`lib/rate-limit.js`): urutan store Redis REST Upstash, Firestore, lalu memori; dipakai `/api/index`, `/api/companies`, `/api/stats`, dan `/api/analytics`. `getClientIp` diperbaiki: `x-real-ip` dulu, lalu elemen terakhir `x-forwarded-for`.
- Status jujur: Vercel KV belum terpasang karena pembuatan via API gagal saat jaringan egress mati; store yang aktif sementara adalah Firestore. Web push (FCM) ditunda; Telegram dan chip "Baru" sudah mencakup kebutuhan.
- Tes: 121 lolos, 0 gagal (82 lama + 23 rate-limit + 16 notify). Build sukses; lint 0 error, 2 warning lama.

## 2.8.1 — 2026-11-07

Cek ulang 22 perusahaan target di portal resmi masing-masing.

- Super Indo (115): Ada lowongan target → Tidak ada lowongan target (DC Staff Gudang Cikarang tidak lagi terlihat; Staff Gudang hanya di Bawen dan Jawa Timur).
- Novell (212): Ada lowongan target → Tidak ada lowongan terlihat (HELPER/WAREHOUSE STAFF tidak terlihat di portal maupun kanal resmi terbaru).
- Apotek K-24 (230): Ada lowongan target → Portal tidak bisa dibuka (pengambilan halaman gagal total).
- ISS Indonesia (240): Ada lowongan target → Tidak dapat diverifikasi (portal hanya menampilkan kerangka SunFish; daftar lowongan tidak terbaca).
- Ganesha Operation (246): Ada lowongan target → Tidak dapat diverifikasi (halaman tertahan di "Loading..."; daftar lowongan tidak terbaca).
- Pintarnya (266): Ada lowongan target → Tidak ada lowongan terlihat (peran lama tidak tampak di antara 7 lowongan di beranda; beranda hanya sampel).
- Lion Air Group (277): Ada lowongan target → Portal tidak bisa dibuka (permintaan ditolak).
- Hermina Hospitals (287): Ada lowongan target → Ada lowongan target (tidak cocok) (Gudang Umum masih ada, tetapi syarat D3).
- Shopee Indonesia / SPX Express (293): Ada lowongan target → Tidak dapat diverifikasi (daftar lowongan dirender JavaScript dan tidak terbaca; tiga detail lowongan dari pencarian kedaluwarsa).
- Angkasa Pura Supports (299): tetap Ada lowongan target (CLEANING SERVICE batas 10 Nov 2026, TRAIN ATTENDANT batas 18 Nov 2026; CHIEF SECURITY GUARD muncul, SEKRETARIS tidak lagi tampil).
- BASF (301): Ada lowongan target → Tidak ada lowongan terlihat (halaman karir resmi tidak menampilkan daftar lowongan).
- OCS Group Indonesia (364): Ada lowongan target → Tidak dapat diverifikasi (portal hanya menampilkan splash lisensi SunFish; daftar lowongan tidak terbaca).
- Accor (376): Ada lowongan target → Ada lowongan target (tidak cocok) (Receiving & Storekeeper masih ada, tetapi syarat Diploma + pengalaman 1 tahun; Storekeeper baru di Mercure Gatot Subroto juga tidak cocok).
- PT Dexa Medica (386): Ada lowongan target → Tidak dapat diverifikasi (portal tidak berhasil dibaca).
- Tetap Ada lowongan target: Yamaha (150), EY (162), Roti O (190), Richeese Factory (200), MR DIY (235), Staffinc (263), Fore Coffee (330), Ranch Market (342).
- Hitungan baru 406 kanal: 9 Ada lowongan target, 7 tidak cocok, 153 Tidak ada lowongan target, 80 Tidak ada lowongan terlihat, 89 Tidak dapat diverifikasi, 68 Portal tidak bisa dibuka.

## 2.8.0 — 2026-11-07

Rancang ulang tampilan dan pengalaman dari nol.

- Kerangka baru: tab bawah di HP, tema terang/gelap, huruf Plus Jakarta Sans lokal, stempel status sebagai motif.
- Beranda: 406 kotak kanal yang menyala sesuai pencarian; hasil teratas langsung muncul.
- Cari: urutan dihitung di browser dari `/api/index`; animasi FLIP; filter di panel bawah.
- Detail, Lamaran, Peta, Mulai, Dasbor, Pengaturan dirancang ulang. Firebase di halaman detail dimuat malas (First Load JS 290 kB ke 111 kB).
- `lib/search.js`: kata kunci 1-2 huruf hanya cocok sebagai kata utuh.
- Dihapus: `photo-strip.js`, `recent-chip.js`, `cari/recent-saver.js`, `locale-toggle.js` (diganti `site-nav.js`).

## 2.7.0 — 2026-11-06

Rombakan tampilan: halaman bergerak dan tersusun.

- Tiap seksi muncul pelan saat di-scroll (IntersectionObserver, hormati prefers-reduced-motion); angka CountUp baru naik saat terlihat.
- Header menempel saat scroll; navigasi HP jadi satu baris horizontal yang bisa digeser (header tetap hitam sesuai design lock).
- Seksi Angka data dihapus — angkanya sudah ada di trust strip.
- Daftar 22 target: chip filter per kelompok (Gudang 7, Toko 5, Cleaning 4, Produksi 3, Lainnya 3) dan baris dua baris (nama di atas, posisi dan lokasi di bawah) supaya tidak terpotong di HP.
- Foto membesar sedikit saat disentuh; tombol dan baris merespons sentuhan; dropdown pencarian dan FAQ membuka dengan animasi.

## 2.6.0 — 2026-11-06

Karir Hidup: data dicek ulang sendiri tiap hari, dan tampilannya memakai visual asli.

- Cron Vercel mengecek ulang 22 portal target tiap jam 01:00 WIB; portal yang tadinya hidup terus mati dicatat ke umpan Yang berubah, portal mati yang hidup lagi jadi "Tidak dapat diverifikasi" sampai dicek ulang manusia.
- Umpan Yang berubah di Beranda (koleksi `changes`, API /api/changes); cek massal admin ikut mencatat perubahan yang sama.
- Logo asli tiap perusahaan dari domain resminya (layanan favicon Google) di daftar target dan halaman detail; bila favicon gagal, logonya hilang rapi.
- Tiga foto asli di Beranda (gudang, produksi, cleaning), tampil hitam-putih; semua URL foto dan favicon diverifikasi langsung sebelum dipakai.
- Cap "Terakhir dicek ulang" di Beranda dan Dasbor, dengan penanda Segar (dalam 7 hari) atau Sudah lama.
- Versi 2.5.0 tidak dirilis terpisah; isinya ikut rilis ini.

## 2.5.0 — 2026-11-06

Temuan riset alur web besar diterapkan ke Karir.

- Landing nambah seksi Masalah dan hasil setelah angka kepercayaan: kanal karir berserakan dan lowongan copas lawan 406 kanal resmi yang dicek langsung di browser.
- Pencarian terakhir: tersimpan di browser saja, chip "Terakhir" di Beranda, tersimpan juga saat mencari dari /cari, dan baris yang sama di Dasbor.
- Pengaturan di /pengaturan: pilihan onboarding, lamaran yang dilacak, dan pencarian terakhir — masing-masing bisa dihapus, atau hapus semuanya sekaligus.
- Dasbor: keadaan "Semua langkah selesai" kalau ketiga langkah berikutnya sudah beres; halaman Metode menandai dirinya sudah dibaca.
- FAQ sekarang bisa dicari lewat kolom pencarian.
- Sitemap 417 URL (11 halaman + 406 perusahaan).

## 2.4.0 — 2026-11-06

Landing page, onboarding, dan dasbor pribadi — alur pengguna lengkap.

- Beranda jadi landing page: angka kepercayaan (406 dicek, 22 target, 5 tidak cocok, 66 portal mati), cara kerja 3 langkah, fitur (Cari, Lacak lamaran, Peta lowongan), cuplikan FAQ, dan penutup dengan tombol Mulai.
- Onboarding di /mulai: isi domisili dan posisi, langsung diarahkan ke hasil yang cocok; tersimpan di browser saja.
- Dasbor jadi ruang kerja pribadi: sapaan sesuai pilihan onboarding, langkah berikutnya, ringkasan lamaran, lalu donat dan daftar seperti sebelumnya.
- Tombol Mulai di header dan tautan Mulai di footer. Alur pengguna tertulis di PRODUCT.md.
- Sitemap 416 URL (10 halaman + 406 perusahaan).

## 2.3.0 — 2026-11-06

Aplikasi web dilengkapi jadi alat berburu kerja yang lengkap.

- Lamaran Saya: lacak lamaran (Ditandai, Sudah dilamar, Dipanggil, Ditolak, lengkap tanggal dan catatan), tersimpan di browser, ringkasan jumlah per status di /lamaran.
- Peta lowongan: 22 perusahaan target di peta, titik per kota dengan jumlah, klik untuk melihat daftarnya.
- Bagikan daftar 22 target lewat WhatsApp dan cetak daftar target (gaya cetak sendiri, tanpa header dan tombol).
- Pencarian langsung bisa dipilih dengan panah keyboard (Atas/Bawah, Enter, Escape).
- Gambar pratinjau (OG) dinamis per perusahaan, dibuat dengan next/og.
- Pencarian mengerti sinonim peran (cleaner menemukan Cleaning Service, warehouse menemukan Staff Gudang); pencocokan nama perusahaan tetap memakai kata yang diketik.
- Admin: cek massal 22 tautan target satu per satu dengan progres (jeda 6,5 detik antar panggilan karena batas 10 permintaan per menit).
- Sitemap bertambah jadi 415 URL (9 halaman + 406 perusahaan).

## 2.2.0 — 2026-11-06

Aplikasi web dibuat lebih hidup, lebih visual, dan lebih rapi.

- Pencarian langsung di Beranda: ketik domisili dan posisi, 6 hasil teratas muncul di bawah kolom tanpa pindah halaman (Enter tetap mengirim ke halaman Cari).
- Angka naik saat halaman muncul, grafik donat dan bar tumbuh, titik hijau berdenyut untuk lowongan target, ikon garis per kategori, dan satu animasi masuk yang halus per seksi. Semua gerak mati bila pengguna memakai prefers-reduced-motion.
- Dasbor dirombak jadi visual: donat sebaran status, bar animasi kategori terbanyak, angka besar yang naik, dan daftar lowongan target dengan ikon dan titik status.
- Copy dipangkas: lede Beranda jadi satu kalimat, langkah cara kerja masing-masing maksimal 6 kata, Tentang memakai angka besar, Metode memakai legenda status dengan jumlah asli, FAQ jadi lipat-buka.
- Detail perusahaan dan Cari: ikon kategori dan titik status di tiap baris, animasi masuk, kerapian blok di HP.
- Ketahanan build: halaman yang butuh data di-render saat request, bukan saat build, dan hitungan di header tidak menggagalkan build bila Firestore tidak bisa dijangkau dari mesin build. PRODUCT.md diperbarui karena masih menyebut aplikasi statis.

## 2.1.0 — 2026-11-06

Aplikasi web dilengkapi jadi produk yang lebih serius.

- Halaman detail per perusahaan (`/perusahaan/[no]`): tautan portal, lokasi, posisi tercatat, catatan cek, perusahaan sejenis, tombol bagikan (salin tautan dan WhatsApp), form laporkan tautan mati, metadata dan JSON-LD per halaman. Perusahaan yang tidak ada mengembalikan 404.
- Halaman isi: Tentang, Metode, FAQ, dan Perubahan (riwayat versi). Sitemap otomatis (413 URL) dan robots. Manifest web agar situs bisa dipasang sebagai aplikasi.
- API baru: `GET /api/companies/[no]`, `GET /api/stats`, pencarian bebas `q`, paginasi `offset`, dan `POST /api/admin/check-link` untuk mengecek tautan karir sebuah perusahaan (URL hanya dari data tersimpan, ada timeout 10 detik dan batas laju).
- Admin panel ditingkatkan: tabel dengan cari, saring status, urutan, dan paginasi 20 baris; panel kualitas data (tanpa tautan, tanpa lokasi, tanggal cek lebih dari 30 hari); impor CSV (validasi per baris, maks 100 baris) dan ekspor CSV/JSON; jejak perubahan di koleksi `audit_logs`; daftar laporan tautan mati dari koleksi `reports`; tombol cek tautan dan perbarui tanggal cek.
- Antarmuka dua bahasa (Indonesia dan Inggris) lewat saklar ID/EN di header, tersimpan di cookie. Data perusahaan tetap Bahasa Indonesia.
- Aturan Firestore diperketat dan diterbitkan: tulis `companies` hanya untuk pengguna login dan hanya bila dokumen lolos validasi (9 kolom wajib, nomor angka, status salah satu dari 6 nilai); `audit_logs` hanya bisa dibaca dan dibuat admin; `reports` bisa dibuat siapa pun dalam bentuk yang divalidasi, tidak bisa dibaca publik.
- Perbaikan keandalan: semua pengambilan data dari Firestore memakai timeout 10 detik, supaya rute jaringan yang mati membuat halaman menampilkan error dengan jelas, bukan menggantung. Halaman 404 dipindahkan dari loading root karena loading root membuat status halaman tidak ditemukan jadi 200. Header di HP kini membungkus rapi tanpa meluber (terukur: lebar gulir sama dengan lebar layar di 360 piksel dan 1280 piksel).

## 2.0.0 — 2026-11-06

Aplikasi web dibangun ulang jadi full stack.

- Next.js 15 dengan React 19 di Vercel (https://karir-adiprmx.vercel.app/), tiga layar yang sama: Beranda, Cari, Dasbor.
- Database Firebase Firestore (proyek `karir-9d53a`, asia-southeast1, paket Spark gratis): 406 perusahaan di koleksi `companies`, diimpor dari CSV. Aturan: baca terbuka, tulis hanya untuk pengguna yang sudah login.
- API pencarian server `GET /api/companies`, logika skor yang sama dengan halaman Cari (posisi +50, domisili +30, terverifikasi +20, tidak cocok +10, portal mati −20, tidak terverifikasi −10). Hasilnya terverifikasi sama dengan versi sebelumnya: Bogor + Helper Gudang menempatkan Roti O di atas dengan skor 100, PGN tepat satu hasil.
- Admin panel di `/admin`: login Firebase Auth (Email/Password) untuk tambah, ubah, dan hapus perusahaan. Akun admin dibuat pemilik repo di Firebase Console.
- Supabase tidak dipakai karena akun sudah mencapai batas 2 proyek gratis yang aktif. Vercel KV tidak dipakai karena bukan database sungguhan. Versi statis lama di `docs/` (GitHub Pages) tidak lagi jadi aplikasi live.
- Data dibaca aplikasi lewat Firestore REST API, karena SDK gRPC tidak bisa menembus proxy jaringan lingkungan build.

## 1.3.0 — 2026-11-06

Aplikasi web dirombak total jadi tiga layar dengan konsep yang jelas.

- Beranda: pencarian langsung di depan, contoh pencarian yang bisa diketuk, strip angka data, rel 22 lowongan target yang terverifikasi, dan cara kerja dalam tiga langkah.
- Cari: pencarian lengkap dengan filter kategori, status, dan urutan.
- Dasbor: sebaran status, kategori terbanyak, daftar 22 lowongan target, kanal yang perlu dicek ulang, dan kesegaran data — semua angka dihitung langsung dari data.
- Navigasi antar layar lewat tautan `#/beranda`, `#/cari`, `#/dasbor` yang bisa dibagikan.
- Perbaikan tampilan HP: kartu hasil tidak lagi meluber ke samping; kartu rel lowongan tidak lagi meregang kosong.

## 1.2.0 — 2026-11-05

Repo dirombak total dari daftar gudang Bogor menjadi alat cari loker untuk semua orang.

- Aplikasi web baru di `docs/`: cari berdasarkan domisili dan posisi atau perusahaan, dengan rekomendasi berdasarkan skor (posisi cocok +50, domisili cocok +30, lowongan terverifikasi +20, syarat tidak cocok +10, portal tidak bisa dibuka −20, tidak dapat diverifikasi −10). Berjalan tanpa server dan tanpa layanan pihak ketiga. Diterbitkan lewat GitHub Pages dari folder `docs/`.
- Aturan kejujuran aplikasi: kalimat penyangkalan di data tidak dihitung sebagai kecocokan; peran yang tidak cocok tetap tampil sebagai rekomendasi kanal dengan label belum terverifikasi; pencarian nama perusahaan hanya menampilkan perusahaan itu.
- PGN masuk sebagai No. 406 (PT Perusahaan Gas Negara Tbk, BUMN): kanal rekrutmennya lewat E-Recruitment Pertamina dan minta login, jadi statusnya Tidak dapat diverifikasi. Total jadi 406 perusahaan.
- README ditulis ulang untuk cakupan universal, dengan bagian aplikasi web dan penjelasan skor rekomendasi. `docs/METODE.md` diperbarui: cakupan universal, arti status Tidak dapat diverifikasi mencakup portal yang minta login, dan empat baris tanpa tautan dicatat dengan benar.

## 1.1.0 — 2026-11-05

Ronde H: 106 perusahaan tambahan, semuanya dicek langsung di browser pada 5 November 2026. Total jadi 405 perusahaan.

- H1 manufaktur 26, H2 retail kecil 19 (J.CO tidak dicek karena sudah ada di daftar), H3 jasa/logistik 24, H4 perusahaan gede 20, H5 tech/fintech/platform 17. Lima perusahaan yang muncul di riset H3 dan H5 (Lalamove, Waresix, Deliveree, Kargo Technologies, Logisly) hanya dihitung sekali, di H3.
- Status ronde H: 6 Ada lowongan target, 4 Ada lowongan target (tidak cocok), 33 Tidak ada lowongan target, 21 Tidak ada lowongan terlihat, 15 Portal tidak bisa dibuka, 27 Tidak dapat diverifikasi.
- Status keseluruhan 405: 152 Tidak ada lowongan target, 77 Tidak ada lowongan terlihat, 83 Tidak dapat diverifikasi, 66 Portal tidak bisa dibuka, 22 Ada lowongan target, 5 Ada lowongan target (tidak cocok).
- Temuan target baru: BASF Production Operator Jakarta, Fore Coffee Barista (seluruh Indonesia), Ranch Market kasir (Ambon/Malang/Cikarang Barat/Jakarta Selatan), OCS CLEANER Kab. Bogor, Accor Receiving & Storekeeper Jakarta Pusat, Dexa Production Staff A dan Steril Novice Worker Bekasi. Yang tidak cocok: RS Pondok Indah Teknisi MEP (D3 + 3 tahun pengalaman), Marriott Housekeeping Supervisor (level supervisor), Swiss-Belhotel Executive Housekeeper Kota Bogor (S1 + 2 tahun pengalaman), KitaLulus Staff Gudang Cibinong lewat platform (pemberi kerja Titik Seduh Cibinong, minimal D3/D4).
- Tiga baris baru tanpa tautan, karena tidak ditemukan situs resmi perusahaan: PT Dwi Indah (No. 315), PT Cintas Sentul Raya (No. 321), PT Best Logistics Service Indonesia (No. 355). Sama seperti Olive Fried Chicken (No. 204), tautannya tidak ditebak.
- Repo dinamai ulang menjadi `karir` (sebelumnya `daftar-link-karir`, lalu `daftar-link-karir-terverifikasi`, lalu `karir-terverifikasi`).

## 1.0.0 — 2026-11-05

Versi pertama yang diterbitkan.

- 299 perusahaan, semuanya sudah dicek langsung di browser.
- 81 perusahaan dicek 4 November 2026, 218 perusahaan dicek 5 November 2026.
- Status: 119 Tidak ada lowongan target, 56 Tidak ada lowongan terlihat, 56 Tidak dapat diverifikasi, 51 Portal tidak bisa dibuka, 16 Ada lowongan target, 1 Ada lowongan target (tidak cocok).
- Kolom baru di semua 299 baris: LOKASI dan POSISI, berisi lokasi dan judul posisi yang terlihat saat dicek.
- Angkasa Pura Supports dicatat terpisah dari induknya, Angkasa Pura Indonesia, karena portal karirnya terpisah.
- Satu baris tanpa tautan: Olive Fried Chicken (No. 204), karena tidak ditemukan situs resmi perusahaan.
