# PRODUCT.md — Karir (inferred from the owner's brief, 6 Nov 2026)

## Product truth

- Karir is a directory of 610 official career channels of Indonesian companies, each opened and checked live in a browser. Each row carries its own check date, and the app shows how fresh the data is from that date.
- The web app is full stack: Next.js 16 + React 19 on Vercel (https://karir-adiprmx.vercel.app/), Firestore database (`karir-9d53a`, 610 documents), server search API, admin panel at `/admin`. The old static version in folder `docs/` (GitHub Pages) is kept only as a previous version. Sign-in is optional (Firebase Auth, email/password): signed-in users sync their application tracker to their account, and anonymous visitor analytics run. No external fonts. Motion is restrained: sections reveal as they scroll into view, counters rise only when visible, a pulsing dot only for companies with openings, photos zoom slightly on hover, buttons press to scale 0.98, and live search results as you type.
- Data is honest: vacancy findings were checked for warehouse/production/cleaning/office boy/packing/crew store roles. Other roles are recommended as channels with an honest "not yet verified" label. Denial sentences in the data never count as matches.
- Budget is zero rupiah. The owner has no VPS. Control stays with the owner and the assistant only.

## Audience and job

Pencari kerja di Indonesia. Mereka membuka aplikasi, mengetik domisili dan posisi yang dicari, lalu membuka kanal karir resmi yang layak dibuka. Dalam hitungan detik mereka harus bisa membedakan hasil yang lowongannya terverifikasi dari kanal yang sekadar layak dicek.

Segmen pengguna (disusun dari peran dan wilayah yang datanya dicek; semuanya asumsi sampai divalidasi, lihat `docs/riset-pengguna.md`):

- Pencari kerja pertama kali. Baru lulus atau baru pertama kali melamar. Butuh dipandu: alur `/mulai`, penjelasan tiap status, dan peringatan soal lowongan palsu.
- Pencari kerja yang sudah biasa melamar. Tahu posisi yang dicari. Butuh kecepatan: ketik, lihat hasil, buka portal, tandai.
- Pencari kerja yang melamar ke banyak tempat sekaligus. Butuh pelacak: tandai tiap perusahaan, catat tanggal dan status, lihat semuanya di satu halaman.
- Pencari kerja di wilayah fokus daftar ini: Bogor, Depok, Cibinong, Citayam, Bojonggede, Citeureup, Gunung Putri, dan Jabodetabek. Domisili dipakai untuk mengurutkan hasil, bukan menyaringnya; lowongan di luar wilayah itu tetap tercatat.

Peran yang datanya paling sering dicek: Helper Gudang, Staff Gudang, Cleaning Service, Office Boy, Packing, Operator Produksi, Helper Produksi, dan Crew Store. Semua peran setara; tidak ada peran yang diutamakan di atas yang lain.

## Prioritas dan keputusan

Pemilik repo yang memutuskan apa yang dikerjakan dan urutannya. Kriteria urutannya, dari yang didahulukan:

1. Kebenaran data dan keamanan pengguna. Data yang salah atau menyesatkan diperbaiki dulu; begitu juga celah yang membahayakan pengguna atau data.
2. Fitur inti yang dipakai setiap hari: cari, halaman detail, dan pelacak lamaran.
3. Kemudahan berkontribusi dan meminta bantuan: template issue, panduan kontribusi, dan jalur laporan yang jelas.
4. Poles dan perluasan: perbaikan tampilan, fitur baru, dan perluasan cakupan data.

Setiap keputusan dicatat beserta alasannya di CHANGELOG (untuk rilis) atau di dokumen yang bersangkutan, mengikuti praktik yang sudah ada di entri changelog 2.0.0 sampai 2.8.2. Keputusan yang dibalik dicatat juga: dokumen yang memuat keputusan lama diperbarui di perubahan yang sama, supaya tidak ada dokumen yang memuat keputusan yang sudah tidak berlaku.

Tanggal target hanya ditulis setelah pemilik menetapkannya. Pekerjaan yang belum punya tanggal ditulis apa adanya, tanpa tanggal tebakan.

## Tujuan produk (draf — belum disetujui pemilik)

Seksi ini adalah DRAF. Angka target di bawah ini adalah usulan tim, bukan janji yang sudah disetujui pemilik. Jangan mengutip angka-angka ini ke pengunjung sebagai janji sampai pemilik menyetujuinya. Yang sudah pasti adalah cara mengukurnya: setiap tujuan di bawah memakai data yang sudah ada hari ini (CSV, Firestore, atau analitik anonim), tanpa alat ukur baru.

Dasar ukur per 14 November 2026 (tanggal cek terbaru di data): 610 perusahaan, 288 di antaranya berstatus "Ada lowongan", 183 baris punya kanal melamar lain (email HRD 125, WhatsApp HRD 13, kontak lain 162 — satu baris bisa punya lebih dari satu kanal).

1. **Data lowongan selalu segar.** Usulan target: sekurang-kurangnya 95% perusahaan berstatus "Ada lowongan" sudah dicek ulang dalam 7 hari terakhir. Cara mengukur: hitung dari kolom `tanggal_cek` di CSV per status — tidak butuh analitik. Dasar ukur hari ini: 283 dari 288 (98,3%) sudah dicek dalam 7 hari terakhir. Cron cek ulang harian (01:00 WIB) yang menjaga angka ini; bila angkanya turun, antrean cron atau jadwal cek ulang yang perlu diperiksa, lihat `docs/monitoring-cron.md`.
2. **Kanal melamar lain makin lengkap.** Usulan target: sekurang-kurangnya 40% baris punya kanal melamar lain (email, WhatsApp, atau kontak lain dari sumber resmi). Cara mengukur: hitung baris yang kolom `email_hrd`, `wa_hrd`, atau `kontak_lain`-nya terisi, dibagi total baris CSV. Dasar ukur hari ini: 183 dari 610 (30,0%). Target ini naik hanya lewat hunting kanal resmi, bukan dengan menebak alamat.
3. **Pelacak lamaran dipakai pengunjung.** Usulan target: sekurang-kurangnya 10% pengunjung unik dalam 30 hari terakhir menandai minimal satu lamaran. Cara mengukur: ringkasan Pengunjung di panel admin menghitung pengunjung unik yang punya event `tracker_mark` (atau `portal_click` sebagai syarat alternatif) dalam 30 hari terakhir, dari koleksi `analytics_events`. Catatan: pipa analitik belum terverifikasi ujung-ke-ujung (menunggu `ANALYTICS_SALT` di Vercel Production) — angka dasarnya baru bisa dibaca setelah verifikasi itu selesai.
4. **Pencarian menemukan hasil.** Usulan target: sekurang-kurangnya 90% pencarian di /cari mengembalikan minimal satu hasil. Cara mengukur: event `search` di analitik membawa jumlah hasil (`results`); hitung porsi event dengan `results` lebih dari 0 dalam 30 hari terakhir. Pencarian tanpa hasil adalah sinyal data yang kurang (peran atau wilayah yang belum tercakup), bukan sekadar angka.
5. **Pengunjung membuka kanal resmi.** Usulan target: sekurang-kurangnya 30% pengunjung unik dalam 30 hari terakhir mengeklik minimal satu tombol portal atau kanal melamar. Cara mengukur: event `portal_click` dan `channel_copy` di analitik, diringkas per pengunjung di panel admin. Ini ukuran paling dekat dengan "Karir berhasil mengantar orang ke kanal resmi" — lebih berarti daripada sekadar jumlah kunjungan.

Retensi membatasi jendela ukur: event analitik mentah disimpan 90 hari (cron pembersihan tiap Senin 02:00 WIB), dan ringkasan admin memakai 30 hari terakhir dengan batas 300 pengunjung. Tujuan di atas diukur dalam jendela 30 hari karena itu yang tersedia di panel admin hari ini.

## Keputusan: mesin pencari hanya mengindeks Bahasa Indonesia

Aplikasi punya dua bahasa antarmuka (Indonesia dan Inggris), tetapi bahasanya dipilih lewat cookie `karir-locale` di URL yang sama — tidak ada URL terpisah per bahasa (tanpa `/en/...`, tanpa subdomain). Karena itu mesin pencari hanya mengindeks versi Bahasa Indonesia, dan tidak ada `hreflang` (tidak ada URL alternatif yang bisa dirujuk).

Ini keputusan sadar, bukan kekurangan yang terlewat. Alasannya: audiens Karir adalah pencari kerja di Indonesia, konten datanya (nama perusahaan, posisi, catatan cek) berbahasa Indonesia, dan satu URL per halaman menjaga skor pencarian tetap pada satu alamat. Bila suatu hari versi Inggris perlu diindeks, yang harus berubah dulu adalah arsitekturnya (URL terpisah per bahasa), bukan sekadar menambah tag `hreflang`.

## Alur pengguna (satu garis lurus, tanpa cabang buntu)

1. Buka situs. Landing page langsung menjelaskan ini apa: 610 kanal karir resmi yang dicek langsung di browser, 288 di antaranya ada lowongan. Kolom pencarian ada di layar pertama, jadi pengunjung bisa langsung ketik domisili dan posisi tanpa daftar atau login.
2. Pengunjung baru tekan "Mulai" (tombol di header). Isi dua hal: domisili dan posisi yang dicari. Jawabannya hanya tersimpan di browsernya sendiri (localStorage, tidak dikirim ke mana pun), lalu ia langsung diarahkan ke hasil yang cocok. Bisa dilewati.
3. Cari (/cari). Hasil diurutkan pakai skor: posisi cocok paling berat (+50), lalu lokasi cocok (+30), lalu status ada lowongan (+20). Klik satu perusahaan, masuk ke halaman detailnya.
4. Detail perusahaan (/perusahaan/[no]). Status, lokasi, posisi, catatan hasil cek, dan tanggal dicek. Tombol "Buka portal karir" mengarah ke situs resmi perusahaan itu. Di bawahnya ada kanal melamar lain bila ada: email atau WhatsApp HRD yang ditemukan di situs resmi perusahaan. Di bawahnya ada "Lamaran saya": tandai sebagai Ditandai, Sudah dilamar, Dipanggil, atau Ditolak, lengkap tanggal dan catatan (tersimpan di browser, dan tersinkron ke akun bila pengunjung masuk).
5. Lamaran Saya (/lamaran). Semua perusahaan yang ditandai terkumpul di satu halaman, dengan hitungan per status. Di sinilah pengguna mengelola proses lamarannya.
6. Peta (/peta). perusahaan yang ada lowongannya di peta per kota. Klik satu titik, keluar daftar perusahaan di kota itu.
7. Dasbor (/dasbor). Ruang kerja pribadi: sapaan sesuai domisili dan posisi dari langkah 2, daftar langkah berikutnya (isi pilihan, tandai lamaran pertama, periksa portal resmi), ringkasan lamaran, lalu grafik sebaran status dan daftar perusahaan yang ada lowongannya. Cap "Terakhir dicek ulang" menunjukkan seberapa segar datanya.
8. Admin (/admin, khusus owner). Login Firebase, lalu ubah data perusahaan, impor dan ekspor CSV, cek massal tautan perusahaan yang ada lowongannya, dan lihat laporan tautan mati dari pengunjung plus audit log.
9. Karir Hidup. Tiap jam 01:00 WIB cron mengecek ulang portal perusahaan yang ada lowongannya (288) dan portal yang sempat mati supaya ada jalan pulih; perubahan status masuk umpan "Yang berubah" di Beranda (koleksi `changes`), dan perubahan dalam 48 jam terakhir ditandai chip "Baru" di umpan, daftar perusahaan yang ada lowongannya di Dasbor, dan kartu perusahaan. Cron juga membandingkan daftar perusahaan yang ada lowongannya dengan snapshot run sebelumnya: lowongan baru dan batas lamar 0-3 hari lagi tercatat di koleksi `alerts` dan dikirim sekali sebagai satu pesan Telegram ke pemilik. Cek massal admin ikut mencatat perubahan yang sama. Portal yang tadinya mati lalu hidup lagi jadi "Tidak dapat diverifikasi" sampai dicek ulang manusia, karena cek tautan hanya membuktikan portal bisa dibuka, bukan lowongannya masih ada.

Alur data: Firestore (610 dokumen) → API server → halaman. Tulis data hanya lewat admin panel (tercatat di audit_logs). Pilihan onboarding dan daftar pencarian terakhir yang ditampilkan kembali tidak pernah menyentuh server: localStorage di browser pengguna saja. Pengecualiannya adalah kata kunci pencarian, yang dicatat sebagai event analitik anonim lewat `/api/analytics` (tanpa nama, tanpa IP mentah) untuk semua pengunjung, termasuk tamu. Tracker lamaran tersimpan di browser, dan tersinkron ke akun bila pengunjung masuk. Pengaturan (/pengaturan) menunjukkan apa yang tersimpan di browser dan bisa menghapusnya.

## Direction contract (surface: web/app)

- THESIS: the tool is the hero. The first viewport is a working search, not a headline about a search. The app has clear screens (Beranda, Cari, Dasbor, detail per company, Tentang, Metode, FAQ) behind one navigation, each with one job. It refuses the category default: dark band plus giant headline plus three equal cards plus staggered reveals.
- OWN-WORLD: near-black header and footer on white ground, hairline dividers, 12px cards, pill chips, 8px inputs and buttons, system font stack, tabular numbers. Color only for function: green for companies with openings, gray everything else. No gradients, no glass, no glow, no eyebrow labels, no side stripes, no stock decoration.
- STORY: the visitor understands in one glance that this is 610 real checked channels, believes the numbers because every figure is computed from the data, and acts by typing domicile and position, then opening a channel.
- FIRST VIEWPORT: left-aligned headline (two lines max) and one short subtext above a real search form (Domisili, Posisi atau perusahaan, Cari). Quick examples underneath with real queries. Stats as a plain figure strip with hairline dividers, not cards.
- FORM: code-led (Operate surface). Signature interaction: typing a domicile and position re-ranks 610 real companies instantly, with match chips explaining each rank.
- FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
