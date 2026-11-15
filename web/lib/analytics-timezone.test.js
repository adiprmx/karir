/* Tes offset zona waktu todayJakarta (QA-11): asersi jam batas.
 * Dijalankan dengan: node --test lib/analytics-timezone.test.js
 * (koordinator menambahkan file ini ke skrip "test" di package.json).
 *
 * Jakarta adalah UTC+7: batas harinya jatuh pada 17:00 UTC.
 * Test format saja (yang sudah ada di lib/analytics.test.js) tidak
 * akan menangkap fungsi yang lupa menerapkan offset — jam 17:00Z
 * dan 18:00Z di bawah ini mengunci offset +7 secara eksplisit. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { todayJakarta } from "./analytics-server.js";

describe("todayJakarta: offset +7 dikunci (QA-11)", () => {
  it("17:00Z adalah 00:00 WIB hari berikutnya", () => {
    assert.equal(todayJakarta(new Date("2026-11-07T17:00:00Z")), "2026-11-08");
    assert.equal(todayJakarta(new Date("2026-11-07T17:00:01Z")), "2026-11-08");
  });

  it("satu detik sebelum 17:00Z masih hari yang sama (23:59:59 WIB)", () => {
    assert.equal(todayJakarta(new Date("2026-11-07T16:59:59Z")), "2026-11-07");
  });

  it("18:00Z adalah 01:00 WIB hari berikutnya", () => {
    assert.equal(todayJakarta(new Date("2026-11-07T18:00:00Z")), "2026-11-08");
  });

  it("siang UTC masih hari yang sama di WIB", () => {
    assert.equal(todayJakarta(new Date("2026-11-07T10:00:00Z")), "2026-11-07");
    assert.equal(todayJakarta(new Date("2026-11-07T00:00:00Z")), "2026-11-07");
  });

  it("batas tahun: 31 Des 17:00Z menjadi 1 Jan tahun berikutnya", () => {
    assert.equal(todayJakarta(new Date("2026-12-31T17:00:00Z")), "2027-01-01");
    assert.equal(todayJakarta(new Date("2026-12-31T16:59:59Z")), "2026-12-31");
  });

  it("format tetap YYYY-MM-DD di semua jam batas", () => {
    for (const iso of [
      "2026-11-07T16:59:59Z",
      "2026-11-07T17:00:00Z",
      "2026-11-07T18:00:00Z",
    ]) {
      assert.match(todayJakarta(new Date(iso)), /^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
