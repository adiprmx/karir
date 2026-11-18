/* Tes unit untuk scripts/check-watcher-heartbeat.mjs (P-05, C5),
 * memakai test runner bawaan Node. Dijalankan dengan:
 * node --test scripts/check-watcher-heartbeat.test.js
 * Yang dites: uraian argumen, penilaian kesegaran heartbeat
 * (segar/basi/hilang/tidak valid), dan jalan end-to-end run()
 * dengan fetch tiruan. Tidak ada panggilan jaringan nyata. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAX_AGE_HOURS,
  assessHeartbeat,
  parseArgs,
  run,
} from "./check-watcher-heartbeat.mjs";

const BASE = "https://mock.invalid/v1/projects/karir-9d53a/databases/(default)/documents";
const NOW = new Date("2026-11-18T01:00:00.000Z");

function response({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function watcherDoc({ lastRunAt, lastRunOk = true }) {
  const fields = {};
  if (lastRunAt !== undefined) {
    fields.lastRunAt = { stringValue: lastRunAt };
  }
  if (lastRunOk !== undefined) {
    fields.lastRunOk = { booleanValue: lastRunOk };
  }
  return {
    name: `${BASE}/meta/watcher`,
    fields,
    updateTime: lastRunAt || "2026-11-18T00:00:00.000000Z",
  };
}

describe("parseArgs", () => {
  it("bawaan: batas 26 jam", () => {
    assert.deepEqual(parseArgs([]), {
      maxAgeHours: DEFAULT_MAX_AGE_HOURS,
      help: false,
    });
    assert.equal(DEFAULT_MAX_AGE_HOURS, 26);
  });

  it("menerima --max-age-hours", () => {
    assert.equal(parseArgs(["--max-age-hours", "12"]).maxAgeHours, 12);
  });

  it("menolak nilai tidak valid", () => {
    assert.throws(() => parseArgs(["--max-age-hours", "nol"]), /angka positif/);
    assert.throws(() => parseArgs(["--max-age-hours", "-3"]), /angka positif/);
    assert.throws(() => parseArgs(["--tidak-ada"]), /tidak dikenal/);
  });

  it("menerima --help", () => {
    assert.equal(parseArgs(["--help"]).help, true);
  });
});

describe("assessHeartbeat", () => {
  it("segar: run 6 jam lalu", () => {
    const result = assessHeartbeat(
      watcherDoc({ lastRunAt: "2026-11-17T19:00:00.000Z" }),
      { maxAgeHours: 26, now: NOW },
    );
    assert.equal(result.fresh, true);
    assert.equal(result.lastRunOk, true);
  });

  it("basi: run 30 jam lalu", () => {
    const result = assessHeartbeat(
      watcherDoc({ lastRunAt: "2026-11-16T19:00:00.000Z" }),
      { maxAgeHours: 26, now: NOW },
    );
    assert.equal(result.fresh, false);
    assert.match(result.reason, /basi/);
  });

  it("tepat di batas: masih segar", () => {
    const result = assessHeartbeat(
      watcherDoc({ lastRunAt: "2026-11-16T23:00:00.000Z" }),
      { maxAgeHours: 26, now: NOW },
    );
    assert.equal(result.fresh, true);
  });

  it("dokumen hilang: tidak segar", () => {
    const result = assessHeartbeat(null, { maxAgeHours: 26, now: NOW });
    assert.equal(result.fresh, false);
    assert.match(result.reason, /tidak ditemukan/);
  });

  it("tanpa lastRunAt: tidak segar", () => {
    const result = assessHeartbeat(watcherDoc({ lastRunAt: undefined }), {
      maxAgeHours: 26,
      now: NOW,
    });
    assert.equal(result.fresh, false);
    assert.match(result.reason, /lastRunAt/);
  });

  it("lastRunAt tidak valid: tidak segar", () => {
    const result = assessHeartbeat(
      watcherDoc({ lastRunAt: "bukan-tanggal" }),
      { maxAgeHours: 26, now: NOW },
    );
    assert.equal(result.fresh, false);
    assert.match(result.reason, /tidak valid/);
  });

  it("lastRunOk false tetapi segar: tetap segar (watcher berjalan)", () => {
    const result = assessHeartbeat(
      watcherDoc({
        lastRunAt: "2026-11-17T19:00:00.000Z",
        lastRunOk: false,
      }),
      { maxAgeHours: 26, now: NOW },
    );
    assert.equal(result.fresh, true);
    assert.equal(result.lastRunOk, false);
  });
});

describe("run", () => {
  const env = { FIRESTORE_ACCESS_TOKEN: "token-uji", FIRESTORE_BASE: BASE };

  it("--help keluar 0", async () => {
    assert.equal(await run(["--help"], { env, fetchImpl: async () => response() }), 0);
  });

  it("argumen tidak valid keluar 2", async () => {
    assert.equal(
      await run(["--tidak-ada"], { env, fetchImpl: async () => response() }),
      2,
    );
  });

  it("tanpa kredensial keluar 1", async () => {
    assert.equal(
      await run([], { env: {}, fetchImpl: async () => response() }),
      1,
    );
  });

  it("heartbeat segar keluar 0", async () => {
    const fetchImpl = async (url, options) => {
      assert.equal(
        options.headers.Authorization,
        `Bearer ${env.FIRESTORE_ACCESS_TOKEN}`,
      );
      assert.ok(url.endsWith("/meta/watcher"));
      return response({
        body: watcherDoc({ lastRunAt: "2026-11-17T19:00:00.000Z" }),
      });
    };
    assert.equal(await run([], { env, fetchImpl, now: NOW }), 0);
  });

  it("heartbeat basi keluar 1", async () => {
    const fetchImpl = async () =>
      response({
        body: watcherDoc({ lastRunAt: "2026-11-16T19:00:00.000Z" }),
      });
    assert.equal(await run([], { env, fetchImpl, now: NOW }), 1);
  });

  it("dokumen 404 keluar 1", async () => {
    const fetchImpl = async () => response({ ok: false, status: 404, body: {} });
    assert.equal(await run([], { env, fetchImpl, now: NOW }), 1);
  });

  it("HTTP 500 keluar 1", async () => {
    const fetchImpl = async () => response({ ok: false, status: 500, body: {} });
    assert.equal(await run([], { env, fetchImpl, now: NOW }), 1);
  });

  it("fetch melempar keluar 1", async () => {
    const fetchImpl = async () => {
      throw new Error("jaringan putus");
    };
    assert.equal(await run([], { env, fetchImpl, now: NOW }), 1);
  });

  it("--max-age-hours dihormati", async () => {
    const fetchImpl = async () =>
      response({
        body: watcherDoc({ lastRunAt: "2026-11-17T19:00:00.000Z" }),
      });
    /* Umur 6 jam: segar di batas 26 jam, basi di batas 5 jam. */
    assert.equal(await run([], { env, fetchImpl, now: NOW }), 0);
    assert.equal(
      await run(["--max-age-hours", "5"], { env, fetchImpl, now: NOW }),
      1,
    );
  });
});
