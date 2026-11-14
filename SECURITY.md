# Keamanan

Repo ini menyimpan daftar kanal karir dan aplikasi web yang membacanya. Repo ini tidak menyimpan kata sandi pengguna atau data pembayaran. Pengunjung bisa memilih masuk dengan akun Firebase (email dan kata sandi dikelola Firebase, bukan repo ini); dari akun yang masuk, yang tersimpan hanya email, nama tampilan, dan tanda lamaran, dan hanya pemilik akun dan admin yang bisa melihatnya. Akun admin Firebase dibuat pemilik repo di Firebase Console.

## Melaporkan celah

Buat issue baru di https://github.com/adiprmx/karir/issues/new dan tulis `Keamanan:` di awal judul. Jelaskan di issue apa dampaknya dan bagian mana yang terkena. Jangan menulis langkah eksploitasi lengkap di issue, karena issue di repo ini bisa dibaca siapa pun. Tulis ringkas saja, lalu minta pemilik repo menghubungi pelapor untuk detail langkahnya.

Repo ini belum punya kanal laporan privat. Sampai ada, issue publik dengan judul bertanda Keamanan dan isi yang ringkas adalah jalurnya.

Pemilik repo membaca issue yang masuk dan membalas lewat thread issue yang sama. Tidak ada tenggat respons yang dijanjikan di sini; janji yang tertulis adalah laporan dibaca dan dibalas di threadnya, bukan didiamkan.

## Yang perlu dijaga

Dua nilai tidak boleh masuk ke repo atau ke issue: isi `FIREBASE_SERVICE_ACCOUNT` (kunci service account untuk cron, dipasang sebagai env di Vercel) dan `CRON_SECRET` (rahasia cron, dipasang sebagai env di Vercel). Keduanya hanya hidup di server. Kalau salah satunya pernah tertulis di tempat umum, anggap bocor dan ganti di Firebase Console dan di Vercel.

Enam variabel `NEXT_PUBLIC_FIREBASE_*` adalah konfigurasi klien publik. Kunci API di dalamnya bisa dilihat siapa pun yang membuka aplikasi. Keamanan data tidak datang dari kunci itu, melainkan dari aturan Firestore (`web/firestore.rules`) dan Firebase Auth: baca `companies` terbuka, tulis hanya untuk admin yang login dan hanya bila dokumen lolos validasi, `audit_logs` tidak bisa diubah atau dihapus, `reports` hanya bisa dibuat dalam bentuk yang divalidasi.

## Akun pengguna

Masuk ke aplikasi bersifat opsional: semua fitur bisa dipakai tanpa akun. Pengunjung yang masuk memakai Firebase Auth (email/kata sandi). Repo ini tidak pernah melihat atau menyimpan kata sandi pengguna — kata sandi dikelola Firebase.

**Data apa yang tersimpan dari akun yang masuk:**

- Profil akun (`user_profiles`): email dan nama tampilan.
- Pelacak lamaran (`user_trackers/{uid}/items`): perusahaan yang ditandai, status lamaran, tanggal, dan catatan (maks 200 karakter).

**Siapa yang bisa membaca `user_profiles`:** hanya pemilik akun itu sendiri dan admin. Aturan Firestore-nya (`web/firestore.rules`): baca diizinkan bila pengakses sudah masuk dan UID-nya sama dengan UID pemilik dokumen, atau pengakses adalah admin. Pengunjung lain, termasuk pengunjung yang masuk dengan akun berbeda, tidak bisa membaca profil akun orang lain. Tulis (buat/ubah) hanya oleh pemilik akun, dengan validasi bentuk (email maks 200 karakter, nama tampilan maks 100 karakter). Hapus lewat aturan Firestore ditutup total (`allow delete: if false`) — penghapusan profil hanya bisa dilakukan pemilik repo lewat Firebase Console atau service account, sebagai bagian dari permintaan hapus akun di bawah.

**Reset kata sandi:** pengunjung yang lupa kata sandi memakai tombol "Lupa kata sandi?" di panel akun. Aplikasi mengirim email reset lewat Firebase (`sendPasswordResetEmail`) ke alamat yang tertulis; tautan di email itu yang dipakai untuk membuat kata sandi baru. Tidak ada reset kata sandi lewat repo, issue, atau pengelola.

**Hapus akun dan data:** belum ada tombol hapus akun di situs. Pengunjung meminta lewat Issues di repo GitHub Karir (tautan yang sama dipakai halaman Pengaturan dan halaman Kebijakan Privasi); pengelola membalas dan mengatur penghapusannya. Yang dihapus pengelola: akun Firebase Auth, dokumen `user_profiles`, dan subkoleksi `user_trackers` milik akun itu. Data yang hanya tersimpan di browser (tandaan pelacak tamu, pilihan onboarding, pencarian terakhir) tidak tersentuh penghapusan ini — pengunjung menghapusnya sendiri dari halaman Pengaturan, yang menunjukkan apa yang tersimpan dan menyediakan tombol hapus semua data. Event analitik anonim tidak terkait akun dan tidak memuat nama, email, atau IP mentah, jadi tidak ada data analitik per akun yang perlu dihapus.

**Akun admin** dibuat pemilik repo di Firebase Console dan dibedakan lewat custom claim `admin` (bukan lewat data di Firestore). Akun admin yang dipakai untuk mengelola data adalah akun yang sama yang bisa membaca `user_profiles` — akses baca admin itu sengaja ada supaya pengelola bisa menanggapi permintaan hapus akun dan memeriksa laporan.

## Token /api/index bukan autentikasi (keputusan desain, SEC-11)

Rute `GET /api/token` mengeluarkan token berumur pendek untuk memanggil `/api/index` bila header Referer atau Origin peminta cocok dengan origin situs. Token ini BUKAN autentikasi dan tidak pernah dimaksudkan sebagai autentikasi: datanya sendiri (daftar perusahaan) adalah data publik yang bacanya terbuka untuk siapa pun.

Fungsi gerbang ini adalah anti-bot dan anti-scraping ringan: menahan pemakaian otomatis yang menggerus kuota baca Firestore, bersama penolakan user agent otomatis dan batas laju 60 permintaan per menit per hash IP. Header Referer/Origin bisa dipalsukan siapa pun yang sengaja — itu diterima sebagai batas desain, karena yang dilindungi bukan kerahasiaan data, melainkan kuota baca. Lapisan yang benar-benar membatasi beban adalah batas laju bersama dan arsitektur seed-first (baca marker kecil, refill hanya bila data berubah), bukan tokennya.

Firebase App Check (alternatif yang lebih kuat) sengaja tidak dipakai: ia menambah ketergantungan dan risiko memblokir pengunjung sah di perangkat yang tidak lolos attestation, sementara data yang dilindungi bersifat publik. Bila pola penyalahgunaan berubah (misalnya banjir request dengan Referer palsu yang lolos batas laju), keputusan ini dibuka lagi — dan perubahan keputusannya dicatat di sini.

## Yang tidak dihitung celah

- Data lowongan yang sudah usang. Status tiap baris terikat tanggal cek; data lama adalah data yang perlu dicek ulang, dan itu dicatat di `ROADMAP.md`.
- Portal perusahaan yang tidak bisa dibuka atau mengembalikan 404. Itu status data, tercatat sebagai `Portal tidak bisa dibuka`.
- 76 baris tanpa tautan karir. 72 di antaranya punya kanal lain (email, WhatsApp, atau formulir); 4 tanpa kanal apa pun (Olive Fried Chicken No. 204, PT Dwi Indah No. 315, PT Cintas Sentul Raya No. 321, PT Best Logistics Service Indonesia No. 355). Tidak ditemukan situs resmi perusahaan itu, jadi tautannya tidak ditebak.
- Logo perusahaan yang gagal dimuat atau foto yang tidak tampil. Aplikasi memang menyembunyikan keduanya bila sumbernya gagal.
- Balasan 429 dari `POST /api/admin/check-link`. Itu batas laju yang bekerja: 10 permintaan per menit per IP.
