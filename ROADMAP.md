# Rencana

Daftar ini berisi pekerjaan yang sudah diketahui. Tidak ada tanggal di sini yang ditebak; yang belum punya tanggal ditulis apa adanya.

## Menunggu pemilik

Tiga langkah di Firebase Console, akun `whoisadip@gmail.com`, proyek `karir-9d53a`. Sampai ketiganya selesai, umpan perubahan kosong dan cron menjawab 503.

- Terbitkan `web/firestore.rules` dari repo: Firestore Database, Rules, salin isi file itu, Publish. Tanpa ini, baca koleksi `changes` ditolak 403, umpan Yang berubah selalu kosong, dan tulis perubahan dari admin gagal diam-diam.
- Service account: Project Settings, Service accounts, Generate new private key, lalu pasang hasil unduhannya sebagai env Vercel `FIREBASE_SERVICE_ACCOUNT` (string JSON) bersama `CRON_SECRET` (string acak). Tanpa ini cron menjawab 503 `cron belum diaktifkan`.
- Akun admin: Authentication, Users, Add user. Email dan kata sandi dibuat pemilik sendiri; kata sandi tidak pernah lewat asisten.

## Sesudah akun admin dibuat

- Tes login di `https://karir-adiprmx.vercel.app/admin`, lalu tes tulis satu perusahaan: ubah catatan kecil, simpan, periksa tampil di `/cari`, di Firestore, dan tercatat di `audit_logs`.
- Tes cek massal admin end-to-end, termasuk pencatatan perubahan ke umpan Yang berubah bila aturan `changes` sudah terbit.
- Tes cron dengan service account terpasang: panggil `/api/cron/recheck` dan periksa jawabannya bukan 503, lalu periksa satu perubahan tercatat bila ada portal yang berbalik.

## Rombak tampilan

Tampilan aplikasi dirombak dari nol oleh Claude. Brief sudah disiapkan (`brief-frontend-karir-untuk-claude.md` di folder file pemilik), isinya hanya fakta produk dan tujuan, tanpa arahan desain. Statusnya menunggu hasil Claude. Hasilnya nanti dipasang ke repo, di-deploy, dan diverifikasi live sebelum diumumkan.

## Tidak direncanakan

- Akun wajib. Masuk tetap pilihan, bukan kewajiban — akun pengguna sendiri sudah ada sejak versi 2.8.1, dan semua fitur tetap bisa dipakai tanpa masuk.
- Payment gateway. Aplikasi tidak memungut pembayaran apa pun.
