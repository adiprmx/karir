# PRODUCT.md — Karir (inferred from the owner's brief, 6 Nov 2026)

## Product truth

- Karir is a directory of 610 official career channels of Indonesian companies, each opened and checked live in a browser on 4–5 Nov 2026.
- The web app is full stack: Next.js 15 + React 19 on Vercel (https://karir-adiprmx.vercel.app/), Firestore database (`karir-9d53a`, 610 documents), server search API, admin panel at `/admin`. The old static version in folder `docs/` (GitHub Pages) is kept only as a previous version. No user accounts, no personal data, no analytics, no external fonts. Motion is restrained: sections reveal as they scroll into view, counters rise only when visible, a pulsing dot only for companies with openings, photos zoom slightly on hover, buttons press to scale 0.98, and live search results as you type.
- Data is honest: vacancy findings were checked for warehouse/production/cleaning/office boy/packing/crew store roles. Other roles are recommended as channels with an honest "not yet verified" label. Denial sentences in the data never count as matches.
- Budget is zero rupiah. The owner has no VPS. Control stays with the owner and the assistant only.

## Audience and job

Indonesian job seekers. They open the app, type where they live and what position they want, and get the official career channels worth opening. They must be able to tell within seconds whether a result is a verified vacancy or just a channel to check.

## Alur pengguna (satu garis lurus, tanpa cabang buntu)

1. Buka situs. Landing page langsung menjelaskan ini apa: 610 kanal karir resmi yang dicek langsung di browser, 288 di antaranya ada lowongan. Kolom pencarian ada di layar pertama, jadi pengunjung bisa langsung ketik domisili dan posisi tanpa daftar atau login.
2. Pengunjung baru tekan "Mulai" (tombol di header). Isi dua hal: domisili dan posisi yang dicari. Jawabannya hanya tersimpan di browsernya sendiri (localStorage, tidak dikirim ke mana pun), lalu ia langsung diarahkan ke hasil yang cocok. Bisa dilewati.
3. Cari (/cari). Hasil diurutkan pakai skor: posisi cocok paling berat (+50), lalu lokasi cocok (+30), lalu status ada lowongan (+20). Klik satu perusahaan, masuk ke halaman detailnya.
4. Detail perusahaan (/perusahaan/[no]). Status, lokasi, posisi, catatan hasil cek, dan tanggal dicek. Tombol "Buka portal karir" mengarah ke situs resmi perusahaan itu. Di bawahnya ada "Lamaran saya": tandai sebagai Ditandai, Sudah dilamar, Dipanggil, atau Ditolak, lengkap tanggal dan catatan (tersimpan di browser saja).
5. Lamaran Saya (/lamaran). Semua perusahaan yang ditandai terkumpul di satu halaman, dengan hitungan per status. Di sinilah pengguna mengelola proses lamarannya.
6. Peta (/peta). perusahaan yang ada lowongannya di peta per kota. Klik satu titik, keluar daftar perusahaan di kota itu.
7. Dasbor (/dasbor). Ruang kerja pribadi: sapaan sesuai domisili dan posisi dari langkah 2, daftar langkah berikutnya (isi pilihan, tandai lamaran pertama, periksa portal resmi), ringkasan lamaran, lalu grafik sebaran status dan daftar perusahaan yang ada lowongannya. Cap "Terakhir dicek ulang" menunjukkan seberapa segar datanya.
8. Admin (/admin, khusus owner). Login Firebase, lalu ubah data perusahaan, impor dan ekspor CSV, cek massal tautan perusahaan yang ada lowongannya, dan lihat laporan tautan mati dari pengunjung plus audit log.
9. Karir Hidup. Tiap jam 01:00 WIB cron mengecek ulang portal perusahaan yang ada lowongannya (288) dan portal yang sempat mati supaya ada jalan pulih; perubahan status masuk umpan "Yang berubah" di Beranda (koleksi `changes`), dan perubahan dalam 48 jam terakhir ditandai chip "Baru" di umpan, daftar perusahaan yang ada lowongannya di Dasbor, dan kartu perusahaan. Cron juga membandingkan daftar perusahaan yang ada lowongannya dengan snapshot run sebelumnya: lowongan baru dan batas lamar 0-3 hari lagi tercatat di koleksi `alerts` dan dikirim sekali sebagai satu pesan Telegram ke pemilik. Cek massal admin ikut mencatat perubahan yang sama. Portal yang tadinya mati lalu hidup lagi jadi "Tidak dapat diverifikasi" sampai dicek ulang manusia, karena cek tautan hanya membuktikan portal bisa dibuka, bukan lowongannya masih ada.

Alur data: Firestore (610 dokumen) → API server → halaman. Tulis data hanya lewat admin panel (tercatat di audit_logs). Tracker lamaran, pilihan onboarding, dan pencarian terakhir tidak pernah menyentuh server: localStorage di browser pengguna saja. Pengaturan (/pengaturan) menunjukkan apa yang tersimpan di browser dan bisa menghapusnya.

## Direction contract (surface: web/app)

- THESIS: the tool is the hero. The first viewport is a working search, not a headline about a search. The app has clear screens (Beranda, Cari, Dasbor, detail per company, Tentang, Metode, FAQ) behind one navigation, each with one job. It refuses the category default: dark band plus giant headline plus three equal cards plus staggered reveals.
- OWN-WORLD: near-black header and footer on white ground, hairline dividers, 12px cards, pill chips, 8px inputs and buttons, system font stack, tabular numbers. Color only for function: green for companies with openings, gray everything else. No gradients, no glass, no glow, no eyebrow labels, no side stripes, no stock decoration.
- STORY: the visitor understands in one glance that this is 610 real checked channels, believes the numbers because every figure is computed from the data, and acts by typing domicile and position, then opening a channel.
- FIRST VIEWPORT: left-aligned headline (two lines max) and one short subtext above a real search form (Domisili, Posisi atau perusahaan, Cari). Quick examples underneath with real queries. Stats as a plain figure strip with hairline dividers, not cards.
- FORM: code-led (Operate surface). Signature interaction: typing a domicile and position re-ranks 610 real companies instantly, with match chips explaining each rank.
- FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
