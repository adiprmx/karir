#!/usr/bin/env python3
"""Cek konsistensi data Karir di tiga tempat: CSV, seed, dan situs live.

Keputusan S1 (14 Nov 2026): CSV adalah sumber kebenaran abadi untuk SEMUA
field; Firestore adalah cermin live. Cron cek ulang memperbarui
status/tanggal_cek di Firestore langsung, dan write-back harian
menyalinnya kembali ke CSV + seed. Karena itu data live BOLEH lebih baru
dari CSV, tetapi hanya dalam jendela write-back (maksimal 24 jam).

Mode bawaan (tanpa --live): bandingkan CSV vs seed saja, 0 selisih di
semua field, ditambah cek angka README (DOK-01: angka-angka kunci yang
dinyatakan README.md harus cocok dengan CSV). Mode ini yang jalan di CI
pada setiap perubahan data atau README.
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
  - Watchdog write-back: 10 entri terbaru /api/changes harus sudah
    tercermin di CSV (status CSV == `to`, atau tanggal_cek CSV lebih
    baru dari `checkedAt` entri). Bila ada entri yang belum tercermin,
    write-back harian tertinggal atau macet — GAGAL dengan pesan
    yang menyebut nomornya.
  - Sumber data: respons API membawa `source` ("live" | "seed").
    Bila sumbernya "seed" (Firestore tidak bisa dibaca saat cek),
    perbandingan live vs CSV tidak membuktikan apa-apa tentang
    Firestore — skrip mencetak PERINGATAN jelas dan tetap keluar 0
    (bukan gagal), supaya insiden kuota tidak membuat CI merah
    karena alasan yang salah; watchdog write-back tetap jalan
    karena /api/changes membaca koleksi changes langsung.
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
import re
import subprocess
import sys
import time
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "daftar-link-karir.csv"
SEED_PATH = ROOT / "web" / "data" / "companies.json"
README_PATH = ROOT / "README.md"

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


def check_readme_numbers(csv_rows, errors):
    """DOK-01: angka-angka kunci yang dinyatakan README.md harus
    cocok dengan CSV. Angka README pernah membusuk berulang (406 vs
    610, "22 lowongan target" vs 288) karena tidak ada yang
    memeriksanya. Cek ini jalan di mode bawaan (tanpa --live) dan
    di CI tiap push yang menyentuh README/data/skrip.

    Bila sebuah pola tidak ditemukan di README, itu juga kesalahan:
    kalimat README yang berubah harus diikuti pembaruan pola di
    sini, supaya angka tidak lolos tanpa diperiksa.
    """
    try:
        text = README_PATH.read_text(encoding="utf-8")
    except OSError as exc:
        errors.append(f"README tidak bisa dibaca: {exc}")
        return
    total = len(csv_rows)
    status_count = Counter(r["status"] for r in csv_rows.values())

    def has_channel(r):
        return any(
            (r[k] or "").strip() for k in ("email_hrd", "wa_hrd", "kontak_lain")
        )

    no_link = [r for r in csv_rows.values() if not r["link_karir"].strip()]
    with_channel = [r for r in no_link if has_channel(r)]
    no_channel = [r for r in no_link if not has_channel(r)]

    checks = [
        ("total perusahaan (kalimat pembuka)",
         r"berisi (\d+) kanal karir resmi", total),
        ("ada lowongan (kalimat pembuka)",
         r"(\d+) perusahaan sedang ada lowongan",
         status_count["Ada lowongan"]),
        ("total kanal (judul hasil cek)",
         r"Hasil cek (\d+) kanal", total),
        ("ada lowongan (kalimat hasil cek)",
         r"(\d+) dari \d+ kanal ada lowongan",
         status_count["Ada lowongan"]),
        ("total kanal (kalimat hasil cek)",
         r"\d+ dari (\d+) kanal ada lowongan", total),
        ("total perusahaan (alt grafik status)",
         r"Sebaran status (\d+) perusahaan", total),
        ("Ada lowongan (tabel status)",
         r"\| Ada lowongan \| (\d+) \|", status_count["Ada lowongan"]),
        ("Tidak ada lowongan (tabel status)",
         r"\| Tidak ada lowongan \| (\d+) \|",
         status_count["Tidak ada lowongan"]),
        ("Tidak dapat diverifikasi (tabel status)",
         r"\| Tidak dapat diverifikasi \| (\d+) \|",
         status_count["Tidak dapat diverifikasi"]),
        ("Portal tidak bisa dibuka (tabel status)",
         r"\| Portal tidak bisa dibuka \| (\d+) \|",
         status_count["Portal tidak bisa dibuka"]),
        ("tanpa tautan karir",
         r"(\d+) perusahaan tidak punya tautan karir", len(no_link)),
        ("tanpa tautan tapi ada kanal lain",
         r"(\d+) di antaranya masih bisa dilamar lewat kanal lain",
         len(with_channel)),
        ("tanpa kanal apa pun",
         r"(\d+) perusahaan tidak punya kanal apa pun", len(no_channel)),
    ]
    bad = 0
    for label, pattern, expected in checks:
        m = re.search(pattern, text)
        if not m:
            errors.append(
                f"README: pola {label} tidak ditemukan — perbarui pola di "
                f"check-consistency.py bila kalimat README berubah"
            )
            bad += 1
            continue
        found = int(m.group(1))
        if found != expected:
            errors.append(
                f"README vs CSV {label}: README={found}, CSV={expected} "
                f"(perbarui README.md)"
            )
            bad += 1
    # Nomor perusahaan tanpa kanal yang disebut README harus sama
    # dengan CSV (bukan hanya jumlahnya).
    m = re.search(r"tidak ditebak: ([^.]+)\.", text)
    if not m:
        errors.append("README: daftar perusahaan tanpa kanal tidak ditemukan")
        bad += 1
    else:
        listed = sorted(int(n) for n in re.findall(r"\d+", m.group(1)))
        actual = sorted(r["no"] for r in no_channel)
        if listed != actual:
            errors.append(
                f"README vs CSV perusahaan tanpa kanal: README={listed}, "
                f"CSV={actual} (perbarui README.md)"
            )
            bad += 1
    print(f"README vs CSV: {len(checks) + 1} angka dicek, {bad} bermasalah")


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


def check_writeback(csv_rows, base_url, errors):
    """Watchdog write-back (T8): 10 entri terbaru /api/changes harus
    sudah tercermin di CSV. Entri tercatat bila status berubah (cron
    atau panel admin); write-back harian menyalinnya ke CSV + seed
    dalam 24 jam. Entri yang belum tercermin berarti write-back
    tertinggal/macet — laporkan sebagai kesalahan dengan nomornya.

    Aturan tercermin: status CSV == entri `to`, ATAU tanggal_cek CSV
    lebih baru dari `checkedAt` entri (hunting mengecek ulang sesudah
    perubahan itu, jadi CSV sudah melampauinya). Entri untuk nomor
    yang tidak ada di CSV juga kesalahan (perusahaan baru dari panel
    admin yang belum masuk repo).
    """
    body = fetch_json(f"{base_url}/api/changes")
    if body is None:
        print("watchdog write-back: /api/changes tidak bisa dibaca — dilewati")
        return
    entries = body.get("changes") or []
    stale = 0
    for e in entries:
        no = e.get("companyNo")
        to = e.get("to") or ""
        checked = parse_date(e.get("checkedAt") or "")
        if not isinstance(no, int) or no not in csv_rows:
            errors.append(
                f"write-back: entri changes untuk no {no} tidak ada di CSV "
                f"(perusahaan baru dari panel admin?)"
            )
            stale += 1
            continue
        row = csv_rows[no]
        csv_date = parse_date(row["tanggal_cek"])
        reflected = row["status"] == to or (
            checked is not None and csv_date is not None and csv_date > checked
        )
        if not reflected:
            errors.append(
                f"write-back tertinggal: no {no} {row['perusahaan'][:40]!r} "
                f"berubah ke {to!r} pada {e.get('checkedAt')} tapi CSV "
                f"masih {row['status']!r} (cek {row['tanggal_cek']})"
            )
            stale += 1
    print(f"watchdog write-back: {len(entries)} entri changes dicek, {stale} belum tercermin")


def check_live(csv_rows, base_url, errors):
    base = base_url.rstrip("/")
    stats = fetch_json(f"{base}/api/stats")
    if stats is None:
        print("LIVE TIDAK BISA DIJANGKAU: /api/stats gagal setelah 3 percobaan")
        return None
    total = stats.get("total")
    print(f"live /api/stats: total={total}, CSV={len(csv_rows)}")
    if stats.get("source") == "seed":
        print(
            "PERINGATAN: /api/stats menyajikan data SEED (Firestore tidak "
            "bisa dibaca) — cek live ini tidak membuktikan sinkronisasi "
            "Firestore, hanya membuktikan seed cocok dengan CSV."
        )
    if total != len(csv_rows):
        errors.append(f"/api/stats total {total} != jumlah baris CSV {len(csv_rows)}")

    live_rows = {}
    list_source = None
    for offset in (0, 400):
        body = fetch_json(f"{base}/api/companies?limit=400&offset={offset}")
        if body is None:
            print(f"LIVE TIDAK BISA DIJANGKAU: /api/companies offset={offset} gagal")
            return None
        list_source = body.get("source") or list_source
        for e in body.get("results", []):
            c = e.get("company") or {}
            if c.get("no") is not None:
                live_rows[int(c["no"])] = c
    print(f"live /api/companies: {len(live_rows)} dokumen")
    if list_source == "seed":
        print(
            "PERINGATAN: /api/companies menyajikan data SEED (Firestore "
            "tidak bisa dibaca) — perbandingan field di bawah ini memakai "
            "seed, bukan data live."
        )
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

    check_writeback(csv_rows, base, errors)
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
    check_readme_numbers(csv_rows, errors)

    if args.live:
        reached = check_live(csv_rows, args.base_url, errors)
        if reached is None:
            return 2

    if errors:
        print(f"KONSISTENSI GAGAL: {len(errors)} masalah")
        for e in errors:
            print(f" - {e}")
        return 1
    print("OK: konsistensi lolos" + (" (termasuk live)" if args.live else " (CSV vs seed + README)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
