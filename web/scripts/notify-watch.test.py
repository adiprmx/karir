"""Test watcher notifikasi Karir (NOTIF-12), memakai unittest stdlib.
Dijalankan dengan: python3 web/scripts/notify-watch.test.py

Watcher diimpor langsung dari /home/hatch/workspace/.claude-v280/
notify_watch.py — tanpa jaringan, tanpa Firestore live, tanpa token
asli: call_curl/send_telegram/marker_exists diganti tiruan di tiap
test yang menyentuh transport. main() TIDAK dites end-to-end (butuh
token + jaringan); jalinan main() -> heartbeat dites dengan tiruan.
check_cron_run selalu dipanggil dengan dry_run=True dan now_wib
eksplisit (01:30 WIB), supaya tidak ada time.sleep masa tenggang,
tidak ada kirim Telegram, dan tidak flaky tergantung jam jalan tes.
Bila berkas watcher tidak ada (mis. di CI), seluruh test dilewati.
"""
import importlib.util
import io
import os
import sys
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timezone
from unittest import mock

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
        # Statistik run (P-06) dinolkan supaya tes tidak bocor
        # hitungan antar tes.
        self.w.reset_run_stats()

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

    # --- list_unsent (P-06: runQuery berfilter sent == false) ---

    def baris_run_query(self, dokumen):
        """Satu halaman jawaban runQuery dari daftar dokumen."""
        return [{"document": d} for d in dokumen]

    def test_list_unsent_memakai_run_query_berfilter(self):
        """P-06/C10: request pertama adalah POST :runQuery dengan
        filter sent == false, orderBy createdAt + __name__,
        limit 100 — tanpa list seluruh koleksi."""
        self.pasang_call_curl({
            ":runQuery": (
                "200",
                self.baris_run_query([self.dokumen_alert("a1")]),
            ),
        })
        panggilan = []
        asli = self.w.call_curl

        def rekam(method, url, body=None):
            panggilan.append((method, url, body))
            return asli(method, url, body)

        self.w.call_curl = rekam
        hasil = self.w.list_unsent()
        self.assertEqual([a["id"] for a in hasil], ["a1"])
        self.assertEqual(len(panggilan), 1)
        method, url, body = panggilan[0]
        self.assertEqual(method, "POST")
        self.assertTrue(url.endswith(":runQuery"))
        q = body["structuredQuery"]
        self.assertEqual(q["from"], [{"collectionId": "alerts"}])
        self.assertEqual(
            q["where"]["fieldFilter"]["field"], {"fieldPath": "sent"}
        )
        self.assertEqual(q["where"]["fieldFilter"]["op"], "EQUAL")
        self.assertEqual(
            q["where"]["fieldFilter"]["value"], {"booleanValue": False}
        )
        self.assertEqual(
            q["orderBy"],
            [
                {"field": {"fieldPath": "createdAt"},
                 "direction": "ASCENDING"},
                {"field": {"fieldPath": "__name__"},
                 "direction": "ASCENDING"},
            ],
        )
        self.assertEqual(q["limit"], 100)
        self.assertNotIn("startAt", q)

    def test_list_unsent_paginasi_kursor_saring_urut(self):
        """Halaman penuh (100 dokumen) dilanjutkan dengan kursor
        startAt (createdAt + nama dokumen terakhir); tipe di luar
        RELAY_TYPES disaring; hasil diurutkan."""
        halaman1 = [
            self.dokumen_alert(
                f"d{i:03d}", createdAt=f"2026-11-15T0{i // 60}:"
                f"{i % 60:02d}:00Z"
            )
            for i in range(100)
        ]
        halaman2 = self.baris_run_query([
            self.dokumen_alert("penanda", tipe="cron-miss",
                               createdAt="2026-11-15T03:00:00Z"),
            self.dokumen_alert("c3", tipe="deadline",
                               createdAt="2026-11-15T01:30:00Z"),
        ])
        panggilan = self.pasang_call_curl({
            ":runQuery": [
                ("200", self.baris_run_query(halaman1)),
                ("200", halaman2),
            ],
        })
        hasil = self.w.list_unsent()
        self.assertEqual(len(hasil), 101)
        self.assertEqual(hasil[0]["id"], "d000")
        self.assertNotIn("penanda", [a["id"] for a in hasil])
        self.assertEqual(len(panggilan), 2)
        start_at = panggilan[1][2]["structuredQuery"]["startAt"]["values"]
        self.assertEqual(
            start_at[0], {"stringValue": "2026-11-15T01:39:00Z"}
        )
        self.assertTrue(start_at[1]["referenceValue"].endswith("/d099"))

    def test_list_unsent_401_retry_tidak_makan_anggaran_halaman(self):
        """P-06/C11: retry 401 tidak menghabiskan anggaran halaman —
        dengan LIST_MAX_PAGES=2, sesudah satu 401 kedua halaman
        penuh tetap diambil (kode lama hanya mengambil 1)."""
        halaman = self.baris_run_query([
            self.dokumen_alert(f"d{i:03d}")
            for i in range(100)
        ])
        halaman2 = self.baris_run_query([
            self.dokumen_alert(f"e{i:03d}")
            for i in range(100)
        ])
        self.w.ensure_token = lambda: True
        jawaban = [
            ("401", {}),
            ("200", halaman),
            ("200", halaman2),
        ]
        self.w.call_curl = lambda m, u, body=None: jawaban.pop(0)
        lama = self.w.LIST_MAX_PAGES
        self.w.LIST_MAX_PAGES = 2
        try:
            hasil = self.w.list_unsent()
        finally:
            self.w.LIST_MAX_PAGES = lama
        self.assertEqual(len(hasil), 200)

    def test_list_unsent_401_retry_token_sekali(self):
        self.w.ensure_token = lambda: True
        jawaban = [
            ("401", {}),
            ("200", self.baris_run_query([self.dokumen_alert("a1")])),
        ]
        self.w.call_curl = lambda m, u, body=None: jawaban.pop(0)
        hasil = self.w.list_unsent()
        self.assertEqual([a["id"] for a in hasil], ["a1"])

    def test_list_unsent_baca_gagal_jadi_none(self):
        self.pasang_call_curl({":runQuery": ("500", {})})
        self.assertIsNone(self.w.list_unsent())

    def test_list_unsent_menghitung_baca(self):
        """P-06/K7: tiap dokumen hasil runQuery dihitung 1 baca."""
        self.w.reset_run_stats()
        self.pasang_call_curl({
            ":runQuery": (
                "200",
                self.baris_run_query([
                    self.dokumen_alert("a1"),
                    self.dokumen_alert("a2"),
                ]),
            ),
        })
        self.w.list_unsent()
        self.assertEqual(self.w.RUN_STATS["reads"], 2)

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
            hasil = self.w.check_cron_run(
                "2026-11-15", "2026-11-14", dry_run=True,
                now_wib=datetime(2026, 11, 15, 1, 30),
            )
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
        self.assertTrue(
            self.w.check_cron_run(
                "2026-11-15", "2026-11-14", dry_run=True,
                now_wib=datetime(2026, 11, 15, 1, 30),
            )
        )
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
            hasil = self.w.check_cron_run(
                "2026-11-15", "2026-11-14", dry_run=True,
                now_wib=datetime(2026, 11, 15, 1, 30),
            )
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
            hasil = self.w.check_cron_run(
                "2026-11-15", "2026-11-14", dry_run=True,
                now_wib=datetime(2026, 11, 15, 1, 30),
            )
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])
        self.assertIn("belum alarm", out.getvalue())

    def test_check_cron_run_penanda_sudah_ada_tidak_kirim_lagi(self):
        self.pasang_call_curl({"/cron-runs/2026-11-15": ("404", {})})
        self.w.marker_exists = lambda mid: True
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        self.assertTrue(
            self.w.check_cron_run(
                "2026-11-15", "2026-11-14", dry_run=True,
                now_wib=datetime(2026, 11, 15, 1, 30),
            )
        )
        self.assertEqual(terkirim, [])

    def test_check_cron_run_baca_gagal_dilewati_tanpa_alarm_palsu(self):
        self.pasang_call_curl({"/cron-runs/2026-11-15": ("429", {})})
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        self.assertTrue(
            self.w.check_cron_run(
                "2026-11-15", "2026-11-14", dry_run=True,
                now_wib=datetime(2026, 11, 15, 1, 30),
            )
        )
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

    def test_workflows_dipantau_mencakup_scheduler_dan_monitor(self):
        """P-05: keempat workflow scheduler + monitor ikut dipantau;
        cleanup mingguan berjendela 8 hari seperti backup.
        P-06: export-health-history.yml ikut dipantau."""
        self.assertEqual(
            self.w.WORKFLOWS_DIPANTAU,
            (
                "write-back.yml",
                "validate.yml",
                "backup.yml",
                "scheduled-recheck.yml",
                "scheduled-cleanup.yml",
                "scheduled-digest.yml",
                "watcher-monitor.yml",
                "export-health-history.yml",
            ),
        )
        self.assertEqual(self.w.WORKFLOW_JENDELA_JAM, 24)
        self.assertEqual(
            self.w.WORKFLOW_JENDELA_JAM_KHUSUS,
            {"backup.yml": 8 * 24, "scheduled-cleanup.yml": 8 * 24},
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

    # --- masa tenggang + heartbeat watcher (P-05, C1/C5) ---

    def test_konstanta_tenggang_p05(self):
        self.assertEqual(self.w.RECHECK_RUN_HOUR, 1)
        self.assertEqual(self.w.RECHECK_RUN_MINUTE, 0)
        self.assertEqual(self.w.RECHECK_GRACE_MINUTES, 15)
        self.assertEqual(self.w.CLEANUP_GRACE_MINUTES, 15)
        self.assertFalse(hasattr(self.w, "HEARTBEAT_RECHECK_DELAY"))

    def test_detik_menuju_akhir_tenggang(self):
        jadwal = datetime(2026, 11, 15, 1, 0)
        # Sebelum jadwal: tenggang penuh + sisa sampai jadwal.
        self.assertEqual(
            self.w.detik_menuju_akhir_tenggang(
                datetime(2026, 11, 15, 0, 50), jadwal, 15
            ),
            25 * 60,
        )
        # Dalam tenggang: sisa sampai 01:15.
        self.assertEqual(
            self.w.detik_menuju_akhir_tenggang(
                datetime(2026, 11, 15, 1, 10), jadwal, 15
            ),
            5 * 60,
        )
        # Sesudah tenggang: negatif.
        self.assertLess(
            self.w.detik_menuju_akhir_tenggang(
                datetime(2026, 11, 15, 1, 30), jadwal, 15
            ),
            0,
        )
        # Zona waktu diabaikan (nilai jam dinding yang dipakai).
        self.assertEqual(
            self.w.detik_menuju_akhir_tenggang(
                datetime(2026, 11, 15, 1, 10, tzinfo=timezone.utc),
                jadwal,
                15,
            ),
            5 * 60,
        )

    def test_check_cron_run_sebelum_jadwal_dilewati_tanpa_alarm(self):
        """Watcher 00:50, heartbeat belum ada — run belum
        dijadwalkan, bukan kegagalan."""
        self.pasang_call_curl({"/cron-runs/2026-11-15": ("404", {})})
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_cron_run(
                "2026-11-15", "2026-11-14", dry_run=True,
                now_wib=datetime(2026, 11, 15, 0, 50),
            )
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])
        self.assertIn("belum dijadwalkan", out.getvalue())
        self.assertNotIn("belum tercatat berjalan", out.getvalue())

    def test_check_cron_run_dalam_tenggang_dry_run_tanpa_alarm(self):
        """Watcher 01:10, heartbeat belum ada — masih dalam masa
        tenggang: dry-run mencetak penundaan, tanpa tidur/alarm."""
        self.pasang_call_curl({"/cron-runs/2026-11-15": ("404", {})})
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_cron_run(
                "2026-11-15", "2026-11-14", dry_run=True,
                now_wib=datetime(2026, 11, 15, 1, 10),
            )
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])
        self.assertIn("masa tenggang", out.getvalue())
        self.assertNotIn("belum tercatat berjalan", out.getvalue())

    def test_check_cron_run_dalam_tenggang_tunggu_lalu_muncul(self):
        """Non-dry-run dalam tenggang: tidur sampai akhir tenggang
        (sleep ditiruan), cek ulang, heartbeat muncul — tanpa alarm."""
        panggilan = {"n": 0}

        def tiruan(method, url, body=None):
            panggilan["n"] += 1
            if panggilan["n"] == 1:
                return "404", {}
            return "200", {"fields": {"openSkipped": {"integerValue": "0"}}}

        self.w.call_curl = tiruan
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        with mock.patch("time.sleep") as tidur:
            out = io.StringIO()
            with redirect_stdout(out):
                hasil = self.w.check_cron_run(
                    "2026-11-15", "2026-11-14", dry_run=False,
                    now_wib=datetime(2026, 11, 15, 1, 10),
                )
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])
        tidur.assert_called_once()
        self.assertAlmostEqual(tidur.call_args[0][0], 5 * 60)
        self.assertIn("muncul di cek ulang", out.getvalue())

    def test_check_cron_run_sesudah_tenggang_alarm_tanpa_tidur(self):
        """Sesudah tenggang (01:30), heartbeat hilang: alarm
        langsung, tanpa tidur apa pun."""
        self.pasang_call_curl({"/cron-runs/2026-11-15": ("404", {})})
        self.w.marker_exists = lambda mid: False
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        with mock.patch("time.sleep") as tidur:
            out = io.StringIO()
            with redirect_stdout(out):
                hasil = self.w.check_cron_run(
                    "2026-11-15", "2026-11-14", dry_run=True,
                    now_wib=datetime(2026, 11, 15, 1, 30),
                )
        self.assertTrue(hasil)
        tidur.assert_not_called()
        self.assertIn("belum tercatat berjalan", out.getvalue())
        self.assertIn("GitHub Actions", out.getvalue())

    def test_check_cleanup_run_dalam_tenggang_dry_run_tanpa_alarm(self):
        """Senin 02:10, heartbeat cleanup belum ada — masih dalam
        masa tenggang: tanpa alarm."""
        self.pasang_call_curl({"/cron-runs/cleanup-2026-11-23": ("404", {})})
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_cleanup_run(
                datetime(2026, 11, 23, 2, 10), dry_run=True
            )
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])
        self.assertIn("masa tenggang", out.getvalue())
        self.assertNotIn("belum tercatat berjalan", out.getvalue())

    def test_tulis_heartbeat_watcher_sukses(self):
        panggilan = []

        def tiruan(method, url, body=None):
            panggilan.append((method, url, body))
            return "200", {}

        self.w.call_curl = tiruan
        out = io.StringIO()
        with redirect_stdout(out):
            self.assertTrue(self.w.tulis_heartbeat_watcher(True))
        self.assertEqual(len(panggilan), 1)
        method, url, body = panggilan[0]
        self.assertEqual(method, "PATCH")
        self.assertIn("/meta/watcher", url)
        self.assertIn("lastRunAt", url)
        self.assertIn("lastRunOk", url)
        self.assertIn("lastRunAt", body["fields"])
        self.assertTrue(body["fields"]["lastRunOk"]["booleanValue"])
        self.assertIn("heartbeat watcher ditulis", out.getvalue())

    def test_tulis_heartbeat_watcher_gagal_tidak_melempar(self):
        self.w.call_curl = lambda m, u, body=None: ("500", {})
        self.assertFalse(self.w.tulis_heartbeat_watcher(False))

    def test_tulis_heartbeat_watcher_token_hilang_tidak_melempar(self):
        def tiruan(method, url, body=None):
            raise OSError("token tidak ada")

        self.w.call_curl = tiruan
        self.assertFalse(self.w.tulis_heartbeat_watcher(True))

    def test_main_menulis_heartbeat_kecuali_dry_run(self):
        """main() menulis heartbeat sesudah pemeriksaan (bukan
        dry-run), dengan lastRunOk mengikuti kode keluar.
        P-06: heartbeat membawa statistik run; bila ada baca,
        read-stats watcher juga ditulis."""
        asli_jalankan = self.w.jalankan_pemeriksaan
        asli_tulis = self.w.tulis_heartbeat_watcher
        asli_stats = self.w.tulis_read_stats_watcher
        asli_argv = sys.argv
        try:
            self.w.jalankan_pemeriksaan = lambda dry_run: 0
            ditulis = []
            self.w.tulis_heartbeat_watcher = (
                lambda ok, stats=None: ditulis.append((ok, stats))
            )
            dibaca = []
            self.w.tulis_read_stats_watcher = (
                lambda reads, tanggal: dibaca.append((reads, tanggal))
            )
            sys.argv = ["notify_watch.py"]
            self.w.RUN_STATS["reads"] = 7
            self.w.RUN_STATS["date"] = "2026-11-18"
            self.assertEqual(self.w.main(), 0)
            self.assertEqual(len(ditulis), 1)
            self.assertTrue(ditulis[0][0])
            self.assertEqual(ditulis[0][1]["reads"], 7)
            self.assertEqual(dibaca, [(7, "2026-11-18")])
            # Kode gagal -> lastRunOk False.
            self.w.jalankan_pemeriksaan = lambda dry_run: 1
            ditulis.clear()
            dibaca.clear()
            self.assertEqual(self.w.main(), 1)
            self.assertEqual(ditulis[0][0], False)
            # Dry-run -> tidak menulis apa pun.
            sys.argv = ["notify_watch.py", "--dry-run"]
            ditulis.clear()
            dibaca.clear()
            self.assertEqual(self.w.main(), 1)
            self.assertEqual(ditulis, [])
            self.assertEqual(dibaca, [])
        finally:
            self.w.jalankan_pemeriksaan = asli_jalankan
            self.w.tulis_heartbeat_watcher = asli_tulis
            self.w.tulis_read_stats_watcher = asli_stats
            sys.argv = asli_argv


    # --- sinyal recheck (P-06/K4, C4) ---

    def fields_heartbeat(self, **nilai):
        """Map field Firestore REST dari nilai polos."""
        fields = {}
        for kunci, val in nilai.items():
            if isinstance(val, bool):
                fields[kunci] = {"booleanValue": val}
            elif isinstance(val, int):
                fields[kunci] = {"integerValue": str(val)}
            else:
                fields[kunci] = {"stringValue": val}
        return fields

    def test_sinyal_recheck_sehat_kosong(self):
        fields = self.fields_heartbeat(
            status="ok", telegram="sent", push="sent", pushSent=3,
            pushFailed=0, pushTruncated=False,
            alertPhaseTruncated=False, snapshotKnown=True,
            snapshotWritten=True, quotaPercent=12, quotaAlert="none",
        )
        self.assertEqual(self.w.sinyal_recheck(fields), [])

    def test_sinyal_recheck_dilewati(self):
        sinyal = self.w.sinyal_recheck(self.fields_heartbeat(
            status="skipped", skipReason="seed-only",
            error="Sumber data seed.",
        ))
        self.assertEqual([s[0] for s in sinyal], ["cron-skipped"])
        self.assertIn("seed-only", sinyal[0][1])
        self.assertIn("Sumber data seed.", sinyal[0][1])

    def test_sinyal_recheck_telegram(self):
        gagal = self.w.sinyal_recheck(
            self.fields_heartbeat(status="ok", telegram="failed")
        )
        self.assertEqual([s[0] for s in gagal], ["telegram-failed"])
        tanpa = self.w.sinyal_recheck(self.fields_heartbeat(
            status="ok", telegram="skipped-no-token"
        ))
        self.assertEqual([s[0] for s in tanpa], ["telegram-no-token"])
        tidak_ada = self.w.sinyal_recheck(
            self.fields_heartbeat(status="ok", telegram="none")
        )
        self.assertEqual(tidak_ada, [])

    def test_sinyal_recheck_push(self):
        gagal = self.w.sinyal_recheck(self.fields_heartbeat(
            status="ok", push="failed", pushFailed=2
        ))
        self.assertEqual([s[0] for s in gagal], ["push-failed"])
        self.assertIn("2 langganan gagal", gagal[0][1])
        vapid = self.w.sinyal_recheck(self.fields_heartbeat(
            status="ok", push="skipped-no-vapid"
        ))
        self.assertEqual([s[0] for s in vapid], ["push-no-vapid"])
        potong = self.w.sinyal_recheck(self.fields_heartbeat(
            status="ok", push="sent", pushTruncated=True
        ))
        self.assertEqual([s[0] for s in potong], ["push-truncated"])
        # Ambang tinggi: 9 belum alarm, 10 alarm.
        self.assertEqual(
            [s[0] for s in self.w.sinyal_recheck(self.fields_heartbeat(
                status="ok", push="sent", pushFailed=9
            ))],
            [],
        )
        tinggi = self.w.sinyal_recheck(self.fields_heartbeat(
            status="ok", push="sent", pushFailed=10
        ))
        self.assertEqual([s[0] for s in tinggi], ["push-failed-high"])

    def test_sinyal_recheck_fase_alert_dan_snapshot(self):
        sinyal = self.w.sinyal_recheck(self.fields_heartbeat(
            status="ok", alertPhaseTruncated=True,
            snapshotKnown=True, snapshotWritten=False,
        ))
        self.assertEqual(
            [s[0] for s in sinyal],
            ["alert-phase-truncated", "snapshot-failed"],
        )
        # Snapshot tidak diketahui (baca gagal) -> tulis memang
        # dilewati, bukan kegagalan tulis -> tanpa sinyal.
        self.assertEqual(
            self.w.sinyal_recheck(self.fields_heartbeat(
                status="ok", snapshotKnown=False, snapshotWritten=False
            )),
            [],
        )

    def test_sinyal_recheck_kuota_hilang(self):
        sinyal = self.w.sinyal_recheck(self.fields_heartbeat(
            status="ok", quotaPercent=91, quotaAlert="90-failed"
        ))
        self.assertEqual([s[0] for s in sinyal], ["quota-alert-missing"])
        self.assertIn("91%", sinyal[0][1])
        # Alert 70% berhasil dibuat -> tanpa sinyal.
        self.assertEqual(
            self.w.sinyal_recheck(self.fields_heartbeat(
                status="ok", quotaPercent=72, quotaAlert="70"
            )),
            [],
        )
        # Di bawah ambang 70% -> tanpa sinyal walau "none".
        self.assertEqual(
            self.w.sinyal_recheck(self.fields_heartbeat(
                status="ok", quotaPercent=69, quotaAlert="none"
            )),
            [],
        )

    def test_check_recheck_signals_dry_run_mencetak_alarm(self):
        self.pasang_call_curl({
            "/cron-runs/2026-11-15": (
                "200", {"fields": self.fields_heartbeat(
                    status="skipped", skipReason="lock-failed",
                    error="Kunci tidak didapat.",
                )},
            ),
        })
        self.w.marker_exists = lambda mid: False
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_recheck_signals(
                "2026-11-15", dry_run=True
            )
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])
        self.assertIn("DILEWATI", out.getvalue())
        self.assertIn("lock-failed", out.getvalue())

    def test_check_recheck_signals_penanda_sudah_ada_dan_hilang(self):
        self.pasang_call_curl({
            "/cron-runs/2026-11-15": (
                "200", {"fields": self.fields_heartbeat(
                    status="ok", telegram="failed"
                )},
            ),
        })
        self.w.marker_exists = lambda mid: True
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        self.assertTrue(
            self.w.check_recheck_signals("2026-11-15", dry_run=False)
        )
        self.assertEqual(terkirim, [])
        # Heartbeat hilang -> dilewati (urusan check_cron_run).
        self.pasang_call_curl({"/cron-runs/2026-11-15": ("404", {})})
        self.assertTrue(
            self.w.check_recheck_signals("2026-11-15", dry_run=False)
        )

    def test_check_recheck_signals_kirim_gagal_kode_false(self):
        self.pasang_call_curl({
            "/cron-runs/2026-11-15": (
                "200", {"fields": self.fields_heartbeat(
                    status="ok", push="failed", pushFailed=1
                )},
            ),
        })
        self.w.marker_exists = lambda mid: False
        self.w.send_telegram = lambda teks: False
        self.assertFalse(
            self.w.check_recheck_signals("2026-11-15", dry_run=False)
        )

    # --- mode seed (P-06, K1) ---

    def pasang_insiden(self, ada):
        """Mock GET incidents: `ada` = set doc id yang ada (200)."""
        def tiruan(method, url, body=None):
            for doc_id in ada:
                if url.endswith(f"/incidents/{doc_id}"):
                    return "200", {"fields": {
                        "code": {"stringValue": doc_id.split("-")[0]},
                        "count": {"integerValue": "2"},
                    }}
            if "/incidents/" in url:
                return "404", {}
            return "404", {}
        self.w.call_curl = tiruan

    def test_check_seed_mode_dua_jam_alarm(self):
        self.pasang_insiden({
            "REFILL_FAILED_SEED_FALLBACK-2026-11-18-00",
            "REFILL_FAILED_SEED_FALLBACK-2026-11-18-01",
        })
        self.w.marker_exists = lambda mid: False
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_seed_mode(
                datetime(2026, 11, 18, 1, 30), dry_run=True
            )
        self.assertTrue(hasil)
        self.assertIn("LEBIH DARI 1 JAM", out.getvalue())
        self.assertIn("REFILL_FAILED_SEED_FALLBACK", out.getvalue())

    def test_check_seed_mode_satu_jam_belum_alarm(self):
        self.pasang_insiden({
            "MARKER_READ_FAILED-2026-11-18-01",
        })
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_seed_mode(
                datetime(2026, 11, 18, 1, 30), dry_run=False
            )
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])
        self.assertIn("insiden < 2 jam", out.getvalue())

    def test_check_seed_mode_baca_gagal_dilewati(self):
        self.w.call_curl = lambda m, u, body=None: ("429", {})
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_seed_mode(
                datetime(2026, 11, 18, 1, 30), dry_run=False
            )
        self.assertTrue(hasil)
        self.assertIn("dilewati", out.getvalue())

    # --- backlog retensi (P-06, C6) ---

    def test_check_retention_backlog_dua_senin_alarm(self):
        from datetime import date
        self.pasang_call_curl({
            "/cron-runs/cleanup-2026-11-23": (
                "200", {"fields": self.fields_heartbeat(
                    analyticsHasMore=True,
                )},
            ),
        })
        self.w.marker_exists = lambda mid: False
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_retention_backlog(
                date(2026, 11, 30),
                self.fields_heartbeat(alertsHasMore=True),
                dry_run=True,
            )
        self.assertTrue(hasil)
        self.assertIn("TERTINGGAL dua Senin", out.getvalue())

    def test_check_retention_backlog_satu_senin_belum_alarm(self):
        from datetime import date
        self.pasang_call_curl({
            "/cron-runs/cleanup-2026-11-23": (
                "200", {"fields": self.fields_heartbeat()},
            ),
        })
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_retention_backlog(
                date(2026, 11, 30),
                self.fields_heartbeat(alertsHasMore=True),
                dry_run=True,
            )
        self.assertTrue(hasil)
        self.assertIn("belum alarm", out.getvalue())

    def test_check_retention_backlog_senin_lalu_hilang_tanpa_alarm(self):
        from datetime import date
        self.pasang_call_curl({
            "/cron-runs/cleanup-2026-11-23": ("404", {}),
        })
        out = io.StringIO()
        with redirect_stdout(out):
            hasil = self.w.check_retention_backlog(
                date(2026, 11, 30),
                self.fields_heartbeat(alertsHasMore=True),
                dry_run=True,
            )
        self.assertTrue(hasil)
        self.assertIn("belum bisa dikonfirmasi", out.getvalue())

    # --- heartbeat watcher diperluas + read-stats (P-06/K7) ---

    def test_tulis_heartbeat_watcher_dengan_statistik(self):
        panggilan = []

        def tiruan(method, url, body=None):
            panggilan.append((method, url, body))
            return "200", {}

        self.w.call_curl = tiruan
        stats = {
            "reads": 42, "alerts_found": 3, "alerts_relayed": 3,
            "checks": 5, "alarms": 1, "error": "",
        }
        self.assertTrue(self.w.tulis_heartbeat_watcher(True, stats=stats))
        method, url, body = panggilan[0]
        self.assertEqual(method, "PATCH")
        for kunci in (
            "readsUsed", "alertsFound", "alertsRelayed",
            "checks", "alarmsSent", "error",
        ):
            self.assertIn(kunci, url)
            self.assertIn(kunci, body["fields"])
        self.assertEqual(
            body["fields"]["readsUsed"], {"integerValue": "42"}
        )
        self.assertEqual(
            body["fields"]["alarmsSent"], {"integerValue": "1"}
        )

    def test_tulis_read_stats_watcher_satu_write(self):
        panggilan = []

        def tiruan(method, url, body=None):
            panggilan.append((method, url, body))
            return "200", {}

        self.w.call_curl = tiruan
        self.assertTrue(
            self.w.tulis_read_stats_watcher(42, "2026-11-18")
        )
        self.assertEqual(len(panggilan), 1)
        method, url, body = panggilan[0]
        self.assertEqual(method, "POST")
        self.assertTrue(url.endswith(":batchWrite"))
        # SATU Write: update updatedAt + updateTransforms increment
        # (bentuk yang sama dengan lib/read-meter.js).
        self.assertEqual(len(body["writes"]), 1)
        tulis = body["writes"][0]
        self.assertTrue(tulis["update"]["name"].endswith(
            "/read-stats/2026-11-18"
        ))
        self.assertEqual(
            tulis["updateMask"], {"fieldPaths": ["updatedAt"]}
        )
        self.assertEqual(tulis["updateTransforms"], [{
            "fieldPath": "sources.watcher",
            "increment": {"integerValue": "42"},
        }])
        self.assertNotIn("currentDocument", tulis)

    def test_tulis_read_stats_watcher_nol_tidak_menulis(self):
        panggilan = []
        self.w.call_curl = lambda m, u, body=None: (
            panggilan.append((m, u, body)), ("200", {})
        )[1]
        self.assertTrue(self.w.tulis_read_stats_watcher(0, "2026-11-18"))
        self.assertEqual(panggilan, [])

    # --- simulasi K6: write-back gagal + CI merah (P-06) ---

    def test_k6_write_back_gagal_dan_ci_merah_kirim_telegram(self):
        """K6: satu kegagalan write-back + satu CI merah (validate)
        masing-masing memicu notifikasi Telegram dalam satu pesan
        gabungan; penanda dedup ditulis per run."""
        self.pasang_gh_api({
            "write-back.yml": [
                self.run_github(201, "failure", "2026-11-18T00:30:00Z",
                                title="Write-back data"),
            ],
            "validate.yml": [
                self.run_github(202, "failure", "2026-11-18T00:45:00Z",
                                title="Validasi CI"),
            ],
        })
        self.w.marker_exists = lambda mid: False
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        penanda = []
        self.w.write_marker = lambda mid, mt: penanda.append(mid) or True
        hasil = self.w.check_workflow_runs(
            datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc),
            dry_run=False,
        )
        self.assertTrue(hasil)
        self.assertEqual(len(terkirim), 1)
        self.assertIn("write-back.yml run 201", terkirim[0])
        self.assertIn("validate.yml run 202", terkirim[0])
        self.assertEqual(
            sorted(penanda),
            ["wf-fail-validate-202", "wf-fail-write-back-201"],
        )

    def test_k6_dedup_run_yang_sama_tidak_kirim_lagi(self):
        """K6: run gagal yang penandanya sudah ada tidak mengirim
        ulang (dedup per run id)."""
        self.pasang_gh_api({
            "write-back.yml": [
                self.run_github(201, "failure", "2026-11-18T00:30:00Z"),
            ],
        })
        self.w.marker_exists = lambda mid: True
        terkirim = []
        self.w.send_telegram = lambda teks: terkirim.append(teks) or True
        hasil = self.w.check_workflow_runs(
            datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc),
            dry_run=False,
        )
        self.assertTrue(hasil)
        self.assertEqual(terkirim, [])

    # --- jalinan jalankan_pemeriksaan (P-06) ---

    def test_jalankan_pemeriksaan_sehat_menghitung_statistik(self):
        """Semua pemeriksaan jalan (5 checks), statistik terkumpul,
        kode 0. Dijalankan dry-run supaya tidak ada kirim/tulis.
        Waktu dibekukan (FakeDatetime) supaya tanggal WIB
        deterministik: now 2026-11-24 18:30 UTC = 25 Nov 01:30 WIB
        (Senin terakhir 23 Nov — sesudah CLEANUP_HEARTBEAT_START,
        jadi heartbeat cleanup ikut dibaca)."""
        class FakeDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime(
                    2026, 11, 24, 18, 30, tzinfo=timezone.utc
                )

        asli_datetime = self.w.datetime
        self.w.datetime = FakeDatetime
        try:
            self.w.ensure_token = lambda: True
            self.pasang_call_curl({
                ":runQuery": ("200", []),
                "/cron-runs/2026-11-25": (
                    "200", {"fields": self.fields_heartbeat(
                        status="ok", openSkipped=0, telegram="sent",
                        push="sent", snapshotKnown=True,
                        snapshotWritten=True, quotaPercent=5,
                        quotaAlert="none",
                    )},
                ),
                "/cron-runs/cleanup-2026-11-23": (
                    "200", {"fields": self.fields_heartbeat(status="ok")},
                ),
                "/incidents/": ("404", {}),
            })
            self.w.gh_api_get = lambda path: {"workflow_runs": []}
            self.w.marker_exists = lambda mid: False
            out = io.StringIO()
            with redirect_stdout(out):
                kode = self.w.jalankan_pemeriksaan(dry_run=True)
            self.assertEqual(kode, 0)
            self.assertEqual(self.w.RUN_STATS["checks"], 5)
            self.assertEqual(self.w.RUN_STATS["alerts_found"], 0)
            self.assertEqual(self.w.RUN_STATS["error"], "")
            # Baca: heartbeat recheck 2x (cron + sinyal) + cleanup 1x.
            self.assertEqual(self.w.RUN_STATS["reads"], 3)
        finally:
            self.w.datetime = asli_datetime


if __name__ == "__main__":
    unittest.main(verbosity=2)
