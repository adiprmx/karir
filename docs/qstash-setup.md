# Penyiapan QStash sebagai pemicu cadangan (P-05)

QStash (Upstash) adalah pemicu CADANGAN cron Karir: bila
GitHub Actions gagal memicu endpoint (mis. antrean runner
macet), QStash memanggil endpoint yang sama 5 menit kemudian.
Kode tidak bergantung pada QStash — GitHub Actions adalah
jalur utama, dan endpoint menolak pemicu kedua lewat kunci
idempotency bila job sudah berjalan/selesai.

Penyiapan ini butuh Upstash Console (browser) — tugas parent.
Akun Upstash sudah ada (KV terpasang di Vercel).

## 1. Buat schedule di Upstash Console

Masuk ke Upstash Console > QStash > Schedules, buat tiga
schedule (cron dalam UTC; WIB = UTC+7):

| Schedule | Cron (UTC) | Waktu WIB | URL tujuan |
|---|---|---|---|
| karir-recheck | `5 18 * * *` | tiap hari 01:05 | `https://karir-adiprmx.vercel.app/api/cron/recheck` |
| karir-digest | `35 18 * * *` | tiap hari 01:35 | `https://karir-adiprmx.vercel.app/api/cron/digest` |
| karir-cleanup | `5 19 * * 0` | Senin 02:05 | `https://karir-adiprmx.vercel.app/api/cron/cleanup` |

Catatan penting:

- **URL tanpa garis miring akhir.** Verifikasi signature
  membandingkan klaim `sub` JWT dengan URL endpoint persis
  karakter per karakter — garis miring akhir membuat
  verifikasi gagal 401.
- **Metode GET, tanpa body.** QStash mengirim schedule sebagai
  GET tanpa body; klaim `body` JWT adalah hash string kosong.
- **Tanpa header Authorization.** Auth QStash memakai
  signature JWT (`Upstash-Signature`), bukan `CRON_SECRET`.
  Jangan tambahkan header `Authorization` — endpoint
  memprioritaskan Bearer bila ada, dan secret tidak boleh
  ditulis di Console pihak ketiga.
- **Retry QStash:** biarkan default. Endpoint menjawab 200
  untuk duplikat (bukan error), jadi QStash tidak retry
  sia-sia. Bila endpoint 500, retry QStash memberi kesempatan
  kedua yang sah.

Pemakaian: 3 messages/hari dari jatah 1.000 pesan/bulan paket
Free — jauh di bawah batas.

## 2. Pasang kunci penandatanganan di env Vercel

Di Upstash Console > QStash > Settings, salin
**Current Signing Key** dan **Next Signing Key**, lalu pasang
sebagai environment variable di Vercel (Production):

- `QSTASH_CURRENT_SIGNING_KEY` = current signing key
- `QSTASH_NEXT_SIGNING_KEY` = next signing key

Redeploy TIDAK diperlukan untuk env baru bila memakai Vercel
CLI/API redeploy — variabel env baru berlaku pada deploy
berikutnya; lakukan redeploy Production sekali sesudah
memasang, atau tunggu deploy berikutnya.

Bila kunci belum dipasang, jalur QStash nonaktif (fail-closed):
panggilan QStash dijawab 401, GitHub Actions tetap jalan
normal. Ini aman — bukan kegagalan.

## 3. Rotasi kunci

Upstash merotasi kunci penandatanganan secara berkala: kunci
lama menjadi "next", kunci baru menjadi "current". Saat rotasi:

1. Salin kunci baru dari Console.
2. Perbarui `QSTASH_CURRENT_SIGNING_KEY` (baru) dan
   `QSTASH_NEXT_SIGNING_KEY` (lama) di env Vercel.
3. Redeploy Production.

Endpoint mencoba current dulu, lalu next — rotasi tidak
memutuskan verifikasi selama kedua kunci benar.

## 4. Verifikasi

Sesudah schedule dibuat dan kunci dipasang:

1. Tunggu satu jadwal QStash (mis. recheck 01:05 WIB) — bila
   GitHub Actions sudah jalan 01:00, QStash menjawab
   `duplicate` (terlihat di log QStash: HTTP 200). Itu bukti
   idempotency + verifikasi signature bekerja.
2. Periksa field `trigger` di dokumen heartbeat
   `cron-runs/{tanggal}`: `github-actions` bila Actions yang
   jalan, `qstash` bila QStash yang jalan (mis. Actions gagal).
3. Bila QStash menjawab 401 terus-menerus: periksa URL tanpa
   garis miring akhir + kunci di env Vercel sudah benar dan
   sudah redeploy.

## 5. Menonaktifkan

Bila QStash tidak lagi dibutuhkan: hapus ketiga schedule di
Console, lalu hapus kedua env kunci di Vercel. Endpoint tetap
jalan normal lewat GitHub Actions + Vercel Cron.
