/* Test wiring POST / DELETE /api/push/subscribe (T10): memastikan
 * endpoint langganan web push hanya memakai UID dari ID token yang
 * terverifikasi — bukan UID dari body (tidak ada parameter seperti
 * itu) — dan satu pengguna tidak bisa mendaftarkan atau menghapus
 * langganan pengguna lain. Handler rute diimpor lewat loader test
 * (alias `@/` + stub `next/server`); semua fetch (JWKS Google,
 * token service account, Firestore) di-mock — tidak ada jaringan,
 * tidak ada secret asli, tidak ada push sungguhan. Env dummy
 * dipasang di sini, BUKAN dari .env; env KV/Firebase API key
 * DIHAPUS supaya limiter bersama memakai store memori
 * (deterministik, tanpa jaringan). Dijalankan dengan:
 *   node --test lib/push-subscribe.test.js
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { generateKeyPairSync, createHash, createSign } from "node:crypto";
import { resetSharedLimiter } from "./rate-limit.js";
import { subscriptionDocId } from "./push.js";

/* --- Env dummy (sebelum impor rute) --- */
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
process.env.ANALYTICS_SALT = "garam-uji-t10-bukan-asli";
const { privateKey: saPrivateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const SA_JSON = JSON.stringify({
  type: "service_account",
  project_id: "proyek-uji",
  private_key_id: "kunci-uji-t10",
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

const { POST: postSubscribe, DELETE: deleteSubscribe } = await import(
  "../app/api/push/subscribe/route.js"
);

/* --- Token ID tiruan (pola yang sama dengan admin-auth.test.js) --- */
const PROJECT_ID = "proyek-uji";
const KID = "kid-uji-t10";
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
  const headerB64 = base64urlJson({ alg: "RS256", typ: "JWT", kid: KID });
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

/* --- Langganan tiruan --- */
function validKeys() {
  const p256dh = Buffer.alloc(65);
  p256dh[0] = 0x04;
  p256dh[1] = 0xab;
  const auth = Buffer.alloc(16, 0x11);
  return {
    p256dh: p256dh.toString("base64url"),
    auth: auth.toString("base64url"),
  };
}

const ENDPOINT_A = "https://fcm.googleapis.com/fcm/send/langganan-a";
const ENDPOINT_B = "https://fcm.googleapis.com/fcm/send/langganan-b";
const ENDPOINT_GHOST = "https://fcm.googleapis.com/fcm/send/tidak-ada";

function validSubscription(endpoint = ENDPOINT_A) {
  return { endpoint, keys: validKeys() };
}

/* Dokumen langganan yang "ada" di Firestore tiruan: docId -> UID pemilik. */
let docsById = {};
/* Tulis PATCH yang ditangkap mock (url + body). */
let patchCalls = [];
/* Hapus DELETE yang ditangkap mock (url). */
let deleteCalls = [];
/* Bila true, PATCH dijawab 500. */
let patchFail = false;
/* Bila true, GET dokumen dijawab 500. */
let getFail = false;
/* Bila true, DELETE dijawab 500. */
let deleteFail = false;

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
  if (u.includes("/push_subscriptions/")) {
    const docId = u.split("/push_subscriptions/")[1].split("?")[0];
    if (method === "PATCH") {
      if (patchFail) return mockResponse({ ok: false, status: 500 });
      patchCalls.push({ url: u, body: JSON.parse(options.body || "{}") });
      return mockResponse({ ok: true, status: 200, body: {} });
    }
    if (method === "DELETE") {
      if (deleteFail) return mockResponse({ ok: false, status: 500 });
      deleteCalls.push(u);
      return mockResponse({ ok: true, status: 200, body: {} });
    }
    /* GET satu dokumen. */
    if (getFail) return mockResponse({ ok: false, status: 500 });
    const ownerUid = docsById[docId];
    if (!ownerUid) return mockResponse({ ok: false, status: 404 });
    return mockResponse({
      ok: true,
      status: 200,
      body: {
        name: `projects/proyek-uji/databases/(default)/documents/push_subscriptions/${docId}`,
        fields: { uid: { stringValue: ownerUid } },
      },
    });
  }
  return mockResponse({ ok: false, status: 404 });
};

beforeEach(() => {
  docsById = {
    [subscriptionDocId(ENDPOINT_A)]: UID_A,
    [subscriptionDocId(ENDPOINT_B)]: UID_B,
  };
  patchCalls = [];
  deleteCalls = [];
  patchFail = false;
  getFail = false;
  deleteFail = false;
  resetSharedLimiter();
  process.env.FIREBASE_SERVICE_ACCOUNT = SA_JSON;
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
});

/* IP berbeda per test supaya ember batas laju tidak saling
 * mengganggu walau reset terlewat. */
let ipCounter = 60;
function nextIp() {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

function subscribeRequest({ token, ip, body, method = "POST" } = {}) {
  const headers = { "x-real-ip": ip || nextIp() };
  if (token) headers.authorization = `Bearer ${token}`;
  return {
    url: "https://karir.local/api/push/subscribe",
    headers: new Headers(headers),
    nextUrl: new URL("https://karir.local/api/push/subscribe"),
    json: async () => body ?? {},
  };
}

describe("POST /api/push/subscribe (T10)", () => {
  it("tanpa token ditolak 401, tanpa tulis", async () => {
    const res = await postSubscribe(
      subscribeRequest({ body: { subscription: validSubscription() } }),
    );
    assert.equal(res.status, 401);
    assert.equal(patchCalls.length, 0);
  });

  it("token bukan JWT ditolak 401", async () => {
    const res = await postSubscribe(
      subscribeRequest({
        token: "bukan-jwt",
        body: { subscription: validSubscription() },
      }),
    );
    assert.equal(res.status, 401);
    assert.equal(patchCalls.length, 0);
  });

  it("token kedaluwarsa ditolak 401", async () => {
    const token = signJwt({ uid: UID_A, expired: true });
    const res = await postSubscribe(
      subscribeRequest({ token, body: { subscription: validSubscription() } }),
    );
    assert.equal(res.status, 401);
    assert.equal(patchCalls.length, 0);
  });

  it("tanda tangan dari kunci lain ditolak 401", async () => {
    const token = signJwt({ uid: UID_A, key: otherKeyPair.privateKey });
    const res = await postSubscribe(
      subscribeRequest({ token, body: { subscription: validSubscription() } }),
    );
    assert.equal(res.status, 401);
    assert.equal(patchCalls.length, 0);
  });

  it("token valid: dokumen ditulis dengan UID dari token + ID SHA-256 endpoint", async () => {
    const token = signJwt({ uid: UID_A });
    const res = await postSubscribe(
      subscribeRequest({
        token,
        body: { subscription: validSubscription(), userAgent: "Browser Uji/1.0" },
      }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, subscribed: true });
    assert.equal(patchCalls.length, 1);
    const call = patchCalls[0];
    /* ID dokumen = SHA-256 hex endpoint (bukan dari body). */
    assert.ok(
      call.url.endsWith(`/push_subscriptions/${subscriptionDocId(ENDPOINT_A)}`),
    );
    /* UID dari token, bukan dari body — body tidak punya UID. */
    assert.equal(call.body.fields.uid.stringValue, UID_A);
    assert.equal(call.body.fields.endpoint.stringValue, ENDPOINT_A);
    assert.equal(call.body.fields.p256dh.stringValue, validKeys().p256dh);
    assert.equal(call.body.fields.auth.stringValue, validKeys().auth);
    assert.equal(call.body.fields.userAgent.stringValue, "Browser Uji/1.0");
    assert.ok(call.body.fields.createdAt.stringValue);
    assert.ok(call.body.fields.updatedAt.stringValue);
  });

  it("UID di body diabaikan: yang dipakai tetap UID dari token", async () => {
    const token = signJwt({ uid: UID_A });
    const res = await postSubscribe(
      subscribeRequest({
        token,
        body: {
          uid: UID_B,
          subscription: validSubscription(),
        },
      }),
    );
    assert.equal(res.status, 200);
    assert.equal(patchCalls.length, 1);
    assert.equal(patchCalls[0].body.fields.uid.stringValue, UID_A);
  });

  it("endpoint http ditolak 400, tanpa tulis", async () => {
    const token = signJwt({ uid: UID_A });
    const res = await postSubscribe(
      subscribeRequest({
        token,
        body: { subscription: validSubscription("http://example.com/push") },
      }),
    );
    assert.equal(res.status, 400);
    assert.equal(patchCalls.length, 0);
  });

  it("kunci p256dh tidak benar ditolak 400, tanpa tulis", async () => {
    const token = signJwt({ uid: UID_A });
    const keys = validKeys();
    keys.p256dh = Buffer.alloc(65, 0x02).toString("base64url");
    const res = await postSubscribe(
      subscribeRequest({
        token,
        body: { subscription: { endpoint: ENDPOINT_A, keys } },
      }),
    );
    assert.equal(res.status, 400);
    assert.equal(patchCalls.length, 0);
  });

  it("langganan tanpa keys ditolak 400", async () => {
    const token = signJwt({ uid: UID_A });
    const res = await postSubscribe(
      subscribeRequest({
        token,
        body: { subscription: { endpoint: ENDPOINT_A } },
      }),
    );
    assert.equal(res.status, 400);
    assert.equal(patchCalls.length, 0);
  });

  it("userAgent panjang dipotong ke 500 karakter di server", async () => {
    const token = signJwt({ uid: UID_A });
    const res = await postSubscribe(
      subscribeRequest({
        token,
        body: {
          subscription: validSubscription(),
          userAgent: `UA ${"y".repeat(600)}`,
        },
      }),
    );
    assert.equal(res.status, 200);
    assert.equal(patchCalls[0].body.fields.userAgent.stringValue.length, 500);
  });

  it("panggilan ke-6 dalam satu menit ditolak 429", async () => {
    const token = signJwt({ uid: UID_A });
    const ip = nextIp();
    for (let i = 0; i < 5; i++) {
      const res = await postSubscribe(
        subscribeRequest({
          token,
          ip,
          body: { subscription: validSubscription() },
        }),
      );
      assert.equal(res.status, 200);
    }
    const limited = await postSubscribe(
      subscribeRequest({
        token,
        ip,
        body: { subscription: validSubscription() },
      }),
    );
    assert.equal(limited.status, 429);
    assert.equal(patchCalls.length, 5);
  });

  it("tanpa service account dijawab 503", async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    try {
      const token = signJwt({ uid: UID_A });
      const res = await postSubscribe(
        subscribeRequest({
          token,
          body: { subscription: validSubscription() },
        }),
      );
      assert.equal(res.status, 503);
      assert.equal(patchCalls.length, 0);
    } finally {
      process.env.FIREBASE_SERVICE_ACCOUNT = SA_JSON;
    }
  });

  it("tulis Firestore gagal dijawab 500 generik (tanpa UID di pesan)", async () => {
    patchFail = true;
    const token = signJwt({ uid: UID_A });
    const res = await postSubscribe(
      subscribeRequest({
        token,
        body: { subscription: validSubscription() },
      }),
    );
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(typeof body.error, "string");
    assert.equal(body.error.includes(UID_A), false);
  });

  it("ID dokumen cocok dengan SHA-256 yang dihitung independen", async () => {
    /* ENDPOINT_B milik UID_B di Firestore tiruan, jadi tokennya
     * harus UID_B (subscribe atas dokumen milik akun lain
     * ditolak 409 — lihat test RENDAH-2 di bawah). */
    const token = signJwt({ uid: UID_B });
    await postSubscribe(
      subscribeRequest({
        token,
        body: { subscription: validSubscription(ENDPOINT_B) },
      }),
    );
    const expected = createHash("sha256")
      .update(ENDPOINT_B, "utf8")
      .digest("hex");
    assert.ok(patchCalls[0].url.endsWith(`/push_subscriptions/${expected}`));
  });

  it("endpoint milik pengguna lain: 409, tanpa tulis, tanpa bocor pemilik (RENDAH-2)", async () => {
    const token = signJwt({ uid: UID_A });
    const res = await postSubscribe(
      subscribeRequest({
        token,
        body: { subscription: validSubscription(ENDPOINT_B) },
      }),
    );
    /* Kode lama: PATCH kedua menulis uid A atas dokumen B tanpa
     * baca dulu (200). Kode baru: baca dulu, tolak 409. */
    assert.equal(res.status, 409);
    assert.equal(patchCalls.length, 0);
    const body = await res.json();
    assert.equal(typeof body.error, "string");
    assert.equal(body.error.includes(UID_B), false);
    assert.equal(body.error.includes(UID_A), false);
  });

  it("endpoint baru (belum ada dokumen): 200 + tulis", async () => {
    const token = signJwt({ uid: UID_A });
    const res = await postSubscribe(
      subscribeRequest({
        token,
        body: { subscription: validSubscription(ENDPOINT_GHOST) },
      }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, subscribed: true });
    assert.equal(patchCalls.length, 1);
    assert.equal(patchCalls[0].body.fields.uid.stringValue, UID_A);
  });

  it("subscribe ulang milik sendiri: tetap 200 idempotent (RENDAH-2)", async () => {
    const token = signJwt({ uid: UID_A });
    for (let i = 0; i < 2; i++) {
      const res = await postSubscribe(
        subscribeRequest({
          token,
          body: { subscription: validSubscription(ENDPOINT_A) },
        }),
      );
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true, subscribed: true });
    }
    assert.equal(patchCalls.length, 2);
    assert.equal(patchCalls[1].body.fields.uid.stringValue, UID_A);
  });

  it("baca dokumen gagal: 500 generik, tanpa tulis (RENDAH-2)", async () => {
    getFail = true;
    const token = signJwt({ uid: UID_A });
    const res = await postSubscribe(
      subscribeRequest({
        token,
        body: { subscription: validSubscription(ENDPOINT_A) },
      }),
    );
    assert.equal(res.status, 500);
    assert.equal(patchCalls.length, 0);
    const body = await res.json();
    assert.equal(body.error.includes(UID_A), false);
  });
});

describe("DELETE /api/push/subscribe (T10)", () => {
  it("tanpa token ditolak 401, tanpa hapus", async () => {
    const res = await deleteSubscribe(
      subscribeRequest({ method: "DELETE", body: { endpoint: ENDPOINT_A } }),
    );
    assert.equal(res.status, 401);
    assert.equal(deleteCalls.length, 0);
  });

  it("langganan sendiri terhapus: 200 + DELETE ke ID SHA-256 endpoint", async () => {
    const token = signJwt({ uid: UID_A });
    const res = await deleteSubscribe(
      subscribeRequest({ token, method: "DELETE", body: { endpoint: ENDPOINT_A } }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, subscribed: false });
    assert.equal(deleteCalls.length, 1);
    assert.ok(
      deleteCalls[0].endsWith(
        `/push_subscriptions/${subscriptionDocId(ENDPOINT_A)}`,
      ),
    );
  });

  it("token pengguna A tidak bisa menghapus langganan pengguna B (200 yang sama, tanpa hapus)", async () => {
    const token = signJwt({ uid: UID_A });
    const res = await deleteSubscribe(
      subscribeRequest({ token, method: "DELETE", body: { endpoint: ENDPOINT_B } }),
    );
    /* Balasan sama persis dengan hapus sukses: tidak membocorkan
     * keberadaan langganan orang lain. */
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, subscribed: false });
    assert.equal(deleteCalls.length, 0);
  });

  it("dokumen tidak ada: tetap 200 idempotent, tanpa hapus", async () => {
    const token = signJwt({ uid: UID_A });
    const res = await deleteSubscribe(
      subscribeRequest({
        token,
        method: "DELETE",
        body: { endpoint: ENDPOINT_GHOST },
      }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, subscribed: false });
    assert.equal(deleteCalls.length, 0);
  });

  it("endpoint http ditolak 400, tanpa hapus", async () => {
    const token = signJwt({ uid: UID_A });
    const res = await deleteSubscribe(
      subscribeRequest({
        token,
        method: "DELETE",
        body: { endpoint: "http://example.com/push" },
      }),
    );
    assert.equal(res.status, 400);
    assert.equal(deleteCalls.length, 0);
  });

  it("tanpa endpoint ditolak 400", async () => {
    const token = signJwt({ uid: UID_A });
    const res = await deleteSubscribe(
      subscribeRequest({ token, method: "DELETE", body: {} }),
    );
    assert.equal(res.status, 400);
    assert.equal(deleteCalls.length, 0);
  });

  it("panggilan ke-6 dalam satu menit ditolak 429 (cakupan sama dengan POST)", async () => {
    const token = signJwt({ uid: UID_A });
    const ip = nextIp();
    for (let i = 0; i < 5; i++) {
      const res = await deleteSubscribe(
        subscribeRequest({
          token,
          ip,
          method: "DELETE",
          body: { endpoint: ENDPOINT_GHOST },
        }),
      );
      assert.equal(res.status, 200);
    }
    const limited = await deleteSubscribe(
      subscribeRequest({
        token,
        ip,
        method: "DELETE",
        body: { endpoint: ENDPOINT_GHOST },
      }),
    );
    assert.equal(limited.status, 429);
  });

  it("tanpa service account dijawab 503", async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    try {
      const token = signJwt({ uid: UID_A });
      const res = await deleteSubscribe(
        subscribeRequest({
          token,
          method: "DELETE",
          body: { endpoint: ENDPOINT_A },
        }),
      );
      assert.equal(res.status, 503);
      assert.equal(deleteCalls.length, 0);
    } finally {
      process.env.FIREBASE_SERVICE_ACCOUNT = SA_JSON;
    }
  });

  it("baca dokumen gagal dijawab 500, tanpa hapus", async () => {
    getFail = true;
    const token = signJwt({ uid: UID_A });
    const res = await deleteSubscribe(
      subscribeRequest({
        token,
        method: "DELETE",
        body: { endpoint: ENDPOINT_A },
      }),
    );
    assert.equal(res.status, 500);
    assert.equal(deleteCalls.length, 0);
  });

  it("hapus dokumen gagal dijawab 500", async () => {
    deleteFail = true;
    const token = signJwt({ uid: UID_A });
    const res = await deleteSubscribe(
      subscribeRequest({
        token,
        method: "DELETE",
        body: { endpoint: ENDPOINT_A },
      }),
    );
    assert.equal(res.status, 500);
  });
});
