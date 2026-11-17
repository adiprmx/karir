"""Test pytest untuk scripts/regenerate_readme.py (P-02, K-08).

Dijalankan dengan: python3 -m pytest scripts/test_regenerate_readme.py -q
(dari root repo; langkah yang sama jalan di .github/workflows/validate.yml).

Yang dites: regenerasi angka README + SVG dari CSV contoh, determinisme
(CSV yang sama -> keluaran yang sama persis), kegagalan keras bila pola
hilang, dan idempotensi terhadap README + SVG repo yang sebenarnya
(angka saat ini sudah cocok dengan CSV, jadi regenerasi tidak mengubah
apa pun).
"""
import csv
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import regenerate_readme as regen

REPO = Path(__file__).resolve().parent.parent
FIELDS = regen.FIELDS


def baris(no, status="Ada lowongan", link="https://contoh.test/karir",
          email="", wa="", kontak=""):
    return {
        "no": str(no), "perusahaan": f"PT Contoh {no}", "kategori": "Retail",
        "link_karir": link, "status": status, "tanggal_cek": "2026-11-17",
        "catatan": "", "lokasi": "Bogor", "posisi": "", "email_hrd": email,
        "wa_hrd": wa, "kontak_lain": kontak, "batas_lamar": "",
    }


def tulis_csv(path, rows):
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in FIELDS})


README_CONTOH = """<p align="center">Daftar ini berisi 3 kanal karir resmi perusahaan. Hasilnya: 2 perusahaan sedang ada lowongan.</p>

<h2 align="center">Hasil cek 3 kanal</h2>

2 dari 3 kanal ada lowongan.

<p align="center">
  <img src="assets/status-bar.svg" alt="Sebaran status 3 perusahaan" width="100%">
</p>

| Status | Jumlah |
| --- | --- |
| Ada lowongan | 2 |
| Tidak ada lowongan | 1 |
| Tidak dapat diverifikasi | 0 |
| Portal tidak bisa dibuka | 0 |

1 perusahaan tidak punya tautan karir. 0 di antaranya masih bisa dilamar lewat kanal lain (email, WhatsApp, atau kontak lain dari sumber resmi). 1 perusahaan tidak punya kanal apa pun karena situs resminya tidak ketemu, dan tautannya tidak ditebak: PT Contoh 3 (3).
"""

SVG_CONTOH = """<svg xmlns="http://www.w3.org/2000/svg" width="700" height="296" viewBox="0 0 700 296" role="img" aria-label="Sebaran status 3 kanal karir: 2 ada lowongan, 1 tidak ada lowongan, 0 tidak dapat diverifikasi, 0 portal tidak bisa dibuka">
  <title>Sebaran status 3 kanal karir</title>
  <rect width="700" height="296" fill="#ffffff"/>
  <g class="row r0">
    <text x="0" y="48" font-size="24" font-weight="600" fill="#111111">Ada lowongan</text>
    <rect class="bar b0" x="0" y="58" width="575.6" height="22" fill="#16a34a"/>
    <text class="num n0" x="589.6" y="79" font-size="28" font-weight="800" fill="#16a34a">2</text>
  </g>
  <g class="row r1">
    <text x="0" y="114" font-size="24" font-weight="600" fill="#111111">Tidak ada lowongan</text>
    <rect class="bar b1" x="0" y="124" width="287.8" height="22" fill="#525252"/>
    <text class="num n1" x="301.8" y="145" font-size="28" font-weight="800" fill="#525252">1</text>
  </g>
  <g class="row r2">
    <text x="0" y="180" font-size="24" font-weight="600" fill="#111111">Tidak dapat diverifikasi</text>
    <rect class="bar b2" x="0" y="190" width="0.0" height="22" fill="#a3a3a3"/>
    <text class="num n2" x="14.0" y="211" font-size="28" font-weight="800" fill="#a3a3a3">0</text>
  </g>
  <g class="row r3">
    <text x="0" y="246" font-size="24" font-weight="600" fill="#111111">Portal tidak bisa dibuka</text>
    <rect class="bar b3" x="0" y="256" width="0.0" height="22" fill="#c9c9c9"/>
    <text class="num n3" x="14.0" y="277" font-size="28" font-weight="800" fill="#c9c9c9">0</text>
  </g>
</svg>
"""


def hitungan_contoh():
    return {
        "total": 3,
        "status": {"Ada lowongan": 2, "Tidak ada lowongan": 1,
                   "Tidak dapat diverifikasi": 0,
                   "Portal tidak bisa dibuka": 0},
        "no_link": 1, "with_channel": 0, "no_channel": 1,
        "no_channel_list": [(3, "PT Contoh 3")],
    }


def test_load_counts_dari_csv(tmp_path):
    p = tmp_path / "c.csv"
    tulis_csv(p, [baris(1), baris(2, status="Tidak ada lowongan"),
                  baris(3, link="")])
    c = regen.load_counts(p)
    assert c["total"] == 3
    assert c["status"]["Ada lowongan"] == 2
    assert c["status"]["Tidak ada lowongan"] == 1
    assert c["status"]["Portal tidak bisa dibuka"] == 0
    assert c["no_link"] == 1
    assert c["no_channel"] == 1
    assert c["no_channel_list"] == [(3, "PT Contoh 3")]


def test_regenerasi_readme_idempotent_pada_contoh_cocok():
    baru, errors = regen.regenerate_readme(README_CONTOH, hitungan_contoh())
    assert errors == []
    assert baru == README_CONTOH


def test_regenerasi_readme_memperbarui_angka():
    c = hitungan_contoh()
    c["total"] = 4
    c["status"] = {"Ada lowongan": 1, "Tidak ada lowongan": 1,
                   "Tidak dapat diverifikasi": 1,
                   "Portal tidak bisa dibuka": 1}
    c["no_link"] = 0
    c["with_channel"] = 0
    c["no_channel"] = 0
    c["no_channel_list"] = []
    baru, errors = regen.regenerate_readme(README_CONTOH, c)
    assert errors == []
    assert "berisi 4 kanal karir resmi" in baru
    assert "1 perusahaan sedang ada lowongan" in baru
    assert "Hasil cek 4 kanal" in baru
    assert "1 dari 4 kanal ada lowongan" in baru
    assert "Sebaran status 4 perusahaan" in baru
    assert "| Ada lowongan | 1 |" in baru
    assert "| Portal tidak bisa dibuka | 1 |" in baru
    assert "0 perusahaan tidak punya tautan karir" in baru
    assert "tidak ditebak: ." in baru


def test_regenerasi_readme_gagal_bila_pola_hilang():
    rusak = README_CONTOH.replace("Hasil cek 3 kanal", "Hasil pemeriksaan")
    _, errors = regen.regenerate_readme(rusak, hitungan_contoh())
    assert any("judul hasil cek" in e for e in errors)


def test_regenerasi_svg_idempotent_pada_contoh_cocok():
    baru, errors = regen.regenerate_svg(SVG_CONTOH, hitungan_contoh())
    assert errors == []
    assert baru == SVG_CONTOH


def test_regenerasi_svg_memperbarui_lebar_dan_angka():
    c = hitungan_contoh()
    c["total"] = 4
    c["status"] = {"Ada lowongan": 1, "Tidak ada lowongan": 1,
                   "Tidak dapat diverifikasi": 1,
                   "Portal tidak bisa dibuka": 1}
    baru, errors = regen.regenerate_svg(SVG_CONTOH, c)
    assert errors == []
    # Keempat hitungan sama -> semua batang selebar maksimum.
    assert baru.count('width="575.6"') == 4
    assert baru.count('x="589.6"') == 4
    assert "Sebaran status 4 kanal karir" in baru
    assert "1 ada lowongan, 1 tidak ada lowongan" in baru


def test_bar_width_nol_bila_maks_nol():
    assert regen.bar_width(0, 0) == 0.0
    assert regen.bar_width(5, 10) == 287.8


def test_deterministik_dua_kali_sama():
    c = hitungan_contoh()
    r1, _ = regen.regenerate_readme(README_CONTOH, c)
    r2, _ = regen.regenerate_readme(README_CONTOH, c)
    s1, _ = regen.regenerate_svg(SVG_CONTOH, c)
    s2, _ = regen.regenerate_svg(SVG_CONTOH, c)
    assert r1 == r2
    assert s1 == s2


def test_main_check_idempotent_pada_repo_asli():
    # README + SVG repo saat ini sudah cocok dengan CSV: --check lolos.
    assert regen.main(["--check", "--root", str(REPO)]) == 0


def test_main_menulis_perubahan_dan_check_lalu_lolos(tmp_path):
    root = tmp_path / "repo"
    (root / "data").mkdir(parents=True)
    (root / "assets").mkdir()
    tulis_csv(root / "data" / "daftar-link-karir.csv",
              [baris(1), baris(2, status="Tidak ada lowongan"),
               baris(3, link="")])
    (root / "README.md").write_text(README_CONTOH, encoding="utf-8")
    (root / "assets" / "status-bar.svg").write_text(SVG_CONTOH,
                                                    encoding="utf-8")
    assert regen.main(["--check", "--root", str(root)]) == 0
    # Ubah CSV: satu status berubah -> --check gagal, main menulis,
    # lalu --check lolos lagi.
    tulis_csv(root / "data" / "daftar-link-karir.csv",
              [baris(1), baris(2, status="Portal tidak bisa dibuka"),
               baris(3, link="")])
    assert regen.main(["--check", "--root", str(root)]) == 1
    assert regen.main(["--root", str(root)]) == 0
    assert regen.main(["--check", "--root", str(root)]) == 0
    readme = (root / "README.md").read_text(encoding="utf-8")
    assert "| Portal tidak bisa dibuka | 1 |" in readme
    # Baris 1 dan 3 tetap "Ada lowongan" -> hitungan tidak berubah.
    assert "2 perusahaan sedang ada lowongan" in readme
    assert "| Tidak ada lowongan | 0 |" in readme
    # Tidak ada berkas sementara yang tertinggal.
    assert list(root.rglob("*.tmp-p02")) == []


def test_regenerasi_nama_perusahaan_dengan_backslash_aman():
    # Red Team P-02: nama perusahaan yang mengandung backslash atau
    # rujukan grup regex tidak boleh merusak substitusi (pengganti
    # literal, bukan pola re.subn).
    c = hitungan_contoh()
    c["no_channel_list"] = [(3, r"PT Coba \g<1> \\ Test")]
    baru, errors = regen.regenerate_readme(README_CONTOH, c)
    assert errors == []
    assert r"tidak ditebak: PT Coba \g<1> \\ Test (3)." in baru


def test_main_gagal_bila_csv_kosong(tmp_path):
    root = tmp_path / "repo"
    (root / "data").mkdir(parents=True)
    (root / "assets").mkdir()
    (root / "data" / "daftar-link-karir.csv").write_text(
        ",".join(FIELDS) + "\n", encoding="utf-8")
    (root / "README.md").write_text(README_CONTOH, encoding="utf-8")
    (root / "assets" / "status-bar.svg").write_text(SVG_CONTOH,
                                                    encoding="utf-8")
    assert regen.main(["--root", str(root)]) == 1
