<p align="center">
  <img src="assets/banner.svg" alt="Karir" width="100%">
</p>

<p align="center">
  <a href="https://github.com/adiprmx/karir/actions/workflows/validate.yml"><img src="https://github.com/adiprmx/karir/actions/workflows/validate.yml/badge.svg" alt="Validasi data"></a>
  <a href="https://github.com/adiprmx/karir/blob/main/LICENSE"><img src="https://img.shields.io/github/license/adiprmx/karir" alt="Lisensi MIT"></a>
  <img src="https://img.shields.io/badge/perusahaan-405-black" alt="405 perusahaan">
</p>

<p align="center">Kanal karir resmi 405 perusahaan Indonesia. Masing-masing dibuka dan diperiksa langsung di browser pada 4 dan 5 November 2026.</p>

## Daftar isi

- [Sekilas](#sekilas)
- [Cara pakai](#cara-pakai)
- [Skema data](#skema-data)
- [Status](#status)
- [Lowongan di Bogor dan sekitarnya](#lowongan-di-bogor-dan-sekitarnya)
- [Metode](#metode)
- [Berkontribusi](#berkontribusi)
- [Lisensi](#lisensi)

## Sekilas

| Perusahaan | Lowongan target | Syarat tidak cocok | Terakhir dicek |
| --- | --- | --- | --- |
| 405 | 22 | 5 | 5 Nov 2026 |

Peran yang dicari: Helper Gudang, Staff Gudang, Cleaning Service, Office Boy, Packing, Operator Produksi, Helper Produksi, dan Crew Store. Lokasi yang diutamakan: Bogor, Depok, Cibinong, dan sekitarnya.

Link di sini mengarah ke halaman karir perusahaan. Halaman itu belum tentu sedang menampilkan lowongan, dan statusnya ditulis sesuai tanggal cek.

## Cara pakai

Buka `data/daftar-link-karir.csv`, saring kolom `status` ke "Ada lowongan target", lalu buka tautan karirnya dan baca syarat lengkapnya sebelum melamar. Lamar hanya lewat kanal resmi di daftar ini. Rekrutmen yang sah tidak memungut biaya.

Dengan Python:

```python
import pandas as pd

url = "https://raw.githubusercontent.com/adiprmx/karir/main/data/daftar-link-karir.csv"
df = pd.read_csv(url)
target = df[df.status == "Ada lowongan target"]
print(target[["perusahaan", "link_karir", "lokasi"]].to_string(index=False))
```

## Skema data

Satu baris per perusahaan, 9 kolom:

| Kolom | Isi | Contoh |
| --- | --- | --- |
| no | Nomor urut | 212 |
| perusahaan | Nama perusahaan | PT Novell Pharmaceutical Laboratories |
| kategori | Jenis perusahaan | Manufaktur |
| link_karir | Tautan kanal karir resmi | https://novellpharm.com/index.php?mod=professional |
| status | Hasil cek | Ada lowongan target |
| tanggal_cek | Tanggal pengecekan | 2026-11-05 |
| catatan | Catatan hasil cek | Judul persis HELPER, penempatan Gunung Putri Bogor |
| lokasi | Lokasi perusahaan atau lowongan | Gunung Putri Bogor |
| posisi | Peran target yang ditemukan | HELPER, WAREHOUSE STAFF |

File `data/daftar-link-karir.xlsx` isinya sama, ditambah sheet Petunjuk. Daftar lengkap lowongan target ada di `docs/TEMUAN.md`, riwayat perubahan di `CHANGELOG.md`.

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
| [PT Novell Pharmaceutical Laboratories](https://novellpharm.com/index.php?mod=professional) | HELPER | Gunung Putri, Bogor | Judul persis HELPER; WAREHOUSE STAFF juga tercantum di halaman yang sama |
| [Ganesha Operation](https://career.ganeshaoperation.com/lowongan?posisi=Office+Boy&kota=47%2C48) | Office Boy | Bogor dan Cibinong | Detail menulis umur maksimal 25 tahun sampai Oktober 2025, tapi lowongan tampil live |
| [PT Dexa Medica (Dexa Group)](https://www.dexagroupcareer.com) | Production Staff A, Steril Novice Worker | Bekasi | Production Staff A diposting 28 Okt 2026; Steril Novice Worker untuk pengemasan finished good |
| [Swiss-Belhotel International](https://jobs.talentics.id/swiss-belhotel-international/hotel-executive-housekeeper-housekeeping-manager-copy-1) | Hotel Executive Housekeeper | Kota Bogor | Tidak cocok: butuh S1 dan pengalaman 2 tahun |
| [KitaLulus](https://www.kitalulus.com/) | Staff Gudang, lewat platform | Cibinong | Tidak cocok: minimal D3/D4, pemberi kerja Titik Seduh Cibinong |

## Metode

Setiap kanal dibuka langsung di browser lewat navigasi situs resmi perusahaan. Cuplikan pencarian, postingan pihak ketiga, dan tautan pemendek tidak dipakai sebagai bukti. Pengecekan ini hanya membuka halaman: tidak ada yang dilamar, tidak ada akun yang dibuat, tidak ada login, dan tidak ada data pribadi yang dimasukkan. Penjelasan lengkap ada di `docs/METODE.md`.

## Berkontribusi

Usulan perusahaan baru, koreksi tautan, dan hasil cek ulang diterima lewat issue dan pull request. Setiap perubahan data harus dibuktikan dengan tautan halaman resmi yang dibuka langsung. Aturannya ada di `CONTRIBUTING.md`.

## Lisensi

Kode dan skrip: MIT, lihat `LICENSE`. Data di `data/`: CC BY 4.0.
