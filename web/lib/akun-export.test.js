/* Test wiring GET /api/akun/export (S8/C-05): memastikan endpoint
 * ekspor event analitik hanya mengembalikan event milik UID dari
 * ID token yang terverifikasi — bukan UID dari query/body (tidak
 * ada parameter seperti itu), dan bukan event pengguna lain.
 * Handler rute diimpor lewat loader test (alias `@/` + stub
 * `next/server`); semua fetch (JWKS Google, token service
 * account, Firestore) di-mock — tidak ada jaringan, tidak ada
 * secret asli. Env dummy dipasang di sini, BUKAN dari .env;
 * env KV/Firebase API key DIHAPUS supaya limiter bersama memakai
 * store memori (deterministik, tanpa jaringan). Dijalankan dengan:
 *   node --test lib/akun-export.test.js
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { generateKeyPairSync, createSign } from "node:crypto";
import { resetSharedLimiter } from "./rate-limit.js";
import { resetServiceAccountTokenCache } from "./analytics-server.js";

/* --- Env dummy (sebelum impor rute) --- */
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
process.env.ANALYTICS_SALT = "garam-uji-s8-bukan-asli";
const { privateKey: saPrivateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const SA_JSON = JSON.stringify({
  type: "service_account",
  project_id: "proyek-uji",
  private_key_id: "kunci-uji-s8",
  private_key: saPrivateKey.export({ type: "pkcs8", format: "pem" }),
  client_email: "uji@proyek-uji.iam.gserviceaccount.com",
  client_id: "1234567890",
});
process.env.FIREBASE_SERVICE_ACCOUNT = SA_JSON;
for (const key of [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
]) {
  delete process.env[key];
}

/* Loader `@/` + `next/server` harus terdaftar SEBELUM rute diimpor,
 * karena itu rute diimpor dinamis di bawah. */
register("./route-test-loader.mjs", import.meta.url);

const { GET: getExport } = await import("../app/api/akun/export/route.js");

/* --- Token ID tiruan (pola yang sama dengan admin-auth.test.js) --- */
const PROJECT_ID = "proyek-uji";
const KID = "kid-uji-s8";
const UID_A = "uid-pengguna-a";
const UID_B = "uid-pengguna-b";

const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKeyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const TEST_JWK = {
  ...keyPair.publicKey.export({ format: "jwk" }),
  kid: KID,
  alg: "RS256",
  use: "sig",
};

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signJwt({ uid, expired = false, key = keyPair.privateKey }) {
  const nowSec = Math.floor(Date.now() / 1000);
  const headerB64 = base64urlJson({
    alg: "RS256",
    typ: "JWT",
    kid: KID,
  });
  const payloadB64 = base64urlJson({
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: uid,
    iat: expired ? nowSec - 7200 : nowSec - 60,
    exp: expired ? nowSec - 60 : nowSec + 3600,
  });
  const signer = createSign("RSA-SHA256");
  signer.update(`${headerB64}.${payloadB64}`);
  return `${headerB64}.${payloadB64}.${signer.sign(key, "base64url")}`;
}

/* --- Dokumen event tiruan per UID --- */
function eventDoc(uid, ts, type, path) {
  return {
    document: {
      name: `projects/proyek-uji/databases/(default)/documents/analytics_events/${uid}-${ts}`,
      fields: {
        type: { stringValue: type },
        path: { stringValue: path },
        ts: { timestampValue: ts },
        uid: { stringValue: uid },
      },
    },
  };
}

const EVENTS_BY_UID = {
  [UID_A]: [
    eventDoc(UID_A, "2026-11-15T10:00:00.000Z", "search", "/cari"),
    eventDoc(UID_A, "2026-11-14T10:00:00.000Z", "pageview", "/"),
  ],
  [UID_B]: [eventDoc(UID_B, "2026-11-15T09:00:00.000Z", "detail", "/perusahaan/5")],
};

/* UID yang diminta query terakhir (ditangkap mock, supaya test
 * bisa menegaskan query selalu memakai UID dari token). */
let lastQueriedUid = null;
/* Bila true, runQuery dijawab 500. */
let queryFail = false;

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
  if (u.includes("service_accounts/v1/jwk")) {
    return mockResponse({ ok: true, status: 200, body: { keys: [TEST_JWK] } });
  }
  if (u.includes("oauth2.googleapis.com/token")) {
    return mockResponse({
      ok: true,
      status: 200,
      body: { access_token: "token-sa-uji", expires_in: 3600 },
    });
  }
  if (u.includes("/documents:runQuery")) {
    if (queryFail) return mockResponse({ ok: false, status: 500 });
    let uid = null;
    try {
      uid =
        JSON.parse(options.body || "{}").structuredQuery.where.fieldFilter
          .value.stringValue;
    } catch {
      /* Body bukan JSON: uid tetap null. */
    }
    lastQueriedUid = uid;
    return mockResponse({
      ok: true,
      status: 200,
      body: EVENTS_BY_UID[uid] || [],
    });
  }
  return mockResponse({ ok: false, status: 404 });
};

beforeEach(() => {
  lastQueriedUid = null;
  queryFail = false;
  resetSharedLimiter();
  resetServiceAccountTokenCache();
  process.env.FIREBASE_SERVICE_ACCOUNT = SA_JSON;
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
});

/* IP berbeda per test supaya ember batas laju tidak saling
 * mengganggu walau reset terlewat. */
let ipCounter = 30;
function nextIp() {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

function exportRequest({ token, ip } = {}) {
  const headers = { "x-real-ip": ip || nextIp() };
  if (token) headers.authorization = `Bearer ${token}`;
  return {
    url: "https://karir.local/api/akun/export",
    headers: new Headers(headers),
    nextUrl: new URL("https://karir.local/api/akun/export"),
  };
}

describe("GET /api/akun/export (S8/C-05)", () => {
  it("tanpa token ditolak 401", async () => {
    const res = await getExport(exportRequest());
    assert.equal(res.status, 401);
    assert.equal(lastQueriedUid, null);
  });

  it("token bukan JWT ditolak 401", async () => {
    const res = await getExport(exportRequest({ token: "bukan-jwt" }));
    assert.equal(res.status, 401);
    assert.equal(lastQueriedUid, null);
  });

  it("token kedaluwarsa ditolak 401", async () => {
    const token = signJwt({ uid: UID_A, expired: true });
    const res = await getExport(exportRequest({ token }));
    assert.equal(res.status, 401);
    assert.equal(lastQueriedUid, null);
  });

  it("tanda tangan dari kunci lain ditolak 401", async () => {
    const token = signJwt({ uid: UID_A, key: otherKeyPair.privateKey });
    const res = await getExport(exportRequest({ token }));
    assert.equal(res.status, 401);
    assert.equal(lastQueriedUid, null);
  });

  it("token valid: hanya event milik UID dari token yang kembali", async () => {
    const token = signJwt({ uid: UID_A });
    const res = await getExport(exportRequest({ token }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(lastQueriedUid, UID_A);
    assert.equal(body.count, 2);
    assert.equal(body.truncated, false);
    assert.deepEqual(
      body.events.map((e) => e.type),
      ["search", "pageview"],
    );
    /* Tidak ada event pengguna lain yang bocor. */
    assert.ok(body.events.every((e) => e.path !== "/perusahaan/5"));
  });

  it("token pengguna lain tidak bisa membaca event orang lain", async () => {
    const token = signJwt({ uid: UID_B });
    const res = await getExport(exportRequest({ token }));
    assert.equal(res.status, 200);
    const body = await res.json();
    /* Query memakai UID B dari token, bukan UID A dari mana pun. */
    assert.equal(lastQueriedUid, UID_B);
    assert.equal(body.count, 1);
    assert.equal(body.events[0].type, "detail");
    assert.equal(body.events[0].path, "/perusahaan/5");
  });

  it("pengguna tanpa event mendapat daftar kosong", async () => {
    const token = signJwt({ uid: "uid-tanpa-event" });
    const res = await getExport(exportRequest({ token }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(lastQueriedUid, "uid-tanpa-event");
    assert.deepEqual(body, { events: [], count: 0, truncated: false });
  });

  it("panggilan ke-6 dalam satu menit ditolak 429", async () => {
    const token = signJwt({ uid: UID_A });
    const ip = nextIp();
    for (let i = 0; i < 5; i++) {
      const res = await getExport(exportRequest({ token, ip }));
      assert.equal(res.status, 200);
    }
    const limited = await getExport(exportRequest({ token, ip }));
    assert.equal(limited.status, 429);
  });

  it("tanpa service account dijawab 503", async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    resetServiceAccountTokenCache();
    try {
      const token = signJwt({ uid: UID_A });
      const res = await getExport(exportRequest({ token }));
      assert.equal(res.status, 503);
    } finally {
      process.env.FIREBASE_SERVICE_ACCOUNT = SA_JSON;
      resetServiceAccountTokenCache();
    }
  });

  it("query Firestore gagal dijawab 500 generik", async () => {
    queryFail = true;
    const token = signJwt({ uid: UID_A });
    const res = await getExport(exportRequest({ token }));
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(typeof body.error, "string");
    /* Pesan error tidak memuat UID. */
    assert.equal(body.error.includes(UID_A), false);
  });
});
