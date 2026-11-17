/* Tes unit untuk scripts/restore-firestore.mjs, memakai test runner
 * bawaan Node. Dijalankan dengan: node --test scripts/restore-firestore.test.js
 * Yang dites: uraian argumen (termasuk pengaman --cleanup dan pola
 * awalan), pemetaan nama dokumen ke koleksi uji, pemeriksaan bentuk
 * push_subscriptions, dan jalan end-to-end restore + verifikasi +
 * cleanup dengan Firestore tiruan di memori (tanpa jaringan nyata,
 * tanpa menulis ke koleksi produksi — mock menegaskan tidak ada
 * tulis ke jalur tanpa awalan restore_drill_). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PREFIX_PATTERN,
  checkPushSubscriptionDoc,
  chunkArray,
  defaultPrefix,
  docIdFromName,
  parseArgs,
  run,
  testCollectionName,
  testDocumentName,
  trackerUidFromName,
  validateBackupFileName,
  validateCollectionName,
} from "./restore-firestore.mjs";

const BASE = "https://mock.invalid/v1/projects/karir-9d53a/databases/(default)/documents";
const PREFIX = "restore_drill_20261118";

function doc(collection, id, fields = {}) {
  return {
    name: `projects/karir-9d53a/databases/(default)/documents/${collection}/${id}`,
    fields,
    createTime: "2026-11-15T00:00:00.000000Z",
    updateTime: "2026-11-15T00:00:00.000000Z",
  };
}

function pushDoc(id, endpoint = "https://push.contoh.test/abc") {
  return doc("push_subscriptions", id, {
    endpoint: { stringValue: endpoint },
    p256dh: { stringValue: "kunci-p256dh-uji" },
    auth: { stringValue: "kunci-auth-uji" },
  });
}

/* Firestore tiruan di memori: menyimpan dokumen per nama lengkap.
 * batchWrite update/delete + list GET didukung; penulisan ke jalur
 * TANPA awalan restore_drill_ ditolak keras (meniru pengaman). */
function mockFirestore() {
  const store = new Map();
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push(url);
    const u = String(url);
    const ok = (body, status = 200) => ({
      ok: status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    if (u.endsWith(":batchWrite")) {
      const body = JSON.parse(options.body || "{}");
      for (const w of body.writes || []) {
        const name = w.update?.name || w.delete;
        if (!name || !name.includes(`${PREFIX}_`)) {
          return ok({ error: "tulis ke jalur non-uji ditolak" }, 403);
        }
        if (w.update) {
          /* Stempel hanya-baca tidak boleh ikut terkirim. */
          assert.equal(w.update.createTime, undefined);
          assert.equal(w.update.updateTime, undefined);
          store.set(w.update.name, w.update);
        } else if (w.delete) {
          store.delete(w.delete);
        }
      }
      return ok({});
    }
    /* List GET: jalur koleksi setelah /documents/. */
    const marker = "/documents/";
    const idx = u.indexOf(marker);
    const path = u.slice(idx + marker.length).split("?")[0];
    const prefix = `projects/karir-9d53a/databases/(default)/documents/${path}/`;
    const documents = [...store.values()].filter(
      (d) => d.name.startsWith(prefix) && !d.name.slice(prefix.length).includes("/"),
    );
    return ok({ documents });
  };
  return { fetchImpl, store, calls };
}

async function fixtureBackup() {
  const dir = await mkdtemp(join(tmpdir(), "karir-restore-uji-"));
  const manifest = {
    project: "karir-9d53a",
    createdAt: "2026-11-18T00:00:00.000Z",
    tool: "backup-firestore.mjs",
    collections: {
      companies: { documents: 2, file: "companies.json" },
      "cron-runs": { documents: 1, file: "cron-runs.json" },
      push_subscriptions: { documents: 1, file: "push_subscriptions.json" },
      "user_trackers/items": { documents: 2, file: "user_trackers-items.json" },
    },
    totalDocuments: 6,
  };
  await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(
    join(dir, "companies.json"),
    JSON.stringify([
      doc("companies", "1", { perusahaan: { stringValue: "Perusahaan Satu" } }),
      doc("companies", "2", { perusahaan: { stringValue: "Perusahaan Dua" } }),
    ]),
  );
  await writeFile(
    join(dir, "cron-runs.json"),
    JSON.stringify([doc("cron-runs", "2026-11-18", { job: { stringValue: "recheck" } })]),
  );
  await writeFile(join(dir, "push_subscriptions.json"), JSON.stringify([pushDoc("a".repeat(64))]));
  await writeFile(
    join(dir, "user_trackers-items.json"),
    JSON.stringify([
      doc("user_trackers/uid-1/items", "item-1", { no: { integerValue: "1" } }),
      doc("user_trackers/uid-1/items", "item-2", { no: { integerValue: "2" } }),
    ]),
  );
  return dir;
}

const ENV = { FIRESTORE_ACCESS_TOKEN: "token-uji", FIRESTORE_BASE: BASE };

describe("parseArgs", () => {
  it("bawaan: tanpa mode khusus", () => {
    assert.deepEqual(parseArgs(["--backup", "cadangan"]), {
      backup: "cadangan",
      collections: null,
      prefix: null,
      verify: false,
      cleanup: false,
      yes: false,
      dryRun: false,
      help: false,
    });
  });

  it("menerima --verify, --cleanup --yes, dan --collection", () => {
    const options = parseArgs([
      "--backup=cadangan",
      "--collection=companies,meta",
      "--prefix",
      "restore_drill_20261118",
      "--verify",
    ]);
    assert.equal(options.backup, "cadangan");
    assert.deepEqual(options.collections, ["companies", "meta"]);
    assert.equal(options.verify, true);
  });

  it("menolak --verify bersama --cleanup", () => {
    assert.throws(() => parseArgs(["--verify", "--cleanup", "--yes"]), {
      message: /tidak dapat dipakai bersamaan/,
    });
  });

  it("menolak --cleanup tanpa --yes", () => {
    assert.throws(() => parseArgs(["--cleanup"]), {
      message: /--cleanup butuh --yes/,
    });
  });

  it("menolak awalan di luar pola restore_drill_", () => {
    assert.throws(
      () => parseArgs(["--prefix", "companies"]),
      { message: /Awalan tidak valid/ },
    );
    assert.throws(
      () => parseArgs(["--prefix", "restore_drill_2026-11-18"]),
      { message: /Awalan tidak valid/ },
    );
    assert.ok(PREFIX_PATTERN.test("restore_drill_20261118"));
    assert.ok(PREFIX_PATTERN.test("restore_drill_20261118_2"));
    assert.ok(!PREFIX_PATTERN.test("restore_drill_20261118_ABC"));
  });

  it("menolak argumen tak dikenal dan nilai yang hilang", () => {
    assert.throws(() => parseArgs(["--tidak-ada"]), {
      message: /Argumen tidak dikenal/,
    });
    assert.throws(() => parseArgs(["--backup"]), {
      message: /--backup butuh nilai/,
    });
  });
});

describe("pemetaan nama dokumen uji", () => {
  it("koleksi tingkat atas memakai awalan", () => {
    assert.equal(testCollectionName("companies", PREFIX), `${PREFIX}_companies`);
    assert.equal(
      testDocumentName(
        "projects/karir-9d53a/databases/(default)/documents/companies/7",
        PREFIX,
      ),
      `projects/karir-9d53a/databases/(default)/documents/${PREFIX}_companies/7`,
    );
  });

  it("items dipetakan ke induk uji dengan UID yang sama", () => {
    assert.equal(
      testDocumentName(
        "projects/karir-9d53a/databases/(default)/documents/user_trackers/uid-9/items/item-3",
        PREFIX,
      ),
      `projects/karir-9d53a/databases/(default)/documents/${PREFIX}_user_trackers/uid-9/items/item-3`,
    );
    assert.equal(
      trackerUidFromName(
        "projects/karir-9d53a/databases/(default)/documents/user_trackers/uid-9/items/item-3",
      ),
      "uid-9",
    );
  });

  it("nama tak dikenal mengembalikan null (tidak ditulis sembarangan)", () => {
    assert.equal(testDocumentName("bukan-nama", PREFIX), null);
    assert.equal(testDocumentName(null, PREFIX), null);
    assert.equal(
      testDocumentName(
        "projects/karir-9d53a/databases/(default)/documents/a/b/c/d/e",
        PREFIX,
      ),
      null,
    );
  });

  it("docIdFromName + defaultPrefix", () => {
    assert.equal(docIdFromName("x/documents/companies/42"), "42");
    assert.equal(docIdFromName(""), "");
    assert.equal(defaultPrefix(new Date("2026-11-18T00:00:00Z")), PREFIX);
  });

  it("chunkArray membagi tepat", () => {
    assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunkArray([], 400), []);
  });
});

describe("validasi manifest (Red Team P-03)", () => {
  it("menolak nama berkas dengan pemisah jalur / traversal", () => {
    assert.throws(() => validateBackupFileName("../rahasia.json"), {
      message: /Nama berkas cadangan tidak valid/,
    });
    assert.throws(() => validateBackupFileName("sub/berkas.json"), {
      message: /Nama berkas cadangan tidak valid/,
    });
    assert.throws(() => validateBackupFileName(""), {
      message: /Nama berkas cadangan tidak valid/,
    });
    assert.doesNotThrow(() => validateBackupFileName("companies.json"));
  });

  it("menolak nama koleksi di luar pola aman", () => {
    assert.throws(() => validateCollectionName("a/b"), {
      message: /Nama koleksi cadangan tidak valid/,
    });
    assert.throws(() => validateCollectionName("a b"), {
      message: /Nama koleksi cadangan tidak valid/,
    });
    assert.doesNotThrow(() => validateCollectionName("cron-runs"));
    assert.doesNotThrow(() =>
      validateCollectionName("user_trackers/items"),
    );
  });

  it("run menolak manifest dengan nama berkas traversal", async () => {
    const dir = await mkdtemp(join(tmpdir(), "karir-restore-jahat-"));
    await writeFile(
      join(dir, "manifest.json"),
      JSON.stringify({
        project: "karir-9d53a",
        createdAt: "2026-11-18T00:00:00.000Z",
        collections: {
          companies: { documents: 1, file: "../rahasia.json" },
        },
        totalDocuments: 1,
      }),
    );
    const code = await run(["--backup", dir, "--prefix", PREFIX], {
      env: ENV,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    });
    assert.equal(code, 1);
  });
});

describe("checkPushSubscriptionDoc", () => {
  it("dokumen benar tanpa masalah", () => {
    assert.deepEqual(checkPushSubscriptionDoc(pushDoc("b".repeat(64))), []);
  });

  it("menemukan id bukan heksadesimal, endpoint http, dan kunci hilang", () => {
    const problems = checkPushSubscriptionDoc(
      doc("push_subscriptions", "id-pendek", {
        endpoint: { stringValue: "http://tidak-aman.test/x" },
      }),
    );
    assert.equal(problems.length, 4);
    assert.ok(problems.some((p) => p.includes("SHA-256")));
    assert.ok(problems.some((p) => p.includes("endpoint")));
    assert.ok(problems.some((p) => p.includes("p256dh")));
    assert.ok(problems.some((p) => p.includes("auth")));
  });
});

describe("run", () => {
  it("dry-run keluar 0 tanpa memanggil fetch", async () => {
    const dir = await fixtureBackup();
    let called = 0;
    const code = await run(
      ["--backup", dir, "--prefix", PREFIX, "--dry-run"],
      { env: {}, fetchImpl: async () => { called += 1; throw new Error("tidak boleh dipanggil"); } },
    );
    assert.equal(code, 0);
    assert.equal(called, 0);
  });

  it("tanpa --backup keluar 2", async () => {
    const code = await run(["--dry-run"], { env: ENV, fetchImpl: async () => ({}) });
    assert.equal(code, 2);
  });

  it("tanpa kredensial keluar 1", async () => {
    const dir = await fixtureBackup();
    const code = await run(["--backup", dir, "--prefix", PREFIX], {
      env: {},
      fetchImpl: async () => ({ ok: false, status: 500, text: async () => "" }),
    });
    assert.equal(code, 1);
  });

  it("koleksi tak ada di manifest keluar 2", async () => {
    const dir = await fixtureBackup();
    const code = await run(
      ["--backup", dir, "--collection", "tidak-ada"],
      { env: ENV, fetchImpl: async () => ({}) },
    );
    assert.equal(code, 2);
  });

  it("direktori tanpa manifest keluar 1", async () => {
    const dir = await mkdtemp(join(tmpdir(), "karir-restore-kosong-"));
    await mkdir(join(dir, "sub"), { recursive: true });
    const code = await run(["--backup", dir], { env: ENV, fetchImpl: async () => ({}) });
    assert.equal(code, 1);
  });

  it("end-to-end: restore + verifikasi lolos, hanya koleksi uji yang ditulis", async () => {
    const dir = await fixtureBackup();
    const { fetchImpl, store } = mockFirestore();
    const code = await run(["--backup", dir, "--prefix", PREFIX], {
      env: ENV,
      fetchImpl,
    });
    assert.equal(code, 0);
    assert.equal(store.size, 6);
    for (const name of store.keys()) {
      assert.ok(name.includes(`${PREFIX}_`), `tulis di luar koleksi uji: ${name}`);
    }
    assert.ok(store.has(
      `projects/karir-9d53a/databases/(default)/documents/${PREFIX}_companies/1`,
    ));
    assert.ok(store.has(
      `projects/karir-9d53a/databases/(default)/documents/${PREFIX}_user_trackers/uid-1/items/item-2`,
    ));
  });

  it("end-to-end: restore sebagian koleksi saja", async () => {
    const dir = await fixtureBackup();
    const { fetchImpl, store } = mockFirestore();
    const code = await run(
      ["--backup", dir, "--prefix", PREFIX, "--collection", "cron-runs"],
      { env: ENV, fetchImpl },
    );
    assert.equal(code, 0);
    assert.equal(store.size, 1);
  });

  it("--verify mendeteksi hitungan tidak cocok (drill belum jalan)", async () => {
    const dir = await fixtureBackup();
    const { fetchImpl } = mockFirestore();
    const code = await run(
      ["--backup", dir, "--prefix", PREFIX, "--verify"],
      { env: ENV, fetchImpl },
    );
    assert.equal(code, 1);
  });

  it("--verify lolos sesudah restore", async () => {
    const dir = await fixtureBackup();
    const { fetchImpl } = mockFirestore();
    const codeRestore = await run(["--backup", dir, "--prefix", PREFIX], {
      env: ENV,
      fetchImpl,
    });
    assert.equal(codeRestore, 0);
    const codeVerify = await run(
      ["--backup", dir, "--prefix", PREFIX, "--verify"],
      { env: ENV, fetchImpl },
    );
    assert.equal(codeVerify, 0);
  });

  it("--cleanup menghapus seluruh dokumen uji", async () => {
    const dir = await fixtureBackup();
    const { fetchImpl, store } = mockFirestore();
    const codeRestore = await run(["--backup", dir, "--prefix", PREFIX], {
      env: ENV,
      fetchImpl,
    });
    assert.equal(codeRestore, 0);
    assert.equal(store.size, 6);
    const codeCleanup = await run(
      ["--backup", dir, "--prefix", PREFIX, "--cleanup", "--yes"],
      { env: ENV, fetchImpl },
    );
    assert.equal(codeCleanup, 0);
    assert.equal(store.size, 0);
  });

  it("--verify mendeteksi dokumen push_subscriptions yang bentuknya rusak", async () => {
    const dir = await fixtureBackup();
    const { fetchImpl, store } = mockFirestore();
    const codeRestore = await run(["--backup", dir, "--prefix", PREFIX], {
      env: ENV,
      fetchImpl,
    });
    assert.equal(codeRestore, 0);
    /* Rusak satu dokumen hasil restore: hapus kunci auth. */
    const key = `projects/karir-9d53a/databases/(default)/documents/${PREFIX}_push_subscriptions/${"a".repeat(64)}`;
    const rusak = store.get(key);
    delete rusak.fields.auth;
    const codeVerify = await run(
      ["--backup", dir, "--prefix", PREFIX, "--verify"],
      { env: ENV, fetchImpl },
    );
    assert.equal(codeVerify, 1);
  });
});
