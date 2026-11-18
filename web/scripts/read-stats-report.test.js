/* Tes unit untuk scripts/read-stats-report.mjs (P-06, K7/T1),
 * memakai test runner bawaan Node. Dijalankan dengan:
 * node --test scripts/read-stats-report.test.js
 * Yang dites: uraian argumen, penyelesaian rentang tanggal,
 * agregasi (termasuk hari hilang), dan jalan end-to-end run()
 * dengan fetch tiruan. Tidak ada panggilan jaringan nyata. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateReadStats,
  parseArgs,
  resolveDates,
  run,
  wibDateString,
} from "./read-stats-report.mjs";

const BASE =
  "https://mock.invalid/v1/projects/karir-9d53a/databases/(default)/documents";
const NOW = new Date("2026-11-18T20:00:00.000Z"); /* 19 Nov 03:00 WIB */

function response({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function readStatsDoc(date, sources) {
  const fields = {};
  for (const [source, count] of Object.entries(sources)) {
    fields[source] = { integerValue: String(count) };
  }
  return {
    name: `${BASE}/read-stats/${date}`,
    fields: {
      updatedAt: { stringValue: `${date}T10:00:00.000Z` },
      sources: { mapValue: { fields } },
    },
  };
}

describe("parseArgs", () => {
  it("bawaan: days null (nanti default 14)", () => {
    assert.deepEqual(parseArgs([]), {
      days: null,
      from: null,
      to: null,
      help: false,
    });
  });

  it("menerima --days dan --from/--to", () => {
    assert.equal(parseArgs(["--days", "7"]).days, 7);
    const range = parseArgs([
      "--from",
      "2026-11-01",
      "--to",
      "2026-11-05",
    ]);
    assert.equal(range.from, "2026-11-01");
    assert.equal(range.to, "2026-11-05");
  });

  it("menolak argumen tidak valid", () => {
    assert.throws(() => parseArgs(["--days", "0"]), /1–31/);
    assert.throws(() => parseArgs(["--days", "32"]), /1–31/);
    assert.throws(() => parseArgs(["--days", "2,5"]), /1–31/);
    assert.throws(
      () => parseArgs(["--days", "7", "--from", "2026-11-01", "--to", "2026-11-02"]),
      /tidak boleh dipakai bersama/,
    );
    assert.throws(
      () => parseArgs(["--from", "2026-11-01"]),
      /berpasangan/,
    );
    assert.throws(() => parseArgs(["--tidak-ada"]), /tidak dikenal/);
  });
});

describe("resolveDates", () => {
  it("--days 3 berakhir di hari ini (WIB)", () => {
    assert.deepEqual(resolveDates({ days: 3, from: null, to: null }, NOW), [
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
    ]);
  });

  it("bawaan 14 hari", () => {
    const dates = resolveDates(
      { days: null, from: null, to: null },
      NOW,
    );
    assert.equal(dates.length, 14);
    assert.equal(dates[0], "2026-11-06");
    assert.equal(dates[13], "2026-11-19");
  });

  it("--from/--to inklusif", () => {
    assert.deepEqual(
      resolveDates(
        { days: null, from: "2026-11-01", to: "2026-11-03" },
        NOW,
      ),
      ["2026-11-01", "2026-11-02", "2026-11-03"],
    );
  });

  it("menolak rentang terbalik dan terlalu panjang", () => {
    assert.throws(
      () => resolveDates({ days: null, from: "2026-11-05", to: "2026-11-01" }, NOW),
      /tidak boleh sebelum/,
    );
    assert.throws(
      () => resolveDates({ days: null, from: "2026-10-01", to: "2026-11-05" }, NOW),
      /melebihi 31 hari/,
    );
  });
});

describe("wibDateString", () => {
  it("menggeser UTC +7 jam", () => {
    assert.equal(wibDateString(NOW), "2026-11-19");
  });
});

describe("aggregateReadStats", () => {
  it("mengagregasi per sumber dan menemukan yang terbesar", () => {
    const result = aggregateReadStats(
      [
        { date: "2026-11-17", sources: { "web-refill": 100, "web-marker": 5 } },
        { date: "2026-11-18", sources: { "web-refill": 50, "cron-recheck": 7 } },
      ],
      ["2026-11-17", "2026-11-18"],
    );
    assert.deepEqual(result.totals, {
      "web-refill": 150,
      "web-marker": 5,
      "cron-recheck": 7,
    });
    assert.equal(result.grandTotal, 162);
    assert.deepEqual(result.largest, { source: "web-refill", count: 150 });
    assert.deepEqual(result.missingDays, []);
    assert.deepEqual(result.daily, {
      "2026-11-17": 105,
      "2026-11-18": 57,
    });
  });

  it("hari hilang dilaporkan, bukan dianggap nol", () => {
    const result = aggregateReadStats(
      [{ date: "2026-11-17", sources: { "web-refill": 10 } }],
      ["2026-11-17", "2026-11-18"],
    );
    assert.deepEqual(result.missingDays, ["2026-11-18"]);
    assert.equal(result.daily["2026-11-18"], null);
    assert.equal(result.grandTotal, 10);
  });

  it("tanpa dokumen sama sekali: total nol, largest null", () => {
    const result = aggregateReadStats([], ["2026-11-17"]);
    assert.equal(result.grandTotal, 0);
    assert.equal(result.largest, null);
    assert.deepEqual(result.missingDays, ["2026-11-17"]);
  });
});

describe("run", () => {
  const envWithToken = {
    FIRESTORE_BASE: BASE,
    FIRESTORE_ACCESS_TOKEN: "token-uji",
  };

  function fetchImplFor(docsByDate) {
    return async (url) => {
      const u = String(url);
      const match = u.match(/\/read-stats\/(\d{4}-\d{2}-\d{2})$/);
      if (!match) throw new Error(`URL tidak terduga: ${u}`);
      const doc = docsByDate[match[1]];
      return doc
        ? response({ body: doc })
        : response({ ok: false, status: 404, body: {} });
    };
  }

  it("mencetak laporan dan keluar 0", async () => {
    const lines = [];
    const origLog = console.log;
    console.log = (...args) => lines.push(args.join(" "));
    try {
      const code = await run(
        ["--from", "2026-11-17", "--to", "2026-11-18"],
        {
          env: envWithToken,
          fetchImpl: fetchImplFor({
            "2026-11-17": readStatsDoc("2026-11-17", {
              "web-refill": 100,
              "web-marker": 5,
            }),
            "2026-11-18": readStatsDoc("2026-11-18", {
              "web-refill": 50,
            }),
          }),
          now: NOW,
        },
      );
      assert.equal(code, 0);
    } finally {
      console.log = origLog;
    }
    const out = lines.join("\n");
    assert.match(out, /2026-11-17 s\.d\. 2026-11-18 \(2 hari\)/);
    assert.match(out, /Sumber terbesar: web-refill \(150 baca, 96\.8%/);
    assert.match(out, /2026-11-17: 105 baca/);
    assert.match(out, /batas bawah/);
  });

  it("hari hilang dicatat di laporan, tetap keluar 0", async () => {
    const lines = [];
    const origLog = console.log;
    console.log = (...args) => lines.push(args.join(" "));
    try {
      const code = await run(
        ["--from", "2026-11-17", "--to", "2026-11-18"],
        {
          env: envWithToken,
          fetchImpl: fetchImplFor({
            "2026-11-17": readStatsDoc("2026-11-17", { "web-refill": 10 }),
          }),
          now: NOW,
        },
      );
      assert.equal(code, 0);
    } finally {
      console.log = origLog;
    }
    const out = lines.join("\n");
    assert.match(out, /1 hari tanpa dokumen \(2026-11-18\)/);
    assert.match(out, /2026-11-18: tidak ada dokumen/);
  });

  it("tanpa dokumen sama sekali keluar 1", async () => {
    const code = await run(["--from", "2026-11-17", "--to", "2026-11-18"], {
      env: envWithToken,
      fetchImpl: fetchImplFor({}),
      now: NOW,
    });
    assert.equal(code, 1);
  });

  it("tanpa kredensial keluar 1", async () => {
    const code = await run(["--days", "2"], {
      env: {},
      fetchImpl: fetchImplFor({}),
      now: NOW,
    });
    assert.equal(code, 1);
  });

  it("argumen tidak valid keluar 2; --help keluar 0", async () => {
    assert.equal(
      await run(["--days", "99"], {
        env: envWithToken,
        fetchImpl: fetchImplFor({}),
        now: NOW,
      }),
      2,
    );
    assert.equal(
      await run(["--help"], {
        env: envWithToken,
        fetchImpl: fetchImplFor({}),
        now: NOW,
      }),
      0,
    );
  });
});
