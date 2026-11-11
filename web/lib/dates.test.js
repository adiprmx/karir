import { test } from "node:test";
import assert from "node:assert/strict";
import {
  daysSince,
  daysUntil,
  deadlineInfo,
  formatDate,
  todayJakarta,
} from "./dates.js";

/* 10 Nov 2026 pukul 08.00 WIB = 01.00 UTC. */
const NOW = new Date("2026-11-10T01:00:00Z");

test("todayJakarta memakai kalender WIB, bukan UTC", () => {
  /* 23.30 UTC tanggal 9 sudah 06.30 WIB tanggal 10. */
  assert.equal(todayJakarta(new Date("2026-11-09T23:30:00Z")), "2026-11-10");
  assert.equal(todayJakarta(new Date("2026-11-10T16:59:00Z")), "2026-11-10");
  assert.equal(todayJakarta(new Date("2026-11-10T17:00:00Z")), "2026-11-11");
});

test("formatDate memformat tanggal ISO dan menolak yang salah", () => {
  assert.match(formatDate("2026-11-05"), /5/);
  assert.match(formatDate("2026-11-05"), /2026/);
  assert.equal(formatDate(""), null);
  assert.equal(formatDate("5 November"), null);
  assert.equal(formatDate(undefined), null);
});

test("daysUntil menghitung hari kalender dan menolak tanggal tidak ada", () => {
  assert.equal(daysUntil("2026-11-10", NOW), 0);
  assert.equal(daysUntil("2026-11-11", NOW), 1);
  assert.equal(daysUntil("2026-11-18", NOW), 8);
  assert.equal(daysUntil("2026-11-09", NOW), -1);
  assert.equal(daysUntil("2026-02-31", NOW), null);
  assert.equal(daysUntil("", NOW), null);
  assert.equal(daysUntil("besok", NOW), null);
});

test("daysSince tidak pernah negatif", () => {
  assert.equal(daysSince("2026-11-07", NOW), 3);
  assert.equal(daysSince("2026-11-10", NOW), 0);
  assert.equal(daysSince("2026-12-01", NOW), 0);
  assert.equal(daysSince("", NOW), null);
});

test("deadlineInfo: hari ini, besok, 0-3 hari mendesak, lebih jauh tidak", () => {
  assert.deepEqual(
    (({ text, urgent, past }) => ({ text, urgent, past }))(deadlineInfo("2026-11-10", NOW)),
    { text: "Tutup hari ini", urgent: true, past: false },
  );
  assert.equal(deadlineInfo("2026-11-11", NOW).text, "Tutup besok");
  assert.equal(deadlineInfo("2026-11-13", NOW).text, "Tutup 3 hari lagi");
  assert.equal(deadlineInfo("2026-11-13", NOW).urgent, true);
  const far = deadlineInfo("2026-11-18", NOW);
  assert.equal(far.urgent, false);
  assert.match(far.text, /^Tutup /);
  assert.match(far.text, /2026/);
});

test("deadlineInfo: sudah lewat ditandai jujur, kosong atau salah jadi null", () => {
  const past = deadlineInfo("2026-11-09", NOW);
  assert.equal(past.past, true);
  assert.equal(past.urgent, false);
  assert.match(past.text, /lewat/);
  assert.equal(deadlineInfo("", NOW), null);
  assert.equal(deadlineInfo(undefined, NOW), null);
  assert.equal(deadlineInfo("2026-13-01", NOW), null);
});
