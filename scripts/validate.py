#!/usr/bin/env python3
"""Validate data/daftar-link-karir.csv.

Checks: expected columns, row count, status vocabulary, date format,
no duplicate company names, and links are http(s) URLs or empty only
when the note explains that no official site was found.

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
]
VALID_STATUSES = {
    "Tidak ada lowongan target",
    "Tidak ada lowongan terlihat",
    "Tidak dapat diverifikasi",
    "Portal tidak bisa dibuka",
    "Ada lowongan target",
    "Ada lowongan target (tidak cocok)",
}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


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
        link = (row["link_karir"] or "").strip()
        if link and not link.startswith(("http://", "https://")):
            errors.append(f"baris {i}: link_karir bukan URL http(s): {link!r}")
        note = (row["catatan"] or "").lower()
        if not link and not ("situs resmi" in note and ("tidak ada" in note or "tidak ditemukan" in note or "not found" in note)):
            errors.append(f"baris {i}: link kosong tanpa penjelasan di catatan")
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
