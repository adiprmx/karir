/* Tes unit untuk lib/health-state.js (P-06, K8): cache modul
 * ringkasan run cron terakhir + uptime instance untuk /api/health.
 * Dijalankan dengan: node --test lib/health-state.test.js */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getLastCronRun,
  getUptimeMs,
  noteCronRun,
  resetHealthStateForTests,
} from "./health-state.js";

describe("noteCronRun / getLastCronRun", () => {
  it("mencatat ringkasan run dan mengembalikannya", () => {
    resetHealthStateForTests();
    noteCronRun({
      date: "2026-11-18",
      status: "ok",
      trigger: "github-actions",
      finishedAt: "2026-11-18T01:05:00.000Z",
    });
    assert.deepEqual(getLastCronRun(), {
      date: "2026-11-18",
      status: "ok",
      trigger: "github-actions",
      finishedAt: "2026-11-18T01:05:00.000Z",
    });
  });

  it("nilai bukan objek diabaikan", () => {
    resetHealthStateForTests();
    noteCronRun(null);
    noteCronRun(undefined);
    noteCronRun("teks");
    noteCronRun(123);
    assert.equal(getLastCronRun(), null);
  });

  it("field bukan string menjadi string kosong", () => {
    resetHealthStateForTests();
    noteCronRun({
      date: 20261118,
      status: null,
      trigger: {},
      finishedAt: [],
    });
    assert.deepEqual(getLastCronRun(), {
      date: "",
      status: "",
      trigger: "",
      finishedAt: "",
    });
  });

  it("getLastCronRun mengembalikan salinan (mutasi tidak menular)", () => {
    resetHealthStateForTests();
    noteCronRun({
      date: "2026-11-18",
      status: "ok",
      trigger: "github-actions",
      finishedAt: "2026-11-18T01:05:00.000Z",
    });
    const salinan = getLastCronRun();
    salinan.status = "diubah";
    assert.equal(getLastCronRun().status, "ok");
  });

  it("reset mengembalikan null", () => {
    noteCronRun({
      date: "2026-11-18",
      status: "ok",
      trigger: "github-actions",
      finishedAt: "2026-11-18T01:05:00.000Z",
    });
    resetHealthStateForTests();
    assert.equal(getLastCronRun(), null);
  });
});

describe("getUptimeMs", () => {
  it("nol atau positif; waktu sebelum boot dijepit ke 0", () => {
    assert.ok(getUptimeMs() >= 0);
    assert.equal(getUptimeMs(0), 0);
  });
});
