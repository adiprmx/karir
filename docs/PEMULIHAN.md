# Pemulihan data

Dokumen ini menjelaskan cara memulihkan data Karir bila ada yang rusak
atau hilang. Terakhir diperbarui: 15 November 2026.

## Prinsip

- **CSV adalah sumber kebenaran** (`data/daftar-link-karir.csv`): satu
  baris per perusahaan, 13 kolom. Semua pemulihan berangkat dari CSV.
  Lihat keputusan S1 di `docs/ARCHITECTURE.md`.
- **Firestore adalah cermin live** (proyek `karir-9d53a`, koleksi
  `companies`): salinan CSV yang bisa lebih baru maksimal 24 jam
  karena cron cek ulang menulis status dan tanggal cek langsung ke
  Firestore. Selisih itu disalin kembali ke CSV oleh write-back
  harian (workflow `.github/workflows/write-back.yml`, tiap hari
  03:00 WIB).
- **Seed adalah salinan CSV** (`web/data/companies.json`): cadangan
  yang dibaca aplikasi saat Firestore tidak bisa dijangkau. Isinya
  harus selalu sama persis dengan CSV (dijaga
  `scripts/check-consistency.py` di CI). Seed bukan sumber data
  baru — jangan pernah memulihkan CSV dari seed, karena seed hanya
  menyalin CSV.
- **Hanya koleksi `companies` yang bisa dipulihkan dari CSV.**
  Koleksi lain (`changes`, `alerts`, `audit_logs`, `reports`,
  `analytics_events`, `user_trackers`, `user_profiles`, `meta`,
  `rate_limits`) tidak ada salinannya di repo. Bila salah satunya
  rusak, yang bisa dilakukan hanyalah membangunnya ulang dari nol
  (misalnya `meta/lastChange` dibuat lagi dengan rev 1) atau
  membiarkannya terisi kembali oleh cron dan pemakaian aplikasi.
  Belum ada ekspor backup otomatis untuk koleksi-koleksi itu.

Skrip impor kanonis dan write-back agent-side tinggal di luar repo,
di `~/workspace/.claude-v280/` (mesin pengelola). Perintah-perintah di
bawah memakai jalur itu; sesuaikan bila mesinnya berbeda.

## Skenario 1: dokumen Firestore rusak atau hilang (pulihkan dari CSV)

Gunakan skrip impor kanonis `import_canonical.py`. Skrip ini membaca
CSV langsung dan menulis ke-13 field per dokumen dengan `updateMask`
lengkap; dokumen yang belum ada dibuat lewat POST create dengan ID
dokumen sama dengan nomor baris. Setelah menulis, skrip memverifikasi
dengan baca-balik ke-13 field tiap dokumen, lalu menaikkan rev marker
`meta/lastChange` supaya instance web refill dari Firestore.

Skrip ini TIDAK menulis massal tanpa daftar nomor eksplisit: tanpa
`--dry-run` dan tanpa `--only`, skrip berhenti. CSV bawaan skrip
adalah CSV repo hunting harian — untuk memulihkan dari CSV repo ini,
tambahkan `--csv` yang menunjuk ke CSV repo Karir.

1. Pastikan CSV repo ini valid dulu, dari root repo:

   ```bash
   python3 scripts/validate.py
   python3 scripts/check-consistency.py
   ```

   Keduanya harus lolos. Jangan memulihkan dari CSV yang gagal
   validasi.

2. Lihat dulu apa yang akan ditulis (dry-run, tidak menulis apa pun):

   ```bash
   python3 ~/workspace/.claude-v280/import_canonical.py \
     --csv data/daftar-link-karir.csv --dry-run
   ```

3. Tulis ulang dokumen yang rusak saja, sebut nomornya satu per satu:

   ```bash
   python3 ~/workspace/.claude-v280/import_canonical.py \
     --csv data/daftar-link-karir.csv --only 1,299,568
   ```

   Untuk memulihkan SELURUH koleksi (misalnya Firestore dikosongkan),
   buat daftar nomor dari CSV lalu berikan ke `--only`:

   ```bash
   NOMOR=$(python3 -c "import csv; print(','.join(r['no'] for r in csv.DictReader(open('data/daftar-link-karir.csv', encoding='utf-8'))))")
   python3 ~/workspace/.claude-v280/import_canonical.py \
     --csv data/daftar-link-karir.csv --only "$NOMOR"
   ```

4. Verifikasi: skrip sudah memverifikasi baca-balik tiap dokumen dan
   melaporkan selisih bila ada. Setelah itu, cek situs live menjawab
   dari Firestore (bukan seed):

   ```bash
   python3 scripts/check-consistency.py --live
   ```

   Perintah ini membaca seluruh daftar dari situs live dan
   menghabiskan kuota baca — jalankan hanya saat pemulihan, bukan
   rutin. Bila `--live` lolos, pemulihan selesai.

Catatan: impor memakai token service account (dibuat ulang otomatis
oleh skrip lewat `sa_token.py` bila hilang atau lebih dari 50 menit).
Jangan pernah melakukan PATCH tanpa `updateMask` lengkap — field yang
tidak disebut bisa terhapus.

Jalur alternatif di dalam repo, `web/scripts/import-firestore.mjs`,
membaca seed (bukan CSV) dan membuat dokumen lewat create per dokumen.
Jalur ini hanya untuk mengisi koleksi kosong: impor ulang menabrak
HTTP 409 karena ID dokumen sudah ada, dan tulisnya hanya jalan bila
aturan Firestore membuka tulis sementara. Untuk pemulihan, jalur
kanonis di atas yang dipakai.

## Skenario 2: seed tidak sama dengan CSV (regenerasi seed)

Seed dibuat dari CSV dengan resep yang sama seperti yang dipakai
workflow write-back: tiap baris CSV menjadi satu entri JSON dengan
ke-13 field, `no` sebagai angka, sisanya string. Regenerasi dari root
repo:

```bash
python3 - <<'PY'
import csv, json
FIELDS = ["no", "perusahaan", "kategori", "link_karir", "status",
          "tanggal_cek", "catatan", "lokasi", "posisi", "email_hrd",
          "wa_hrd", "kontak_lain", "batas_lamar"]
with open("data/daftar-link-karir.csv", newline="", encoding="utf-8") as fh:
    rows = list(csv.DictReader(fh))
seed = [{k: (int(r["no"]) if k == "no" else r.get(k, ""))
         for k in FIELDS} for r in rows]
with open("web/data/companies.json", "w", encoding="utf-8") as fh:
    fh.write(json.dumps(seed, indent=1, ensure_ascii=False))
print(f"seed ditulis: {len(seed)} entri")
PY
```

Lalu verifikasi 0 selisih:

```bash
python3 scripts/check-consistency.py
```

Perintah ini juga memeriksa angka-angka README terhadap CSV, jadi
sekali jalan sudah mencakup keduanya. Jangan mengedit
`web/data/companies.json` dengan tangan — edit CSV-nya, lalu
regenerasi seed dengan cara di atas.

## Skenario 3: CSV dan Firestore menyimpang (rekonsiliasi)

Gejalanya: `scripts/check-consistency.py --live` gagal, atau write-back
harian tidak jalan (misalnya situs menyajikan seed selama insiden
kuota, sehingga workflow write-back berhenti tanpa menulis).

Langkah rekonsiliasi:

1. Lihat selisihnya dulu. Dari root repo:

   ```bash
   python3 scripts/check-consistency.py
   python3 scripts/check-consistency.py --live
   ```

   Cek pertama membandingkan CSV vs seed (harus 0 selisih). Cek kedua
   membandingkan CSV vs situs live: field statis harus 0 selisih,
   sedangkan status dan tanggal cek live boleh lebih baru maksimal
   24 jam. Bila live lebih tua dari CSV, atau lebih baru lebih dari
   24 jam, itu tanda write-back macet.

2. Bila selisihnya hanya status/tanggal cek yang live-nya lebih baru:
   itu selisih yang sah dan akan diselesaikan write-back harian
   berikutnya (03:00 WIB). Untuk menyelesaikan segera tanpa menunggu
   jadwal, jalankan workflow "Write-back harian" manual dari tab
   Actions di GitHub (`workflow_dispatch`), atau jalankan skrip
   agent-side dari mesin pengelola:

   ```bash
   python3 ~/workspace/.claude-v280/write_back.py --repo . --apply
   ```

   Tanpa `--apply`, skrip hanya menampilkan rencana (dry-run).
   Skrip ini hanya membaca Firestore dan menulis CSV + seed; ia
   tidak pernah menulis ke Firestore dan tidak menyentuh marker.
   Aturan penerapannya: tanggal cek live lebih baru dari CSV maka
   status + tanggal cek live diterapkan; tanggal cek live lebih tua
   maka dilewati dengan peringatan (CSV lebih baru — hunting yang
   akan mengimpornya ke live); field statis yang berbeda hanya
   dilaporkan, tidak diterapkan, kecuali dengan `--include-static`.

3. Bila selisihnya ada di field statis (nama, tautan, catatan, kanal):
   jangan menerapkan otomatis. Periksa dulu mana yang benar —
   biasanya CSV yang benar karena field statis hanya berubah lewat
   hunting dan impor kanonis. Bila Firestore yang salah, perbaiki
   dengan impor kanonis (Skenario 1, `--only` nomor yang
   bersangkutan). Bila CSV yang salah (misalnya edit panel admin
   yang belum tersalin), terapkan dengan
   `write_back.py --include-static --apply` setelah memeriksa
   selisihnya satu per satu di mode dry-run.

4. Bila ada dokumen live yang tidak ada di CSV, atau baris CSV yang
   hilang di live: keduanya hanya dilaporkan, tidak pernah
   diterapkan otomatis oleh write-back. Dokumen live tanpa baris CSV
   ditambahkan ke CSV hanya bila nomornya berurutan (max+1) dan
   dengan `--allow-new`; baris CSV yang hilang di live dipulihkan
   dengan impor kanonis (Skenario 1).

5. Setelah rekonsiliasi, jalankan lagi kedua cek di langkah 1 sampai
   lolos, lalu commit CSV + seed bila berubah.

## Skenario 4: marker kesegaran hilang atau macet

Marker `meta/lastChange` (`{rev, updatedAt, counterDay,
refillsToday, readsEstimate}`) adalah satu-satunya yang dibaca
aplikasi tiap 5 menit untuk tahu apakah data berubah. Bila dokumen
ini hilang, aplikasi tetap jalan dari seed (degradasi tanpa 503),
tetapi data baru di Firestore tidak akan pernah ter-refill.

- Bila hilang: buat lagi dengan rev 1. Impor kanonis apa pun
  (`--only` minimal satu nomor) akan menaikkan rev dan membuat
  marker berfungsi lagi, karena skrip menaikkan marker setiap kali
  ia menulis dokumen.
- Bila rev tidak naik setelah impor: periksa log impor — marker
  hanya naik bila ada dokumen yang benar-benar tertulis
  (`ok > 0`). Impor yang tidak menulis apa pun (semua dokumen sudah
  sama) memang tidak menyentuh marker.

## Yang tidak tercakup dokumen ini

- Pemulihan akun Firebase Auth dan aturan Firestore: aturan
  Firestore tersimpan di repo (`web/firestore.rules`) dan diterbitkan
  ulang dari Firebase Console bila perlu. Akun admin dibuat ulang
  di Firebase Console dengan custom claim `admin: true`.
- Pemulihan cron dan notifikasi: lihat `docs/monitoring-cron.md`.
- Cadangan di luar CSV: belum ada. Bila suatu hari ekspor backup
  otomatis dibangun, dokumen ini diperbarui dengan lokasi dan cara
  memakainya.
