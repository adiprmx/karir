<!-- Satu perubahan per pull request. Hapus bagian yang tidak relevan. -->

## Apa yang berubah

<!-- Jelaskan singkat: apa yang berubah dan kenapa. -->

## Untuk perubahan data

<!-- Isi bila pull request mengubah data/daftar-link-karir.csv. -->

- Tautan halaman resmi yang dibuka:
- Tanggal pengecekan (YYYY-MM-DD):
- Nomor perusahaan yang berubah:

## Untuk perubahan kode

<!-- Isi bila pull request mengubah aplikasi di web/. -->

- Alasan menambah dependensi (bila ada):

## Checklist

- [ ] Untuk perubahan data: tautan ditemukan lewat navigasi situs resmi perusahaan, bukan cuplikan pencarian, postingan media sosial, job board pihak ketiga, atau tautan pemendek sebagai tautan karir.
- [ ] Untuk perubahan data: `python3 scripts/validate.py` dan `python3 scripts/check-consistency.py` lolos.
- [ ] Untuk perubahan kode: `npm test`, `npm run lint`, dan `npm run build` lolos (dari folder `web/`).
- [ ] Tidak ada data pribadi, kata sandi, kunci API, atau nilai Firebase asli di pull request ini.
- [ ] Aturan di `CONTRIBUTING.md` dan `docs/METODE.md` sudah diikuti.
