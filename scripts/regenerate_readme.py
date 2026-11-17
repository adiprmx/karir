#!/usr/bin/env python3
"""Regenerasi angka README.md + assets/status-bar.svg dari CSV (P-02, K-08).

Write-back Firestore -> CSV mengubah hitungan status di CSV; README dan
grafik status harus ikut berubah SEBELUM validasi jalan, kalau tidak
check-consistency.py (DOK-01) gagal dan write-back tidak pernah commit
— kegagalan struktural yang membuat CI main merah sejak 16 Nov 2026.

Skrip ini adalah Opsi A rencana-kuota-drift.md §B3.1: satu sumber
kebenaran angka (CSV -> README + SVG selalu konsisten), validasi penuh
tetap jalan tanpa pengecualian.

Deterministik: CSV yang sama selalu menghasilkan README + SVG yang
sama (tidak ada tanggal, tidak ada acak, pembulatan lebar batang
tetap). Dijalankan workflow write-back.yml sesudah langkah sync dan
sebelum langkah validasi; bisa juga dijalankan manual.

Pola yang diperbarui adalah pola yang SAMA dengan yang diperiksa
check-consistency.py::check_readme_numbers — bila kalimat README
berubah, ubah KEDUA berkas. Bila sebuah pola tidak ditemukan, skrip
gagal (exit 1) tanpa menulis apa pun, supaya perubahan kalimat tidak
lolos diam-diam.

Tulis memakai berkas sementara + os.replace (atomik); tidak pernah
memotong berkas target secara langsung.

Usage:
  python3 scripts/regenerate_readme.py [--check] [--root PATH]
  --check: hanya laporkan apakah berkas akan berubah (exit 1 bila ya),
           tanpa menulis.
  --root:  root repo (bawaan: induk folder scripts/).
Keluar 0 bila sukses (atau tidak ada perubahan), 1 bila pola hilang
atau CSV tidak bisa dibaca.
"""
import argparse
import csv
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "daftar-link-karir.csv"
README_PATH = ROOT / "README.md"
SVG_PATH = ROOT / "assets" / "status-bar.svg"

FIELDS = [
    "no", "perusahaan", "kategori", "link_karir", "status", "tanggal_cek",
    "catatan", "lokasi", "posisi", "email_hrd", "wa_hrd", "kontak_lain",
    "batas_lamar",
]
STATUSES = [
    "Ada lowongan",
    "Tidak ada lowongan",
    "Tidak dapat diverifikasi",
    "Portal tidak bisa dibuka",
]
# Lebar batang terpanjang pada grafik (baris dengan hitungan terbanyak
# selalu diskalakan ke lebar ini; baris lain proporsional).
MAX_BAR_WIDTH = 575.6
# Jarak angka dari ujung batang (x angka = lebar batang + jarak ini).
NUM_GAP = 14.0


def load_counts(csv_path):
    """Hitung angka-angka turunan dari CSV. Kembalikan dict."""
    with open(csv_path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    for r in rows:
        r["no"] = int(r["no"])
    total = len(rows)
    status_count = Counter(r["status"] for r in rows)

    def has_channel(r):
        return any((r.get(k) or "").strip()
                   for k in ("email_hrd", "wa_hrd", "kontak_lain"))

    no_link = [r for r in rows if not (r.get("link_karir") or "").strip()]
    with_channel = [r for r in no_link if has_channel(r)]
    no_channel = sorted((r for r in no_link if not has_channel(r)),
                        key=lambda r: r["no"])
    return {
        "total": total,
        "status": {s: status_count.get(s, 0) for s in STATUSES},
        "no_link": len(no_link),
        "with_channel": len(with_channel),
        "no_channel": len(no_channel),
        "no_channel_list": [(r["no"], r["perusahaan"]) for r in no_channel],
    }


def _sub_or_fail(text, pattern, repl, label, errors, literal=False):
    """Ganti pola (satu kemunculan) atau catat kesalahan bila tak ada.

    literal=True: pengganti disisipkan mentah via fungsi (wajib bila
    pengganti mengandung data dari CSV seperti nama perusahaan —
    re.subn menafsirkan backslash + rujukan grup di string pengganti,
    sehingga nama berisi "\\" atau "\\g<...>" dapat merusak keluaran).
    """
    func = (lambda m: repl) if literal else repl
    new, n = re.subn(pattern, func, text, count=1)
    if n == 0:
        errors.append(f"pola {label} tidak ditemukan")
        return text
    return new


def regenerate_readme(text, c):
    """Kembalikan (teks_baru, daftar_kesalahan)."""
    errors = []
    total = c["total"]
    ada = c["status"]["Ada lowongan"]
    subs = [
        # (pola, pengganti, label) — pola sama dengan check-consistency.py
        (r"berisi \d+ kanal karir resmi",
         f"berisi {total} kanal karir resmi",
         "total perusahaan (kalimat pembuka)"),
        (r"\d+ perusahaan sedang ada lowongan",
         f"{ada} perusahaan sedang ada lowongan",
         "ada lowongan (kalimat pembuka)"),
        (r"Hasil cek \d+ kanal",
         f"Hasil cek {total} kanal",
         "total kanal (judul hasil cek)"),
        (r"\d+ dari \d+ kanal ada lowongan",
         f"{ada} dari {total} kanal ada lowongan",
         "ada lowongan + total (kalimat hasil cek)"),
        (r"Sebaran status \d+ perusahaan",
         f"Sebaran status {total} perusahaan",
         "total perusahaan (alt grafik status)"),
        (r"\| Ada lowongan \| \d+ \|",
         f"| Ada lowongan | {ada} |",
         "Ada lowongan (tabel status)"),
        (r"\| Tidak ada lowongan \| \d+ \|",
         f"| Tidak ada lowongan | {c['status']['Tidak ada lowongan']} |",
         "Tidak ada lowongan (tabel status)"),
        (r"\| Tidak dapat diverifikasi \| \d+ \|",
         f"| Tidak dapat diverifikasi | {c['status']['Tidak dapat diverifikasi']} |",
         "Tidak dapat diverifikasi (tabel status)"),
        (r"\| Portal tidak bisa dibuka \| \d+ \|",
         f"| Portal tidak bisa dibuka | {c['status']['Portal tidak bisa dibuka']} |",
         "Portal tidak bisa dibuka (tabel status)"),
        (r"\d+ perusahaan tidak punya tautan karir",
         f"{c['no_link']} perusahaan tidak punya tautan karir",
         "tanpa tautan karir"),
        (r"\d+ di antaranya masih bisa dilamar lewat kanal lain",
         f"{c['with_channel']} di antaranya masih bisa dilamar lewat kanal lain",
         "tanpa tautan tapi ada kanal lain"),
        (r"\d+ perusahaan tidak punya kanal apa pun",
         f"{c['no_channel']} perusahaan tidak punya kanal apa pun",
         "tanpa kanal apa pun"),
    ]
    for pattern, repl, label in subs:
        text = _sub_or_fail(text, pattern, repl, label, errors)
    # Daftar perusahaan tanpa kanal: hanya ditulis ulang bila himpunan
    # nomornya berubah (supaya alias manual seperti "(355, BLSI)" tidak
    # terhapus oleh regenerasi yang tidak perlu).
    m = re.search(r"tidak ditebak: ([^.]+)\.", text)
    if not m:
        errors.append("daftar perusahaan tanpa kanal tidak ditemukan")
    else:
        listed = sorted(int(n) for n in re.findall(r"\d+", m.group(1)))
        actual = sorted(no for no, _ in c["no_channel_list"])
        if listed != actual:
            generated = ", ".join(
                f"{name} ({no})" for no, name in c["no_channel_list"])
            text = _sub_or_fail(
                text, r"tidak ditebak: [^.]+\.",
                f"tidak ditebak: {generated}.",
                "daftar perusahaan tanpa kanal", errors, literal=True)
    return text, errors


def bar_width(count, max_count):
    """Lebar batang (1 desimal) untuk hitungan ini."""
    if max_count <= 0:
        return 0.0
    return round(count / max_count * MAX_BAR_WIDTH, 1)


def regenerate_svg(text, c):
    """Kembalikan (teks_baru, daftar_kesalahan)."""
    errors = []
    total = c["total"]
    counts = c["status"]
    max_count = max(counts.values()) if counts else 0
    aria = ("Sebaran status {total} kanal karir: {a} ada lowongan, "
            "{b} tidak ada lowongan, {c} tidak dapat diverifikasi, "
            "{d} portal tidak bisa dibuka").format(
                total=total, a=counts["Ada lowongan"],
                b=counts["Tidak ada lowongan"],
                c=counts["Tidak dapat diverifikasi"],
                d=counts["Portal tidak bisa dibuka"])
    subs = [
        (r'aria-label="Sebaran status [^"]*"',
         f'aria-label="{aria}"',
         "aria-label SVG"),
        (r"<title>Sebaran status \d+ kanal karir</title>",
         f"<title>Sebaran status {total} kanal karir</title>",
         "title SVG"),
    ]
    for pattern, repl, label in subs:
        text = _sub_or_fail(text, pattern, repl, label, errors)
    # Per baris: lebar batang + posisi x angka + angka itu sendiri.
    # Baris diidentifikasi kelasnya (b0..b3 / n0..n3) sesuai urutan
    # STATUSES, jadi urutan baris di SVG harus sama dengan STATUSES.
    for i, status in enumerate(STATUSES):
        w = bar_width(counts[status], max_count)
        x = w + NUM_GAP
        text = _sub_or_fail(
            text,
            rf'(<rect class="bar b{i}" x="0" y="\d+" width=")[\d.]+(")',
            rf"\g<1>{w:.1f}\g<2>",
            f"lebar batang {status}", errors)
        text = _sub_or_fail(
            text,
            rf'(<text class="num n{i}" x=")[\d.]+(")',
            rf"\g<1>{x:.1f}\g<2>",
            f"posisi angka {status}", errors)
        text = _sub_or_fail(
            text,
            rf'(<text class="num n{i}"[^>]*>)\d+(</text>)',
            rf"\g<1>{counts[status]}\g<2>",
            f"angka {status}", errors)
    return text, errors


def _write_atomic(path, text):
    tmp = path.with_suffix(path.suffix + ".tmp-p02")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Regenerasi angka README.md + status-bar.svg dari CSV.")
    ap.add_argument("--check", action="store_true",
                    help="hanya laporkan perubahan, tanpa menulis")
    ap.add_argument("--root", default=str(ROOT),
                    help="root repo (bawaan: induk folder scripts/)")
    args = ap.parse_args(argv)

    root = Path(args.root)
    csv_path = root / "data" / "daftar-link-karir.csv"
    readme_path = root / "README.md"
    svg_path = root / "assets" / "status-bar.svg"
    try:
        counts = load_counts(csv_path)
    except (OSError, csv.Error, ValueError) as exc:
        print(f"regenerasi GAGAL: CSV tidak bisa dibaca: {exc}")
        return 1
    if counts["total"] == 0:
        print("regenerasi GAGAL: CSV kosong (0 baris)")
        return 1

    errors = []
    readme_text = readme_path.read_text(encoding="utf-8")
    new_readme, errs = regenerate_readme(readme_text, counts)
    errors += errs
    svg_text = svg_path.read_text(encoding="utf-8")
    new_svg, errs = regenerate_svg(svg_text, counts)
    errors += errs
    if errors:
        print("regenerasi GAGAL:")
        for e in errors:
            print(f" - {e}")
        return 1

    changed = []
    if new_readme != readme_text:
        changed.append("README.md")
    if new_svg != svg_text:
        changed.append("assets/status-bar.svg")
    if args.check:
        if changed:
            print("regenerasi: berkas berikut akan berubah: "
                  + ", ".join(changed))
            return 1
        print("regenerasi: tidak ada perubahan")
        return 0
    if "README.md" in changed:
        _write_atomic(readme_path, new_readme)
    if "assets/status-bar.svg" in changed:
        _write_atomic(svg_path, new_svg)
    print(f"regenerasi selesai: total={counts['total']}, "
          f"ada lowongan={counts['status']['Ada lowongan']}, "
          f"portal={counts['status']['Portal tidak bisa dibuka']}; "
          f"berubah: {', '.join(changed) if changed else 'tidak ada'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
