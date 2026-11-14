# Rencana

Daftar ini berisi pekerjaan yang sudah diketahui. Tidak ada tanggal di sini yang ditebak; yang belum punya tanggal ditulis apa adanya.

## Sudah selesai: tiga langkah Firebase

Tiga langkah di Firebase Console (akun `whoisadip@gmail.com`, proyek `karir-9d53a`) sudah selesai. Umpan perubahan terisi dan cron berjalan.

- Aturan Firestore (`web/firestore.rules`) sudah diterbitkan. Baca koleksi `changes` terbuka untuk publik, tulisnya hanya untuk admin.
- Service account sudah dipasang sebagai env Vercel `FIREBASE_SERVICE_ACCOUNT` bersama `CRON_SECRET`. Cron cek ulang berjalan tiap 01:00 WIB sejak 9 November 2026 dan mencatat perubahan ke umpan Yang berubah.
- Akun admin sudah dibuat dan klaim admin sudah dipasang.

## Sudah terverifikasi

- Aturan akses sudah dites: 11 cek lolos, termasuk penolakan 403 untuk non-admin dan akses admin ke koleksi admin.
- Cron sudah terbukti berjalan: perubahan status tercatat di umpan Yang berubah sejak 9 November 2026.

## Masih perlu dites

- Masuk ke panel `/admin` dari browser, ubah catatan kecil satu perusahaan, simpan, lalu periksa tampil di `/cari`, di Firestore, dan tercatat di `audit_logs`.
- Cek massal admin end-to-end: jalankan dari panel, lalu periksa perubahan tercatat di umpan Yang berubah bila ada portal yang berbalik.

## Berjalan terus

- Hunting harian: menambah perusahaan baru dan mengecek ulang yang sudah ada, setiap hari.

## Rombak tampilan

Tampilan aplikasi dirombak dari nol oleh Claude. Hasilnya datang sebagai versi 3.0.0 pada 11 November 2026 dan ditolak pemilik di hari yang sama karena tampilannya kaku dan kelihatan buatan AI. Masukan untuk ronde 2 sudah disiapkan; ronde 2 menunggu keputusan pemilik.

## Tidak direncanakan

- Akun wajib. Masuk tetap pilihan, bukan kewajiban. Akun pengguna sendiri sudah ada sejak versi 2.8.1, dan semua fitur tetap bisa dipakai tanpa masuk.
- Payment gateway. Aplikasi tidak memungut pembayaran apa pun.
