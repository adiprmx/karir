/* Test handler rute digest push mandiri (P-05), memakai test
 * runner bawaan Node. Dijalankan dengan:
 *   node --test lib/cron-digest-route.test.js
 *
 * Handler rute Next.js diimpor langsung lewat loader test
 * (route-test-loader.mjs: alias `@/` + stub `next/server`) lalu
 * dipanggil dengan Request tiruan; semua fetch (Firestore REST,
 * tukar token service account) di-mock — tidak ada jaringan,
 * tidak ada secret asli, tidak ada push sungguhan (kirim memakai
 * stub web-push, lib/webpush-test-stub.mjs).
 *
 * Yang dites: gerbang CRON_SECRET (fail-closed), kunci
 * idempotency (duplikat ditolak 200), kueri alert belum pushed,
 * kirim digest + penanda pushed, semua-sudah-pushed (push none),
 * kueri gagal (500 + heartbeat failed + kunci failed), daftar
 * langganan gagal (500), tanpa VAPID (500 skipped-no-vapid),
 * dan auth QStash (GET + POST dengan body). */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createHmac, generateKeyPairSync } from "node:crypto";
import { generateVAPIDKeys } from "web-push";
import { resetServiceAccountTokenCache } from "./analytics-server.js";
import { webpushStub } from "./webpush-test-stub.mjs";
import { hashRawBody } from "./qstash-verify.js";

/* --- Env dummy (sebelum impor rute) --- */
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji-t16b";
process.env.CRON_SECRET = "secret-cron-uji-bukan-asli";
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SA_JSON = JSON.stringify({
  client_email: "uji@proyek-uji-t16b.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  project_id: "proyek-uji-t16b",
});
process.env.FIREBASE_SERVICE_ACCOUNT = SA_JSON;

register("./route-test-loader.mjs", import.meta.url);
register("./webpush-test-loader.mjs", import.meta.url);

const VAPID = generateVAPIDKeys();
const QSTASH_KEY = "kunci-penandatangan-current-uji";

const { GET: getDigest, POST: postDigest } = await import(
  "../app/api/cron/digest/route.js"
);

const ORIGIN = "https://karir.local";
const DIGEST_URL = `${ORIGIN}/api/cron/digest`;

function todayWib() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function fakeRequest({ headers = {}, method, text } = {}) {
  const req = {
    url: DIGEST_URL,
    headers: new Headers(headers),
    nextUrl: new URL(DIGEST_URL),
  };
  if (method) req.method = method;
  if (text !== undefined) req.text = async () => text;
  return req;
}

function cronRequest() {
  return fakeRequest({
    headers: { authorization: "Bearer secret-cron-uji-bukan-asli" },
  });
}

function jwtQstash({ rawBody = "" } = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "Upstash",
      sub: DIGEST_URL,
      exp: nowSec + 300,
      nbf: nowSec - 10,
      body: hashRawBody(rawBody),
    }),
  ).toString("base64url");
  const input = `${header}.${payload}`;
  const sig = createHmac("sha256", QSTASH_KEY)
    .update(input, "utf8")
    .digest()
    .toString("base64url");
  return `${input}.${sig}`;
}

/* --- Dokumen Firestore tiruan --- */
function alertDoc(id, overrides = {}) {
  return {
    name:
      `projects/proyek-uji-t16b/databases/(default)/documents/alerts/${id}`,
    fields: {
      type: { stringValue: "new-target" },
      companyNo: { integerValue: "7" },
      perusahaan: { stringValue: "Perusahaan Uji" },
      posisi: { stringValue: "Staff Gudang" },
      link: { stringValue: "https://contoh.test/karir" },
      createdAt: { stringValue: "2026-11-18T01:00:00.000Z" },
      sent: { booleanValue: false },
      ...overrides,
    },
  };
}

function pushSubscriptionDoc() {
  const p256dh = Buffer.alloc(65);
  p256dh[0] = 0x04;
  p256dh[1] = 0xab;
  const auth = Buffer.alloc(16, 0x11);
  return {
    name: "projects/proyek-uji-t16b/databases/(default)/documents/push_subscriptions/doc-uji-push",
    fields: {
      endpoint: {
        stringValue: "https://fcm.googleapis.com/fcm/send/langganan-uji",
      },
      p256dh: { stringValue: p256dh.toString("base64url") },
      auth: { stringValue: auth.toString("base64url") },
    },
  };
}

/* Mode tiruan: alertsQuery "ok" (dua alert belum pushed) |
 * "semua-pushed" | "kosong" | "fail"; pushList "ok" | "failed";
 * lock "ok" | "conflict" (create 409, GET mengembalikan lockDoc). */
const modes = {
  alertsQuery: "ok",
  pushList: "ok",
  lock: "ok",
  lockDoc: null,
};
const recorded = {
  patch: [],
  runQueryCalls: 0,
  pushListCalls: 0,
};

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
  const method = (options.method || "GET").toUpperCase();
  if (u.includes("oauth2.googleapis.com/token")) {
    return mockResponse({
      ok: true,
      status: 200,
      body: { access_token: "token-akses-uji" },
    });
  }
  if (u.includes("/cron-locks")) {
    if (method === "POST") {
      if (modes.lock === "conflict") {
        return mockResponse({ ok: false, status: 409 });
      }
      return mockResponse({
        ok: true,
        status: 200,
        body: { updateTime: new Date().toISOString() },
      });
    }
    if (method === "GET") {
      if (!modes.lockDoc) return mockResponse({ ok: false, status: 404 });
      return mockResponse({ ok: true, status: 200, body: modes.lockDoc });
    }
    recorded.patch.push({ url: u, body: JSON.parse(options.body || "{}") });
    return mockResponse({
      ok: true,
      status: 200,
      body: { updateTime: new Date().toISOString() },
    });
  }
  if (u.includes("/documents:runQuery")) {
    recorded.runQueryCalls += 1;
    if (modes.alertsQuery === "fail") {
      return mockResponse({ ok: false, status: 500 });
    }
    if (modes.alertsQuery === "kosong") {
      return mockResponse({ ok: true, status: 200, body: [] });
    }
    if (modes.alertsQuery === "semua-pushed") {
      return mockResponse({
        ok: true,
        status: 200,
        body: [
          {
            document: alertDoc("sudah-1", {
              pushed: { booleanValue: true },
            }),
          },
        ],
      });
    }
    return mockResponse({
      ok: true,
      status: 200,
      body: [
        { document: alertDoc("baru-1") },
        {
          document: alertDoc("baru-2", {
            type: { stringValue: "deadline" },
            batasLamar: { stringValue: "2026-11-20" },
            daysLeft: { integerValue: "2" },
          }),
        },
        {
          document: alertDoc("sudah-1", {
            pushed: { booleanValue: true },
          }),
        },
      ],
    });
  }
  if (u.includes("/push_subscriptions")) {
    recorded.pushListCalls += 1;
    if (modes.pushList === "failed") {
      return mockResponse({ ok: false, status: 500 });
    }
    return mockResponse({
      ok: true,
      status: 200,
      body: { documents: [pushSubscriptionDoc()] },
    });
  }
  if (method === "PATCH") {
    recorded.patch.push({ url: u, body: JSON.parse(options.body || "{}") });
    return mockResponse({ ok: true, status: 200, body: {} });
  }
  return mockResponse({ ok: false, status: 404 });
};

function lockDocRunning() {
  return {
    name: "x/cron-locks/digest-2026-11-18",
    fields: {
      job: { stringValue: "digest" },
      status: { stringValue: "running" },
      startedAt: { stringValue: new Date().toISOString() },
    },
    updateTime: new Date().toISOString(),
  };
}

function lockDocDone() {
  return {
    name: "x/cron-locks/digest-2026-11-18",
    fields: {
      job: { stringValue: "digest" },
      status: { stringValue: "done" },
      startedAt: { stringValue: new Date().toISOString() },
    },
    updateTime: new Date().toISOString(),
  };
}

function pasangVapidUji() {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID.publicKey;
  process.env.VAPID_PRIVATE_KEY = VAPID.privateKey;
}

beforeEach(() => {
  modes.alertsQuery = "ok";
  modes.pushList = "ok";
  modes.lock = "ok";
  modes.lockDoc = null;
  recorded.patch.length = 0;
  recorded.runQueryCalls = 0;
  recorded.pushListCalls = 0;
  resetServiceAccountTokenCache();
  webpushStub.reset();
  process.env.CRON_SECRET = "secret-cron-uji-bukan-asli";
  process.env.FIREBASE_SERVICE_ACCOUNT = SA_JSON;
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji-t16b";
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.QSTASH_CURRENT_SIGNING_KEY;
  delete process.env.QSTASH_NEXT_SIGNING_KEY;
});

describe("gerbang digest (fail-closed)", () => {
  it("tanpa auth: 401", async () => {
    const res = await getDigest(fakeRequest());
    assert.equal(res.status, 401);
  });

  it("tanpa CRON_SECRET: 503", async () => {
    delete process.env.CRON_SECRET;
    const res = await getDigest(cronRequest());
    assert.equal(res.status, 503);
  });

  it("tanpa service account: 503", async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const res = await getDigest(cronRequest());
    assert.equal(res.status, 503);
  });

  it("tanpa project ID: 503", async () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const res = await getDigest(cronRequest());
    assert.equal(res.status, 503);
  });
});

describe("run digest", () => {
  it("alert belum pushed + VAPID: digest terkirim, alert ditandai pushed", async () => {
    pasangVapidUji();
    const res = await getDigest(cronRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.alertsFound, 2);
    assert.equal(body.alertsTotal, 3);
    assert.equal(body.push, "sent");
    assert.equal(body.pushSent, 1);
    assert.equal(body.pushedMarked, 2);
    assert.equal(body.pushedFailed, 0);
    assert.equal(body.trigger, "cron-secret");
    assert.equal(body.heartbeatWritten, true);
    /* Satu kirim push ke langganan tiruan. */
    assert.equal(webpushStub.sendCalls.length, 1);
    const payload = JSON.parse(webpushStub.sendCalls[0].payload);
    assert.equal(payload.title, "Lowongan baru di Karir");
    assert.equal(payload.data.tag, `karir-digest-${todayWib()}`);
    /* Kedua alert belum pushed ditandai; yang sudah pushed tidak. */
    const pushed = recorded.patch.filter((p) =>
      p.url.includes("/alerts/"),
    );
    assert.deepEqual(
      pushed.map((p) => p.url.split("/alerts/")[1].split("?")[0]).sort(),
      ["baru-1", "baru-2"],
    );
    assert.equal(
      pushed[0].body.fields.pushed.booleanValue,
      true,
    );
    /* Heartbeat digest ditulis ke dokumen digest-{tanggal}. */
    const heartbeat = recorded.patch.find((p) =>
      p.url.includes(`/cron-runs/digest-${todayWib()}`),
    );
    assert.ok(heartbeat, "tidak ada PATCH heartbeat digest");
    assert.equal(heartbeat.body.fields.job.stringValue, "digest");
    assert.equal(heartbeat.body.fields.status.stringValue, "ok");
    assert.equal(heartbeat.body.fields.alertsFound.integerValue, "2");
    assert.equal(heartbeat.body.fields.push.stringValue, "sent");
    /* Kunci dilepas dengan status done. */
    const release = recorded.patch.find(
      (p) =>
        p.url.includes("/cron-locks/") &&
        p.body.fields.status?.stringValue === "done",
    );
    assert.ok(release, "kunci tidak dilepas done");
  });

  it("tidak ada alert belum pushed: push none, run tetap 200", async () => {
    pasangVapidUji();
    modes.alertsQuery = "semua-pushed";
    const res = await getDigest(cronRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.alertsFound, 0);
    assert.equal(body.alertsTotal, 1);
    assert.equal(body.push, "none");
    assert.equal(webpushStub.sendCalls.length, 0);
    assert.equal(recorded.pushListCalls, 0);
  });

  it("tidak ada alert hari ini: push none", async () => {
    modes.alertsQuery = "kosong";
    const res = await getDigest(cronRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.alertsFound, 0);
    assert.equal(body.alertsTotal, 0);
    assert.equal(body.push, "none");
  });

  it("duplikat (job sedang berjalan): 200 duplicate, tidak ada kirim", async () => {
    pasangVapidUji();
    modes.lock = "conflict";
    modes.lockDoc = lockDocRunning();
    const res = await getDigest(cronRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.duplicate, true);
    assert.equal(body.reason, "running");
    assert.equal(body.job, "digest");
    assert.equal(recorded.runQueryCalls, 0);
    assert.equal(webpushStub.sendCalls.length, 0);
  });

  it("duplikat (sudah selesai hari ini): 200 duplicate reason done", async () => {
    modes.lock = "conflict";
    modes.lockDoc = lockDocDone();
    const res = await getDigest(cronRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.duplicate, true);
    assert.equal(body.reason, "done");
    assert.equal(recorded.runQueryCalls, 0);
  });

  it("kueri alert gagal: 500 + heartbeat failed + kunci failed", async () => {
    modes.alertsQuery = "fail";
    const res = await getDigest(cronRequest());
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error, "Daftar alert tidak bisa dibaca.");
    const heartbeat = recorded.patch.find((p) =>
      p.url.includes(`/cron-runs/digest-${todayWib()}`),
    );
    assert.ok(heartbeat);
    assert.equal(heartbeat.body.fields.status.stringValue, "failed");
    const release = recorded.patch.find(
      (p) =>
        p.url.includes("/cron-locks/") &&
        p.body.fields.status?.stringValue === "failed",
    );
    assert.ok(release, "kunci tidak dilepas failed");
  });

  it("daftar langganan gagal: 500, push failed, alert tidak ditandai", async () => {
    pasangVapidUji();
    modes.pushList = "failed";
    const res = await getDigest(cronRequest());
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.status, "failed");
    assert.equal(body.push, "failed");
    assert.equal(body.pushedMarked, 0);
    const pushed = recorded.patch.filter((p) => p.url.includes("/alerts/"));
    assert.equal(pushed.length, 0);
  });

  it("tanpa kunci VAPID: 500 skipped-no-vapid", async () => {
    const res = await getDigest(cronRequest());
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.status, "failed");
    assert.equal(body.push, "skipped-no-vapid");
    assert.equal(body.error, "Kunci VAPID belum dipasang.");
  });
});

describe("auth QStash di route digest", () => {
  it("signature valid (GET): run jalan, trigger qstash", async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = QSTASH_KEY;
    modes.alertsQuery = "kosong";
    const res = await getDigest(
      fakeRequest({ headers: { "upstash-signature": jwtQstash() } }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.trigger, "qstash");
  });

  it("signature palsu: 401", async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = QSTASH_KEY;
    const res = await getDigest(
      fakeRequest({ headers: { "upstash-signature": "palsu.bukan.jwt" } }),
    );
    assert.equal(res.status, 401);
  });

  it("POST + signature valid dengan body: run jalan", async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = QSTASH_KEY;
    modes.alertsQuery = "kosong";
    const res = await postDigest(
      fakeRequest({
        headers: { "upstash-signature": jwtQstash({ rawBody: "isi-post" }) },
        method: "POST",
        text: "isi-post",
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.trigger, "qstash");
  });

  it("POST + signature body tidak cocok: 401", async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = QSTASH_KEY;
    const res = await postDigest(
      fakeRequest({
        headers: { "upstash-signature": jwtQstash({ rawBody: "isi-asli" }) },
        method: "POST",
        text: "isi-diubah",
      }),
    );
    assert.equal(res.status, 401);
  });

  it("POST + Bearer CRON_SECRET: run jalan (tanpa signature)", async () => {
    modes.alertsQuery = "kosong";
    const res = await postDigest(
      fakeRequest({
        headers: { authorization: "Bearer secret-cron-uji-bukan-asli" },
        method: "POST",
        text: "",
      }),
    );
    assert.equal(res.status, 200);
  });
});
