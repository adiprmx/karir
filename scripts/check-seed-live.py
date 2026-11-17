#!/usr/bin/env python3
"""Cek jumlah perusahaan seed vs situs live (P-01, mendukung BE2-03).

Seed (web/data/companies.json) adalah cadangan yang dipakai situs saat
Firestore tidak bisa dibaca; situs live menyajikan Firestore. Bila
keduanya berbeda jumlah, seed tertinggal dari data live (riwayatnya:
seed 639 lawan live 685 pada BE2-03) dan pengguna yang jatuh ke seed
melihat daftar yang tidak lengkap.

Skrip ini HANYA membandingkan jumlah total — perbandingan field
lengkap adalah tugas scripts/check-consistency.py --live. Satu
panggilan /api/stats, murah kuota (tidak membaca seluruh daftar).

Mode bawaan adalah mode laporan: mencetak seed, live, dan selisih,
lalu keluar 0 apa pun selisihnya. Ambang penegakan ditetapkan di
P-02 (penutup drift): pakai --max-drift N untuk keluar 1 bila
|live - seed| > N. Sampai P-02 mengaktifkan ambang itu, CI
menjalankan skrip ini dalam mode laporan supaya drift yang sudah
diketahui tidak membuat CI merah karena alasan yang sudah dicatat.

Transport memakai curl (urllib mengabaikan proxy egress di VM ini).
API menolak user-agent otomatis (403), jadi skrip memakai user-agent
browser biasa — ini pengecekan repo sendiri, bukan scraping pihak lain.

Usage:
  python3 scripts/check-seed-live.py [--base-url URL] [--max-drift N]
Keluar 0 bila lolos (atau mode laporan), 1 bila selisih melewati
--max-drift, 2 bila situs live tidak bisa dijangkau setelah 3
percobaan atau seed tidak bisa dibaca.
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED_PATH = ROOT / "web" / "data" / "companies.json"
DEFAULT_BASE_URL = "https://karir-adiprmx.vercel.app"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")


def fetch_json(url):
    """GET JSON lewat curl; kembalikan dict atau None bila gagal total."""
    for attempt in range(1, 4):
        cmd = [
            "curl", "-sS", "--max-time", "30", url,
            "-H", f"User-Agent: {UA}",
            "-w", "\\nHTTP:%{http_code}",
        ]
        out = subprocess.run(cmd, capture_output=True, text=True).stdout
        text, _, http = out.rpartition("\\nHTTP:")
        if http.strip() == "200":
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return None
        if attempt < 3:
            time.sleep(5)
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL,
                        help="asal situs yang dicek (bawaan: produksi)")
    parser.add_argument("--max-drift", type=int, default=None,
                        help="gagal bila |live - seed| > N; tanpa flag ini "
                             "skrip hanya melaporkan (mode laporan P-01)")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    try:
        seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
        seed_total = len(seed)
    except (OSError, json.JSONDecodeError, TypeError) as e:
        print(f"SEED TIDAK BISA DIBACA: {SEED_PATH}: {e}")
        return 2

    stats = fetch_json(f"{base}/api/stats")
    if stats is None:
        print(f"LIVE TIDAK BISA DIJANGKAU: {base}/api/stats gagal "
              "setelah 3 percobaan")
        return 2
    live_total = stats.get("total")
    if not isinstance(live_total, int):
        print(f"/api/stats tidak mengembalikan total bilangan bulat: {stats}")
        return 2

    drift = live_total - seed_total
    source = stats.get("source", "?")
    print(f"seed: {seed_total}; live: {live_total} (source: {source}); "
          f"selisih (live - seed): {drift:+d}")
    if source == "seed":
        print("PERINGATAN: /api/stats menyajikan data SEED (Firestore tidak "
              "bisa dibaca saat cek) — selisih 0 di sini tidak membuktikan "
              "Firestore dan seed sama.")
    if args.max_drift is not None and abs(drift) > args.max_drift:
        print(f"GAGAL: |selisih| {abs(drift)} melewati ambang "
              f"--max-drift {args.max_drift}")
        return 1
    if args.max_drift is None:
        print("Mode laporan (ambang penegakan ditetapkan P-02).")
    else:
        print(f"Lolos: |selisih| {abs(drift)} dalam ambang {args.max_drift}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
