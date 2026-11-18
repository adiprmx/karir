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
import { createHmac, generateKeyPairSync } from "node:crypto";
import {
  resetServiceAccountTokenCache,
  todayJakarta,
} from "./analytics-server.js";

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
  POST: postCleanup,
  RETENTION_POLICIES,
  cleanupCollection,
} = await import("../app/api/cron/cleanup/route.js");

/* --- Mock fetch global untuk wiring GET --- */
const FS_BASE =
  "projects/proyek-uji/databases/(default)/documents";
/* Mode query per koleksi: "ok" | "fail". */
const modes = { analytics_events: "ok", rate_limits: "ok", alerts: "ok", changes: "ok", reports: "ok", audit_logs: "ok", "cron-runs": "ok", incidents: "ok" };
/* Dokumen lama tiruan per koleksi (nama Firestore). */
const oldDocs = {
  analytics_events: [],
  rate_limits: [`${FS_BASE}/rate_limits/kunci-a`, `${FS_BASE}/rate_limits/kunci-b`],
  alerts: [],
  changes: [`${FS_BASE}/changes/entri-1`],
  reports: [`${FS_BASE}/reports/laporan-1`],
  audit_logs: [],
  "cron-runs": [`${FS_BASE}/cron-runs/2026-08-10`],
  incidents: [`${FS_BASE}/incidents/MARKER_READ_FAILED-2026-08-10-01`],
};
/* Tulis batchWrite yang ditangkap mock. */
const deletedNames = [];
/* Tulis heartbeat cron-runs yang ditangkap mock (S8/C-02). */
const heartbeatWrites = [];
/* Bila true, tulis heartbeat dijawab 500 (uji best-effort). */
let heartbeatFail = false;
/* Mode kunci idempotency (P-05): "ok" = create 200; "conflict" =
 * create 409 lalu GET mengembalikan lockDoc. lockDoc null = GET
 * 404 (dokumen lenyap). lockCalls mencatat semua panggilan kunci. */
let lockMode = "ok";
let lockDoc = null;
const lockCalls = [];

function lockDocResponse() {
  return {
    name: `${FS_BASE}/cron-locks/cleanup-${todayJakarta()}`,
    fields: {
      job: { stringValue: "cleanup" },
      date: { stringValue: todayJakarta() },
      runId: { stringValue: "run-lain" },
      trigger: { stringValue: "github-actions" },
      status: { stringValue: lockDoc.status },
      startedAt: { stringValue: lockDoc.startedAt },
      finishedAt: { stringValue: "" },
    },
    updateTime: lockDoc.updateTime,
  };
}

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
  if (u.includes("/cron-runs/")) {
    let body = null;
    try {
      body = JSON.parse(options.body || "{}");
    } catch {
      /* Body bukan JSON: abaikan. */
    }
    heartbeatWrites.push({ url: u, body });
    if (heartbeatFail) {
      return mockResponse({ ok: false, status: 500 });
    }
    return mockResponse({ ok: true, status: 200, body: {} });
  }
  /* Kunci idempotency (P-05): create / baca / lepas / hapus. */
  if (u.includes("/cron-locks")) {
    const method = (options.method || "GET").toUpperCase();
    lockCalls.push({ method, url: u });
    if (method === "POST") {
      if (lockMode === "conflict") {
        return mockResponse({ ok: false, status: 409 });
      }
      return mockResponse({
        ok: true,
        status: 200,
        body: { updateTime: new Date().toISOString() },
      });
    }
    if (method === "GET") {
      if (!lockDoc) return mockResponse({ ok: false, status: 404 });
      return mockResponse({ ok: true, status: 200, body: lockDocResponse() });
    }
    /* PATCH (lepas/takeover) + DELETE (fallback): selalu sukses. */
    return mockResponse({
      ok: true,
      status: 200,
      body: { updateTime: new Date().toISOString() },
    });
  }
  return mockResponse({ ok: false, status: 404 });
};

function resetModes() {
  for (const key of Object.keys(modes)) modes[key] = "ok";
}

beforeEach(() => {
  resetModes();
  deletedNames.length = 0;
  heartbeatWrites.length = 0;
  heartbeatFail = false;
  lockMode = "ok";
  lockDoc = null;
  lockCalls.length = 0;
  resetServiceAccountTokenCache();
  process.env.CRON_SECRET = "rahasia-cron-uji-w1g6-bukan-asli";
  process.env.FIREBASE_SERVICE_ACCOUNT = SA_JSON;
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
  delete process.env.QSTASH_CURRENT_SIGNING_KEY;
  delete process.env.QSTASH_NEXT_SIGNING_KEY;
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
  it("tujuh koleksi dengan retensi + batas + tipe field yang benar (P-06: +incidents)", () => {
    const byCollection = Object.fromEntries(
      RETENTION_POLICIES.map((p) => [p.collection, p]),
    );
    assert.deepEqual(Object.keys(byCollection).sort(), [
      "alerts",
      "audit_logs",
      "changes",
      "cron-runs",
      "incidents",
      "rate_limits",
      "reports",
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
    /* P-03: nilai interim ditetapkan koordinator 18 Nov 2026,
     * menunggu konfirmasi pemilik sebelum P-09. Field penanda umur
     * mengikuti penulis tiap koleksi (reports: `dibuat` di
     * app/perusahaan/[no]/actions.js; audit_logs: `at` di
     * writeAudit app/admin/page.js; cron-runs: `startedAt` di
     * buildCronRunRecord/buildCleanupRunRecord lib/notify.js). */
    assert.deepEqual(byCollection.reports, {
      collection: "reports",
      field: "dibuat",
      valueType: "stringValue",
      retentionDays: 180,
      maxDelete: 100,
    });
    assert.deepEqual(byCollection.audit_logs, {
      collection: "audit_logs",
      field: "at",
      valueType: "stringValue",
      retentionDays: 365,
      maxDelete: 100,
    });
    assert.deepEqual(byCollection["cron-runs"], {
      collection: "cron-runs",
      field: "startedAt",
      valueType: "stringValue",
      retentionDays: 90,
      maxDelete: 100,
    });
    /* P-06: insiden observabilitas — 90 hari berdasarkan lastSeen. */
    assert.deepEqual(byCollection.incidents, {
      collection: "incidents",
      field: "lastSeen",
      valueType: "stringValue",
      retentionDays: 90,
      maxDelete: 100,
    });
  });

  it("total maks hapus per run jauh di bawah batas 20.000/hari", () => {
    const analyticsMax = 200;
    const retentionMax = RETENTION_POLICIES.reduce(
      (sum, p) => sum + p.maxDelete,
      0,
    );
    assert.equal(retentionMax, 800);
    assert.equal(analyticsMax + retentionMax, 1000);
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
    assert.equal(queryBody.structuredQuery.limit, 101);
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

  it("satu baris lebih dari batas berarti masih ada sisa (hasMore)", async () => {
    const rows = Array.from({ length: 4 }, (_, i) => `a/b/alerts/${i}`);
    const { fetchImpl, calls } = stubFetch({ rows });
    const res = await cleanupCollection(
      { ...POLICY, maxDelete: 3 },
      { fetchImpl, now: NOW, token: "token-uji", projectId: "proyek-uji" },
    );
    assert.equal(res.deleted, 3);
    assert.equal(res.hasMore, true);
    /* Baris keempat hanya penanda sisa, tidak ikut dihapus. */
    const batchBody = JSON.parse(calls[1].body);
    assert.equal(batchBody.writes.length, 3);
  });

  it("hasil tepat sama dengan batas berarti tidak ada sisa (C-07)", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => `a/b/alerts/${i}`);
    const { fetchImpl } = stubFetch({ rows });
    const res = await cleanupCollection(
      { ...POLICY, maxDelete: 3 },
      { fetchImpl, now: NOW, token: "token-uji", projectId: "proyek-uji" },
    );
    assert.equal(res.deleted, 3);
    assert.equal(res.hasMore, false);
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

  it("200: analitik + retensi tujuh koleksi, hapus hanya dokumen lama", async () => {
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
    assert.equal(body.retention.reports.deleted, 1);
    assert.equal(body.retention.audit_logs.deleted, 0);
    assert.equal(body.retention["cron-runs"].deleted, 1);
    assert.equal(body.retention.incidents.deleted, 1);
    assert.equal(body.retention.incidents.hasMore, false);
    assert.deepEqual(deletedNames, [
      `${FS_BASE}/rate_limits/kunci-a`,
      `${FS_BASE}/rate_limits/kunci-b`,
      `${FS_BASE}/changes/entri-1`,
      `${FS_BASE}/reports/laporan-1`,
      `${FS_BASE}/cron-runs/2026-08-10`,
      `${FS_BASE}/incidents/MARKER_READ_FAILED-2026-08-10-01`,
    ]);
  });

  it("query satu koleksi gagal: 500 retensi (bukan 200)", async () => {
    modes.alerts = "fail";
    const res = await getCleanup(cleanupRequest());
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error, "Pembersihan retensi gagal.");
  });

  it("200: heartbeat ditulis ke cron-runs/cleanup-{tanggal WIB} (S8/C-02)", async () => {
    const res = await getCleanup(cleanupRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.heartbeatWritten, true);
    assert.equal(heartbeatWrites.length, 1);
    const today = todayJakarta();
    assert.ok(
      heartbeatWrites[0].url.endsWith(`/cron-runs/cleanup-${today}`),
      `id dokumen heartbeat salah: ${heartbeatWrites[0].url}`,
    );
    const fields = heartbeatWrites[0].body.fields;
    assert.equal(fields.date.stringValue, today);
    assert.equal(fields.job.stringValue, "cleanup");
    assert.equal(fields.status.stringValue, "ok");
    assert.equal(fields.deleted.integerValue, "6");
    assert.equal(fields.analyticsDeleted.integerValue, "0");
    assert.equal(fields.rateLimitsDeleted.integerValue, "2");
    assert.equal(fields.alertsDeleted.integerValue, "0");
    assert.equal(fields.changesDeleted.integerValue, "1");
    assert.equal(fields.reportsDeleted.integerValue, "1");
    assert.equal(fields.auditLogsDeleted.integerValue, "0");
    assert.equal(fields.cronRunsDeleted.integerValue, "1");
    assert.equal(fields.incidentsDeleted.integerValue, "1");
    assert.equal(fields.incidentsHasMore.booleanValue, false);
    /* P-06/K4: durasi tiap fase tercatat di heartbeat. */
    const phaseMs = fields.phaseMs.mapValue.fields;
    for (const kunci of [
      "analytics",
      "rate_limits",
      "alerts",
      "changes",
      "reports",
      "audit_logs",
      "cron-runs",
      "incidents",
    ]) {
      assert.equal(
        typeof phaseMs[kunci]?.integerValue,
        "string",
        `phaseMs ${kunci} hilang`,
      );
    }
    assert.equal(fields.error.stringValue, "");
  });

  it("retensi gagal: 500 menyertakan hasil parsial + heartbeat gagal (C-08)", async () => {
    modes.alerts = "fail";
    const res = await getCleanup(cleanupRequest());
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, "Pembersihan retensi gagal.");
    /* Hasil analitik yang sudah terhapus tidak hilang dari
     * balasan, begitu pula koleksi retensi yang sempat selesai. */
    assert.equal(body.analytics.deleted, 0);
    assert.equal(body.retention.rate_limits.deleted, 2);
    assert.equal(heartbeatWrites.length, 1);
    const fields = heartbeatWrites[0].body.fields;
    assert.equal(fields.status.stringValue, "failed");
    assert.equal(fields.analyticsDeleted.integerValue, "0");
    assert.equal(fields.rateLimitsDeleted.integerValue, "2");
    assert.equal(typeof fields.error.stringValue, "string");
    assert.notEqual(fields.error.stringValue, "");
  });

  it("event gagal: 500 + heartbeat gagal ditulis", async () => {
    modes.analytics_events = "fail";
    const res = await getCleanup(cleanupRequest());
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error, "Pembersihan event gagal.");
    assert.equal(heartbeatWrites.length, 1);
    const fields = heartbeatWrites[0].body.fields;
    assert.equal(fields.status.stringValue, "failed");
    assert.equal(fields.deleted.integerValue, "0");
    assert.notEqual(fields.error.stringValue, "");
  });

  it("tulis heartbeat gagal: run tetap 200, heartbeatWritten false", async () => {
    heartbeatFail = true;
    const res = await getCleanup(cleanupRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.heartbeatWritten, false);
    assert.equal(body.retention.rate_limits.deleted, 2);
    assert.equal(heartbeatWrites.length, 1);
  });
});

/* --- Idempotency + auth QStash + POST (P-05, C9/C7) --- */
describe("idempotency cleanup (P-05, C9)", () => {
  function tanamKunci(status, ageMs) {
    const stamp = new Date(Date.now() - ageMs).toISOString();
    lockDoc = { status, startedAt: stamp, updateTime: stamp };
  }

  it("duplikat (job sedang berjalan): 200 duplicate, tanpa hapus", async () => {
    lockMode = "conflict";
    tanamKunci("running", 30_000);
    const res = await getCleanup(cleanupRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.duplicate, true);
    assert.equal(body.reason, "running");
    assert.equal(body.job, "cleanup");
    assert.deepEqual(deletedNames, []);
    assert.equal(heartbeatWrites.length, 0);
  });

  it("done + allowRerun: jalan lagi (loop lanjutan Actions, C7)", async () => {
    lockMode = "conflict";
    tanamKunci("done", 60_000);
    const res = await getCleanup(cleanupRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.duplicate, undefined);
    assert.equal(body.retention.rate_limits.deleted, 2);
  });

  it("kunci basi (> TTL): takeover, run jalan normal", async () => {
    lockMode = "conflict";
    tanamKunci("running", 10 * 60_000);
    const res = await getCleanup(cleanupRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.duplicate, undefined);
    assert.equal(body.retention.rate_limits.deleted, 2);
  });

  it("run sukses: kunci dilepas done + trigger di heartbeat", async () => {
    const req = cleanupRequest();
    req.headers.set("x-karir-trigger", "github-actions");
    const res = await getCleanup(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.heartbeatWritten, true);
    const fields = heartbeatWrites[0].body.fields;
    assert.equal(fields.trigger.stringValue, "github-actions");
    const release = lockCalls.find(
      (c) => c.method === "PATCH" && c.url.includes("/cron-locks/"),
    );
    assert.ok(release, "tidak ada PATCH lepas kunci");
  });

  it("run gagal: kunci dilepas failed (pemicu cadangan boleh ambil alih)", async () => {
    modes.alerts = "fail";
    const res = await getCleanup(cleanupRequest());
    assert.equal(res.status, 500);
    /* Lepas kunci tetap terjadi di jalur gagal (PATCH kunci ada). */
    const release = lockCalls.find(
      (c) => c.method === "PATCH" && c.url.includes("/cron-locks/"),
    );
    assert.ok(release, "tidak ada PATCH lepas kunci di jalur gagal");
  });
});

describe("auth QStash + POST di route cleanup (P-05)", () => {
  const QSTASH_KEY = "kunci-penandatangan-current-uji";

  function jwtQstash() {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: "Upstash",
        sub: "https://karir.local/api/cron/cleanup",
        exp: nowSec + 300,
        nbf: nowSec - 10,
        /* Klaim body = hash SHA-256 string kosong (GET tanpa body). */
        body: "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU",
      }),
    ).toString("base64url");
    const input = `${header}.${payload}`;
    const sig = createHmac("sha256", QSTASH_KEY)
      .update(input, "utf8")
      .digest()
      .toString("base64url");
    return `${input}.${sig}`;
  }

  it("signature QStash valid: run jalan, trigger qstash", async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = QSTASH_KEY;
    const req = {
      url: "https://karir.local/api/cron/cleanup",
      headers: new Headers({ "upstash-signature": jwtQstash() }),
      nextUrl: new URL("https://karir.local/api/cron/cleanup"),
    };
    const res = await getCleanup(req);
    assert.equal(res.status, 200);
    const fields = heartbeatWrites[0].body.fields;
    assert.equal(fields.trigger.stringValue, "qstash");
  });

  it("signature QStash palsu: 401", async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = QSTASH_KEY;
    const req = {
      url: "https://karir.local/api/cron/cleanup",
      headers: new Headers({ "upstash-signature": "palsu.bukan.jwt" }),
      nextUrl: new URL("https://karir.local/api/cron/cleanup"),
    };
    const res = await getCleanup(req);
    assert.equal(res.status, 401);
  });

  it("POST + Bearer: run jalan", async () => {
    const req = cleanupRequest();
    req.method = "POST";
    req.text = async () => "";
    const res = await postCleanup(req);
    assert.equal(res.status, 200);
  });
});
