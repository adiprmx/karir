# Keamanan

Repo ini menyimpan daftar kanal karir dan aplikasi web yang membacanya. Repo ini tidak menyimpan kata sandi pengguna, data pembayaran, atau data pribadi pengunjung. Satu-satunya akun yang ada adalah akun admin Firebase, yang dibuat pemilik repo di Firebase Console.

## Melaporkan celah

Buat issue baru di https://github.com/adiprmx/karir/issues/new dan tulis `Keamanan:` di awal judul. Jelaskan di issue apa dampaknya dan bagian mana yang terkena. Jangan menulis langkah eksploitasi lengkap di issue, karena issue di repo ini bisa dibaca siapa pun. Tulis ringkas saja, lalu minta pemilik repo menghubungi pelapor untuk detail langkahnya.

Repo ini belum punya kanal laporan privat. Sampai ada, issue publik dengan judul bertanda Keamanan dan isi yang ringkas adalah jalurnya.

Pemilik repo membaca issue yang masuk dan membalas lewat thread issue yang sama. Tidak ada tenggat respons yang dijanjikan di sini; janji yang tertulis adalah laporan dibaca dan dibalas di threadnya, bukan didiamkan.

## Yang perlu dijaga

Dua nilai tidak boleh masuk ke repo atau ke issue: isi `FIREBASE_SERVICE_ACCOUNT` (kunci service account untuk cron, dipasang sebagai env di Vercel) dan `CRON_SECRET` (rahasia cron, dipasang sebagai env di Vercel). Keduanya hanya hidup di server. Kalau salah satunya pernah tertulis di tempat umum, anggap bocor dan ganti di Firebase Console dan di Vercel.

Enam variabel `NEXT_PUBLIC_FIREBASE_*` adalah konfigurasi klien publik. Kunci API di dalamnya bisa dilihat siapa pun yang membuka aplikasi. Keamanan data tidak datang dari kunci itu, melainkan dari aturan Firestore (`web/firestore.rules`) dan Firebase Auth: baca `companies` terbuka, tulis hanya untuk admin yang login dan hanya bila dokumen lolos validasi, `audit_logs` tidak bisa diubah atau dihapus, `reports` hanya bisa dibuat dalam bentuk yang divalidasi.

## Yang tidak dihitung celah

- Data lowongan yang sudah usang. Status tiap baris terikat tanggal cek; data lama adalah data yang perlu dicek ulang, dan itu dicatat di `ROADMAP.md`.
- Portal perusahaan yang tidak bisa dibuka atau mengembalikan 404. Itu status data, tercatat sebagai `Portal tidak bisa dibuka`.
- Empat baris tanpa tautan karir (Olive Fried Chicken No. 204, PT Dwi Indah No. 315, PT Cintas Sentul Raya No. 321, PT Best Logistics Service Indonesia No. 355). Tidak ditemukan situs resmi perusahaan itu, jadi tautannya tidak ditebak.
- Logo perusahaan yang gagal dimuat atau foto yang tidak tampil. Aplikasi memang menyembunyikan keduanya bila sumbernya gagal.
- Balasan 429 dari `POST /api/admin/check-link`. Itu batas laju yang bekerja: 10 permintaan per menit per IP.
