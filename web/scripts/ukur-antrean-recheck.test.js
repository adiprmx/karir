/* Tes skrip ukur antrean recheck (P-04, kriteria 4): parsing argumen,
 * konversi dokumen cron-runs, dan putusan target openSkipped = 0
 * pada tiga run berturut-turut. Dijalankan dengan:
 *   node --test scripts/ukur-antrean-recheck.test.js
 * Tidak ada jaringan: hanya fungsi murni yang dites. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TARGET_RUN_BERTURUT,
  parseArgs,
  tanggalWib,
  docKeBaris,
  ringkasAntrean,
} from "./ukur-antrean-recheck.mjs";

function docCronRun(overrides = {}) {
  const fields = {
    checked: { integerValue: "48" },
    changed: { integerValue: "18" },
    updated: { integerValue: "30" },
    skipped: { integerValue: "185" },
    openSkipped: { integerValue: "185" },
    unreachable: { integerValue: "12" },
    blocked: { integerValue: "4" },
    serverError: { integerValue: "1" },
    queueTotal: { integerValue: "317" },
    status: { stringValue: "truncated" },
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete fields[key];
    else if (key === "status") fields[key] = { stringValue: value };
    else fields[key] = { integerValue: String(value) };
  }
  return { fields };
}

describe("parseArgs", () => {
  it("default 7 hari", () => {
    assert.deepEqual(parseArgs([]), { days: 7 });
  });

  it("--days dibaca", () => {
    assert.deepEqual(parseArgs(["--days", "14"]), { days: 14 });
  });

  it("--days di luar 1-90 ditolak", () => {
    assert.throws(() => parseArgs(["--days", "0"]), /--days/);
    assert.throws(() => parseArgs(["--days", "91"]), /--days/);
    assert.throws(() => parseArgs(["--days", "tujuh"]), /--days/);
  });
});

describe("tanggalWib", () => {
  it("hari ini dan kemarin berformat YYYY-MM-DD dan berurutan", () => {
    const hariIni = tanggalWib(0);
    const kemarin = tanggalWib(1);
    assert.match(hariIni, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(kemarin, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(kemarin < hariIni);
  });
});

describe("docKeBaris", () => {
  it("dokumen P-04 lengkap dikonversi utuh", () => {
    assert.deepEqual(docKeBaris(docCronRun(), "2026-11-18"), {
      date: "2026-11-18",
      checked: 48,
      changed: 18,
      updated: 30,
      skipped: 185,
      openSkipped: 185,
      unreachable: 12,
      blocked: 4,
      serverError: 1,
      queueTotal: 317,
      truncated: true,
    });
  });

  it("dokumen sebelum P-04 (tanpa pencacah baru) dibaca sebagai nol", () => {
    const doc = docCronRun({
      unreachable: null,
      blocked: null,
      serverError: null,
      status: "ok",
    });
    const baris = docKeBaris(doc, "2026-11-17");
    assert.equal(baris.unreachable, 0);
    assert.equal(baris.blocked, 0);
    assert.equal(baris.serverError, 0);
    assert.equal(baris.truncated, false);
    assert.equal(baris.checked, 48);
  });

  it("dokumen kosong -> semua nol", () => {
    const baris = docKeBaris({}, "2026-11-17");
    assert.equal(baris.checked, 0);
    assert.equal(baris.openSkipped, 0);
    assert.equal(baris.truncated, false);
  });
});

describe("ringkasAntrean", () => {
  function baris(date, openSkipped, checked = 300) {
    return {
      date,
      checked,
      changed: 0,
      updated: checked,
      skipped: 0,
      openSkipped,
      unreachable: 0,
      blocked: 0,
      serverError: 0,
      queueTotal: 317,
      truncated: false,
    };
  }

  it("tiga run terakhir openSkipped 0 -> target tercapai", () => {
    const ringkasan = ringkasAntrean([
      baris("2026-11-20", 0),
      baris("2026-11-19", 0),
      baris("2026-11-18", 0),
      baris("2026-11-17", 185),
    ]);
    assert.equal(ringkasan.targetTercapai, true);
    assert.equal(ringkasan.runTercatat, 4);
    assert.equal(ringkasan.rataChecked, 300);
    assert.equal(ringkasan.hariTerakhir, "2026-11-20");
  });

  it("satu dari tiga run terakhir openSkipped > 0 -> belum tercapai", () => {
    const ringkasan = ringkasAntrean([
      baris("2026-11-20", 0),
      baris("2026-11-19", 3),
      baris("2026-11-18", 0),
    ]);
    assert.equal(ringkasan.targetTercapai, false);
  });

  it("kurang dari tiga run tercatat -> belum tercapai (belum cukup bukti)", () => {
    const ringkasan = ringkasAntrean([
      baris("2026-11-20", 0),
      baris("2026-11-19", 0),
    ]);
    assert.equal(ringkasan.targetTercapai, false);
    assert.equal(ringkasan.runTercatat, 2);
  });

  it("tanpa run tercatat -> nol di semua hitungan", () => {
    const ringkasan = ringkasAntrean([]);
    assert.equal(ringkasan.targetTercapai, false);
    assert.equal(ringkasan.runTercatat, 0);
    assert.equal(ringkasan.rataChecked, 0);
    assert.equal(ringkasan.hariTerakhir, null);
  });

  it("target memakai tiga run TERBARU, bukan tiga run mana pun", () => {
    /* Tiga run lama 0 tetapi run terbaru terpotong -> belum tercapai. */
    const ringkasan = ringkasAntrean([
      baris("2026-11-20", 12),
      baris("2026-11-19", 0),
      baris("2026-11-18", 0),
      baris("2026-11-17", 0),
    ]);
    assert.equal(ringkasan.targetTercapai, false);
  });

  it("konstanta target = 3 run", () => {
    assert.equal(TARGET_RUN_BERTURUT, 3);
  });
});
