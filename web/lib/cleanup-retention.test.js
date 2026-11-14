/* Test retensi cron cleanup (FIN-08): kebijakan per koleksi,
 * cleanupCollection (query cutoff + batchWrite bertahap), dan wiring
 * GET /api/cron/cleanup. Handler rute diimpor lewat loader test
 * (alias `@/` + stub `next/server`); semua fetch Firestore + token
 * service account di-mock — tidak ada jaringan, tidak ada secret
 * asli, tidak ada hapus sungguhan terhadap Firestore produksi.
 * Env dummy dipasang di sini, BUKAN dari .env. Dijalankan dengan:
 *   node --test lib/cleanup-retention.test.js
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { generateKeyPairSync } from "node:crypto";
import { resetServiceAccountTokenCache } from "./analytics-server.js";

/* --- Env dummy (sebelum impor rute) --- */
process.env.CRON_SECRET = "rahasia-cron-uji-w1g6-bukan-asli";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SA_JSON = JSON.stringify({
  type: "service_account",
  project_id: "proyek-uji",
  private_key_id: "kunci-uji-w1g6",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  client_email: "uji@proyek-uji.iam.gserviceaccount.com",
  client_id: "1234567890",
});
process.env.FIREBASE_SERVICE_ACCOUNT = SA_JSON;

/* Loader `@/` + `next/server` harus terdaftar SEBELUM rute diimpor,
 * karena itu rute diimpor dinamis di bawah. */
register("./route-test-loader.mjs", import.meta.url);

const {
  GET: getCleanup,
  RETENTION_POLICIES,
  cleanupCollection,
} = await import("../app/api/cron/cleanup/route.js");

/* --- Mock fetch global untuk wiring GET --- */
const FS_BASE =
  "projects/proyek-uji/databases/(default)/documents";
/* Mode query per koleksi: "ok" | "fail". */
const modes = { analytics_events: "ok", rate_limits: "ok", alerts: "ok", changes: "ok" };
/* Dokumen lama tiruan per koleksi (nama Firestore). */
const oldDocs = {
  analytics_events: [],
  rate_limits: [`${FS_BASE}/rate_limits/kunci-a`, `${FS_BASE}/rate_limits/kunci-b`],
  alerts: [],
  changes: [`${FS_BASE}/changes/entri-1`],
};
/* Tulis batchWrite yang ditangkap mock. */
const deletedNames = [];

function mockResponse({ ok, status, body }) {
  return {
    ok,
    status,
    headers: new Headers(),
    json: async () => body ?? {},
    text: async () => JSON.stringify(body ?? {}),
  };
}

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.includes("oauth2.googleapis.com/token")) {
    return mockResponse({
      ok: true,
      status: 200,
      body: { access_token: "token-sa-uji", expires_in: 3600 },
    });
  }
  if (u.includes("/documents:runQuery")) {
    let collection = "";
    try {
      collection = JSON.parse(options.body || "{}").structuredQuery.from[0]
        .collectionId;
    } catch {
      /* Body bukan JSON: anggap koleksi tidak dikenal. */
    }
    if (modes[collection] === "fail") {
      return mockResponse({ ok: false, status: 500 });
    }
    const names = oldDocs[collection] || [];
    return mockResponse({
      ok: true,
      status: 200,
      body: names.map((name) => ({ document: { name } })),
    });
  }
  if (u.includes("/documents:batchWrite")) {
    try {
      const writes = JSON.parse(options.body || "{}").writes || [];
      for (const w of writes) {
        if (w.delete) deletedNames.push(w.delete);
      }
    } catch {
      /* Body bukan JSON: abaikan. */
    }
    return mockResponse({ ok: true, status: 200, body: {} });
  }
  return mockResponse({ ok: false, status: 404 });
};

function resetModes() {
  for (const key of Object.keys(modes)) modes[key] = "ok";
}

beforeEach(() => {
  resetModes();
  deletedNames.length = 0;
  resetServiceAccountTokenCache();
  process.env.CRON_SECRET = "rahasia-cron-uji-w1g6-bukan-asli";
  process.env.FIREBASE_SERVICE_ACCOUNT = SA_JSON;
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
});

function cleanupRequest({ auth = true } = {}) {
  return {
    url: "https://karir.local/api/cron/cleanup",
    headers: new Headers(
      auth
        ? { authorization: "Bearer rahasia-cron-uji-w1g6-bukan-asli" }
        : {},
    ),
    nextUrl: new URL("https://karir.local/api/cron/cleanup"),
  };
}

/* --- Kebijakan retensi --- */
describe("RETENTION_POLICIES (FIN-08)", () => {
  it("tiga koleksi dengan retensi + batas + tipe field yang benar", () => {
    const byCollection = Object.fromEntries(
      RETENTION_POLICIES.map((p) => [p.collection, p]),
    );
    assert.deepEqual(Object.keys(byCollection).sort(), [
      "alerts",
      "changes",
      "rate_limits",
    ]);
    assert.deepEqual(byCollection.rate_limits, {
      collection: "rate_limits",
      field: "updatedAt",
      valueType: "timestampValue",
      retentionDays: 7,
      maxDelete: 200,
    });
    assert.deepEqual(byCollection.alerts, {
      collection: "alerts",
      field: "createdAt",
      valueType: "stringValue",
      retentionDays: 90,
      maxDelete: 100,
    });
    assert.deepEqual(byCollection.changes, {
      collection: "changes",
      field: "createdAt",
      valueType: "stringValue",
      retentionDays: 180,
      maxDelete: 100,
    });
  });

  it("total maks hapus per run jauh di bawah batas 20.000/hari", () => {
    const analyticsMax = 200;
    const retentionMax = RETENTION_POLICIES.reduce(
      (sum, p) => sum + p.maxDelete,
      0,
    );
    assert.equal(retentionMax, 400);
    assert.equal(analyticsMax + retentionMax, 600);
    assert.ok(analyticsMax + retentionMax < 20000);
  });

  it("tiap koleksi muat dalam satu batchWrite (maks 500 tulis)", () => {
    for (const p of RETENTION_POLICIES) {
      assert.ok(p.maxDelete <= 500);
    }
  });
});

/* --- cleanupCollection (unit, fetch disuntik) --- */
describe("cleanupCollection", () => {
  const NOW = new Date("2026-11-15T00:00:00.000Z");
  const POLICY = {
    collection: "alerts",
    field: "createdAt",
    valueType: "stringValue",
    retentionDays: 90,
    maxDelete: 100,
  };

  function stubFetch({ rows = [], queryStatus = 200, batchStatus = 200 } = {}) {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url: String(url), body: options.body || "" });
      if (String(url).includes("/documents:runQuery")) {
        return mockResponse({
          ok: queryStatus === 200,
          status: queryStatus,
          body: rows.map((name) => ({ document: { name } })),
        });
      }
      return mockResponse({ ok: batchStatus === 200, status: batchStatus });
    };
    return { fetchImpl, calls };
  }

  it("menghapus dokumen lama lewat batchWrite + cutoff 90 hari", async () => {
    const { fetchImpl, calls } = stubFetch({
      rows: ["a/b/alerts/1", "a/b/alerts/2"],
    });
    const res = await cleanupCollection(POLICY, {
      fetchImpl,
      now: NOW,
      token: "token-uji",
      projectId: "proyek-uji",
    });
    assert.deepEqual(res, {
      deleted: 2,
      cutoff: "2026-08-17T00:00:00.000Z",
      hasMore: false,
    });
    const queryBody = JSON.parse(calls[0].body);
    assert.equal(
      queryBody.structuredQuery.from[0].collectionId,
      "alerts",
    );
    assert.equal(
      queryBody.structuredQuery.where.fieldFilter.field.fieldPath,
      "createdAt",
    );
    assert.equal(queryBody.structuredQuery.where.fieldFilter.op, "LESS_THAN");
    assert.deepEqual(
      queryBody.structuredQuery.where.fieldFilter.value,
      { stringValue: "2026-08-17T00:00:00.000Z" },
    );
    assert.equal(queryBody.structuredQuery.limit, 100);
    const batchBody = JSON.parse(calls[1].body);
    assert.deepEqual(batchBody.writes, [
      { delete: "a/b/alerts/1" },
      { delete: "a/b/alerts/2" },
    ]);
  });

  it("field timestampValue memakai timestampValue di query", async () => {
    const { fetchImpl, calls } = stubFetch({ rows: [] });
    await cleanupCollection(
      {
        collection: "rate_limits",
        field: "updatedAt",
        valueType: "timestampValue",
        retentionDays: 7,
        maxDelete: 200,
      },
      { fetchImpl, now: NOW, token: "token-uji", projectId: "proyek-uji" },
    );
    const queryBody = JSON.parse(calls[0].body);
    assert.deepEqual(
      queryBody.structuredQuery.where.fieldFilter.value,
      { timestampValue: "2026-11-08T00:00:00.000Z" },
    );
  });

  it("tanpa dokumen lama: tidak memanggil batchWrite", async () => {
    const { fetchImpl, calls } = stubFetch({ rows: [] });
    const res = await cleanupCollection(POLICY, {
      fetchImpl,
      now: NOW,
      token: "token-uji",
      projectId: "proyek-uji",
    });
    assert.deepEqual(res, {
      deleted: 0,
      cutoff: "2026-08-17T00:00:00.000Z",
      hasMore: false,
    });
    assert.equal(calls.length, 1);
  });

  it("hasil sebanyak batas berarti masih ada sisa (hasMore)", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => `a/b/alerts/${i}`);
    const { fetchImpl } = stubFetch({ rows });
    const res = await cleanupCollection(
      { ...POLICY, maxDelete: 3 },
      { fetchImpl, now: NOW, token: "token-uji", projectId: "proyek-uji" },
    );
    assert.equal(res.deleted, 3);
    assert.equal(res.hasMore, true);
  });

  it("query gagal melempar", async () => {
    const { fetchImpl } = stubFetch({ queryStatus: 500 });
    await assert.rejects(
      cleanupCollection(POLICY, {
        fetchImpl,
        now: NOW,
        token: "token-uji",
        projectId: "proyek-uji",
      }),
      /Query alerts lama gagal/,
    );
  });

  it("batchWrite gagal melempar", async () => {
    const { fetchImpl } = stubFetch({
      rows: ["a/b/alerts/1"],
      batchStatus: 500,
    });
    await assert.rejects(
      cleanupCollection(POLICY, {
        fetchImpl,
        now: NOW,
        token: "token-uji",
        projectId: "proyek-uji",
      }),
      /Hapus alerts lama gagal/,
    );
  });

  it("tanpa token atau tanpa projectId melempar", async () => {
    const { fetchImpl } = stubFetch({ rows: [] });
    await assert.rejects(
      cleanupCollection(POLICY, {
        fetchImpl,
        now: NOW,
        projectId: "proyek-uji",
      }),
      /Token service account tidak tersedia/,
    );
    await assert.rejects(
      cleanupCollection(POLICY, {
        fetchImpl,
        now: NOW,
        token: "token-uji",
      }),
      /NEXT_PUBLIC_FIREBASE_PROJECT_ID belum dipasang/,
    );
  });
});

/* --- Wiring GET --- */
describe("GET /api/cron/cleanup (FIN-08)", () => {
  it("tanpa auth dijawab 401", async () => {
    const res = await getCleanup(cleanupRequest({ auth: false }));
    assert.equal(res.status, 401);
  });

  it("tanpa CRON_SECRET dijawab 503", async () => {
    delete process.env.CRON_SECRET;
    try {
      const res = await getCleanup(cleanupRequest());
      assert.equal(res.status, 503);
    } finally {
      process.env.CRON_SECRET = "rahasia-cron-uji-w1g6-bukan-asli";
    }
  });

  it("tanpa service account dijawab 503", async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    try {
      const res = await getCleanup(cleanupRequest());
      assert.equal(res.status, 503);
    } finally {
      process.env.FIREBASE_SERVICE_ACCOUNT = SA_JSON;
    }
  });

  it("200: analitik + retensi tiga koleksi, hapus hanya dokumen lama", async () => {
    const res = await getCleanup(cleanupRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.deleted, 0);
    assert.equal(body.hasMore, false);
    assert.equal(typeof body.cutoff, "string");
    assert.equal(body.retention.rate_limits.deleted, 2);
    assert.equal(body.retention.rate_limits.hasMore, false);
    assert.equal(body.retention.alerts.deleted, 0);
    assert.equal(body.retention.changes.deleted, 1);
    assert.deepEqual(deletedNames, [
      `${FS_BASE}/rate_limits/kunci-a`,
      `${FS_BASE}/rate_limits/kunci-b`,
      `${FS_BASE}/changes/entri-1`,
    ]);
  });

  it("query satu koleksi gagal: 500 retensi (bukan 200)", async () => {
    modes.alerts = "fail";
    const res = await getCleanup(cleanupRequest());
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error, "Pembersihan retensi gagal.");
  });
});
