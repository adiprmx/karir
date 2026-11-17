/* Tes unit untuk scripts/archive-changes.mjs, memakai test runner
 * bawaan Node. Dijalankan dengan: node --test scripts/archive-changes.test.js
 * Yang dites: uraian argumen, dekode entri + pengelompokan bulan +
 * gabung tanpa duplikat, paginasi runQuery (offset), dan jalan
 * end-to-end run() dengan fetch tiruan (berkas arsip tertulis,
 * run kedua tidak menduplikasi). Tanpa jaringan nyata. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decodeChangeEntry,
  fetchOldChanges,
  groupByMonth,
  mergeEntries,
  parseArgs,
  run,
} from "./archive-changes.mjs";

const BASE = "https://mock.invalid/v1/projects/karir-9d53a/databases/(default)/documents";

function changeDoc(id, createdAt, companyNo = 1) {
  return {
    name: `projects/karir-9d53a/databases/(default)/documents/changes/${id}`,
    fields: {
      companyNo: { integerValue: String(companyNo) },
      perusahaan: { stringValue: "Perusahaan Uji" },
      from: { stringValue: "Ada lowongan" },
      to: { stringValue: "Tidak ada lowongan" },
      checkedAt: { stringValue: createdAt.slice(0, 10) },
      createdAt: { stringValue: createdAt },
    },
  };
}

function response(body) {
  const text = JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(text),
    text: async () => text,
  };
}

describe("parseArgs", () => {
  it("bawaan: ambang 150 hari, tanpa dry-run", () => {
    assert.deepEqual(parseArgs([]), {
      outDir: null,
      olderThanDays: 150,
      dryRun: false,
      help: false,
    });
  });

  it("menerima --out-dir, --older-than-days, --dry-run", () => {
    const options = parseArgs([
      "--out-dir",
      "arsip",
      "--older-than-days=90",
      "--dry-run",
    ]);
    assert.equal(options.outDir, "arsip");
    assert.equal(options.olderThanDays, 90);
    assert.equal(options.dryRun, true);
  });

  it("menolak ambang bukan bilangan positif dan argumen tak dikenal", () => {
    assert.throws(() => parseArgs(["--older-than-days", "0"]), {
      message: /bilangan bulat positif/,
    });
    assert.throws(() => parseArgs(["--older-than-days", "abc"]), {
      message: /bilangan bulat positif/,
    });
    assert.throws(() => parseArgs(["--tidak-ada"]), {
      message: /Argumen tidak dikenal/,
    });
    assert.throws(() => parseArgs(["--out-dir"]), {
      message: /--out-dir butuh nilai/,
    });
  });
});

describe("decodeChangeEntry / groupByMonth / mergeEntries", () => {
  it("mendekode dokumen mentah ke entri polos", () => {
    const entry = decodeChangeEntry(
      changeDoc("abc", "2026-05-10T01:00:00.000Z", 42),
    );
    assert.deepEqual(entry, {
      id: "abc",
      companyNo: 42,
      perusahaan: "Perusahaan Uji",
      from: "Ada lowongan",
      to: "Tidak ada lowongan",
      checkedAt: "2026-05-10",
      createdAt: "2026-05-10T01:00:00.000Z",
    });
  });

  it("mengembalikan null bila createdAt tidak valid", () => {
    assert.equal(decodeChangeEntry(changeDoc("x", "")), null);
    assert.equal(decodeChangeEntry({ name: "x", fields: {} }), null);
    assert.equal(decodeChangeEntry(null), null);
  });

  it("mengelompokkan entri per bulan", () => {
    const groups = groupByMonth([
      { id: "a", createdAt: "2026-05-01T00:00:00Z" },
      { id: "b", createdAt: "2026-05-20T00:00:00Z" },
      { id: "c", createdAt: "2026-06-02T00:00:00Z" },
    ]);
    assert.deepEqual([...groups.keys()].sort(), ["2026-05", "2026-06"]);
    assert.equal(groups.get("2026-05").length, 2);
  });

  it("menggabung tanpa duplikat dan mengurutkan per tanggal", () => {
    const { merged, added } = mergeEntries(
      [{ id: "a", createdAt: "2026-05-20T00:00:00Z" }],
      [
        { id: "a", createdAt: "2026-05-20T00:00:00Z" },
        { id: "b", createdAt: "2026-05-01T00:00:00Z" },
      ],
    );
    assert.equal(added, 1);
    assert.deepEqual(
      merged.map((e) => e.id),
      ["b", "a"],
    );
  });
});

describe("fetchOldChanges", () => {
  it("mengikuti offset sampai halaman tidak penuh", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body.structuredQuery.offset);
      /* Halaman pertama penuh (500), halaman kedua 1 dokumen. */
      const count = body.structuredQuery.offset === 0 ? 500 : 1;
      return response(
        Array.from({ length: count }, (_, i) => ({
          document: changeDoc(`d${body.structuredQuery.offset + i}`, "2026-05-10T01:00:00.000Z"),
        })),
      );
    };
    const docs = await fetchOldChanges({
      fetchImpl,
      base: BASE,
      token: "token-uji",
      cutoff: "2026-06-01T00:00:00.000Z",
    });
    assert.equal(docs.length, 501);
    assert.deepEqual(calls, [0, 500]);
  });

  it("melewati entri runQuery tanpa dokumen", async () => {
    const fetchImpl = async () =>
      response([
        { document: changeDoc("a", "2026-05-10T01:00:00.000Z") },
        { readTime: "2026-11-18T00:00:00.000000Z" },
      ]);
    const docs = await fetchOldChanges({
      fetchImpl,
      base: BASE,
      token: "token-uji",
      cutoff: "2026-06-01T00:00:00.000Z",
    });
    assert.equal(docs.length, 1);
  });

  it("HTTP gagal melempar dengan status", async () => {
    await assert.rejects(
      fetchOldChanges({
        fetchImpl: async () => ({
          ok: false,
          status: 429,
          text: async () => "RESOURCE_EXHAUSTED",
        }),
        base: BASE,
        token: "token-uji",
        cutoff: "2026-06-01T00:00:00.000Z",
      }),
      { message: /HTTP 429/ },
    );
  });
});

describe("run", () => {
  const ENV = { FIRESTORE_ACCESS_TOKEN: "token-uji", FIRESTORE_BASE: BASE };
  const NOW = new Date("2026-11-18T00:00:00.000Z");

  function fetchChanges(docs) {
    return async () =>
      response(docs.map((document) => ({ document })));
  }

  it("dry-run keluar 0 tanpa memanggil fetch", async () => {
    let called = 0;
    const code = await run(["--dry-run"], {
      env: {},
      fetchImpl: async () => { called += 1; throw new Error("tidak boleh dipanggil"); },
      now: NOW,
    });
    assert.equal(code, 0);
    assert.equal(called, 0);
  });

  it("tanpa kredensial keluar 1", async () => {
    const code = await run([], {
      env: {},
      fetchImpl: async () => ({ ok: false, status: 500, text: async () => "" }),
      now: NOW,
    });
    assert.equal(code, 1);
  });

  it("end-to-end: menulis arsip per bulan + run kedua tidak menduplikasi", async () => {
    const out = await mkdtemp(join(tmpdir(), "karir-arsip-uji-"));
    const docs = [
      changeDoc("m1", "2026-05-10T01:00:00.000Z", 1),
      changeDoc("m2", "2026-05-20T01:00:00.000Z", 2),
      changeDoc("j1", "2026-06-02T01:00:00.000Z", 3),
      changeDoc("rusak", "", 4),
    ];
    const args = ["--out-dir", out];
    const opts = { env: ENV, fetchImpl: fetchChanges(docs), now: NOW };
    assert.equal(await run(args, opts), 0);
    const files = (await readdir(out)).sort();
    assert.deepEqual(files, [
      "changes-archive-2026-05.json",
      "changes-archive-2026-06.json",
    ]);
    const mei = JSON.parse(
      await readFile(join(out, "changes-archive-2026-05.json"), "utf8"),
    );
    assert.equal(mei.month, "2026-05");
    assert.equal(mei.documents, 2);
    assert.equal(mei.range.from, "2026-05-10T01:00:00.000Z");
    assert.equal(mei.range.to, "2026-05-20T01:00:00.000Z");
    assert.deepEqual(
      mei.entries.map((e) => e.id),
      ["m1", "m2"],
    );
    /* Run kedua dengan dokumen yang sama: tidak ada duplikat. */
    assert.equal(await run(args, opts), 0);
    const mei2 = JSON.parse(
      await readFile(join(out, "changes-archive-2026-05.json"), "utf8"),
    );
    assert.equal(mei2.documents, 2);
  });

  it("tidak ada dokumen lama: keluar 0 tanpa menulis berkas", async () => {
    const out = await mkdtemp(join(tmpdir(), "karir-arsip-kosong-"));
    const code = await run(["--out-dir", out], {
      env: ENV,
      fetchImpl: fetchChanges([]),
      now: NOW,
    });
    assert.equal(code, 0);
    assert.deepEqual(await readdir(out), []);
  });

  it("argumen tidak valid keluar 2", async () => {
    const code = await run(["--tidak-ada"], {
      env: ENV,
      fetchImpl: fetchChanges([]),
      now: NOW,
    });
    assert.equal(code, 2);
  });
});
