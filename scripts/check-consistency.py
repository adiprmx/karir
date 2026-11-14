#!/usr/bin/env python3
"""Cek konsistensi data Karir di tiga tempat: CSV, seed, dan situs live.

Keputusan S1 (14 Nov 2026): CSV adalah sumber kebenaran abadi untuk SEMUA
field; Firestore adalah cermin live. Cron cek ulang memperbarui
status/tanggal_cek di Firestore langsung, dan write-back harian
menyalinnya kembali ke CSV + seed. Karena itu data live BOLEH lebih baru
dari CSV, tetapi hanya dalam jendela write-back (maksimal 24 jam).

Mode bawaan (tanpa --live): bandingkan CSV vs seed saja, 0 selisih di
semua field. Mode ini yang jalan di CI pada setiap perubahan data.
Mode --live: tambah perbandingan CSV vs situs live:
  - /api/stats: total harus sama dengan jumlah baris CSV.
  - Daftar penuh lewat /api/companies (2 halaman): field statis
    (nama, kategori, tautan, catatan, lokasi, posisi, kanal, batas
    lamar) harus 0 selisih; status/tanggal_cek live boleh lebih baru
    maksimal 24 jam (selisih tanggal maksimal 1 hari, dan status yang
    berbeda hanya sah bila tanggal_cek live-nya hari ini atau kemarin).
    GAGAL bila live LEBIH TUA dari CSV, atau lebih baru > 24 jam.
  - Sampel dokumen lewat /api/companies/[no]: rute detail harus
    mengembalikan data yang sama dengan daftar.
Mode --live hanya jalan di CI pada branch main (butuh situs live);
lokal, jalankan manual saat situs bisa dijangkau.

Transport memakai curl (urllib mengabaikan proxy egress di VM ini).
API menolak user-agent otomatis (403), jadi skrip memakai user-agent
browser biasa — ini pengecekan repo sendiri, bukan scraping pihak lain.

Usage:
  python3 scripts/check-consistency.py [--live] [--base-url URL]
Keluar 0 bila semua cek lolos, 1 bila ada selisih, 2 bila situs live
tidak bisa dijangkau setelah 3 percobaan.
"""
import argparse
import csv
import json
import subprocess
import sys
import time
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "daftar-link-karir.csv"
SEED_PATH = ROOT / "web" / "data" / "companies.json"

FIELDS = [
    "no", "perusahaan", "kategori", "link_karir", "status", "tanggal_cek",
    "catatan", "lokasi", "posisi", "email_hrd", "wa_hrd", "kontak_lain",
    "batas_lamar",
]
STATIC_FIELDS = [f for f in FIELDS if f not in ("no", "status", "tanggal_cek")]
# Sampel deterministik untuk rute detail: pertama, terakhir, dan yang
# punya batas lamar paling mendesak saat skrip ditulis (PMSol 568).
SAMPLE_NOS = [1, 299, 568, 602, 610]
UA = "Mozilla/5.0 (X11; Linux x86_64) Karir-consistency-check/1.0"


def parse_date(s):
    try:
        y, m, d = map(int, s.split("-"))
        return date(y, m, d)
    except (ValueError, AttributeError):
        return None


def fetch_json(url):
    """GET JSON lewat curl; kembalikan dict atau None bila gagal total."""
    for attempt in range(1, 4):
        cmd = [
            "curl", "-sS", "--max-time", "30", url,
            "-H", f"User-Agent: {UA}",
            "-w", "\nHTTP:%{http_code}",
        ]
        out = subprocess.run(cmd, capture_output=True, text=True).stdout
        text, _, http = out.rpartition("\nHTTP:")
        if http.strip() == "200":
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return None
        if attempt < 3:
            time.sleep(5)
    return None


def load_csv():
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    out = {}
    for r in rows:
        row = {k: (r.get(k) or "") for k in FIELDS}
        row["no"] = int(r["no"])
        out[row["no"]] = row
    return out


def load_seed():
    seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    out = {}
    for e in seed:
        row = {k: (e.get(k) or "") for k in FIELDS}
        row["no"] = int(e["no"])
        out[row["no"]] = row
    return out


def check_csv_vs_seed(csv_rows, seed_rows, errors):
    if set(csv_rows) != set(seed_rows):
        only_csv = sorted(set(csv_rows) - set(seed_rows))
        only_seed = sorted(set(seed_rows) - set(csv_rows))
        if only_csv:
            errors.append(f"CSV vs seed: nomor hanya di CSV: {only_csv[:10]}")
        if only_seed:
            errors.append(f"CSV vs seed: nomor hanya di seed: {only_seed[:10]}")
    diffs = 0
    for no in sorted(set(csv_rows) & set(seed_rows)):
        for k in FIELDS:
            if csv_rows[no][k] != seed_rows[no][k]:
                diffs += 1
                if diffs <= 10:
                    errors.append(
                        f"CSV vs seed no {no} field {k}: "
                        f"CSV={csv_rows[no][k]!r} seed={seed_rows[no][k]!r}"
                    )
    if diffs > 10:
        errors.append(f"CSV vs seed: total {diffs} selisih sel (10 pertama di atas)")
    print(f"CSV vs seed: {len(csv_rows)} baris, {diffs} selisih")
    return diffs == 0


def live_row_ok(no, csv_row, live_row, today, errors):
    """Satu baris live vs CSV. Kembalikan True bila lolos."""
    ok = True
    for k in STATIC_FIELDS:
        if (live_row.get(k) or "") != csv_row[k]:
            errors.append(
                f"live vs CSV no {no} field statis {k}: "
                f"CSV={csv_row[k][:60]!r} live={(live_row.get(k) or '')[:60]!r}"
            )
            ok = False
    csv_date = parse_date(csv_row["tanggal_cek"])
    live_date = parse_date(live_row.get("tanggal_cek") or "")
    if live_date is None:
        errors.append(f"live vs CSV no {no}: tanggal_cek live tidak valid")
        return False
    if csv_date is not None and live_date < csv_date:
        errors.append(
            f"live vs CSV no {no}: tanggal_cek live LEBIH TUA "
            f"({live_row['tanggal_cek']} < {csv_row['tanggal_cek']})"
        )
        ok = False
    if csv_date is not None and (live_date - csv_date).days > 1:
        errors.append(
            f"live vs CSV no {no}: tanggal_cek live lebih baru > 24 jam "
            f"({live_row['tanggal_cek']} vs {csv_row['tanggal_cek']})"
        )
        ok = False
    if (live_row.get("status") or "") != csv_row["status"]:
        # Status live yang berbeda hanya sah bila perubahannya segar:
        # tanggal_cek live harus hari ini atau kemarin (WIB).
        fresh = live_date >= today - timedelta(days=1)
        if not fresh:
            errors.append(
                f"live vs CSV no {no}: status berbeda "
                f"({csv_row['status']!r} -> {live_row.get('status')!r}) "
                f"dan tanggal_cek live {live_row['tanggal_cek']} sudah lama"
            )
            ok = False
    return ok


def check_live(csv_rows, base_url, errors):
    base = base_url.rstrip("/")
    stats = fetch_json(f"{base}/api/stats")
    if stats is None:
        print("LIVE TIDAK BISA DIJANGKAU: /api/stats gagal setelah 3 percobaan")
        return None
    total = stats.get("total")
    print(f"live /api/stats: total={total}, CSV={len(csv_rows)}")
    if total != len(csv_rows):
        errors.append(f"/api/stats total {total} != jumlah baris CSV {len(csv_rows)}")

    live_rows = {}
    for offset in (0, 400):
        body = fetch_json(f"{base}/api/companies?limit=400&offset={offset}")
        if body is None:
            print(f"LIVE TIDAK BISA DIJANGKAU: /api/companies offset={offset} gagal")
            return None
        for e in body.get("results", []):
            c = e.get("company") or {}
            if c.get("no") is not None:
                live_rows[int(c["no"])] = c
    print(f"live /api/companies: {len(live_rows)} dokumen")
    if set(live_rows) != set(csv_rows):
        missing = sorted(set(csv_rows) - set(live_rows))
        extra = sorted(set(live_rows) - set(csv_rows))
        if missing:
            errors.append(f"live: nomor hilang dari situs: {missing[:10]}")
        if extra:
            errors.append(f"live: nomor tak dikenal di situs: {extra[:10]}")

    today = date.today()
    bad = 0
    for no in sorted(set(csv_rows) & set(live_rows)):
        if not live_row_ok(no, csv_rows[no], live_rows[no], today, errors):
            bad += 1
    print(f"live vs CSV: {len(set(csv_rows) & set(live_rows))} baris dibandingkan, {bad} bermasalah")

    for no in SAMPLE_NOS:
        body = fetch_json(f"{base}/api/companies/{no}")
        doc = (body or {}).get("company") or {}
        if not body:
            errors.append(f"sampel /api/companies/{no}: tidak bisa dibaca")
            continue
        if (doc.get("perusahaan") or "") != csv_rows[no]["perusahaan"]:
            errors.append(f"sampel no {no}: nama perusahaan berbeda di rute detail")
        if (doc.get("batas_lamar") or "") != csv_rows[no]["batas_lamar"]:
            errors.append(
                f"sampel no {no}: batas_lamar rute detail "
                f"{doc.get('batas_lamar')!r} != CSV {csv_rows[no]['batas_lamar']!r}"
            )
    print(f"sampel rute detail: {len(SAMPLE_NOS)} dokumen dicek")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="tambah cek terhadap situs live")
    ap.add_argument("--base-url", default="https://karir-adiprmx.vercel.app",
                    help="alamat situs live (bawaan: produksi)")
    args = ap.parse_args()

    errors = []
    csv_rows = load_csv()
    seed_rows = load_seed()
    check_csv_vs_seed(csv_rows, seed_rows, errors)

    if args.live:
        reached = check_live(csv_rows, args.base_url, errors)
        if reached is None:
            return 2

    if errors:
        print(f"KONSISTENSI GAGAL: {len(errors)} masalah")
        for e in errors:
            print(f" - {e}")
        return 1
    print("OK: konsistensi lolos" + (" (termasuk live)" if args.live else " (CSV vs seed)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
