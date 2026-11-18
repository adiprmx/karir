/* Test pengukur baca Firestore per sumber (P-06, K7).
 * Dijalankan dengan: node --test lib/read-meter.test.js
 * Semua fetch di-mock — tidak ada panggilan Firestore sungguhan. */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  READ_METER_FLUSH_MIN_DELTA,
  flushReadMeters,
  pendingReadsForTests,
  recordReads,
  resetReadMetersForTests,
  wibDate,
} from "./read-meter.js";

const PROJECT = "proyek-uji";
const API_KEY = "kunci-uji";

function mockResponse({ ok, status }) {
  return { ok, status, json: async () => ({}) };
}

describe("wibDate", () => {
  it("17:00 UTC menjadi tanggal WIB keesokan hari", () => {
    assert.equal(wibDate(Date.parse("2026-11-17T17:00:00Z")), "2026-11-18");
  });
  it("10:00 UTC menjadi tanggal yang sama", () => {
    assert.equal(wibDate(Date.parse("2026-11-18T10:00:00Z")), "2026-11-18");
  });
});

describe("recordReads / flushReadMeters", () => {
  let warnAsli;
  beforeEach(() => {
    resetReadMetersForTests();
    warnAsli = console.warn;
    console.warn = () => {};
  });
  afterEach(() => {
    console.warn = warnAsli;
    resetReadMetersForTests();
  });

  it("menumpuk hitungan per sumber", () => {
    recordReads("web-refill", 685, { nowMs: 1000 });
    recordReads("web-refill", 10, { nowMs: 1000 });
    recordReads("web-marker", 1, { nowMs: 1000 });
    /* Flush malas terpicu (delta >= 50) memakai fetch global —
     * di test ini env Firebase tidak dipasang, jadi flush
     * mengembalikan early tanpa fetch dan tumpukan tetap ada. */
    assert.equal(pendingReadsForTests()["web-refill"], 695);
    assert.equal(pendingReadsForTests()["web-marker"], 1);
  });

  it("sumber di luar daftar dan jumlah tidak positif diabaikan", () => {
    recordReads("sumber-asing", 100, { nowMs: 1000 });
    recordReads("web-refill", 0, { nowMs: 1000 });
    recordReads("web-refill", -5, { nowMs: 1000 });
    recordReads("web-refill", "bukan-angka", { nowMs: 1000 });
    assert.deepEqual(pendingReadsForTests(), {});
  });

  it("flush tanpa tumpukan tidak memanggil fetch", async () => {
    let n = 0;
    const fetchImpl = async () => {
      n += 1;
      return mockResponse({ ok: true, status: 200 });
    };
    const result = await flushReadMeters({
      fetchImpl,
      projectId: PROJECT,
      apiKey: API_KEY,
    });
    assert.equal(result.flushed, false);
    assert.equal(n, 0);
  });

  it("flush menulis SATU Write (update + updateTransforms) per dokumen", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url: String(url), options });
      return mockResponse({ ok: true, status: 200 });
    };
    recordReads("web-refill", 10, { nowMs: 1000 });
    recordReads("cron-recheck", 3, { nowMs: 1000 });
    const result = await flushReadMeters({
      fetchImpl,
      projectId: PROJECT,
      apiKey: API_KEY,
      nowMs: Date.parse("2026-11-18T10:00:00Z"),
    });
    assert.equal(result.flushed, true);
    assert.deepEqual(result.sources, { "web-refill": 10, "cron-recheck": 3 });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes("/documents:batchWrite?key=kunci-uji"));
    const body = JSON.parse(calls[0].options.body);
    /* Satu Write saja: update (updatedAt, bermask) + semua
     * increment sebagai updateTransforms — membuat dokumen bila
     * belum ada, tanpa melanggar batas satu transform/dokumen. */
    assert.equal(body.writes.length, 1);
    const write = body.writes[0];
    assert.equal(write.update.name.endsWith("/read-stats/2026-11-18"), true);
    assert.deepEqual(write.updateMask, { fieldPaths: ["updatedAt"] });
    assert.equal(write.update.fields.updatedAt.stringValue, "2026-11-18T10:00:00.000Z");
    assert.equal(write.currentDocument, undefined);
    const byPath = Object.fromEntries(
      write.updateTransforms.map((t) => [
        t.fieldPath,
        t.increment.integerValue,
      ]),
    );
    assert.equal(byPath["sources.web-refill"], "10");
    assert.equal(byPath["sources.cron-recheck"], "3");
    assert.deepEqual(pendingReadsForTests(), {
      "web-refill": 0,
      "cron-recheck": 0,
    });
  });

  it("flush gagal mengembalikan tumpukan untuk dicoba lagi", async () => {
    const fetchImpl = async () =>
      mockResponse({ ok: false, status: 403 });
    recordReads("web-marker", 7, { nowMs: 1000 });
    const result = await flushReadMeters({
      fetchImpl,
      projectId: PROJECT,
      apiKey: API_KEY,
    });
    assert.equal(result.flushed, false);
    assert.equal(pendingReadsForTests()["web-marker"], 7);
  });

  it("flush yang melempar (jaringan) mengembalikan tumpukan", async () => {
    const fetchImpl = async () => {
      throw new Error("jaringan mati");
    };
    recordReads("web-by-id", 2, { nowMs: 1000 });
    const result = await flushReadMeters({
      fetchImpl,
      projectId: PROJECT,
      apiKey: API_KEY,
    });
    assert.equal(result.flushed, false);
    assert.equal(pendingReadsForTests()["web-by-id"], 2);
  });

  it("delta >= 50 memicu flush malas (fetch global di-stub)", async () => {
    const asli = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), options });
      return mockResponse({ ok: true, status: 200 });
    };
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT;
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = API_KEY;
    try {
      recordReads("web-refill", READ_METER_FLUSH_MIN_DELTA, {
        nowMs: Date.now(),
      });
      /* Flush malas fire-and-forget: beri kesempatan jalan. */
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(calls.length, 1);
      assert.ok(calls[0].url.includes("documents:batchWrite"));
    } finally {
      globalThis.fetch = asli;
      delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    }
  });
});
