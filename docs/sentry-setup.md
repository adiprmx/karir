# Penyiapan Sentry (P-06)

Langkah persis untuk mengaktifkan Sentry pada Karir. Kode sudah siap (P-06 Fase A): SDK terpasang, init terkunci di belakang variabel lingkungan, dan tanpa DSN semua jalur Sentry nonaktif diam-diam — situs jalan normal tanpa Sentry. Dokumen ini adalah satu-satunya yang perlu diikuti parent untuk menyalakan Sentry.

**Jangan pernah menulis nilai DSN di repo, laporan, atau chat.** DSN hanya dipasang sebagai variabel lingkungan Vercel.

## 1. Buat akun Sentry Developer (gratis)

1. Buka <https://sentry.io/signup/> dan buat akun dengan email yang sama seperti akun layanan Karir lainnya.
2. Pilih paket **Developer** (gratis, tanpa kartu kredit). Bila ditawari uji coba paket berbayar, lewati — paket Developer sudah cukup untuk Karir (kuota error dan cron monitor gratis).
3. Buat organisasi bila diminta (nama bebas, mis. nama pemilik).

## 2. Buat proyek "karir"

1. Di dasbor Sentry: **Projects → Create Project**.
2. Pilih platform **Next.js**.
3. Nama proyek: `karir`.
4. Pilih alert default (on) — peringatan error akan diatur sesudah DSN dipasang (langkah 5).
5. Setelah proyek dibuat, Sentry menampilkan halaman penyiapan berisi **DSN** (format `https://<kunci>@o<org>.ingest.sentry.io/<id-proyek>`). Salin DSN ini — hanya dipakai di langkah 3, tidak ditulis di mana pun lagi.

## 3. Pasang DSN di Vercel

Di Vercel (**Project karir → Settings → Environment Variables**), tambahkan dua variabel dengan nilai DSN yang sama, untuk lingkungan **Production** (dan Preview bila diinginkan):

| Nama variabel | Nilai |
|---|---|
| `SENTRY_DSN` | DSN dari langkah 2 (server) |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN yang sama (klien) |

Kedua nama ini persis seperti yang dibaca kode:

- `SENTRY_DSN` dibaca `web/sentry.server.config.js` dan `web/lib/sentry.js`.
- `NEXT_PUBLIC_SENTRY_DSN` dicadangkan untuk SDK browser penuh di masa depan (P-10); saat ini pelapor error klien memakai route `/api/client-error` dan belum membaca variabel ini — tetap pasang dari sekarang supaya tidak ada langkah yang tertinggal.

Variabel ketiga bersifat opsional dan sudah punya bawaan:

| Nama variabel | Nilai | Bawaan bila kosong |
|---|---|---|
| `SENTRY_CRON_MONITOR_SLUG` | `karir-recheck` | `karir-recheck` |

Setelah menambah variabel, **redeploy** (Vercel → Deployments → redeploy deployment terbaru) supaya variabel terbaca server.

## 4. Cron monitor recheck (otomatis, lalu aktifkan alarmnya)

Monitor cron **dibuat otomatis oleh Sentry** pada check-in pertama yang membawa konfigurasi monitor — tidak perlu dibuat manual. Kode recheck (`web/app/api/cron/recheck/route.js`) mengirim `in_progress`/`ok`/`error` dengan konfigurasi: jadwal `0 18 * * *` (01:00 WIB), margin keterlambatan 15 menit, runtime maksimum 5 menit, zona waktu Asia/Jakarta, slug `karir-recheck`.

Sesudah run recheck pertama pasca-DSN:

1. Buka Sentry → **Crons** — monitor `karir-recheck` sudah ada.
2. Buka monitor itu, periksa jadwal dan zona waktunya benar.
3. Aktifkan **alert** untuk monitor ini (missed check-in dan check-in error) — caranya: di halaman monitor, **Alerts → Create Alert**, pilih penerima (email pemilik). Tanpa langkah ini, Sentry mencatat tetapi tidak memberitahu siapa pun.

Catatan: hanya run yang memegang kunci recheck yang check-in. Run duplikat tidak check-in (benar — duplikat bukan run sungguhan). Bila Sentry menandai "missed", itu berarti recheck benar-benar tidak jalan atau gagal sebelum mengambil kunci — periksa heartbeat `cron-runs/recheck-{tanggal}` dan alarm watcher.

## 5. Atur alert error

1. Sentry → **Alerts → Create Alert** untuk proyek `karir`.
2. Aturan yang disarankan: bila ada **error baru pertama kali muncul** (new issue), kirim email. Jangan mengaktifkan alert untuk setiap kemunculan error lama — satu error berulang bisa membanjiri kotak masuk.
3. Frekuensi maksimum: satu email per issue per hari sudah cukup untuk Karir.

## 6. Verifikasi (sesudah DSN aktif)

1. Buka situs, buka halaman mana pun, lalu periksa Sentry → **Issues**: tidak ada issue baru yang muncul hanya karena pengunjung biasa membuka situs (SDK server hanya menangkap error server, bukan kunjungan normal).
2. Periksa Sentry → **Crons** sesudah recheck 01:00 WIB berikutnya: satu check-in `ok` (atau `error` bila run gagal — yang memang harus terlihat).
3. Uji rantai penuh (K9) mengikuti rencana verifikasi di `docs/observability.md` § "Rencana verifikasi rantai live (K9)".

## Yang TIDAK dikirim ke Sentry

- Tanpa DSN, tidak ada satu pun data yang dikirim ke Sentry.
- Dengan DSN, scrubber `beforeSend` (`web/lib/sentry.js`) menghapus data pengguna, header, dan cookie, serta menyamarkan kunci sensitif di konteks tambahan. SDK dikonfigurasi `sendDefaultPii: false` dan `tracesSampleRate: 0` (tanpa tracing performa — menghemat kuota gratis).
- Pelapor error klien tidak mengirim stack trace, URL lengkap (hanya path, tanpa query), atau pesan lebih dari 500 karakter.

## Bila kuota Sentry gratis habis

Paket Developer membatasi jumlah event per bulan. Bila kuota habis, Sentry berhenti menerima event sampai bulan berikutnya — situs tidak terpengaruh (SDK gagal diam-diam) dan jalur observabilitas lain (log terstruktur, insiden Firestore, heartbeat, watcher) tetap jalan penuh. Bila kuota sering habis, kurangi dengan menaikkan ambang dedup sink Sentry di `web/lib/sentry.js` (`SENTRY_DEDUP_MS`, bawaan 1 jam) — bukan dengan mematikan Sentry.
