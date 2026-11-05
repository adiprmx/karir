<p align="center">
  <h1 align="center">Karir</h1>
  <p align="center">Kanal karir resmi 405 perusahaan Indonesia, masing-masing dibuka dan diperiksa langsung di browser pada 4 dan 5 November 2026.</p>
  <p align="center">
    <a href="https://github.com/adiprmx/karir/actions/workflows/validate.yml"><img src="https://github.com/adiprmx/karir/actions/workflows/validate.yml/badge.svg" alt="Validasi data"></a>
  </p>
</p>

| 405 | 22 | 5 | 5 Nov 2026 |
| --- | --- | --- | --- |
| perusahaan | lowongan target | syarat tidak cocok | terakhir dicek |

Peran yang dicari: Helper Gudang, Staff Gudang, Cleaning Service, Office Boy, Packing, Operator Produksi, Helper Produksi, dan Crew Store. Lokasi yang diutamakan: Bogor, Depok, Cibinong, dan sekitarnya.

Link di sini mengarah ke halaman karir perusahaan. Halaman itu belum tentu sedang menampilkan lowongan, dan statusnya ditulis sesuai tanggal cek.

## Data

`data/daftar-link-karir.csv` berisi 405 baris dengan 9 kolom: no, perusahaan, kategori, link_karir, status, tanggal_cek, catatan, lokasi, posisi. File `data/daftar-link-karir.xlsx` isinya sama, ditambah sheet Petunjuk. Daftar lengkap lowongan target ada di `docs/TEMUAN.md`, riwayat perubahan di `CHANGELOG.md`.

| No | Perusahaan | Status | Lokasi | Posisi |
| --- | --- | --- | --- | --- |
| 212 | Novell Pharmaceutical Laboratories | Ada lowongan target | Gunung Putri, Bogor | HELPER |
| 246 | Ganesha Operation | Ada lowongan target | Bogor, Cibinong | Office Boy |
| 301 | BASF Care Chemicals Indonesia | Ada lowongan target | Jakarta | Production Operator |

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

## Lowongan di Bogor dan sekitarnya

| Perusahaan | Peran | Lokasi | Catatan |
| --- | --- | --- | --- |
| [OCS Group Indonesia](https://recruitment.dataon.com/ocsindonesia/) | CLEANER | Kab. Bogor | Min. SMA, maks. 40 tahun, min. 1 tahun pengalaman cleaning service |
| [Novell Pharmaceutical Laboratories](https://novellpharm.com/index.php?mod=professional) | HELPER | Gunung Putri, Bogor | |
| [Ganesha Operation](https://career.ganeshaoperation.com/lowongan?posisi=Office+Boy&kota=47%2C48) | Office Boy | Bogor dan Cibinong | |
| [Dexa Group](https://www.dexagroupcareer.com) | Production Staff A, Steril Novice Worker | Bekasi | |
| [Swiss-Belhotel International](https://jobs.talentics.id/swiss-belhotel-international/hotel-executive-housekeeper-housekeeping-manager-copy-1) | Hotel Executive Housekeeper | Kota Bogor | Tidak cocok: butuh S1 dan pengalaman 2 tahun |
| [KitaLulus](https://www.kitalulus.com/) | Staff Gudang, lewat platform | Cibinong | Tidak cocok: minimal D3/D4, pemberi kerja Titik Seduh Cibinong |

## Cara pakai

Buka `data/daftar-link-karir.csv`, saring kolom `status` ke "Ada lowongan target", lalu buka tautan karirnya dan baca syarat lengkapnya sebelum melamar. Lamar hanya lewat kanal resmi di daftar ini. Rekrutmen yang sah tidak memungut biaya.

## Metode

Setiap kanal dibuka langsung di browser lewat navigasi situs resmi perusahaan. Cuplikan pencarian, postingan pihak ketiga, dan tautan pemendek tidak dipakai sebagai bukti. Pengecekan ini hanya membuka halaman: tidak ada yang dilamar, tidak ada akun yang dibuat, tidak ada login, dan tidak ada data pribadi yang dimasukkan. Penjelasan lengkap ada di `docs/METODE.md`.

## Kontribusi dan lisensi

Usulan perusahaan baru, koreksi tautan, dan hasil cek ulang diterima lewat issue dan pull request. Setiap perubahan data harus dibuktikan dengan tautan halaman resmi yang dibuka langsung. Aturannya ada di `CONTRIBUTING.md`.

Kode dan skrip: MIT, lihat `LICENSE`. Data di `data/`: CC BY 4.0.
