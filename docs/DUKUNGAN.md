# Dukungan pengguna: proses internal

Dokumen ini untuk pengelola Karir. Isinya: kanal dukungan yang ada,
cara menriase laporan tautan mati, status tindak lanjut, dan perbaikan
yang masih tertunda. Terakhir diperbarui 15 November 2026.

Halaman yang dilihat pengguna ada di `/dukungan`. Dokumen ini tidak
ditautkan dari situs.

## Kanal dukungan

Yang ada hari ini:

- Laporan tautan mati dari halaman detail perusahaan. Formulir anonim,
  tanpa login, menulis ke koleksi `reports` di Firestore.
- Issue GitHub dengan template Koreksi data
  (`github.com/adiprmx/karir/issues/new?template=koreksi.md`). Dipakai
  untuk koreksi data dan, untuk sekarang, usulan perusahaan baru.
- Halaman Pertanyaan umum (`/faq`) dan Metode (`/metode`) sebagai
  bantuan mandiri.

Yang tidak ada (jangan dijanjikan ke pengguna):

- Tidak ada GitHub Discussions di repo ini (tidak aktif). Jangan
  mengarahkan pengguna ke sana. Satu tautan lama masih mengarah ke
  Discussions di `.github/ISSUE_TEMPLATE/config.yml`; lihat
  "Perbaikan tertunda" di bawah.
- Tidak ada email, chat, atau nomor telepon bantuan.
- Tidak ada balasan perorangan untuk laporan tautan mati, karena
  laporan tidak meminta nama atau kontak. Ini pilihan privasi yang
  disengaja, konsisten dengan janji di FAQ dan kebijakan privasi.

## Alur laporan tautan mati

1. Pengunjung membuka halaman perusahaan, membuka bagian "Ada yang
   salah? Laporkan tautan mati", menulis alasan, lalu mengirim.
2. Laporan tersimpan di koleksi `reports` dengan field `no`,
   `perusahaan`, `alasan`, `dibuat`. Hanya admin yang bisa membaca
   laporan (aturan Firestore, sejak Fase 1). Laporan tidak bisa
   diubah atau dihapus dari klien.
3. Admin membuka panel `/admin`, seksi "Laporan tautan mati".
   Komponennya ada di `web/app/admin/support-reports.js`.
4. Admin menriase (lihat di bawah), memperbaiki data bila perlu, lalu
   menandai laporan "sudah ditangani".

## Triase laporan

Kerjakan laporan dari yang paling baru, satu per satu:

1. Buka tautan "Lihat perusahaan" dan periksa kanal karir perusahaan
   itu langsung di browser.
2. Bila tautan memang mati atau salah, perbaiki datanya lewat panel
   admin atau impor CSV, seperti perbaikan data biasa. Sumber
   kebenaran tetap CSV; perbaikan di Firestore ikut write-back
   harian.
3. Bila tautan ternyata masih bisa dibuka, tidak ada yang perlu
   diperbaiki. Tandai saja sudah ditangani.
4. Bila laporan tidak jelas (alasan terlalu singkat atau tidak
   menyebut masalahnya), tidak ada yang bisa ditindaklanjuti.
   Tandai sudah ditangani.
5. Bila laporan yang sama masuk berkali-kali untuk perusahaan yang
   sama, tangani satu kali dan tandai semuanya sudah ditangani.
6. Bila tautan diperbaiki dan status perusahaan berubah, perubahan
   itu tercatat otomatis di umpan perubahan ("Yang berubah" di
   Beranda) oleh cron cek ulang harian. Itu satu-satunya kabar hasil
   yang bisa dilihat pelapor, tanpa identitas.

Tidak ada janji waktu balasan atau waktu perbaikan. Laporan dibaca
saat pengelola membuka panel admin. Perbaikan data yang masuk lewat
laporan ikut cek ulang harian pukul 01.00 WIB, sama seperti perbaikan
lainnya.

## Status tindak lanjut

Laporan punya field `status`: `baru` atau `ditangani`. Laporan lama
yang belum punya field ini dianggap `baru`. Saat ditandai, komponen
juga menulis `ditanganiPada` (cap waktu server). Membatalkan tanda
menghapus `ditanganiPada` dan mengembalikan status ke `baru`.

Status hanya bisa disimpan setelah aturan Firestore di bawah
diterbitkan. Sampai saat itu, tombol status menampilkan pesan bahwa
aturan belum mengizinkan. Aturan yang dibutuhkan (ganti blok
`match /reports/{doc}` di `web/firestore.rules`, baris 87-96):

```
match /reports/{doc} {
  allow read: if isAdmin();
  allow create: if request.resource.data.keys().hasAll(
      ['no', 'perusahaan', 'alasan', 'dibuat'])
    && request.resource.data.no is int
    && request.resource.data.alasan is string
    && request.resource.data.alasan.size() > 0
    && request.resource.data.alasan.size() < 500
    && request.resource.data.dibuat is string
    && request.resource.data.perusahaan is string;
  allow update: if isAdmin()
    && request.resource.data.diff(resource.data).affectedKeys()
        .hasOnly(['status', 'ditanganiPada'])
    && request.resource.data.status in ['baru', 'ditangani'];
  allow delete: if false;
}
```

Dua baris validasi `dibuat` dan `perusahaan` pada create ikut
menutup DUKUNG-08 (urutan daftar tidak bisa dipalsukan dengan cap
waktu masa depan atau nama bukan string). Update dibatasi hanya
untuk dua field status, jadi isi laporan asli tidak bisa diubah
admin lewat celah ini. Hapus tetap dilarang: laporan adalah jejak,
status adalah cara mengosongkan antrean.

Wiring komponen ke panel admin (koordinator, setelah T15 merge):
hapus state `reports`/`reportsError`, fungsi `loadReports`, dan
blok render laporan lama di `web/app/admin/page.js`, lalu render
`<SupportReports db={db} />`. Petunjuk persis ada di komentar
kepala `web/app/admin/support-reports.js`.

## Notifikasi laporan baru

Hari ini belum ada notifikasi otomatis saat laporan masuk
(DUKUNG-01). Admin hanya tahu setelah membuka panel. Yang sudah
ada sebagai pengganti sementara:

- Tombol "Muat ulang" di seksi laporan, supaya daftar bisa
  diperbarui tanpa memuat ulang seluruh halaman.
- Penghitung "laporan masuk sejak terakhir kali panel ini dibuka"
  (cap waktu kunjungan terakhir tersimpan di browser admin).
- Chip "Baru" dan filter Baru / Sudah ditangani.

Rencana yang masih tertunda (butuh kerja backend, di luar cakupan
T12): tipe `report` di koleksi `alerts` + watcher Telegram yang
sudah dipakai untuk target baru dan tenggat, atau ringkasan laporan
baru di cron cek ulang harian. Sampai itu ada, periksa laporan
setiap kali membuka panel admin.

## Spam dan penyalahgunaan

Formulir laporan hari ini tanpa perlindungan spam (DUKUNG-04):
anonim, tanpa batas laju, dan bisa dikirim berulang. Perbaikan yang
direncanakan (milik backend/security, bukan T12): pindahkan
pengiriman laporan ke route API server dengan batas laju per
pengunjung dan validasi bentuk, tambahkan jeda kirim ulang di
klien, dan deteksi duplikat sederhana (perusahaan dan alasan yang
sama dalam waktu dekat).

Sementara itu, bila laporan sampah masuk: tandai sudah ditangani
supaya keluar dari filter Baru. Jangan hapus laporan (aturan
melarang hapus, dan jejak tetap berguna bila pola spam perlu
dipelajari).

## Perbaikan tertunda (spesifikasi)

### DUKUNG-03: batas 500 karakter dan pesan error yang menyesatkan

Klien mengizinkan alasan tepat 500 karakter
(`web/app/perusahaan/[no]/actions.js`: `slice(0, 500)` dan
`maxLength={500}`), tetapi aturan menuntut kurang dari 500
(`alasan.size() < 500`). Alasan tepat 500 karakter lolos klien
lalu ditolak server, dan semua kegagalan menampilkan pesan yang
menyalahkan koneksi.

Perbaikan (milik tema yang memegang actions.js): selaraskan batas
di satu sisi saja (klien `slice(0, 499)` atau aturan
`<= 500`), dan bedakan pesan error penolakan validasi dari error
jaringan di actions.js. Pesan gagal saat ini hardcode di
actions.js, bukan di i18n.

### DUKUNG-08: validasi aturan laporan

Tertutup oleh dua baris validasi pada create di blok aturan di
atas (`dibuat is string`, `perusahaan is string`). Diterbitkan
bersama aturan update status.

### Tautan Discussions di config template issue

`.github/ISSUE_TEMPLATE/config.yml` masih mengarahkan "Pertanyaan
umum" ke `github.com/adiprmx/karir/discussions`, padahal
Discussions tidak aktif di repo ini. Perbaiki saat template issue
usulan perusahaan baru (COM-02, T19) dikerjakan: ganti tautan itu
dengan halaman Dukungan di situs, atau hapus contact link-nya.
Jangan mengarahkan pengguna ke Discussions sebelum owner
memutuskan komunitas diaktifkan (keputusan S9).

### Template usulan perusahaan baru (COM-02)

Hari ini usulan perusahaan baru masuk lewat template Koreksi data
(kolom Yang benar), karena issue kosong dimatikan
(`blank_issues_enabled: false`) dan belum ada template usulan.
Begitu template usulan ada (T19), perbarui seksi "Usulkan
perusahaan baru" di `/dukungan` dan jawaban "Bagaimana
berkontribusi?" di FAQ dengan tautan langsung ke template itu.

## Privasi

Laporan tautan mati tidak mengandung data pribadi: hanya nomor
dan nama perusahaan, alasan, dan waktu. Baca laporan dibatasi
untuk admin. Kebijakan privasi (`/privasi`) sudah menjelaskan
hal ini ke pengguna; bila alur laporan berubah (misalnya mulai
meminta kontak), perbarui kebijakan itu dulu sebelum mengubah
formulir.

## File terkait

- `web/app/dukungan/page.js`: halaman dukungan untuk pengguna.
- `web/app/faq/page.js`: tanya jawab dukungan (laporan, balasan,
  kanal bertanya).
- `web/app/admin/support-reports.js`: seksi laporan di panel admin
  (muat ulang, filter, status tindak lanjut).
- `web/app/perusahaan/[no]/actions.js`: formulir laporan di halaman
  detail (bukan cakupan T12).
- `web/firestore.rules` (blok `reports`): aturan baca/tulis
  laporan; perubahan aturan ada di atas.
- `.github/ISSUE_TEMPLATE/koreksi.md`: template Koreksi data.
