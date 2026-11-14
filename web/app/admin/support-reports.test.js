/* Test helper murni support-reports.js (ADM-14, DUKUNG-01/02).
 * Dijalankan langsung: node --test app/admin/support-reports.test.js
 * dari web/. Tambahkan ke skrip test web/package.json saat merge
 * (koordinator yang menggabungkan package.json). */
import test from "node:test";
import assert from "node:assert/strict";
import {
  getReportStatus,
  filterReports,
  countNewReports,
  countReportsSince,
  formatReportTime,
} from "./support-reports.js";

const baru = { id: "1", no: 1, perusahaan: "A", dibuat: "2026-11-15T00:00:00.000Z" };
const ditangani = {
  id: "2",
  no: 2,
  perusahaan: "B",
  dibuat: "2026-11-14T00:00:00.000Z",
  status: "ditangani",
};
const aneh = {
  id: "3",
  no: 3,
  perusahaan: "C",
  dibuat: "2026-11-13T00:00:00.000Z",
  status: "tidak-dikenal",
};
const list = [baru, ditangani, aneh];

test("getReportStatus: tanpa status berarti baru", () => {
  assert.equal(getReportStatus(baru), "baru");
  assert.equal(getReportStatus(ditangani), "ditangani");
  assert.equal(getReportStatus(aneh), "baru");
  assert.equal(getReportStatus(null), "baru");
  assert.equal(getReportStatus({}), "baru");
});

test("filterReports: filter baru, ditangani, semua", () => {
  assert.deepEqual(
    filterReports(list, "baru").map((r) => r.id),
    ["1", "3"],
  );
  assert.deepEqual(
    filterReports(list, "ditangani").map((r) => r.id),
    ["2"],
  );
  assert.deepEqual(
    filterReports(list, "semua").map((r) => r.id),
    ["1", "2", "3"],
  );
  assert.deepEqual(
    filterReports(list, "tidak-ada").map((r) => r.id),
    ["1", "2", "3"],
  );
});

test("filterReports: tidak mengubah array asal", () => {
  const before = [...list];
  filterReports(list, "baru");
  assert.deepEqual(list, before);
});

test("countNewReports: menghitung yang belum ditangani", () => {
  assert.equal(countNewReports(list), 2);
  assert.equal(countNewReports([]), 0);
  assert.equal(countNewReports([ditangani]), 0);
});

test("countReportsSince: hanya yang dibuat setelah cap waktu", () => {
  assert.equal(countReportsSince(list, "2026-11-14T12:00:00.000Z"), 1);
  assert.equal(countReportsSince(list, "2026-11-12T00:00:00.000Z"), 3);
  assert.equal(countReportsSince(list, "2026-11-16T00:00:00.000Z"), 0);
});

test("countReportsSince: cap waktu tidak valid berarti 0", () => {
  assert.equal(countReportsSince(list, "bukan-tanggal"), 0);
  assert.equal(countReportsSince(list, ""), 0);
  assert.equal(countReportsSince(list, null), 0);
});

test("countReportsSince: laporan bertanggal tidak valid diabaikan", () => {
  const campur = [
    ...list,
    { id: "4", dibuat: "rusak" },
    { id: "5" },
  ];
  assert.equal(countReportsSince(campur, "2026-11-12T00:00:00.000Z"), 3);
});

test("formatReportTime: WIB, format Indonesia", () => {
  assert.equal(
    formatReportTime("2026-11-15T00:26:00.000Z"),
    "15 Nov 2026, 07.26",
  );
});

test("formatReportTime: masukan tidak valid dikembalikan apa adanya", () => {
  assert.equal(formatReportTime("rusak"), "rusak");
  assert.equal(formatReportTime(""), "");
  assert.equal(formatReportTime(null), "");
  assert.equal(formatReportTime(undefined), "");
});
