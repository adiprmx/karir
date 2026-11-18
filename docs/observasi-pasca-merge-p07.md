# Observasi pasca-merge P-07 (K6)

Verifikasi live P-07 DITUNDA ke observasi pasca-merge karena
kuota Firestore habis saat implementasi (429) dan tidak ada
proyek Firebase staging. Kode + tes mock sudah membuktikan
logikanya; yang tersisa adalah membuktikan perilaku di
produksi lewat heartbeat dan satu perangkat nyata.

## 1. Digest harian pertama sesudah merge

Sumber kebenaran: dokumen heartbeat
`cron-runs/digest-{tanggal-WIB}` (dan `cron-runs/{tanggal-WIB}`
untuk recheck 01:00 WIB) sesudah run 01:30 WIB pertama.

| Pemeriksaan | Cara | Hasil yang diharapkan |
|---|---|---|
| Status push jujur | Field `push` di heartbeat | `"sent"` bila ada langganan, `"none"` bila nol langganan — TIDAK PERNAH `"sent"` saat `pushTotal = 0` |
| Hitungan cocok | Bandingkan `pushTotal` dengan jumlah dokumen `push_subscriptions` (konsol Firestore / skrip hitung) | Sama (selisih 0; bila ada langganan baru di antara run dan hitungan, catat waktunya) |
| Paginasi jalan | Field `pushPages` | `>= 1` bila ada langganan; bila langganan > 500, `pushPages >= 2` dan `pushSent` mencakup semua halaman |
| Konfigurasi sehat | Field `pushConfigError` | `false` (bila `true`: kunci VAPID tidak berpasangan — lihat runbook rotasi) |
| Sidik kunci | Field `pushStaleKey` / `pushUnknownKey` | `pushUnknownKey` = jumlah dokumen lama (tanpa sidik kunci); `pushStaleKey` = 0 sampai ada rotasi |

Bila `pushHasMore = true` atau `pushTruncated = true`: run
terpotong anggaran — alert TIDAK ditandai pushed dan endpoint
digest mencoba lagi; selidiki bila terjadi dua hari
berturut-turut.

## 2. Satu pelanggan uji menerima notifikasi di perangkat nyata

Tindakan pemilik/koordinator (tidak bisa dilakukan agen
tanpa perangkat):

1. Di perangkat nyata (HP), buka situs produksi, masuk akun,
   lalu di halaman Pengaturan aktifkan notifikasi (izin
   browser: izinkan).
2. Tunggu digest harian berikutnya (01:30 WIB) ATAU picu
   digest manual lewat endpoint digest dengan `CRON_SECRET`
   (hanya bila ada alert hari itu yang belum `pushed`).
3. Periksa notifikasi sampai di perangkat (judul + isi digest).
4. Bila tidak sampai: cek heartbeat (`pushSent` naik?),
   cek status di Pengaturan (bila `"stale-key"`, ketuk
   "Aktifkan ulang notifikasi"), lalu ulangi.

Catat tanggal + perangkat + hasil di laporan observasi.

## 3. Cleanup Senin pertama sesudah merge

Heartbeat `cron-runs/cleanup-{tanggal-WIB}` Senin 02:00 WIB
pertama:

- `pushCleanupSkipped` harus `true` dan
  `pushCleanupSkipReason` = `"flag-mati"` — fase pembersihan
  memang belum aktif (menunggu cadangan Fase B).
- Tidak ada dokumen `push_subscriptions` yang terhapus
  (bandingkan jumlah dokumen sebelum/sesudah run).

## 4. Aktivasi pembersihan malformed (sesudah cadangan Fase B)

Langkah ini HANYA sesudah cadangan `push_subscriptions` Fase B
P-03 terverifikasi (manifest artifact backup berisi koleksi
itu):

1. Pasang variabel env `PUSH_MALFORMED_CLEANUP_ENABLED=1`
   di Vercel (Production) lalu redeploy.
2. Senin berikutnya, heartbeat cleanup harus mencatat
   `pushCleanupSkipped: false` + `pushCleanupExamined` (jumlah
   dokumen diperiksa), `pushCleanupMalformed` (yang tidak bisa
   menerima push), `pushCleanupCleaned` (yang dihapus).
3. Verifikasi: jumlah dokumen `push_subscriptions` berkurang
   PERSIS sebesar `pushCleanupCleaned`; dokumen yang dihapus
   adalah yang malformed menurut kriteria di runbook rotasi
   (bagian K3) — bila ada keraguan, bandingkan dengan
   cadangan Fase B sebelum run berikutnya.
4. Bila `pushCleanupHasMore = true`, workflow cleanup me-loop
   sampai sisa habis (maks 100 hapus/run).

## 5. Utang yang dicatat (bukan blokir merge)

- Uji staging penuh rotasi VAPID (tidak ada proyek Firebase
  staging; pembuatan butuh Console UI).
- Uji paginasi live dengan > 500 langganan (bergantung jumlah
  langganan nyata; simulasi 600 langganan sudah lolos di tes
  mock).
