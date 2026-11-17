/* Tes unit untuk scripts/backup-firestore.mjs, memakai test runner
 * bawaan Node. Dijalankan dengan: node --test scripts/backup-firestore.test.js
 * Yang dites: uraian argumen (termasuk penolakan koleksi tak dikenal),
 * bentuk manifest, paginasi ekspor koleksi, penyaringan entri
 * runQuery tanpa dokumen, jalan end-to-end run() dengan fetch tiruan
 * (berkas + manifest tertulis), dry-run tanpa jaringan, dan
 * kegagalan tanpa kredensial. Tidak ada panggilan jaringan nyata. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COLLECTIONS,
  ITEMS_GROUP,
  buildManifest,
  exportCollection,
  exportItemsGroup,
  parseArgs,
  run,
} from "./backup-firestore.mjs";

const BASE = "https://mock.invalid/v1/projects/karir-9d53a/databases/(default)/documents";

function response({ ok = true, status = 200, body = {} } = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    json: async () => JSON.parse(text),
    text: async () => text,
  };
}

function doc(collection, id, fields = {}) {
  return {
    name: `projects/karir-9d53a/databases/(default)/documents/${collection}/${id}`,
    fields,
    createTime: "2026-11-15T00:00:00.000000Z",
    updateTime: "2026-11-15T00:00:00.000000Z",
  };
}

describe("parseArgs", () => {
  it("bawaan: semua koleksi, tanpa dry-run", () => {
    assert.deepEqual(parseArgs([]), {
      out: null,
      collections: null,
      dryRun: false,
      help: false,
    });
  });

  it("menerima --out dan --dry-run", () => {
    assert.deepEqual(parseArgs(["--out", "cadangan", "--dry-run"]), {
      out: "cadangan",
      collections: null,
      dryRun: true,
      help: false,
    });
  });

  it("menerima bentuk --out=DIR dan --collections=a,b", () => {
    const options = parseArgs([
      "--out=hasil",
      "--collections=companies,meta,items",
    ]);
    assert.equal(options.out, "hasil");
    assert.deepEqual(options.collections, ["companies", "meta", "items"]);
  });

  it("menerima koleksi P-03 cron-runs dan push_subscriptions", () => {
    const options = parseArgs([
      "--collections",
      "cron-runs,push_subscriptions",
    ]);
    assert.deepEqual(options.collections, ["cron-runs", "push_subscriptions"]);
  });

  it("menghilangkan duplikat koleksi", () => {
    const options = parseArgs(["--collections", "companies,companies"]);
    assert.deepEqual(options.collections, ["companies"]);
  });

  it("menolak koleksi tak dikenal", () => {
    assert.throws(() => parseArgs(["--collections", "companies,tidak-ada"]), {
      message: /Koleksi tidak dikenal: tidak-ada/,
    });
  });

  it("menolak argumen tak dikenal dan nilai yang hilang", () => {
    assert.throws(() => parseArgs(["--tidak-ada"]), {
      message: /Argumen tidak dikenal/,
    });
    assert.throws(() => parseArgs(["--out"]), {
      message: /--out butuh nilai direktori/,
    });
    assert.throws(() => parseArgs(["--collections", "--dry-run"]), {
      message: /--collections butuh nilai daftar koleksi/,
    });
  });
});

describe("buildManifest", () => {
  it("menjumlahkan total dokumen dari hitungan per koleksi", () => {
    const manifest = buildManifest({
      project: "karir-9d53a",
      createdAt: "2026-11-15T00:00:00.000Z",
      counts: {
        companies: { documents: 610, file: "companies.json" },
        meta: { documents: 2, file: "meta.json" },
      },
    });
    assert.equal(manifest.totalDocuments, 612);
    assert.equal(manifest.project, "karir-9d53a");
    assert.equal(manifest.tool, "backup-firestore.mjs");
  });
});

describe("exportCollection", () => {
  it("mengikuti pageToken sampai habis", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (!url.includes("pageToken=")) {
        return response({
          body: {
            documents: [doc("companies", "1")],
            nextPageToken: "lanjut",
          },
        });
      }
      return response({ body: { documents: [doc("companies", "2")] } });
    };
    const docs = await exportCollection({
      fetchImpl,
      base: BASE,
      token: "token-uji",
      collection: "companies",
    });
    assert.equal(docs.length, 2);
    assert.equal(calls.length, 2);
    assert.match(calls[0], /companies\?pageSize=300/);
  });

  it("koleksi kosong mengembalikan larik kosong", async () => {
    const docs = await exportCollection({
      fetchImpl: async () => response({ body: {} }),
      base: BASE,
      token: "token-uji",
      collection: "alerts",
    });
    assert.deepEqual(docs, []);
  });

  it("HTTP gagal melempar dengan status", async () => {
    await assert.rejects(
      exportCollection({
        fetchImpl: async () =>
          response({ ok: false, status: 403, body: { error: "ditolak" } }),
        base: BASE,
        token: "token-uji",
        collection: "companies",
      }),
      { message: /HTTP 403/ },
    );
  });
});

describe("exportItemsGroup", () => {
  it("melewati entri runQuery tanpa dokumen", async () => {
    const fetchImpl = async () =>
      response({
        body: [
          { document: doc("items", "a") },
          { readTime: "2026-11-15T00:00:00.000000Z" },
          { document: doc("items", "b") },
        ],
      });
    const docs = await exportItemsGroup({
      fetchImpl,
      base: BASE,
      token: "token-uji",
    });
    assert.equal(docs.length, 2);
  });
});

describe("run", () => {
  it("dry-run keluar 0 tanpa memanggil fetch", async () => {
    let called = 0;
    const fetchImpl = async () => {
      called += 1;
      return response({ body: {} });
    };
    const code = await run(["--dry-run"], {
      env: {},
      fetchImpl,
    });
    assert.equal(code, 0);
    assert.equal(called, 0);
  });

  it("tanpa kredensial keluar 1 dengan pesan jelas", async () => {
    const code = await run([], {
      env: {},
      fetchImpl: async () => response({ body: {} }),
    });
    assert.equal(code, 1);
  });

  it("end-to-end: menulis berkas koleksi + manifest", async () => {
    const out = await mkdtemp(join(tmpdir(), "karir-backup-uji-"));
    const fetchImpl = async (url, options) => {
      assert.equal(options.headers.Authorization, "Bearer token-uji");
      if (url.includes("/companies")) {
        return response({ body: { documents: [doc("companies", "1")] } });
      }
      if (url.endsWith(":runQuery")) {
        return response({ body: [{ document: doc("items", "x") }] });
      }
      return response({ body: {} });
    };
    const code = await run(
      ["--out", out, "--collections", "companies,items"],
      {
        env: {
          FIRESTORE_ACCESS_TOKEN: "token-uji",
          FIRESTORE_BASE: BASE,
        },
        fetchImpl,
      },
    );
    assert.equal(code, 0);
    const files = (await readdir(out)).sort();
    assert.deepEqual(files, [
      "companies.json",
      "manifest.json",
      "user_trackers-items.json",
    ]);
    const companies = JSON.parse(
      await readFile(join(out, "companies.json"), "utf8"),
    );
    assert.equal(companies.length, 1);
    const manifest = JSON.parse(
      await readFile(join(out, "manifest.json"), "utf8"),
    );
    assert.equal(manifest.totalDocuments, 2);
    assert.equal(manifest.collections.companies.documents, 1);
    assert.equal(manifest.collections["user_trackers/items"].documents, 1);
  });

  it("end-to-end: menulis berkas koleksi P-03 + manifest", async () => {
    const out = await mkdtemp(join(tmpdir(), "karir-backup-p03-"));
    const fetchImpl = async (url) => {
      if (url.includes("/cron-runs")) {
        return response({ body: { documents: [doc("cron-runs", "2026-11-18")] } });
      }
      if (url.includes("/push_subscriptions")) {
        return response({
          body: { documents: [doc("push_subscriptions", "a".repeat(64))] },
        });
      }
      return response({ body: {} });
    };
    const code = await run(
      ["--out", out, "--collections", "cron-runs,push_subscriptions"],
      {
        env: {
          FIRESTORE_ACCESS_TOKEN: "token-uji",
          FIRESTORE_BASE: BASE,
        },
        fetchImpl,
      },
    );
    assert.equal(code, 0);
    const files = (await readdir(out)).sort();
    assert.deepEqual(files, [
      "cron-runs.json",
      "manifest.json",
      "push_subscriptions.json",
    ]);
    const manifest = JSON.parse(
      await readFile(join(out, "manifest.json"), "utf8"),
    );
    assert.equal(manifest.totalDocuments, 2);
    assert.equal(manifest.collections["cron-runs"].documents, 1);
    assert.equal(manifest.collections.push_subscriptions.documents, 1);
  });

  it("argumen tidak valid keluar 2", async () => {
    const code = await run(["--tidak-ada"], {
      env: {},
      fetchImpl: async () => response({ body: {} }),
    });
    assert.equal(code, 2);
  });
});

describe("daftar koleksi", () => {
  it("mencakup semua koleksi tingkat atas di firestore.rules", () => {
    for (const name of [
      "companies",
      "alerts",
      "changes",
      "audit_logs",
      "reports",
      "meta",
      "rate_limits",
      "user_profiles",
      "analytics_events",
      /* P-03 (D2): dua koleksi yang sebelumnya tidak tercakup. */
      "cron-runs",
      "push_subscriptions",
    ]) {
      assert.ok(COLLECTIONS.includes(name), `${name} harus dicadangkan`);
    }
    assert.equal(COLLECTIONS.length, 11);
    assert.equal(ITEMS_GROUP, "items");
  });
});
