"""Test pytest untuk scripts/validate.py (QA-14).

Dijalankan dengan: python3 -m pytest scripts/test_validate.py -q
(dari root repo; langkah yang sama jalan di .github/workflows/validate.yml).

Yang dites: normalisasi nomor WhatsApp, pemetaan kota, dan main()
dengan CSV contoh sah/cacat — tiap kelas cacat yang ditolak validator
punya satu test yang menegaskan pesan kesalahannya. main() membaca
CSV dari validate.CSV_PATH, jadi test menunjuk variabel itu ke berkas
sementara (monkeypatch); validator aslinya tidak diubah. Daftar kota
yang dipakai adalah daftar asli web/lib/cities.js.
"""
import csv
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import validate


def baris(**over):
    """Satu baris CSV yang sah; ubah field lewat argumen."""
    r = {
        "no": "1",
        "perusahaan": "PT Contoh",
        "kategori": "Retail",
        "link_karir": "https://contoh.test/karir",
        "status": "Ada lowongan",
        "tanggal_cek": "2026-11-10",
        "catatan": "",
        "lokasi": "Bogor",
        "posisi": "Staff Gudang",
        "email_hrd": "",
        "wa_hrd": "",
        "kontak_lain": "",
        "batas_lamar": "",
    }
    r.update(over)
    return r


def tulis_csv(tmp_path, rows, header=None):
    p = tmp_path / "daftar-link-karir.csv"
    fields = header or validate.EXPECTED_COLUMNS
    with p.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fields})
    return p


def jalankan(monkeypatch, tmp_path, rows, header=None):
    """Tulis CSV contoh, arahkan validator ke sana, jalankan main()."""
    p = tulis_csv(tmp_path, rows, header)
    monkeypatch.setattr(validate, "CSV_PATH", p)
    return validate.main()


def besok_wib():
    return (datetime.now(timezone.utc) + timedelta(hours=7, days=1)).date().isoformat()


# --- CSV sah ---------------------------------------------------------------

def test_csv_sah_satu_baris_lolos(monkeypatch, tmp_path, capsys):
    assert jalankan(monkeypatch, tmp_path, [baris()]) == 0
    assert "OK: 1 baris" in capsys.readouterr().out


def test_csv_sah_multi_baris_dengan_kanal_dan_batas(monkeypatch, tmp_path):
    rows = [
        baris(),
        baris(
            no="2",
            perusahaan="PT Dua",
            link_karir="https://dua.test/karir",
            batas_lamar="2026-11-18",
            email_hrd="hrd@dua.test",
            wa_hrd="081211559991; 081384788643",
        ),
        baris(
            no="3",
            perusahaan="PT Tiga",
            link_karir="https://tiga.test/karir",
            kontak_lain="formulir: https://t.ly/contoh",
            lokasi="Depok",
        ),
    ]
    assert jalankan(monkeypatch, tmp_path, rows) == 0


def test_batas_lamar_iso_sah(monkeypatch, tmp_path):
    assert (
        jalankan(monkeypatch, tmp_path, [baris(batas_lamar="2026-11-18")]) == 0
    )


def test_email_hrd_multi_dipisah_titik_koma_sah(monkeypatch, tmp_path):
    assert (
        jalankan(
            monkeypatch,
            tmp_path,
            [baris(email_hrd="a@contoh.test; b@contoh.test")],
        )
        == 0
    )


def test_wa_hrd_multi_nomor_sah(monkeypatch, tmp_path):
    assert (
        jalankan(
            monkeypatch,
            tmp_path,
            [baris(wa_hrd="081211559991; 081384788643")],
        )
        == 0
    )


def test_kategori_nonkanonis_terpeta_sah(monkeypatch, tmp_path):
    assert jalankan(monkeypatch, tmp_path, [baris(kategori="Supermarket")]) == 0


def test_kontak_lain_gagang_media_sosial_dikecualikan(monkeypatch, tmp_path):
    assert (
        jalankan(monkeypatch, tmp_path, [baris(kontak_lain="@pp_presisi")]) == 0
    )


def test_link_kosong_dengan_penjelasan_di_catatan_sah(monkeypatch, tmp_path):
    # Baris tanpa kanal yang sah harus berstatus "Tidak dapat
    # diverifikasi" (lihat baseline MAX_TANPA_KANAL): perusahaan
    # yang "Ada lowongan" tanpa jalur melamar selalu gagal, walau
    # catatannya menjelaskan.
    assert (
        jalankan(
            monkeypatch,
            tmp_path,
            [
                baris(
                    link_karir="",
                    status="Tidak dapat diverifikasi",
                    catatan="Situs resmi tidak ditemukan saat dicek.",
                )
            ],
        )
        == 0
    )


# --- Struktur CSV ----------------------------------------------------------

def test_kolom_tidak_sesuai_gagal(monkeypatch, tmp_path):
    # Cabang ini mengembalikan 1 TANPA mencetak daftar kesalahan
    # (return dini sebelum print) — yang diuji hanya kode keluarnya.
    header = validate.EXPECTED_COLUMNS[:-1]  # tanpa batas_lamar
    assert jalankan(monkeypatch, tmp_path, [baris()], header=header) == 1


def test_csv_kosong_gagal(monkeypatch, tmp_path, capsys):
    # CSV kosong gagal bersih (kode 1 + pesan "CSV kosong"), tanpa crash.
    # Dulu main() crash ZeroDivisionError di sini (ditemukan T16-A saat
    # menulis test); diperbaiki koordinator saat merge (return dini).
    assert jalankan(monkeypatch, tmp_path, []) == 1
    assert "CSV kosong" in capsys.readouterr().out


def test_no_tidak_berurutan_gagal(monkeypatch, tmp_path, capsys):
    rows = [baris(no="1"), baris(no="3", perusahaan="PT Tiga",
                                 link_karir="https://tiga.test/karir")]
    assert jalankan(monkeypatch, tmp_path, rows) == 1
    assert "kolom no tidak berurutan" in capsys.readouterr().out


def test_nama_perusahaan_duplikat_gagal(monkeypatch, tmp_path, capsys):
    rows = [
        baris(),
        baris(no="2", perusahaan="pt contoh",
              link_karir="https://lain.test/karir"),
    ]
    assert jalankan(monkeypatch, tmp_path, rows) == 1
    assert "nama perusahaan duplikat" in capsys.readouterr().out


# --- Status dan tanggal ----------------------------------------------------

def test_status_tidak_dikenal_gagal(monkeypatch, tmp_path, capsys):
    assert (
        jalankan(monkeypatch, tmp_path, [baris(status="Ada lowongan target")])
        == 1
    )
    assert "status tidak dikenal" in capsys.readouterr().out


def test_tanggal_cek_bukan_iso_gagal(monkeypatch, tmp_path, capsys):
    assert (
        jalankan(monkeypatch, tmp_path, [baris(tanggal_cek="10 Nov 2026")]) == 1
    )
    assert "tanggal_cek bukan YYYY-MM-DD" in capsys.readouterr().out


def test_tanggal_cek_tidak_valid_kalender_gagal(monkeypatch, tmp_path, capsys):
    assert (
        jalankan(monkeypatch, tmp_path, [baris(tanggal_cek="2026-02-31")]) == 1
    )
    assert "tanggal tidak valid" in capsys.readouterr().out


def test_tanggal_cek_masa_depan_gagal(monkeypatch, tmp_path, capsys):
    assert (
        jalankan(monkeypatch, tmp_path, [baris(tanggal_cek=besok_wib())]) == 1
    )
    assert "tanggal_cek di masa depan" in capsys.readouterr().out


def test_batas_lamar_bukan_iso_gagal(monkeypatch, tmp_path, capsys):
    assert (
        jalankan(monkeypatch, tmp_path, [baris(batas_lamar="15 Nov 2026")]) == 1
    )
    assert "batas_lamar bukan YYYY-MM-DD" in capsys.readouterr().out


def test_batas_lamar_tidak_valid_kalender_gagal(monkeypatch, tmp_path, capsys):
    assert (
        jalankan(monkeypatch, tmp_path, [baris(batas_lamar="2026-02-30")]) == 1
    )
    assert "batas_lamar bukan tanggal kalender yang valid" in capsys.readouterr().out


# --- Kanal melamar ---------------------------------------------------------

def test_email_hrd_tidak_valid_gagal(monkeypatch, tmp_path, capsys):
    assert (
        jalankan(monkeypatch, tmp_path, [baris(email_hrd="bukan-email")]) == 1
    )
    assert "email_hrd bukan alamat email" in capsys.readouterr().out


def test_wa_hrd_mengandung_huruf_gagal(monkeypatch, tmp_path, capsys):
    assert jalankan(monkeypatch, tmp_path, [baris(wa_hrd="0812abc")]) == 1
    assert "wa_hrd bukan nomor telepon yang valid" in capsys.readouterr().out


def test_wa_hrd_terlalu_pendek_gagal(monkeypatch, tmp_path, capsys):
    assert jalankan(monkeypatch, tmp_path, [baris(wa_hrd="0812")]) == 1
    assert "wa_hrd bukan nomor telepon yang valid" in capsys.readouterr().out


def test_kontak_lain_email_tidak_valid_gagal(monkeypatch, tmp_path, capsys):
    assert (
        jalankan(monkeypatch, tmp_path, [baris(kontak_lain="hrd@contoh")]) == 1
    )
    assert "kontak_lain berisi alamat email" in capsys.readouterr().out


def test_kontak_lain_url_tidak_valid_gagal(monkeypatch, tmp_path, capsys):
    assert (
        jalankan(
            monkeypatch, tmp_path, [baris(kontak_lain="https://contoh")]
        )
        == 1
    )
    assert "kontak_lain berisi URL" in capsys.readouterr().out


def test_perusahaan_ada_lowongan_tanpa_kanal_gagal(monkeypatch, tmp_path, capsys):
    assert (
        jalankan(monkeypatch, tmp_path, [baris(link_karir="")]) == 1
    )
    assert "tanpa jalur melamar" in capsys.readouterr().out


def test_link_kosong_tanpa_penjelasan_gagal(monkeypatch, tmp_path, capsys):
    row = baris(link_karir="", status="Tidak dapat diverifikasi")
    assert jalankan(monkeypatch, tmp_path, [row]) == 1
    assert "link kosong tanpa kanal" in capsys.readouterr().out


def test_link_karir_bukan_url_gagal(monkeypatch, tmp_path, capsys):
    assert (
        jalankan(monkeypatch, tmp_path, [baris(link_karir="contoh.test")]) == 1
    )
    assert "link_karir bukan URL yang valid" in capsys.readouterr().out


# --- Kualitas data (DATA-04/05/11) ----------------------------------------

def test_kategori_tidak_dikenal_gagal(monkeypatch, tmp_path, capsys):
    assert (
        jalankan(monkeypatch, tmp_path, [baris(kategori="Industri Aneh")]) == 1
    )
    assert "tidak ada di kosakata kanonis" in capsys.readouterr().out


def test_posisi_mengandung_nilai_status_gagal(monkeypatch, tmp_path, capsys):
    assert (
        jalankan(
            monkeypatch, tmp_path, [baris(posisi="Ada lowongan di gudang")]
        )
        == 1
    )
    assert "bocor ke kolom posisi" in capsys.readouterr().out


def test_posisi_tidak_dirinci_gagal(monkeypatch, tmp_path, capsys):
    assert (
        jalankan(monkeypatch, tmp_path, [baris(posisi="tidak dirinci")]) == 1
    )
    assert "tidak dirinci" in capsys.readouterr().out


def test_lokasi_mengandung_nilai_status_gagal(monkeypatch, tmp_path, capsys):
    assert (
        jalankan(monkeypatch, tmp_path, [baris(lokasi="Ada lowongan")]) == 1
    )
    assert "bocor ke kolom lokasi" in capsys.readouterr().out


def test_ratchet_lokasi_placeholder_melewati_baseline_gagal(
    monkeypatch, tmp_path, capsys
):
    rows = [
        baris(
            no=str(i + 1),
            perusahaan=f"PT Contoh {i + 1}",
            link_karir=f"https://contoh{i + 1}.test/karir",
            lokasi="Tidak bisa dicek",
        )
        for i in range(validate.MAX_PLACEHOLDER_LOKASI + 1)
    ]
    assert jalankan(monkeypatch, tmp_path, rows) == 1
    assert "lokasi placeholder bertambah" in capsys.readouterr().out


def test_ratchet_kategori_nonkanonis_melewati_baseline_gagal(
    monkeypatch, tmp_path, capsys
):
    rows = [
        baris(
            no=str(i + 1),
            perusahaan=f"PT Contoh {i + 1}",
            link_karir=f"https://contoh{i + 1}.test/karir",
            kategori="Supermarket",
        )
        for i in range(validate.MAX_KATEGORI_NONKANONIK + 1)
    ]
    assert jalankan(monkeypatch, tmp_path, rows) == 1
    assert "kategori non-kanonis bertambah" in capsys.readouterr().out


def test_ratchet_link_http_melewati_baseline_gagal(
    monkeypatch, tmp_path, capsys
):
    rows = [
        baris(
            no=str(i + 1),
            perusahaan=f"PT Contoh {i + 1}",
            link_karir=f"http://contoh{i + 1}.test/karir",
        )
        for i in range(validate.MAX_LINK_HTTP + 1)
    ]
    assert jalankan(monkeypatch, tmp_path, rows) == 1
    assert "link_karir http:// bertambah" in capsys.readouterr().out


def test_ratchet_duplikat_link_melewati_baseline_gagal(
    monkeypatch, tmp_path, capsys
):
    rows = [
        baris(no=str(i + 1), perusahaan=f"PT Contoh {i + 1}")
        for i in range(validate.MAX_LINK_KARIR_DUPLIKAT + 2)
    ]
    assert jalankan(monkeypatch, tmp_path, rows) == 1
    assert "duplikat link_karir bertambah" in capsys.readouterr().out


def test_ratchet_tanpa_kanal_melewati_baseline_gagal(
    monkeypatch, tmp_path, capsys
):
    rows = [
        baris(
            no=str(i + 1),
            perusahaan=f"PT Contoh {i + 1}",
            link_karir="",
            catatan="Situs resmi tidak ditemukan saat dicek.",
        )
        for i in range(validate.MAX_TANPA_KANAL + 1)
    ]
    assert jalankan(monkeypatch, tmp_path, rows) == 1
    assert "perusahaan tanpa kanal apa pun bertambah" in capsys.readouterr().out


# --- Fungsi pembantu -------------------------------------------------------

@pytest.mark.parametrize(
    "masukan,keluaran",
    [
        ("081211559991", "6281211559991"),
        ("6281211559991", "6281211559991"),
        ("81211559991", "6281211559991"),
        ("+62 812-111-559991", "62812111559991"),
        ("0812 1155 9991", "6281211559991"),
        ("", None),
        ("123", None),
        ("0812", None),
        ("0812abc", None),
        ("+1 212 555 1234", None),
        ("0" * 16, None),
    ],
)
def test_normalize_wa(masukan, keluaran):
    assert validate.normalize_wa(masukan) == keluaran


def test_load_city_keys_membaca_daftar_asli():
    cities = validate.load_city_keys()
    assert cities is not None
    names = [name for name, _keys in cities]
    assert "Bogor" in names
    assert "Depok" in names
    assert len(names) >= 30


def test_cities_in_text_mengenali_kata_utuh():
    cities = validate.load_city_keys()
    assert "Bogor" in validate.cities_in_text("Bogor, Depok", cities)
    assert "Depok" in validate.cities_in_text("Bogor, Depok", cities)
    assert validate.cities_in_text("Jakarta", cities) == ["Jakarta"]
    assert validate.cities_in_text("tidak ada kota", cities) == []
