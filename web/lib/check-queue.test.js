/* Tes unit untuk buildCheckQueue (lib/check.js, BE-05), memakai test
 * runner bawaan Node.
 * Dijalankan dengan: node --test lib/check-queue.test.js
 * Data mock menyerupai seed: status taksonomi 4 nilai, tanggal_cek
 * ISO, batas_lamar ISO. Tidak ada panggilan jaringan di sini —
 * antrean diuji murni dari data. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCheckQueue,
  CHECK_QUEUE_DEADLINE_DAYS,
} from "./check.js";

function company(overrides = {}) {
  return {
    no: 1,
    perusahaan: "PT Contoh",
    link_karir: "https://contoh.test/karir",
    status: "Ada lowongan",
    tanggal_cek: "2026-11-10",
    batas_lamar: "",
    ...overrides,
  };
}

describe("buildCheckQueue (BE-05)", () => {
  it("tier mendesak dulu: batas lamar 0-7 hari, batas terdekat pertama", () => {
    const { queue, counts } = buildCheckQueue(
      [
        company({ no: 1, batas_lamar: "2026-11-23" }),
        company({ no: 2, batas_lamar: "2026-11-16" }),
        company({ no: 3, batas_lamar: "2026-11-15" }),
        company({ no: 4 }),
      ],
      { todayIso: "2026-11-15" },
    );
    assert.equal(CHECK_QUEUE_DEADLINE_DAYS, 7);
    assert.deepEqual(
      queue.map((q) => q.company.no),
      [3, 2, 1, 4],
    );
    assert.deepEqual(
      queue.map((q) => q.tier),
      ["urgent", "urgent", "open", "open"],
    );
    assert.deepEqual(counts, { urgent: 2, open: 2, dead: 0, total: 4 });
  });

  it("batas sudah lewat atau di luar 7 hari bukan mendesak", () => {
    const { queue } = buildCheckQueue(
      [
        company({ no: 1, batas_lamar: "2026-11-14" }),
        company({ no: 2, batas_lamar: "2026-11-23" }),
        company({ no: 3, batas_lamar: "2026-11-22" }),
        company({ no: 4, batas_lamar: "bukan tanggal" }),
      ],
      { todayIso: "2026-11-15" },
    );
    assert.deepEqual(
      queue.map((q) => q.tier),
      ["urgent", "open", "open", "open"],
    );
    assert.equal(queue[0].company.no, 3);
  });

  it("batas lamar format catatan Indonesia ikut dikenali", () => {
    const { queue } = buildCheckQueue(
      [company({ no: 1, batas_lamar: "18 Nov 2026" }), company({ no: 2 })],
      { todayIso: "2026-11-15" },
    );
    assert.equal(queue[0].tier, "urgent");
    assert.equal(queue[0].company.no, 1);
  });

  it("tier terbuka diurutkan tanggal cek tertua dulu (rotasi)", () => {
    const { queue } = buildCheckQueue(
      [
        company({ no: 1, tanggal_cek: "2026-11-14" }),
        company({ no: 2, tanggal_cek: "2026-11-08" }),
        company({ no: 3, tanggal_cek: "" }),
        company({ no: 4, tanggal_cek: "2026-11-08" }),
      ],
      { todayIso: "2026-11-15" },
    );
    /* Tanpa tanggal cek paling dulu, lalu tertua; seri diputus
     * nomor naik supaya deterministik. */
    assert.deepEqual(
      queue.map((q) => q.company.no),
      [3, 2, 4, 1],
    );
  });

  it("portal mati sesudah yang terbuka, bergilir tanggal cek tertua", () => {
    const { queue, counts } = buildCheckQueue(
      [
        company({
          no: 1,
          status: "Portal tidak bisa dibuka",
          tanggal_cek: "2026-11-01",
        }),
        company({ no: 2, tanggal_cek: "2026-11-14" }),
        company({
          no: 3,
          status: "Portal tidak bisa dibuka",
          tanggal_cek: "2026-11-13",
        }),
      ],
      { todayIso: "2026-11-15" },
    );
    assert.deepEqual(
      queue.map((q) => q.company.no),
      [2, 1, 3],
    );
    assert.deepEqual(
      queue.map((q) => q.tier),
      ["open", "dead", "dead"],
    );
    assert.deepEqual(counts, { urgent: 0, open: 1, dead: 2, total: 3 });
  });

  it("tanpa tautan dan status lain tidak masuk antrean", () => {
    const { queue, counts } = buildCheckQueue(
      [
        company({ no: 1, link_karir: "" }),
        company({ no: 2, link_karir: null }),
        company({ no: 3, status: "Tidak ada lowongan" }),
        company({ no: 4, status: "Tidak dapat diverifikasi" }),
        company({ no: 5 }),
      ],
      { todayIso: "2026-11-15" },
    );
    assert.deepEqual(
      queue.map((q) => q.company.no),
      [5],
    );
    assert.deepEqual(counts, { urgent: 0, open: 1, dead: 0, total: 1 });
  });

  it("skala seed: 293 antrean terurut tier demi tier", () => {
    const mock = [];
    for (let no = 1; no <= 238; no++) {
      mock.push(
        company({
          no,
          tanggal_cek: `2026-11-${String((no % 14) + 1).padStart(2, "0")}`,
          batas_lamar: no <= 3 ? "2026-11-16" : "",
        }),
      );
    }
    for (let no = 239; no <= 293; no++) {
      mock.push(
        company({
          no,
          status: "Portal tidak bisa dibuka",
          tanggal_cek: "2026-11-05",
        }),
      );
    }
    const { queue, counts } = buildCheckQueue(mock, {
      todayIso: "2026-11-15",
    });
    assert.deepEqual(counts, {
      urgent: 3,
      open: 235,
      dead: 55,
      total: 293,
    });
    assert.deepEqual(
      queue.slice(0, 3).map((q) => q.company.no),
      [1, 2, 3],
    );
    assert.ok(queue.slice(0, 238).every((q) => q.tier !== "dead"));
    assert.ok(queue.slice(238).every((q) => q.tier === "dead"));
    /* Dalam tier terbuka, tanggal cek tidak pernah menurun. */
    const openDates = queue
      .filter((q) => q.tier === "open")
      .map((q) => q.company.tanggal_cek);
    const sorted = [...openDates].sort();
    assert.deepEqual(openDates, sorted);
  });
});
