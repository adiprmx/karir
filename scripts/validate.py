#!/usr/bin/env python3
"""Validate data/daftar-link-karir.csv.

Checks: expected columns, row count, status vocabulary, date format,
no duplicate company names, links are http(s) URLs or empty only when
the note explains that no official site was found or when at least one
application channel (email_hrd, wa_hrd, kontak_lain) is filled, and
channel fields have a valid format when filled.

Kualitas data (T8, 15 Nov 2026 — DATA-04/05/06 + penjaga DET-03):
- DATA-04 lokasi: nilai placeholder dihitung (bukan ditolak mentah —
  274 baris masih memakainya) dan DIJAGA SUPAYA TIDAK BERTAMBAH
  (ratchet: gagal bila jumlahnya melebihi baseline). Nilai status yang
  bocor ke kolom lokasi (mis. "Tidak ada lowongan terlihat") adalah
  kesalahan keras. Pemisah multi-kota yang baku adalah "; " — baris
  multi-kota yang masih memakai koma dihitung dan dijaga juga.
  Nilai kanonis lokasi yang tidak diketahui (untuk baris baru dan
  migrasi data): "Tidak diketahui" — menggantikan tiga varian
  "Tidak bisa dicek" / "Tidak tercantum" / "Tidak tercantum di hasil
  cek". Migrasi 274 baris lama ke nilai kanonis adalah pekerjaan data
  (hunting), bukan pekerjaan validator ini.
- DATA-05 kategori: kosakata TERTUTUP. Nilai kategori yang tidak ada
  di kosakata kanonis maupun di tabel pemetaan adalah kesalahan keras
  (nilai baru wajib ditambahkan ke kosakata dulu secara sadar).
  Nilai lama yang punya pemetaan ke nilai kanonis dihitung dan dijaga
  supaya tidak bertambah; pemetaan nilainya ke kanonis adalah
  pekerjaan data (hunting), mengikuti tabel CATEGORY_MAP di bawah.
- DATA-06 kanal: cakupan kanal dilaporkan di setiap run (bukan
  kesalahan — hunting kanal adalah pekerjaan berkelanjutan). Yang
  dijaga keras: perusahaan yang ada lowongannya WAJIB punya minimal
  satu jalur melamar (tautan atau kanal); jumlah perusahaan tanpa
  kanal apa pun tidak boleh bertambah dari baseline.
- DET-03: wa_hrd boleh berisi beberapa nomor (pemisah ";", ",", atau
  "/"); tiap nomor dinormalisasi terpisah (awalan 0 atau 8 menjadi
  62) dan wajib 10-15 digit setelah normalisasi, supaya tidak ada
  lagi tautan wa.me ke nomor gabungan yang tidak ada.

Baseline ratchet diukur dari data 15 Nov 2026 (610 baris). Angka ini
hanya boleh TURUN (data membaik) — menaikkan baseline untuk
meloloskan data yang memburuk adalah kesalahan.

Usage: python3 scripts/validate.py
Exits non-zero and prints every problem found.
"""
import csv
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "daftar-link-karir.csv"
CITIES_JS = ROOT / "web" / "lib" / "cities.js"

EXPECTED_COLUMNS = [
    "no",
    "perusahaan",
    "kategori",
    "link_karir",
    "status",
    "tanggal_cek",
    "catatan",
    "lokasi",
    "posisi",
    "email_hrd",
    "wa_hrd",
    "kontak_lain",
    "batas_lamar",
]
VALID_STATUSES = {
    "Ada lowongan",
    "Tidak ada lowongan",
    "Tidak dapat diverifikasi",
    "Portal tidak bisa dibuka",
}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

# --- DATA-04: placeholder lokasi -------------------------------------------
# Nilai persis (setelah dipangkas spasi) yang berarti "lokasi tidak
# diketahui". Nilai kanonis untuk baris baru: "Tidak diketahui".
LOCATION_PLACEHOLDERS = {
    "Tidak bisa dicek",
    "Tidak tercantum",
    "Tidak tercantum di hasil cek",
    "Tidak ada lowongan terlihat",
}
# Baseline 15 Nov 2026: 274 dari 610 baris (44,9%).
MAX_PLACEHOLDER_LOKASI = 274
# Baris multi-kota (2+ kota dikenali) yang memisahkan kota dengan koma
# tanpa titik koma. Baseline 15 Nov 2026: 59 baris (diukur dengan
# daftar 34 kota di web/lib/cities.js).
MAX_LOKASI_KOMA_MULTIKOTA = 59

# --- DATA-05: kosakata kategori tertutup -----------------------------------
# 36 nilai kanonis. Nilai di luar daftar ini dan di luar CATEGORY_MAP
# adalah kesalahan keras.
CANONICAL_CATEGORIES = {
    "Asuransi",
    "Bank",
    "BUMN",
    "Edutech",
    "E-commerce",
    "Energi",
    "Farmasi",
    "Fashion",
    "Fintech",
    "FMCG",
    "Jasa",
    "Kereta Api",
    "Kesehatan",
    "Keuangan",
    "Konglomerat",
    "Konsultan",
    "Konstruksi",
    "Kuliner / Resto",
    "Logistik",
    "Makanan",
    "Manufaktur",
    "Maritim",
    "Media",
    "Minuman",
    "Mining",
    "Otomotif",
    "Outsourcing",
    "Pendidikan",
    "Perhotelan",
    "Perkebunan",
    "Platform Lowongan",
    "Retail",
    "Staffing",
    "Tech",
    "Telekomunikasi",
    "Transportasi",
}
# Nilai lama -> nilai kanonis. 33 nilai, 129 baris (15 Nov 2026).
# Alasan tiap kelompok (audit DATA-05): Logistik terpecah 5 wadah;
# Kesehatan terpecah 2; BANK/FINANCE/ASURANSI hanya soal casing;
# BUMN adalah kepemilikan, bukan industri (kecuali "BUMN" sendiri yang
# tetap kanonis untuk konglomerat BUMN lintas industri); Agricultural /
# Perkebunan / Agritech tumpang tindih; Mining / Tambang sama;
# klaster kebersihan-keamanan-outsourcing adalah satu industri jasa;
# Supermarket / Hypermarket / Toko adalah Retail; Jasa / Hotel adalah
# Perhotelan; Kedai Kopi adalah Kuliner / Resto.
# Yang SENGAJA tidak dipetakan (butuh tinjauan per perusahaan sebelum
# digabung): FMCG vs Makanan vs Minuman — ketiganya tetap kanonis.
CATEGORY_MAP = {
    "Agricultural": "Perkebunan",
    "Agricultural / FMCG": "FMCG",
    "Agritech": "Tech",
    "ASURANSI": "Asuransi",
    "BANK": "Bank",
    "Bengkel / Otomotif": "Otomotif",
    "BPO": "Outsourcing",
    "BUMN / Tambang": "Mining",
    "BUMN / Transportasi": "Transportasi",
    "BUMN/Farmasi": "Farmasi",
    "Cleaning / Facility / Outsourcing": "Outsourcing",
    "Cleaning Service": "Outsourcing",
    "Consumer Goods / Kosmetik": "FMCG",
    "Ekspedisi / Logistik": "Logistik",
    "FINANCE": "Keuangan",
    "Fintech BUMN": "Fintech",
    "Hypermarket": "Retail",
    "Jasa / Hotel": "Perhotelan",
    "Kedai Kopi": "Kuliner / Resto",
    "Kesehatan / Rumah Sakit": "Kesehatan",
    "Logistik / Pergudangan": "Logistik",
    "Manufaktur / Alat Berat": "Manufaktur",
    "Outsourcing / Cleaning / Gudang": "Outsourcing",
    "Pendidikan / Universitas": "Pendidikan",
    "Platform Logistik": "Logistik",
    "Rental Kendaraan / Logistik": "Logistik",
    "Security / Cleaning / Outsourcing": "Outsourcing",
    "Security / Facility / Outsourcing": "Outsourcing",
    "Supermarket": "Retail",
    "Tambang / Batu Bara": "Mining",
    "Telekomunikasi / BUMN-anak": "Telekomunikasi",
    "Toko Bangunan": "Retail",
    "Toko Elektronik": "Retail",
}
# Baseline 15 Nov 2026: 129 baris memakai nilai non-kanonis.
MAX_KATEGORI_NONKANONIK = 129

# --- DATA-06: kanal melamar -------------------------------------------------
# Perusahaan tanpa jalur melamar apa pun (tautan + 3 kanal kosong).
# Baseline 15 Nov 2026: 4 perusahaan (no 204, 315, 321, 355 — semuanya
# "Tidak dapat diverifikasi" dan catatannya menjelaskan situs resmi
# tidak ditemukan).
MAX_TANPA_KANAL = 4


def load_city_keys():
    """Baca kunci kota dari web/lib/cities.js (satu sumber kebenaran
    daftar kota — jangan duplikasi daftarnya di sini).

    Kembalikan daftar (nama_kota, [kunci]) atau None bila file tidak
    bisa diparse (pemanggil melewati cek multi-kota dengan peringatan).
    """
    try:
        text = CITIES_JS.read_text(encoding="utf-8")
    except OSError:
        return None
    names = re.findall(r'name: "([^"]+)"', text)
    key_groups = re.findall(r"keys: \[([^\]]*)\]", text)
    if not names or len(names) != len(key_groups):
        return None
    out = []
    for name, group in zip(names, key_groups):
        keys = re.findall(r'"([^"]+)"', group)
        if keys:
            out.append((name, keys))
    return out or None


def cities_in_text(text, cities):
    """Kota-kota (nama) yang disebut sebagai kata utuh di teks."""
    lowered = text.lower()
    found = []
    for name, keys in cities:
        for key in keys:
            if re.search(r"\b" + re.escape(key) + r"\b", lowered):
                found.append(name)
                break
    return found


def normalize_wa(part):
    """Normalisasi satu nomor WhatsApp ke digit internasional (62...).

    Kembalikan string digit atau None bila bukan nomor yang valid:
    mengandung huruf, tidak diawali 0/62/8, atau panjangnya di luar
    10-15 digit setelah normalisasi (batas E.164). Spasi dan strip
    diabaikan. Dipakai validator dan cerminan logika pemecah nomor
    di halaman detail (DET-03) — keduanya wajib sepakat.
    """
    part = (part or "").strip()
    if not part or re.search(r"[A-Za-z]", part):
        return None
    digits = re.sub(r"\D", "", part)
    if not digits:
        return None
    if digits.startswith("0"):
        digits = "62" + digits[1:]
    elif digits.startswith("62"):
        pass
    elif digits.startswith("8"):
        digits = "62" + digits
    else:
        return None
    if not 10 <= len(digits) <= 15:
        return None
    return digits


def main() -> int:
    errors = []
    warnings = []
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != EXPECTED_COLUMNS:
            errors.append(f"kolom tidak sesuai: {reader.fieldnames}")
            return 1
        rows = list(reader)

    if not rows:
        errors.append("CSV kosong")
    numbers = [int(r["no"]) for r in rows if r["no"].isdigit()]
    if numbers != list(range(1, len(rows) + 1)):
        errors.append("kolom no tidak berurutan mulai dari 1")

    seen = Counter(r["perusahaan"].strip().lower() for r in rows)
    for name, count in seen.items():
        if count > 1:
            errors.append(f"nama perusahaan duplikat: {name} ({count}x)")

    cities = load_city_keys()
    if cities is None:
        warnings.append(
            "daftar kota dari web/lib/cities.js tidak bisa dibaca — "
            "cek pemisah multi-kota dilewati"
        )

    placeholder_count = 0
    placeholder_by_value = Counter()
    comma_multi_count = 0
    nonkanonik_count = 0
    nonkanonik_by_value = Counter()
    kanal_email = kanal_wa = kanal_lain = 0
    punya_kanal = 0
    tanpa_kanal = 0

    for i, row in enumerate(rows, start=2):
        if row["status"] not in VALID_STATUSES:
            errors.append(f"baris {i}: status tidak dikenal: {row['status']!r}")
        if not DATE_RE.match(row["tanggal_cek"] or ""):
            errors.append(f"baris {i}: tanggal_cek bukan YYYY-MM-DD: {row['tanggal_cek']!r}")
        else:
            y, m, d = map(int, row["tanggal_cek"].split("-"))
            try:
                date(y, m, d)
            except ValueError:
                errors.append(f"baris {i}: tanggal tidak valid: {row['tanggal_cek']!r}")
        batas = (row["batas_lamar"] or "").strip()
        if batas:
            if not DATE_RE.match(batas):
                errors.append(f"baris {i}: batas_lamar bukan YYYY-MM-DD: {batas!r}")
            else:
                y, m, d = map(int, batas.split("-"))
                try:
                    date(y, m, d)
                except ValueError:
                    errors.append(f"baris {i}: batas_lamar bukan tanggal kalender yang valid: {batas!r}")
        link = (row["link_karir"] or "").strip()
        if link and not link.startswith(("http://", "https://")):
            errors.append(f"baris {i}: link_karir bukan URL http(s): {link!r}")
        note = (row["catatan"] or "").lower()
        has_channel = any(
            (row[c] or "").strip() for c in ("email_hrd", "wa_hrd", "kontak_lain")
        )
        if not link and not has_channel and not ("situs resmi" in note and ("tidak ada" in note or "tidak ditemukan" in note or "not found" in note)):
            errors.append(f"baris {i}: link kosong tanpa kanal melamar dan tanpa penjelasan di catatan")
        email = (row["email_hrd"] or "").strip()
        if email and not all(
            EMAIL_RE.match(part.strip()) for part in email.split(";")
        ):
            errors.append(f"baris {i}: email_hrd bukan alamat email: {email!r}")
        wa = (row["wa_hrd"] or "").strip()
        if wa:
            parts = [p for p in re.split(r"[;,/]", wa) if p.strip()]
            if not parts or any(
                normalize_wa(p) is None for p in parts
            ):
                errors.append(f"baris {i}: wa_hrd bukan nomor telepon yang valid: {wa!r}")
        for col in ("perusahaan", "kategori", "status", "lokasi", "posisi"):
            if not (row[col] or "").strip():
                errors.append(f"baris {i}: kolom {col} kosong")

        # --- DATA-04: placeholder lokasi (dihitung + ratchet) ---
        lokasi = (row["lokasi"] or "").strip()
        if lokasi in LOCATION_PLACEHOLDERS:
            placeholder_count += 1
            placeholder_by_value[lokasi] += 1
        # Nilai status bocor ke lokasi: kesalahan keras (saat ini 0).
        for status in VALID_STATUSES:
            if status in lokasi:
                errors.append(
                    f"baris {i}: nilai status {status!r} bocor ke kolom lokasi"
                )
        # Pemisah multi-kota: koma tanpa titik koma (dihitung + ratchet).
        # Catatan: cek ini tidak sadar negasi ("tidak ada di Depok"
        # tetap terhitung sebagai penyebutan kota) — ia menjaga
        # konvensi pemisah, bukan kebenaran pemetaan (itu urusan
        # matchCity di web/lib/cities.js).
        if cities is not None and lokasi not in LOCATION_PLACEHOLDERS:
            found = cities_in_text(lokasi, cities)
            if len(found) >= 2 and "," in lokasi and ";" not in lokasi:
                comma_multi_count += 1

        # --- DATA-05: kosakata kategori tertutup ---
        kategori = (row["kategori"] or "").strip()
        if kategori in CATEGORY_MAP:
            nonkanonik_count += 1
            nonkanonik_by_value[kategori] += 1
        elif kategori not in CANONICAL_CATEGORIES:
            errors.append(
                f"baris {i}: kategori {kategori!r} tidak ada di kosakata "
                f"kanonis — tambahkan ke CANONICAL_CATEGORIES atau "
                f"CATEGORY_MAP di scripts/validate.py dulu"
            )

        # --- DATA-06: cakupan kanal ---
        if email:
            kanal_email += 1
        if wa:
            kanal_wa += 1
        if (row["kontak_lain"] or "").strip():
            kanal_lain += 1
        if has_channel:
            punya_kanal += 1
        if not link and not has_channel:
            tanpa_kanal += 1
            # Perusahaan yang ada lowongannya wajib punya jalur melamar.
            if row["status"] == "Ada lowongan":
                errors.append(
                    f"baris {i}: perusahaan yang ada lowongan tanpa jalur "
                    f"melamar apa pun (tautan + kanal kosong)"
                )

    # --- Ratchet kualitas: jumlah hanya boleh turun, tidak naik. ---
    if placeholder_count > MAX_PLACEHOLDER_LOKASI:
        errors.append(
            f"lokasi placeholder bertambah: {placeholder_count} "
            f"(baseline {MAX_PLACEHOLDER_LOKASI}) — perbaiki datanya, "
            f"jangan naikkan baseline"
        )
    if comma_multi_count > MAX_LOKASI_KOMA_MULTIKOTA:
        errors.append(
            f"lokasi multi-kota pemisah koma bertambah: {comma_multi_count} "
            f"(baseline {MAX_LOKASI_KOMA_MULTIKOTA}) — pakai pemisah '; '"
        )
    if nonkanonik_count > MAX_KATEGORI_NONKANONIK:
        errors.append(
            f"kategori non-kanonis bertambah: {nonkanonik_count} baris "
            f"(baseline {MAX_KATEGORI_NONKANONIK}) — pakai nilai kanonis "
            f"(lihat CATEGORY_MAP)"
        )
    if tanpa_kanal > MAX_TANPA_KANAL:
        errors.append(
            f"perusahaan tanpa kanal apa pun bertambah: {tanpa_kanal} "
            f"(baseline {MAX_TANPA_KANAL})"
        )

    counts = Counter(r["status"] for r in rows)
    total = len(rows)
    print(
        f"Kualitas data: lokasi placeholder {placeholder_count}/{total} "
        f"({placeholder_count / total * 100:.1f}%); kategori non-kanonis "
        f"{nonkanonik_count} baris ({len(nonkanonik_by_value)} nilai); "
        f"kanal: email {kanal_email}, WA {kanal_wa}, kontak lain "
        f"{kanal_lain}, punya >=1 kanal {punya_kanal} "
        f"({punya_kanal / total * 100:.1f}%), tanpa kanal apa pun "
        f"{tanpa_kanal}; multi-kota pemisah koma {comma_multi_count}"
    )
    if placeholder_by_value:
        breakdown = ", ".join(
            f"{k}: {v}" for k, v in placeholder_by_value.most_common()
        )
        print(f"  placeholder lokasi: {breakdown}")
    if nonkanonik_by_value:
        top = nonkanonik_by_value.most_common(5)
        breakdown = ", ".join(f"{k} ({v})" for k, v in top)
        print(f"  kategori non-kanonis terbanyak: {breakdown}")
    for w in warnings:
        print(f"PERINGATAN: {w}")
    if errors:
        print(f"VALIDASI GAGAL: {len(errors)} masalah")
        for e in errors:
            print(f" - {e}")
        return 1
    print(f"OK: {total} baris, status: {dict(counts)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
