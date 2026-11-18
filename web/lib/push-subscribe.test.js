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
 *
 * P-07/K4: mock Firestore di sini STATEFUL dan meniru semantik
 * atomik Firestore yang dipakai route — pembuatan dokumen
 * POST ?documentId (satu pemenang, sisanya 409) dan CAS PATCH /
 * DELETE dengan prasyarat updateTime (412 bila stempel tidak
 * cocok) — supaya tes konkurensi (dua subscribe bersamaan)
 * membuktikan satu dokumen yang konsisten, bukan hanya dua
 * balasan 200. */
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

/* Dokumen langganan yang "ada" di Firestore tiruan: docId ->
 * { fields, updateTime }. Tulis apa pun menaikkan updateTime
 * (stempel server tiruan, monoton naik) supaya prasyarat CAS
 * bisa diuji: PATCH/DELETE dengan updateTime basi dijawab 412. */
let docs = {};
/* Panggilan buat dokumen atomik yang ditangkap mock (url + body). */
let createCalls = [];
/* Tulis PATCH yang ditangkap mock (url + body). */
let patchCalls = [];
/* Hapus DELETE yang ditangkap mock (url) — hanya hapus yang
 * benar-benar jalan (bukan percobaan yang ditolak 412). */
let deleteCalls = [];
/* Jumlah percobaan DELETE (termasuk yang ditolak 412). */
let deleteAttempts = 0;
/* Bila true, POST buat dokumen dijawab 500. */
let createFail = false;
/* Bila true, PATCH dijawab 500. */
let patchFail = false;
/* Bila true, GET dokumen dijawab 500. */
let getFail = false;
/* Bila true, DELETE dijawab 500. */
let deleteFail = false;
/* Bila true, DELETE pertama menukar pemilik dokumen menjadi UID_B
 * lalu menjawab 412 (simulasi dokumen berubah di tengah jalan). */
let deleteFlipOwner = false;

let updateCounter = 0;
function nextUpdateTime() {
  updateCounter += 1;
  return new Date(Date.now() + updateCounter).toISOString();
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

function docName(docId) {
  return (
    `projects/proyek-uji/databases/(default)/documents/` +
    `push_subscriptions/${docId}`
  );
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
  /* POST buat dokumen atomik: /push_subscriptions?documentId=X.
   * Cabang ini tidak memakai await sebelum cek + tulis, jadi
   * bersifat atomik di event loop JS — sama seperti Firestore:
   * satu pemenang (200), sisanya 409. */
  if (u.includes("/push_subscriptions?") && method === "POST") {
    if (createFail) return mockResponse({ ok: false, status: 500 });
    const docId = new URL(u).searchParams.get("documentId");
    if (docs[docId]) return mockResponse({ ok: false, status: 409 });
    const body = JSON.parse(options.body || "{}");
    createCalls.push({ url: u, body });
    const updateTime = nextUpdateTime();
    docs[docId] = { fields: body.fields || {}, updateTime };
    return mockResponse({
      ok: true,
      status: 200,
      body: { name: docName(docId), fields: body.fields, updateTime },
    });
  }
  if (u.includes("/push_subscriptions/")) {
    const docId = u.split("/push_subscriptions/")[1].split("?")[0];
    if (method === "PATCH") {
      if (patchFail) return mockResponse({ ok: false, status: 500 });
      /* CAS: prasyarat currentDocument.updateTime harus cocok
       * dengan stempel tersimpan bila disertakan. */
      const precondition = new URL(u).searchParams.get(
        "currentDocument.updateTime",
      );
      const existing = docs[docId];
      if (
        precondition &&
        (!existing || existing.updateTime !== precondition)
      ) {
        return mockResponse({ ok: false, status: 412 });
      }
      const body = JSON.parse(options.body || "{}");
      patchCalls.push({ url: u, body });
      const updateTime = nextUpdateTime();
      /* PATCH tanpa updateMask menimpa seluruh dokumen; dengan
       * updateMask hanya field yang disebut — mock menyederhanakan
       * dengan menggabung field baru ke field lama (cukup untuk
       * tes klaim dan refresh UID). */
      docs[docId] = {
        fields: { ...(existing ? existing.fields : {}), ...(body.fields || {}) },
        updateTime,
      };
      return mockResponse({ ok: true, status: 200, body: { updateTime } });
    }
    if (method === "DELETE") {
      deleteAttempts += 1;
      if (deleteFail) return mockResponse({ ok: false, status: 500 });
      if (deleteFlipOwner) {
        deleteFlipOwner = false;
        const existing = docs[docId];
        if (existing) {
          docs[docId] = {
            fields: {
              ...existing.fields,
              uid: { stringValue: UID_B },
            },
            updateTime: nextUpdateTime(),
          };
        }
        return mockResponse({ ok: false, status: 412 });
      }
      const precondition = new URL(u).searchParams.get(
        "currentDocument.updateTime",
      );
      const existing = docs[docId];
      if (
        precondition &&
        (!existing || existing.updateTime !== precondition)
      ) {
        return mockResponse({ ok: false, status: 412 });
      }
      if (!existing) return mockResponse({ ok: false, status: 404 });
      deleteCalls.push(u);
      delete docs[docId];
      return mockResponse({ ok: true, status: 200, body: {} });
    }
    /* GET satu dokumen. */
    if (getFail) return mockResponse({ ok: false, status: 500 });
    const existing = docs[docId];
    if (!existing) return mockResponse({ ok: false, status: 404 });
    return mockResponse({
      ok: true,
      status: 200,
      body: {
        name: docName(docId),
        fields: existing.fields,
        updateTime: existing.updateTime,
      },
    });
  }
  return mockResponse({ ok: false, status: 404 });
};

beforeEach(() => {
  docs = {
    [subscriptionDocId(ENDPOINT_A)]: {
      fields: { uid: { stringValue: UID_A } },
      updateTime: "2026-11-18T00:00:00.000Z",
    },
    [subscriptionDocId(ENDPOINT_B)]: {
      fields: { uid: { stringValue: UID_B } },
      updateTime: "2026-11-18T00:00:00.000Z",
    },
  };
  createCalls = [];
  patchCalls = [];
  deleteCalls = [];
  deleteAttempts = 0;
  createFail = false;
  patchFail = false;
  getFail = false;
  deleteFail = false;
  deleteFlipOwner = false;
  updateCounter = 0;
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

  it("endpoint baru (belum ada dokumen): 200 + dibuat lewat POST atomik, tanpa PATCH", async () => {
    const token = signJwt({ uid: UID_A });
    const res = await postSubscribe(
      subscribeRequest({
        token,
        body: { subscription: validSubscription(ENDPOINT_GHOST) },
      }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, subscribed: true });
    /* P-07/K4: dokumen baru dibuat lewat POST ?documentId
     * (atomik), bukan PATCH. */
    assert.equal(createCalls.length, 1);
    assert.equal(patchCalls.length, 0);
    assert.equal(createCalls[0].body.fields.uid.stringValue, UID_A);
    assert.ok(
      createCalls[0].url.includes(
        `documentId=${subscriptionDocId(ENDPOINT_GHOST)}`,
      ),
    );
    /* Dokumennya benar-benar ada di store tiruan. */
    assert.equal(
      docs[subscriptionDocId(ENDPOINT_GHOST)].fields.uid.stringValue,
      UID_A,
    );
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

  it("buat dokumen gagal (bukan 409): 500 generik, tanpa tulis", async () => {
    createFail = true;
    const token = signJwt({ uid: UID_A });
    const res = await postSubscribe(
      subscribeRequest({
        token,
        body: { subscription: validSubscription(ENDPOINT_GHOST) },
      }),
    );
    assert.equal(res.status, 500);
    assert.equal(createCalls.length, 0);
    assert.equal(docs[subscriptionDocId(ENDPOINT_GHOST)], undefined);
  });
});

describe("POST /api/push/subscribe — atomik + konkurensi (P-07/K4, P5)", () => {
  const ENDPOINT_YATIM = "https://fcm.googleapis.com/fcm/send/langganan-yatim";
  const ENDPOINT_RACE = "https://fcm.googleapis.com/fcm/send/langganan-balapan";

  function seedYatim() {
    docs[subscriptionDocId(ENDPOINT_YATIM)] = {
      /* Dokumen yatim: field lengkap KECUALI uid (mis. dibuat
       * sebelum field uid ada). */
      fields: {
        endpoint: { stringValue: ENDPOINT_YATIM },
        p256dh: { stringValue: validKeys().p256dh },
        auth: { stringValue: validKeys().auth },
      },
      updateTime: "2026-11-18T00:00:00.000Z",
    };
  }

  it("dokumen tanpa UID bisa diklaim: 200, bukan 409 (P5)", async () => {
    seedYatim();
    const token = signJwt({ uid: UID_A });
    const res = await postSubscribe(
      subscribeRequest({
        token,
        body: { subscription: validSubscription(ENDPOINT_YATIM) },
      }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, subscribed: true });
    /* Klaim lewat CAS PATCH (bukan create — dokumen sudah ada). */
    assert.equal(createCalls.length, 0);
    assert.equal(patchCalls.length, 1);
    assert.match(
      patchCalls[0].url,
      /currentDocument\.updateTime=2026-11-18T00%3A00%3A00\.000Z/,
    );
    assert.equal(
      docs[subscriptionDocId(ENDPOINT_YATIM)].fields.uid.stringValue,
      UID_A,
    );
  });

  it("dua subscribe bersamaan, UID sama, endpoint baru: dua-duanya 200, SATU dokumen", async () => {
    const token = signJwt({ uid: UID_A });
    const [res1, res2] = await Promise.all([
      postSubscribe(
        subscribeRequest({
          token,
          body: { subscription: validSubscription(ENDPOINT_RACE) },
        }),
      ),
      postSubscribe(
        subscribeRequest({
          token,
          body: { subscription: validSubscription(ENDPOINT_RACE) },
        }),
      ),
    ]);
    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);
    /* Satu pemenang create atomik; yang kalah me-refresh milik
     * sendiri lewat PATCH — tetap satu dokumen, satu pemilik. */
    assert.equal(createCalls.length, 1);
    assert.equal(patchCalls.length, 1);
    const doc = docs[subscriptionDocId(ENDPOINT_RACE)];
    assert.ok(doc);
    assert.equal(doc.fields.uid.stringValue, UID_A);
  });

  it("dua subscribe bersamaan, UID berbeda, endpoint baru: satu 200, satu 409, SATU dokumen satu pemilik", async () => {
    const tokenA = signJwt({ uid: UID_A });
    const tokenB = signJwt({ uid: UID_B });
    const [resA, resB] = await Promise.all([
      postSubscribe(
        subscribeRequest({
          token: tokenA,
          body: { subscription: validSubscription(ENDPOINT_RACE) },
        }),
      ),
      postSubscribe(
        subscribeRequest({
          token: tokenB,
          body: { subscription: validSubscription(ENDPOINT_RACE) },
        }),
      ),
    ]);
    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    assert.equal(createCalls.length, 1);
    assert.equal(patchCalls.length, 0);
    const doc = docs[subscriptionDocId(ENDPOINT_RACE)];
    assert.ok(doc);
    assert.ok(
      doc.fields.uid.stringValue === UID_A ||
        doc.fields.uid.stringValue === UID_B,
    );
  });

  it("dua klaim bersamaan atas dokumen yatim, UID berbeda: satu 200, satu 409", async () => {
    seedYatim();
    const tokenA = signJwt({ uid: UID_A });
    const tokenB = signJwt({ uid: UID_B });
    const [resA, resB] = await Promise.all([
      postSubscribe(
        subscribeRequest({
          token: tokenA,
          body: { subscription: validSubscription(ENDPOINT_YATIM) },
        }),
      ),
      postSubscribe(
        subscribeRequest({
          token: tokenB,
          body: { subscription: validSubscription(ENDPOINT_YATIM) },
        }),
      ),
    ]);
    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    /* Satu klaim CAS menang; yang kalah membaca ulang dan
     * mendapat 409 — dokumen tetap satu, pemiliknya tunggal. */
    const doc = docs[subscriptionDocId(ENDPOINT_YATIM)];
    assert.ok(doc);
    assert.ok(
      doc.fields.uid.stringValue === UID_A ||
        doc.fields.uid.stringValue === UID_B,
    );
  });

  it("dua klaim bersamaan atas dokumen yatim, UID sama: dua-duanya 200", async () => {
    seedYatim();
    const token = signJwt({ uid: UID_A });
    const [res1, res2] = await Promise.all([
      postSubscribe(
        subscribeRequest({
          token,
          body: { subscription: validSubscription(ENDPOINT_YATIM) },
        }),
      ),
      postSubscribe(
        subscribeRequest({
          token,
          body: { subscription: validSubscription(ENDPOINT_YATIM) },
        }),
      ),
    ]);
    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);
    assert.equal(
      docs[subscriptionDocId(ENDPOINT_YATIM)].fields.uid.stringValue,
      UID_A,
    );
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
    /* URL DELETE kini membawa prasyarat updateTime (P-07/K4) —
     * bandingkan path-nya saja. */
    assert.ok(
      deleteCalls[0]
        .split("?")[0]
        .endsWith(`/push_subscriptions/${subscriptionDocId(ENDPOINT_A)}`),
    );
    assert.match(deleteCalls[0], /currentDocument\.updateTime=/);
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

  it("dokumen yatim bisa dihapus pemegang endpoint: 200 + DELETE jalan (P-07/K4)", async () => {
    const ENDPOINT_YATIM =
      "https://fcm.googleapis.com/fcm/send/langganan-yatim-hapus";
    docs[subscriptionDocId(ENDPOINT_YATIM)] = {
      fields: {
        endpoint: { stringValue: ENDPOINT_YATIM },
        p256dh: { stringValue: validKeys().p256dh },
        auth: { stringValue: validKeys().auth },
      },
      updateTime: "2026-11-18T00:00:00.000Z",
    };
    const token = signJwt({ uid: UID_A });
    const res = await deleteSubscribe(
      subscribeRequest({
        token,
        method: "DELETE",
        body: { endpoint: ENDPOINT_YATIM },
      }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, subscribed: false });
    assert.equal(deleteCalls.length, 1);
    assert.equal(docs[subscriptionDocId(ENDPOINT_YATIM)], undefined);
  });

  it("dokumen berubah pemilik di tengah jalan: tidak terhapus, tetap 200 (P-07/K4)", async () => {
    deleteFlipOwner = true;
    const token = signJwt({ uid: UID_A });
    const res = await deleteSubscribe(
      subscribeRequest({
        token,
        method: "DELETE",
        body: { endpoint: ENDPOINT_A },
      }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, subscribed: false });
    /* Satu percobaan hapus ditolak 412; sesudah baca ulang,
     * pemiliknya sudah B — tidak ada hapus yang jalan. */
    assert.equal(deleteAttempts, 1);
    assert.equal(deleteCalls.length, 0);
    const doc = docs[subscriptionDocId(ENDPOINT_A)];
    assert.ok(doc);
    assert.equal(doc.fields.uid.stringValue, UID_B);
  });
});
