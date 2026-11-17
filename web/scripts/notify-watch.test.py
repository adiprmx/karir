"""Test watcher notifikasi Karir (NOTIF-12), memakai unittest stdlib.
Dijalankan dengan: python3 web/scripts/notify-watch.test.py

Watcher diimpor langsung dari /home/hatch/workspace/.claude-v280/
notify_watch.py — tanpa jaringan, tanpa Firestore live, tanpa token
asli: call_curl/send_telegram/marker_exists diganti tiruan di tiap
test yang menyentuh transport. main() TIDAK dites (butuh token +
jaringan). check_cron_run selalu dipanggil dengan dry_run=True,
supaya tidak ada time.sleep(180) dan tidak ada kirim Telegram.
Bila berkas watcher tidak ada (mis. di CI), seluruh test dilewati.
"""
import importlib.util
import io
import os
import sys
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timezone

WATCHER_PATH = "/home/hatch/workspace/.claude-v280/notify_watch.py"


@unittest.skipIf(
    not os.path.exists(WATCHER_PATH),
    "berkas watcher tidak ada di mesin ini",
)
class TestNotifyWatch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location(
            "notify_watch", WATCHER_PATH
        )
        cls.w = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.w)

    def setUp(self):
        self.w = self.__class__.w
        # Pulihkan tiruan antar test.
        self._asli = {
            "call_curl": self.w.call_curl,
            "send_telegram": self.w.send_telegram,
            "marker_exists": self.w.marker_exists,
            "write_marker": self.w.write_marker,
            "ensure_token": self.w.ensure_token,
            "gh_api_get": self.w.gh_api_get,
        }

    def tearDown(self):
        for k, v in self._asli.items():
            setattr(self.w, k, v)

    # --- pembantu tiruan transport ---

    def pasang_call_curl(self, peta):
        """peta: substring URL -> (http, dict) atau daftar berurutan
        jawaban bila URL yang sama dipanggil berkali-kali."""
        panggilan = []

        def tiruan(method, url, body=None):
            panggilan.append((method, url, body))
            for kunci, jawaban in peta.items():
                if kunci in url:
                    if isinstance(jawaban, list):
                        return jawaban.pop(0)
                    return jawaban
            return "404", {}

        self.w.call_curl = tiruan
        return panggilan

    def dokumen_alert(self, id_, tipe="new-target", sent=False, **lebih):
        fields = {
            "type": {"stringValue": tipe},
            "companyNo": {"integerValue": "1"},
            "perusahaan": {"stringValue": "Perusahaan Uji Satu"},
            "posisi": {"stringValue": "Helper Gudang"},
            "link": {"stringValue": "https://contoh.test/karir"},
            "batasLamar": {"stringValue": ""},
            "createdAt": {"stringValue": "2026-11-15T01:00:00Z"},
            "sent": {"booleanValue": sent},
        }
        for k, v in lebih.items():
            if isinstance(v, int):
                fields[k] = {"integerValue": str(v)}
            elif isinstance(v, bool):
                fields[k] = {"booleanValue": v}
            else:
                fields[k] = {"stringValue": v}
        return {
            "name": f"projects/karir-9d53a/databases/(default)/documents/alerts/{id_}",
            "fields": fields,
        }

    # --- doc_to_alert ---

    def test_doc_to_alert_memetakan_semua_field(self):
        a = self.w.doc_to_alert(
            self.dokumen_alert(
                "abc123", batasLamar="2026-11-20", daysLeft=5,
            )
        )
        self.assertEqual(a["id"], "abc123")
        self.assertEqual(a["type"], "new-target")
        self.assertEqual(a["companyNo"], 1)
        self.assertEqual(a["perusahaan"], "Perusahaan Uji Satu")
        self.assertEqual(a["posisi"], "Helper Gudang")
        self.assertEqual(a["batasLamar"], "2026-11-20")
        self.assertEqual(a["daysLeft"], 5)
        self.assertFalse(a["sent"])

    def test_doc_to_alert_field_hilang_jadi_kosong(self):
        a = self.w.doc_to_alert({"name": "x/alerts/z9", "fields": {}})
        self.assertEqual(a["id"], "z9")
        self.assertEqual(a["companyNo"], 0)
        self.assertEqual(a["perusahaan"], "")
        self.assertIsNone(a["daysLeft"])
        self.assertFalse(a["sent"])

    # --- days_left_on / format ---

    def test_days_left_on(self):
        self.assertEqual(self.w.days_left_on("2026-11-16", "2026-11-15"), 1)
        self.assertEqual(self.w.days_left_on("2026-11-15", "2026-11-15"), 0)
        self.assertEqual(self.w.days_left_on("2026-11-14", "2026-11-15"), -1)
        self.assertIsNone(self.w.days_left_on("bukan-tanggal", "2026-11-15"))
        self.assertIsNone(self.w.days_left_on("", "2026-11-15"))
        self.assertIsNone(self.w.days_left_on("2026-11-16", None))

    def test_format_tanggal(self):
        self.assertEqual(self.w.format_tanggal("2026-11-15"), "15 Nov 2026")
        self.assertEqual(self.w.format_tanggal("2026-01-05"), "5 Jan 2026")
        self.assertEqual(self.w.format_tanggal("rusak"), "rusak")

    def test_format_angka_gaya_indonesia(self):
        self.assertEqual(self.w.format_angka(35000), "35.000")
        self.assertEqual(self.w.format_angka(50000), "50.000")
        self.assertEqual(self.w.format_angka(0), "0")

    # --- format_message (NOTIF-09) ---

    def test_format_message_hitung_ulang_days_left_dari_tanggal_kirim(self):
        """daysLeft tersimpan beku di waktu pembuatan alert; pesan
        menghitung ulang dari batasLamar terhadap tanggal kirim."""
        alert = {
            "id": "d1", "type": "deadline", "companyNo": 1,
            "perusahaan": "Perusahaan Uji Satu", "posisi": "Helper Gudang",
            "link": "", "batasLamar": "2026-11-18",
            "daysLeft": 1,  # nilai lama, sudah tidak benar
            "createdAt": "2026-11-15T01:00:00Z", "sent": False,
        }
        teks = self.w.format_message([alert], "2026-11-15")
        self.assertIn("3 hari lagi", teks)
        self.assertIn("18 Nov 2026", teks)
        self.assertNotIn("1 hari lagi", teks)

    def test_format_message_batas_lewat_dilewati(self):
        alert = {
            "id": "d1", "type": "deadline", "companyNo": 1,
            "perusahaan": "Perusahaan Uji Satu", "posisi": "",
            "link": "", "batasLamar": "2026-11-10",
            "daysLeft": -5,
            "createdAt": "2026-11-15T01:00:00Z", "sent": False,
        }
        teks = self.w.format_message([alert], "2026-11-15")
        self.assertNotIn("Perusahaan Uji Satu", teks)

    def test_format_message_target_baru_dan_blok_kuota_di_atas(self):
        baru = {
            "id": "n1", "type": "new-target", "companyNo": 1,
            "perusahaan": "Perusahaan Uji Satu", "posisi": "Helper Gudang",
            "link": "https://contoh.test/karir",
            "batasLamar": "", "daysLeft": None,
            "createdAt": "2026-11-15T01:00:00Z", "sent": False,
        }
        kuota = {
            "id": "q1", "type": "quota", "companyNo": 0,
            "perusahaan": "", "posisi": "", "link": "",
            "batasLamar": "", "daysLeft": None,
            "createdAt": "2026-11-15T01:00:00Z", "sent": False,
            "readsEstimate": 35000, "percent": None,
        }
        teks = self.w.format_message([baru, kuota], "2026-11-15")
        self.assertIn("70%", teks)
        self.assertIn("35.000 dari 50.000 baca", teks)
        self.assertIn("lowongan target baru", teks)
        # Blok kuota di atas blok perusahaan.
        self.assertLess(teks.index("70%"), teks.index("lowongan target baru"))

    def test_format_message_posisi_panjang_dipotong_140(self):
        alert = {
            "id": "n1", "type": "new-target", "companyNo": 1,
            "perusahaan": "Perusahaan Uji Satu", "posisi": "X" * 200,
            "link": "", "batasLamar": "", "daysLeft": None,
            "createdAt": "2026-11-15T01:00:00Z", "sent": False,
        }
        teks = self.w.format_message([alert], "2026-11-15")
        self.assertIn("…", teks)
        self.assertNotIn("X" * 200, teks)

    # --- split_message (NOTIF-08) ---

    def test_split_message(self):
        self.assertEqual(self.w.split_message(""), [])
        self.assertEqual(self.w.split_message("pendek"), ["pendek"])
        panjang = "\n".join(f"baris {i} " + "x" * 100 for i in range(100))
        potongan = self.w.split_message(panjang)
        self.assertTrue(all(len(p) <= 4096 for p in potongan))
        self.assertEqual("\n".join(potongan), panjang)
        self.assertGreater(len(potongan), 1)

    # --- list_unsent ---

    def test_list_unsent_paginasi_saring_urut(self):
        halaman1 = {
            "documents": [
                self.dokumen_alert("b2", createdAt="2026-11-15T02:00:00Z"),
                self.dokumen_alert("a1", createdAt="2026-11-15T01:00:00Z"),
                self.dokumen_alert("sudah", sent=True),
                self.dokumen_alert("penanda", tipe="cron-miss"),
            ],
            "nextPageToken": "hal2",
        }
        halaman2 = {
            "documents": [
                self.dokumen_alert("c3", tipe="deadline",
                                   createdAt="2026-11-15T01:30:00Z"),
            ],
        }
        self.pasang_call_curl({
            "pageToken=hal2": ("200", halaman2),
            "/alerts?": ("200", halaman1),
        })
        hasil = self.w.list_unsent()
        self.assertEqual([a["id"] for a in hasil], ["a1", "c3", "b2"])

    def test_list_unsent_401_retry_token_sekali(self):
        self.w.ensure_token = lambda: True
        jawaban = [
            ("401", {}),
            ("200", {"documents": [self.dokumen_alert("a1")]}),
        ]
        self.w.call_curl = lambda m, u, body=None: jawaban.pop(0)
        hasil = self.w.list_unsent()
        self.assertEqual([a["id"] for a in hasil], ["a1"])

    def test_list_unsent_baca_gagal_jadi_none(self):
        self.pasang_call_curl({"/alerts?": ("500", {})})
        self.assertIsNone(self.w.list_unsent())

    # --- kesehatan cron (OPS-01) ---

    def test_get_run_doc_tiga_status(self):
        self.pasang_call_curl({
            "/cron-runs/2026-11-15": ("200", {"fields": {"openSkipped": {"integerValue": "0"}}}),
            "/cron-runs/2026-11-14": ("404", {}),
            "/cron-runs/2026-11-13": ("429", {}),
        })
        self.assertEqual(
            self.w.get_run_doc("2026-11-15"),
            ("ok", {"openSkipped": {"integerValue": "0"}}),
        )
        self.assertEqual(self.w.get_run_doc("2026-11-14"), ("missing", None))
        self.assertEqual(self.w.get_run_doc("2026-11-13"), ("error", None))

    def test_run_open_skipped(self):
        self.assertEqual(self.w.run_open_skipped({}), 0)
        self.assertEqual(
            self.w.run_open_skipped({"openSkipped": {"integerValue": "3"}}), 3
        )
        self.assertEqual(
            self.w.run_open_skipped({"openSkipped": {"integerValue": "rusak"}}), 0
        )

    def test_check_cron_run_heartbeat_hilang_dry_run_alarm(self):
        self.pasang_call_curl({"/cron-runs/2026-11-15": ("404", {})})
        self.w.marker_exists = lambda mid: False
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_cron_run("2026-11-15", "2026-11-14", dry_run=True)
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])  # dry-run tidak mengirim
        self.assertIn("Cron recheck Karir belum tercatat berjalan", out.getvalue())

    def test_check_cron_run_sehat_tanpa_alarm(self):
        self.pasang_call_curl({
            "/cron-runs/2026-11-15": (
                "200", {"fields": {"openSkipped": {"integerValue": "0"}}}
            ),
        })
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        self.assertTrue(self.w.check_cron_run("2026-11-15", "2026-11-14", dry_run=True))
        self.assertEqual(terkirim, [])

    def test_check_cron_run_terpotong_dua_hari_dry_run_alarm(self):
        self.pasang_call_curl({
            "/cron-runs/2026-11-15": (
                "200", {"fields": {"openSkipped": {"integerValue": "2"}}}
            ),
            "/cron-runs/2026-11-14": (
                "200", {"fields": {"openSkipped": {"integerValue": "1"}}}
            ),
        })
        self.w.marker_exists = lambda mid: False
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_cron_run("2026-11-15", "2026-11-14", dry_run=True)
        self.assertTrue(hasil)
        self.assertIn("2 hari berturut-turut", out.getvalue())

    def test_check_cron_run_terpotong_satu_hari_belum_alarm(self):
        self.pasang_call_curl({
            "/cron-runs/2026-11-15": (
                "200", {"fields": {"openSkipped": {"integerValue": "2"}}}
            ),
            "/cron-runs/2026-11-14": (
                "200", {"fields": {"openSkipped": {"integerValue": "0"}}}
            ),
        })
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_cron_run("2026-11-15", "2026-11-14", dry_run=True)
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])
        self.assertIn("belum alarm", out.getvalue())

    def test_check_cron_run_penanda_sudah_ada_tidak_kirim_lagi(self):
        self.pasang_call_curl({"/cron-runs/2026-11-15": ("404", {})})
        self.w.marker_exists = lambda mid: True
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        self.assertTrue(self.w.check_cron_run("2026-11-15", "2026-11-14", dry_run=True))
        self.assertEqual(terkirim, [])

    def test_check_cron_run_baca_gagal_dilewati_tanpa_alarm_palsu(self):
        self.pasang_call_curl({"/cron-runs/2026-11-15": ("429", {})})
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        self.assertTrue(self.w.check_cron_run("2026-11-15", "2026-11-14", dry_run=True))
        self.assertEqual(terkirim, [])

    # --- heartbeat cleanup mingguan (S8/C-02) ---

    def test_last_cleanup_monday_semua_hari(self):
        """Senin jam 02:00 ke atas -> hari ini; Selasa-Minggu ->
        Senin terakhir minggu berjalan."""
        senin = "2026-11-16"
        kasus = [
            # (waktu WIB, Senin yang diharapkan)
            (datetime(2026, 11, 16, 3, 0), senin),   # Senin 03:00
            (datetime(2026, 11, 17, 1, 30), senin),  # Selasa 01:30
            (datetime(2026, 11, 18, 12, 0), senin),  # Rabu
            (datetime(2026, 11, 19, 23, 59), senin), # Kamis
            (datetime(2026, 11, 20, 8, 0), senin),   # Jumat
            (datetime(2026, 11, 21, 8, 0), senin),   # Sabtu
            (datetime(2026, 11, 22, 23, 59), senin), # Minggu
            (datetime(2026, 11, 23, 3, 0), "2026-11-23"),  # Senin berikut
            (datetime(2026, 11, 30, 10, 0), "2026-11-30"), # Senin akhir bulan
        ]
        for waktu, harapan in kasus:
            with self.subTest(waktu=waktu):
                self.assertEqual(
                    self.w.last_cleanup_monday(waktu).isoformat(), harapan
                )

    def test_last_cleanup_monday_tepi_senin(self):
        """Tepi batas 02:00 WIB di hari Senin: sebelum 02:00 ->
        Senin seminggu sebelumnya; jam 02:00 ke atas -> hari ini."""
        self.assertEqual(
            self.w.last_cleanup_monday(datetime(2026, 11, 16, 1, 30)).isoformat(),
            "2026-11-09",
        )
        self.assertEqual(
            self.w.last_cleanup_monday(datetime(2026, 11, 16, 0, 5)).isoformat(),
            "2026-11-09",
        )
        self.assertEqual(
            self.w.last_cleanup_monday(datetime(2026, 11, 16, 2, 0)).isoformat(),
            "2026-11-16",
        )
        self.assertEqual(
            self.w.last_cleanup_monday(datetime(2026, 11, 16, 2, 30)).isoformat(),
            "2026-11-16",
        )

    def test_check_cleanup_run_sehat_tanpa_alarm(self):
        """Jalur sukses: heartbeat ada + status ok -> tidak ada
        pesan Telegram apa pun."""
        self.pasang_call_curl({
            "/cron-runs/cleanup-2026-11-23": (
                "200", {"fields": {
                    "status": {"stringValue": "ok"},
                    "job": {"stringValue": "cleanup"},
                }},
            ),
        })
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_cleanup_run(datetime(2026, 11, 23, 3, 0), dry_run=True)
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])
        self.assertIn("sehat", out.getvalue())

    def test_check_cleanup_run_hilang_dry_run_alarm(self):
        self.pasang_call_curl({"/cron-runs/cleanup-2026-11-23": ("404", {})})
        self.w.marker_exists = lambda mid: False
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_cleanup_run(datetime(2026, 11, 23, 3, 0), dry_run=True)
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])  # dry-run tidak mengirim
        self.assertIn("Cron cleanup Karir belum tercatat berjalan", out.getvalue())

    def test_check_cleanup_run_gagal_dry_run_alarm(self):
        self.pasang_call_curl({
            "/cron-runs/cleanup-2026-11-23": (
                "200", {"fields": {
                    "status": {"stringValue": "failed"},
                    "error": {"stringValue": "Query lama gagal: HTTP 500"},
                }},
            ),
        })
        self.w.marker_exists = lambda mid: False
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_cleanup_run(datetime(2026, 11, 23, 3, 0), dry_run=True)
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])
        self.assertIn("tercatat gagal", out.getvalue())
        self.assertIn("HTTP 500", out.getvalue())

    def test_check_cleanup_run_baca_gagal_dilewati_tanpa_alarm_palsu(self):
        self.pasang_call_curl({"/cron-runs/cleanup-2026-11-23": ("429", {})})
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_cleanup_run(datetime(2026, 11, 23, 3, 0), dry_run=True)
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])
        self.assertIn("dilewati", out.getvalue())

    def test_check_cleanup_run_sebelum_mulai_dilewati_tanpa_baca(self):
        """Senin yang diharapkan sebelum CLEANUP_HEARTBEAT_START
        (run kode lama tanpa heartbeat): dilewati, Firestore tidak
        dibaca sama sekali, tidak ada alarm."""
        panggilan = self.pasang_call_curl({})
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        out = io.StringIO()
        with redirect_stdout(out):
            # Senin 16 Nov 03:00 -> Senin 16 Nov (sebelum 23 Nov).
            hasil1 = self.w.check_cleanup_run(datetime(2026, 11, 16, 3, 0), dry_run=True)
            # Minggu 22 Nov -> Senin 16 Nov (tetap sebelum 23 Nov).
            hasil2 = self.w.check_cleanup_run(datetime(2026, 11, 22, 10, 0), dry_run=True)
        self.assertTrue(hasil1)
        self.assertTrue(hasil2)
        self.assertEqual(panggilan, [])
        self.assertEqual(terkirim, [])
        self.assertIn("belum dipantau", out.getvalue())

    def test_check_cleanup_run_penanda_sudah_ada_tidak_kirim_lagi(self):
        self.pasang_call_curl({"/cron-runs/cleanup-2026-11-23": ("404", {})})
        self.w.marker_exists = lambda mid: True
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        self.assertTrue(
            self.w.check_cleanup_run(datetime(2026, 11, 23, 3, 0), dry_run=True)
        )
        self.assertEqual(terkirim, [])

    # --- alarm kegagalan workflow (P-02, DATA P1-5; P-03: + backup.yml) ---

    def pasang_gh_api(self, peta):
        """peta: nama workflow -> daftar run (dict GitHub API)."""

        def tiruan(path):
            for wf, runs in peta.items():
                if wf in path:
                    return {"workflow_runs": runs}
            return {"workflow_runs": []}

        self.w.gh_api_get = tiruan

    def run_github(self, run_id, conclusion, created_at, title="run uji"):
        return {
            "id": run_id,
            "conclusion": conclusion,
            "created_at": created_at,
            "display_title": title,
        }

    def test_workflows_dipantau_mencakup_backup_dengan_jendela_8_hari(self):
        self.assertEqual(
            self.w.WORKFLOWS_DIPANTAU,
            ("write-back.yml", "validate.yml", "backup.yml"),
        )
        self.assertEqual(self.w.WORKFLOW_JENDELA_JAM, 24)
        self.assertEqual(
            self.w.WORKFLOW_JENDELA_JAM_KHUSUS, {"backup.yml": 8 * 24}
        )

    def test_check_workflow_runs_gagal_backup_dry_run_alarm(self):
        self.pasang_gh_api({
            "backup.yml": [
                self.run_github(111, "failure", "2026-11-18T01:00:00Z"),
            ],
        })
        self.w.marker_exists = lambda mid: False
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_workflow_runs(
                datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc),
                dry_run=True,
            )
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])  # dry-run tidak mengirim
        self.assertIn("backup.yml run 111", out.getvalue())

    def test_check_workflow_runs_backup_5_hari_lalu_masih_alarm(self):
        """backup.yml jalan mingguan: kegagalan 5 hari lalu masih
        dalam jendela 8 hari — dialarmkan (jendela 24 jam akan
        melewatkannya)."""
        self.pasang_gh_api({
            "backup.yml": [
                self.run_github(112, "failure", "2026-11-13T02:00:00Z"),
            ],
        })
        self.w.marker_exists = lambda mid: False
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_workflow_runs(
                datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc),
                dry_run=True,
            )
        self.assertTrue(hasil)
        self.assertIn("backup.yml run 112", out.getvalue())

    def test_check_workflow_runs_backup_9_hari_lalu_tidak_alarm(self):
        self.pasang_gh_api({
            "backup.yml": [
                self.run_github(113, "failure", "2026-11-09T02:00:00Z"),
            ],
        })
        self.w.marker_exists = lambda mid: False
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_workflow_runs(
                datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc),
                dry_run=True,
            )
        self.assertTrue(hasil)
        self.assertNotIn("backup.yml run 113", out.getvalue())

    def test_check_workflow_runs_write_back_2_hari_lalu_tidak_alarm(self):
        """write-back.yml tetap memakai jendela 24 jam."""
        self.pasang_gh_api({
            "write-back.yml": [
                self.run_github(114, "failure", "2026-11-16T01:00:00Z"),
            ],
        })
        self.w.marker_exists = lambda mid: False
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_workflow_runs(
                datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc),
                dry_run=True,
            )
        self.assertTrue(hasil)
        self.assertNotIn("write-back.yml run 114", out.getvalue())

    def test_check_workflow_runs_sukses_tidak_alarm(self):
        self.pasang_gh_api({
            "backup.yml": [
                self.run_github(115, "success", "2026-11-18T01:00:00Z"),
            ],
            "validate.yml": [
                self.run_github(116, "cancelled", "2026-11-18T01:00:00Z"),
            ],
        })
        self.w.marker_exists = lambda mid: False
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        self.assertTrue(self.w.check_workflow_runs(
            datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc),
            dry_run=True,
        ))
        self.assertEqual(terkirim, [])

    def test_check_workflow_runs_api_gagal_dilewati_tanpa_alarm_palsu(self):
        self.w.gh_api_get = lambda path: None
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_workflow_runs(
                datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc),
                dry_run=True,
            )
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])
        self.assertIn("dilewati", out.getvalue())

    def test_check_workflow_runs_penanda_sudah_ada_tidak_kirim_lagi(self):
        self.pasang_gh_api({
            "backup.yml": [
                self.run_github(117, "failure", "2026-11-18T01:00:00Z"),
            ],
        })
        self.w.marker_exists = lambda mid: True
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        self.assertTrue(self.w.check_workflow_runs(
            datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc),
            dry_run=True,
        ))
        self.assertEqual(terkirim, [])

    def test_check_workflow_runs_kirim_telegram_dan_tulis_penanda(self):
        self.pasang_gh_api({
            "backup.yml": [
                self.run_github(118, "failure", "2026-11-18T01:00:00Z"),
            ],
        })
        self.w.marker_exists = lambda mid: False
        terkirim = []
        penanda = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        self.w.write_marker = lambda mid, tipe: penanda.append((mid, tipe)) or True
        hasil = self.w.check_workflow_runs(
            datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc),
            dry_run=False,
        )
        self.assertTrue(hasil)
        self.assertEqual(len(terkirim), 1)
        self.assertIn("backup.yml run 118", terkirim[0])
        self.assertEqual(penanda, [("wf-fail-backup-118", "wf-fail-backup")])


if __name__ == "__main__":
    unittest.main(verbosity=2)
