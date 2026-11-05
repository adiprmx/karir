# Karir

[![Validate data](https://github.com/adiprmx/karir/actions/workflows/validate.yml/badge.svg)](https://github.com/adiprmx/karir/actions/workflows/validate.yml)

Kanal karir resmi 405 perusahaan, masing-masing dibuka dan diperiksa langsung di browser pada 4 dan 5 November 2026. Peran yang dicari: Helper Gudang, Staff Gudang, Cleaning Service, Office Boy, Packing, Operator Produksi, Helper Produksi, dan Crew Store, di Bogor, Depok, Cibinong, dan sekitarnya.

| Keterangan | Jumlah |
| --- | --- |
| Perusahaan | 405 |
| Tanggal cek | 4 November 2026 (81), 5 November 2026 (324) |
| Lowongan target | 22 |
| Lowongan target, syarat tidak cocok | 5 |
| Data | `data/daftar-link-karir.csv` |

Link di sini mengarah ke halaman karir perusahaan. Halaman itu belum tentu sedang menampilkan lowongan. Status ditulis sesuai tanggal cek, dan lowongan bisa berubah setelah tanggal itu.

## Isi repo

| File | Isi |
| --- | --- |
| `data/daftar-link-karir.csv` | Seluruh 405 baris |
| `data/daftar-link-karir.xlsx` | Spreadsheet yang sama, dengan sheet Petunjuk dan List Link Karir |
| `docs/METODE.md` | Cara pengecekan, arti status, dan batasan daftar |
| `docs/TEMUAN.md` | Semua lowongan target, lengkap dengan tautan dan catatan |
| `CHANGELOG.md` | Perubahan tiap versi |

## Status

| Status | Jumlah |
| --- | --- |
| Tidak ada lowongan target | 152 |
| Tidak ada lowongan terlihat | 77 |
| Tidak dapat diverifikasi | 83 |
| Portal tidak bisa dibuka | 66 |
| Ada lowongan target | 22 |
| Ada lowongan target (tidak cocok) | 5 |

Portal tidak bisa dibuka berarti situs atau portal karirnya tidak bisa diakses saat dicek. Itu kegagalan akses, bukan bukti perusahaan tidak membuka lowongan. Tidak dapat diverifikasi berarti tidak ada kanal karir yang ditemukan lewat navigasi resmi perusahaan.

## Lowongan target di Bogor dan sekitarnya

| Perusahaan | Peran | Lokasi |
| --- | --- | --- |
| [OCS Group Indonesia](https://recruitment.dataon.com/ocsindonesia/) | CLEANER | Kab. Bogor |
| [Novell Pharmaceutical Laboratories](https://novellpharm.com/index.php?mod=professional) | HELPER | Gunung Putri, Bogor |
| [Ganesha Operation](https://career.ganeshaoperation.com/lowongan?posisi=Office+Boy&kota=47%2C48) | Office Boy | Bogor dan Cibinong |
| [Dexa Group](https://www.dexagroupcareer.com) | Production Staff A, Steril Novice Worker | Bekasi |
| [Swiss-Belhotel International](https://jobs.talentics.id/swiss-belhotel-international/hotel-executive-housekeeper-housekeeping-manager-copy-1) | Hotel Executive Housekeeper | Kota Bogor, tidak cocok: butuh S1 dan pengalaman 2 tahun |
| [KitaLulus](https://www.kitalulus.com/) | Staff Gudang, lewat platform, pemberi kerja Titik Seduh Cibinong | Cibinong, tidak cocok: minimal D3/D4 |

Syarat OCS: min. SMA/sederajat, maks. 40 tahun, min. 1 tahun pengalaman sebagai cleaning service. Daftar lengkap 22 lowongan target dan 5 yang tidak cocok ada di `docs/TEMUAN.md`.

## Cara pakai

Buka `data/daftar-link-karir.csv`, saring kolom `status` ke "Ada lowongan target", lalu buka tautan karirnya dan baca syarat lengkapnya sebelum melamar. Lamar hanya lewat kanal resmi di daftar ini. Rekrutmen yang sah tidak memungut biaya.

## Metode

Setiap kanal dibuka langsung di browser lewat navigasi situs resmi perusahaan. Cuplikan pencarian, postingan pihak ketiga, dan tautan pemendek tidak dipakai sebagai bukti. Tidak ada lamaran yang dikirim, tidak ada akun yang dibuat, tidak ada login, dan tidak ada data pribadi yang dimasukkan selama pengecekan. Penjelasan lengkap ada di `docs/METODE.md`.

## Berkontribusi

Usulan perusahaan baru, koreksi tautan, dan hasil cek ulang diterima lewat issue dan pull request. Setiap perubahan data harus dibuktikan dengan tautan halaman resmi yang dibuka langsung. Aturannya ada di `CONTRIBUTING.md`.

## Lisensi

Kode dan skrip: MIT, lihat `LICENSE`. Data di `data/`: CC BY 4.0.
