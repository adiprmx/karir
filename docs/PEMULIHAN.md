# Pemulihan data

Dokumen ini menjelaskan cara memulihkan data Karir bila ada yang rusak
atau hilang. Terakhir diperbarui: 18 November 2026 (P-03: cadangan
penuh + drill restore + retensi + ekspor Auth).

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
- **Cadangan Firestore mingguan mencakup SEMUA koleksi** (11 koleksi
  tingkat atas + subkoleksi `user_trackers/{uid}/items`):
  `companies`, `changes`, `cron-runs`, `push_subscriptions`,
  `alerts`, `analytics_events`, `audit_logs`, `meta`, `rate_limits`,
  `reports`, `user_profiles`. Workflow
  `.github/workflows/backup.yml` jalan tiap Minggu 02:00 UTC (09:00
  WIB) dan menyimpan hasilnya sebagai artifact (retensi 90 hari).
  Cadangan TIDAK PERNAH di-commit ke repo: isinya mencakup data
  yang terhubung ke pengguna. `push_subscriptions` adalah koleksi
  yang paling tidak tergantikan — endpoint + kunci langganan tidak
  dapat dibangun ulang dari sumber lain bila hilang.
- **Restore diuji lewat drill, bukan dipercaya begitu saja.**
  Skrip `web/scripts/restore-firestore.mjs` memulihkan cadangan ke
  koleksi uji berawalan `restore_drill_YYYYMMDD` dan memverifikasi
  hitungan terhadap manifest (Skenario 5). Drill dijadwalkan tiap
  6 bulan (minggu pertama Mei dan November) dan sesudah setiap
  perubahan skema atau perubahan skrip backup/restore.
- **Ekspor Auth bulanan** (workflow `.github/workflows/export-auth.yml`,
  tiap tanggal 1): daftar pengguna Firebase Auth (UID, email, claim
  admin) diekspor dan DIENKRIPSI (gpg AES-256) sebelum diunggah
  sebagai artifact. Tanpa ekspor ini, kehilangan proyek berarti
  seluruh data akun kehilangan pemiliknya meskipun dokumen Firestore
  berhasil dipulihkan.
- **Arsip changes bulanan** (workflow
  `.github/workflows/archive-changes.yml`, tiap tanggal 1): dokumen
  `changes` berumur >150 hari diarsipkan ke repo
  (`data/archives/changes-archive-{YYYY-MM}.json`) sebelum cron
  cleanup menghapus dokumen berumur >180 hari. Arsip adalah data
  publik dan aman di-commit.
- **Retensi yang berlaku** (cron cleanup, Senin 02:00 WIB):
  `analytics_events` 90 hari, `rate_limits` 7 hari, `alerts`
  90 hari, `changes` 180 hari (sesudah diarsipkan), `reports`
  180 hari, `audit_logs` 365 hari, `cron-runs` 90 hari. Tiga nilai
  terakhir adalah NILAI INTERIM yang ditetapkan koordinator
  18 Nov 2026 dan menunggu konfirmasi pemilik sebelum P-09.

Skrip impor kanonis dan write-back tinggal di repo (`scripts/`),
salinan berversi sejak P-03 (menutup T11/DX-08). Salinan agent-side
di mesin pengelola (`~/workspace/.claude-v280/`) tetap dipakai untuk
hunting harian dan wajib diselaraskan dari salinan repo bila logika
berubah. Perintah-perintah di bawah memakai salinan repo; jalankan
dari root repo. Jalur secret selalu lewat environment variable
(`KARIR_SA_JSON`, `KARIR_SA_TOKEN_FILE`) — tidak ada nilai rahasia
di repo maupun di dokumen ini.

## Skenario 1: dokumen Firestore rusak atau hilang (pulihkan dari CSV)

Gunakan skrip impor kanonis `scripts/import_canonical.py`. Skrip ini
membaca CSV langsung dan menulis ke-13 field per dokumen dengan
`updateMask` lengkap; dokumen yang belum ada dibuat lewat POST create
dengan ID dokumen sama dengan nomor baris. Setelah menulis, skrip
memverifikasi dengan baca-balik ke-13 field tiap dokumen, lalu
menaikkan rev marker `meta/lastChange` supaya instance web refill
dari Firestore.

Skrip ini TIDAK menulis massal tanpa daftar nomor eksplisit: tanpa
`--dry-run` dan tanpa `--only`, skrip berhenti. CSV bawaan skrip
adalah CSV repo ini (`data/daftar-link-karir.csv`).

1. Pastikan CSV repo ini valid dulu, dari root repo:

   ```bash
   python3 scripts/validate.py
   python3 scripts/check-consistency.py
   ```

   Keduanya harus lolos. Jangan memulihkan dari CSV yang gagal
   validasi.

2. Lihat dulu apa yang akan ditulis (dry-run, tidak menulis apa pun):

   ```bash
   python3 scripts/import_canonical.py --dry-run
   ```

3. Tulis ulang dokumen yang rusak saja, sebut nomornya satu per satu:

   ```bash
   python3 scripts/import_canonical.py --only 1,299,568
   ```

   Untuk memulihkan SELURUH koleksi (misalnya Firestore dikosongkan),
   buat daftar nomor dari CSV lalu berikan ke `--only`:

   ```bash
   NOMOR=$(python3 -c "import csv; print(','.join(r['no'] for r in csv.DictReader(open('data/daftar-link-karir.csv', encoding='utf-8'))))")
   python3 scripts/import_canonical.py --only "$NOMOR"
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
oleh skrip lewat `scripts/sa_token.py` bila hilang atau lebih dari
50 menit; service account dibaca dari env `KARIR_SA_JSON`).
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
   python3 scripts/write_back.py --repo . --apply
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

## Skenario 5: drill restore (latihan pemulihan berkala)

Drill membuktikan cadangan benar-benar dapat dipulihkan — cadangan
yang belum pernah diuji pemulihannya belum terbukti sebagai cadangan.
Drill memulihkan cadangan ke KOLEKSI UJI berawalan
`restore_drill_YYYYMMDD` di proyek yang sama (bukan ke produksi),
memverifikasi hitungan terhadap manifest, lalu membersihkan koleksi
uji. Jadwal: tiap 6 bulan (minggu pertama Mei dan November) dan
sesudah setiap perubahan skema atau perubahan skrip backup/restore.

1. Unduh artifact cadangan mingguan penuh terbaru dari tab Actions
   repo (workflow "Backup Firestore") dan ekstrak ke direktori
   lokal, mis. `web/backups/2026-11-22`. Periksa manifest-nya:

   ```bash
   cat web/backups/2026-11-22/manifest.json
   ```

   Catat hitungan dokumen per koleksi — angka inilah yang harus
   cocok sesudah pemulihan.

2. Lihat rencana drill dulu (dry-run, tanpa jaringan):

   ```bash
   cd web
   node scripts/restore-firestore.mjs --backup backups/2026-11-22 --dry-run
   ```

3. Jalankan drill (butuh `FIREBASE_SERVICE_ACCOUNT` di env; skrip
   TIDAK PERNAH menulis ke koleksi produksi — semua tulis memakai
   awalan `restore_drill_`):

   ```bash
   node scripts/restore-firestore.mjs --backup backups/2026-11-22
   ```

   Skrip menulis dokumen ke koleksi uji, lalu memverifikasi:
   hitungan per koleksi sama persis dengan manifest, dan dokumen
   `push_subscriptions` diperiksa bentuknya (ID 64 heksadesimal,
   endpoint https, kunci `p256dh`/`auth` ada). Drill dinyatakan
   LOLOS bila skrip keluar 0 dengan pesan "Drill restore LOLOS".

4. Bersihkan koleksi uji sesudah drill (data uji adalah salinan
   data pengguna — tidak boleh mengendap):

   ```bash
   node scripts/restore-firestore.mjs --backup backups/2026-11-22 \
     --cleanup --yes
   ```

   Lalu verifikasi tidak ada koleksi `restore_drill_*` yang tersisa
   (cek di Firebase Console, atau jalankan `--verify` — harus
   melaporkan 0 dokumen di semua koleksi uji).

5. Catat hasil drill: tanggal, cadangan yang dipakai, waktu tiap
   tahap, lolos/gagal, dan temuan. Bila drill gagal: perbaiki
   runbook/skrip, lalu ulangi dalam 14 hari. Dua drill gagal
   berturut-turut diangkat ke koordinator sebagai risiko tinggi.

Catatan: drill memakai koleksi uji di proyek yang sama karena
pembuatan proyek Firebase staging baru butuh Console UI. Bila suatu
hari proyek staging tersedia, drill dapat dialihkan ke sana tanpa
mengubah skrip (cukup arahkan `FIREBASE_SERVICE_ACCOUNT` ke service
account proyek staging dan ganti `PROJECT_ID`).

## Skenario 6: satu koleksi hilang/rusak (pulihkan dari cadangan)

Contoh: koleksi `push_subscriptions` hilang. Urutan baku: pulihkan
ke koleksi uji dulu (Skenario 5) → verifikasi → baru pulihkan ke
produksi. Skrip restore TIDAK menulis ke produksi; penulisan ke
produksi dilakukan manual per koleksi dengan token service account
yang sama, supaya ada persetujuan eksplisit per langkah.

1. Jalankan drill (Skenario 5) untuk koleksi itu saja dan pastikan
   LOLOS:

   ```bash
   cd web
   node scripts/restore-firestore.mjs --backup backups/<tanggal> \
     --collection push_subscriptions
   ```

2. Pulihkan ke produksi dengan skrip kecil berikut (ganti
   `<tanggal>` dan nama koleksi; token service account dari env
   `FIREBASE_SERVICE_ACCOUNT` — skrip ini hanya contoh pola, jalankan
   dari mesin pengelola dengan token yang sudah ditukar):

   ```bash
   python3 - <<'PY'
   import json, os, subprocess
   # Pola: baca berkas cadangan, tulis tiap dokumen lewat REST
   # PATCH (tanpa updateMask = ganti seluruh dokumen; dokumen yang
   # belum ada dibuat). Token diambil dari berkas token service
   # account mesin pengelola — TIDAK PERNAH ditulis di dokumen ini.
   token = open(os.environ["KARIR_SA_TOKEN_FILE"]).read().strip()
   base = ("https://firestore.googleapis.com/v1/projects/karir-9d53a"
           "/databases/(default)/documents")
   docs = json.load(open("backups/<tanggal>/push_subscriptions.json"))
   for doc in docs:
       name = doc["name"]
       body = json.dumps({"fields": doc["fields"]})
       out = subprocess.run(
           ["curl", "-s", "--max-time", "30", "-X", "PATCH",
            f"{base}/{name.split('/documents/')[1]}",
            "-H", f"Authorization: Bearer {token}",
            "-H", "Content-Type: application/json",
            "--data", body, "-w", "\nHTTP:%{http_code}"],
           capture_output=True, text=True).stdout
       assert out.rstrip().endswith("HTTP:200"), out[-200:]
   print(f"dipulihkan: {len(docs)} dokumen")
   PY
   ```

   Untuk koleksi besar (mis. `companies` 685 dokumen), pulihkan
   per kelompok dan verifikasi hitungan tiap kelompok sebelum
   lanjut — jangan menulis 685 dokumen tanpa jeda verifikasi.

3. Verifikasi di produksi: hitungan dokumen sama dengan manifest
   cadangan; sampel dokumen diperiksa field-per-field. Untuk
   `push_subscriptions`, tunggu run recheck berikutnya dan periksa
   `pushSent`/`pushFailed` di `cron-runs`.

4. Bersihkan koleksi uji (langkah 4 Skenario 5) dan catat insiden:
   apa yang hilang, cadangan mana yang dipakai, berapa dokumen
   dipulihkan, berapa lama.

Prinsip yang tidak boleh dilanggar: data akun yang dihapus atas
permintaan penghapusan pengguna TIDAK dikembalikan dari cadangan
(penghapusan atas permintaan tetap final). Marker `meta/lastChange`
hanya dinaikkan sesudah verifikasi restore `companies` selesai,
agar instance web tidak refill dari data setengah pulih.

## Skenario 7: akun Firebase Auth hilang (pulihkan dari ekspor)

1. Unduh artifact `auth-export-encrypted` terbaru dari tab Actions
   repo (workflow "Ekspor Auth bulanan"). Dekripsi di mesin
   pengelola dengan passphrase dari pengelola kata sandi pemilik
   (passphrase TIDAK PERNAH ditulis di repo/laporan/chat):

   ```bash
   gpg --batch --yes --pinentry-mode loopback \
     --passphrase "$AUTH_EXPORT_PASSPHRASE" \
     --decrypt auth-export-2026-11-01.json.gpg \
     > auth-export-2026-11-01.json
   ```

   Hapus berkas teks-biasa sesudah selesai (`shred -u`); jangan
   pernah meng-commit atau membagikannya.

2. Akun dipulihkan lewat Firebase Console (Authentication > Users >
   Add user) atau Firebase Admin SDK dengan UID yang sama seperti
   di ekspor — UID yang dipertahankan membuat `user_profiles` dan
   `user_trackers` kembali terhubung ke pemiliknya. Claim admin
   (`isAdmin: true` di ekspor) dipasang kembali sebagai custom
   claim `admin: true`.

3. Uji pemulihan: masuk sebagai akun admin yang dipulihkan dan
   pastikan panel admin dapat dibuka; periksa satu pengguna biasa
   masih melihat pelacaknya.

4. Bila ekspor pertama belum pernah berhasil karena service account
   tidak punya peran baca Auth (HTTP 403): tambahkan peran lewat
   Firebase Console (IAM & Admin) — pemberian peran tidak dapat
   dilakukan dari VM karena IAM API proyek dinonaktifkan.

## Yang tidak tercakup dokumen ini

- Pemulihan aturan Firestore: aturan tersimpan di repo
  (`web/firestore.rules`) dan diterbitkan ulang dari Firebase
  Console bila perlu.
- Pemulihan cron dan notifikasi: lihat `docs/monitoring-cron.md`.
- Pemulihan proyek Firebase hilang total: ikuti urutan di
  rencana-data-backup Fase 1 (§3.2 B) — buat proyek baru, pasang
  rules dari repo, pulihkan koleksi satu per satu dari cadangan
  mingguan penuh terbaru (urutan: `meta` → `companies` →
  `changes` → `push_subscriptions` → `user_profiles` →
  `user_trackers/{uid}/items` → `alerts` → `reports` →
  `analytics_events` → `audit_logs` → `rate_limits` →
  `cron-runs`), pulihkan akun Auth dari ekspor bulanan terbaru,
  lalu alihkan situs. Perkiraan waktu: 1 hari.
- Kunci VAPID hilang: TIDAK dapat dipulihkan dari cadangan apa pun.
  Buat pasangan kunci baru, umumkan di situs dan changelog,
  sediakan tombol subscribe ulang, dan hapus langganan lama yang
  gagal otomatis (404/410 sudah ditangani). Pencegahan (salinan
  aman di pengelola kata sandi pemilik) adalah satu-satunya
  pertahanan.
