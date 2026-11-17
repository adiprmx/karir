"""Tes salinan berversi skrip impor kanonis + write-back (P-03, T11/DX-08).

Dijalankan dengan: python3 -m pytest scripts/test_p03_repo_scripts.py -q
Yang dites: salinan repo dapat diimpor; jalur bawaan dihitung relatif
dari repo (bukan dari mesin tertentu); tidak ada jalur mesin di
ketiga berkas; fungsi murni plan_sync_status (P-02) berperilaku
benar; holdlist dibaca dengan benar. Tanpa jaringan, tanpa Firestore,
tanpa token asli.
"""
import os
import sys

import pytest

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPTS_DIR)
sys.path.insert(0, SCRIPTS_DIR)

import import_canonical  # noqa: E402
import write_back  # noqa: E402


def baris(no, status="Ada lowongan", tanggal_cek="2026-11-18",
          perusahaan="Perusahaan Uji"):
    return {
        "no": str(no), "perusahaan": perusahaan, "kategori": "Teknologi",
        "link_karir": "https://contoh.test/karir", "status": status,
        "tanggal_cek": tanggal_cek, "catatan": "", "lokasi": "Jakarta",
        "posisi": "", "email_hrd": "", "wa_hrd": "", "kontak_lain": "",
        "batas_lamar": "",
    }


def live(no, status="Ada lowongan", tanggal_cek="2026-11-18"):
    return {
        "no": no, "perusahaan": "Perusahaan Uji", "kategori": "Teknologi",
        "link_karir": "https://contoh.test/karir", "status": status,
        "tanggal_cek": tanggal_cek, "catatan": "", "lokasi": "Jakarta",
        "posisi": "", "email_hrd": "", "wa_hrd": "", "kontak_lain": "",
        "batas_lamar": "",
    }


class TestJalurRepo:
    def test_csv_bawaan_adalah_csv_repo_ini(self):
        assert import_canonical.DEFAULT_CSV == os.path.join(
            REPO_ROOT, "data", "daftar-link-karir.csv")
        assert os.path.exists(import_canonical.DEFAULT_CSV)

    def test_repo_bawaan_write_back_adalah_root_repo_ini(self):
        assert write_back.DEFAULT_REPO == REPO_ROOT

    def test_token_bawaan_bukan_jalur_mesin_tertentu(self):
        # Bawaan dihitung dari ~ (expanduser), bukan ditulis harfiah
        # sebagai jalur mesin tertentu — buktinya ada di tes
        # test_tidak_ada_jalur_mesin_di_ketiga_berkas.
        assert import_canonical.TOKEN_PATH == os.path.expanduser(
            "~/.cache/karir/sa-access-token.txt")
        assert import_canonical.TOKEN_PATH.endswith(
            ".cache/karir/sa-access-token.txt")

    def test_tidak_ada_jalur_mesin_di_ketiga_berkas(self):
        for nama in ("import_canonical.py", "write_back.py",
                     "sa_token.py"):
            with open(os.path.join(SCRIPTS_DIR, nama),
                      encoding="utf-8") as fh:
                isi = fh.read()
            assert "/home/hatch" not in isi, nama
            assert "/home/" not in isi, nama

    def test_tidak_ada_nilai_rahasia_di_ketiga_berkas(self):
        for nama in ("import_canonical.py", "write_back.py",
                     "sa_token.py"):
            with open(os.path.join(SCRIPTS_DIR, nama),
                      encoding="utf-8") as fh:
                isi = fh.read()
            assert "BEGIN PRIVATE KEY" not in isi, nama
            assert "AIza" not in isi, nama
            assert "ya29." not in isi, nama


class TestPlanSyncStatus:
    def test_csv_menang_bila_tanggal_sama_atau_lebih_baru(self):
        rows = [baris(1, "Tidak ada lowongan", "2026-11-18")]
        live_data = {1: live(1, "Ada lowongan", "2026-11-17")}
        plan, _ = import_canonical.plan_sync_status(rows, live_data, {})
        assert [p[0] for p in plan] == [1]
        assert plan[0][1]["status"] == "Tidak ada lowongan"

    def test_live_lebih_baru_dilewati(self):
        rows = [baris(1, "Tidak ada lowongan", "2026-11-16")]
        live_data = {1: live(1, "Ada lowongan", "2026-11-18")}
        plan, laporan = import_canonical.plan_sync_status(
            rows, live_data, {})
        assert plan == []
        assert any("dilewati, live lebih baru" in l for l in laporan)

    def test_nomor_holdlist_tidak_pernah_diubah(self):
        rows = [baris(1, "Tidak ada lowongan", "2026-11-18")]
        live_data = {1: live(1, "Ada lowongan", "2026-11-17")}
        plan, laporan = import_canonical.plan_sync_status(
            rows, live_data, {1: "menunggu verifikasi"})
        assert plan == []
        assert any("DITAHAN" in l for l in laporan)

    def test_status_csv_di_luar_taksonomi_ditolak(self):
        rows = [baris(1, "Status Karangan", "2026-11-18")]
        live_data = {1: live(1, "Ada lowongan", "2026-11-17")}
        plan, laporan = import_canonical.plan_sync_status(
            rows, live_data, {})
        assert plan == []
        assert any("DITOLAK" in l for l in laporan)

    def test_status_sama_tidak_masuk_rencana(self):
        rows = [baris(1, "Ada lowongan", "2026-11-18")]
        live_data = {1: live(1, "Ada lowongan", "2026-11-17")}
        plan, _ = import_canonical.plan_sync_status(rows, live_data, {})
        assert plan == []


class TestHoldlist:
    def test_load_holdlist_format_pipa_dan_komentar(self, tmp_path):
        berkas = tmp_path / "holdlist-status.txt"
        berkas.write_text(
            "# komentar\n"
            "12 | menunggu verifikasi portal\n"
            "34\n"
            "baris-rusak\n",
            encoding="utf-8",
        )
        held = import_canonical.load_holdlist(str(berkas))
        assert held == {12: "menunggu verifikasi portal", 34: ""}

    def test_load_holdlist_hilang_dianggap_kosong(self, tmp_path):
        assert import_canonical.load_holdlist(
            str(tmp_path / "tidak-ada.txt")) == {}


class TestFungsiMurniLain:
    def test_to_fields_dan_from_fields_bolak_balik(self):
        row = baris(7, "Tidak dapat diverifikasi", "2026-11-10")
        doc = import_canonical.to_fields(row)
        assert doc["fields"]["no"] == {"integerValue": "7"}
        assert doc["fields"]["status"] == {
            "stringValue": "Tidak dapat diverifikasi"}
        kembali = import_canonical.from_fields(doc)
        assert kembali["no"] == 7
        assert kembali["status"] == "Tidak dapat diverifikasi"

    def test_mass_flip_threshold_sama_dengan_workflow(self):
        # Nilai 10 ditetapkan P-02 (K-08) dan dipakai workflow
        # write-back.yml; bila diubah, ubah keduanya.
        assert write_back.MASS_FLIP_THRESHOLD == 10
