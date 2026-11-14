#!/usr/bin/env python3
"""Validate data/daftar-link-karir.csv.

Checks: expected columns, row count, status vocabulary, date format,
no duplicate company names, links are http(s) URLs or empty only when
the note explains that no official site was found or when at least one
application channel (email_hrd, wa_hrd, kontak_lain) is filled, and
channel fields have a valid format when filled.

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
WA_RE = re.compile(r"^\+?[0-9][0-9 \-]{7,17}$")


def main() -> int:
    errors = []
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
        if wa and not all(
            WA_RE.match(part.strip()) for part in wa.split(";")
        ):
            errors.append(f"baris {i}: wa_hrd bukan nomor telepon: {wa!r}")
        for col in ("perusahaan", "kategori", "status", "lokasi", "posisi"):
            if not (row[col] or "").strip():
                errors.append(f"baris {i}: kolom {col} kosong")

    counts = Counter(r["status"] for r in rows)
    if errors:
        print(f"VALIDASI GAGAL: {len(errors)} masalah")
        for e in errors:
            print(f" - {e}")
        return 1
    print(f"OK: {len(rows)} baris, status: {dict(counts)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
