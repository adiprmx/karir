/* Tes unit untuk lib/admin-auth.js, memakai test runner bawaan Node.
 * Dijalankan dengan: node --test lib/admin-auth.test.js
 * Kunci Google di-mock: keypair RSA dibuat di test ini, kunci publiknya
 * disajikan sebagai JWK lewat fetchKeys. Token JWT RS256 ditandatangani
 * sendiri di test. Tidak ada panggilan jaringan dan tidak ada token
 * asli yang dipakai di sini. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createSign,
  generateKeyPairSync,
} from "node:crypto";
import { verifyAdminToken, requireAdmin } from "./admin-auth.js";

const PROJECT_ID = "karir-9d53a";
const KID = "kid-uji-1";
const UID = "uid-uji-1";

const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKeyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = {
  ...keyPair.publicKey.export({ format: "jwk" }),
  kid: KID,
  alg: "RS256",
  use: "sig",
};

async function mockFetchKeys() {
  return { keys: [publicJwk] };
}

const options = { fetchKeys: mockFetchKeys, projectId: PROJECT_ID };

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signJwt({ payload, header = {}, key = keyPair.privateKey }) {
  const headerB64 = base64urlJson({ alg: "RS256", typ: "JWT", kid: KID, ...header });
  const payloadB64 = base64urlJson(payload);
  const signer = createSign("RSA-SHA256");
  signer.update(`${headerB64}.${payloadB64}`);
  const signature = signer.sign(key, "base64url");
  return `${headerB64}.${payloadB64}.${signature}`;
}

function validPayload(overrides = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: UID,
    iat: nowSec - 60,
    exp: nowSec + 3600,
    admin: true,
    ...overrides,
  };
}

function fakeRequest(authorization) {
  return {
    headers: {
      get(name) {
        return name.toLowerCase() === "authorization" ? authorization : null;
      },
    },
  };
}

describe("verifyAdminToken", () => {
  it("token valid dengan klaim admin mengembalikan uid", async () => {
    const token = signJwt({ payload: validPayload() });
    assert.deepEqual(await verifyAdminToken(token, options), { uid: UID });
  });

  it("token valid tanpa klaim admin ditolak 403", async () => {
    const { admin: _admin, ...payload } = validPayload();
    const token = signJwt({ payload });
    const result = await verifyAdminToken(token, options);
    assert.equal(result.status, 403);
    assert.equal(typeof result.error, "string");
    assert.equal(result.uid, undefined);
  });

  it("token valid dengan klaim admin false ditolak 403", async () => {
    const token = signJwt({ payload: validPayload({ admin: false }) });
    const result = await verifyAdminToken(token, options);
    assert.equal(result.status, 403);
  });

  it("token kedaluwarsa ditolak 401", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = signJwt({
      payload: validPayload({ iat: nowSec - 7200, exp: nowSec - 60 }),
    });
    const result = await verifyAdminToken(token, options);
    assert.equal(result.status, 401);
  });

  it("tanda tangan dari kunci lain ditolak 401", async () => {
    const token = signJwt({
      payload: validPayload(),
      key: otherKeyPair.privateKey,
    });
    const result = await verifyAdminToken(token, options);
    assert.equal(result.status, 401);
  });

  it("tanda tangan yang diubah ditolak 401", async () => {
    const token = signJwt({ payload: validPayload() });
    const parts = token.split(".");
    // Balik karakter PERTAMA signature, bukan terakhir: karakter
    // terakhir base64url hanya membawa 2 bit signifikan (4 bit bawah
    // diabaikan saat decode), sehingga membaliknya kadang tidak mengubah
    // byte signature sama sekali dan test menjadi flaky.
    const first = parts[2][0] === "A" ? "B" : "A";
    const flipped = first + parts[2].slice(1);
    const result = await verifyAdminToken(
      `${parts[0]}.${parts[1]}.${flipped}`,
      options,
    );
    assert.equal(result.status, 401);
  });

  it("iss salah ditolak 401", async () => {
    const token = signJwt({
      payload: validPayload({ iss: "https://securetoken.google.com/proyek-lain" }),
    });
    const result = await verifyAdminToken(token, options);
    assert.equal(result.status, 401);
  });

  it("aud salah ditolak 401", async () => {
    const token = signJwt({ payload: validPayload({ aud: "proyek-lain" }) });
    const result = await verifyAdminToken(token, options);
    assert.equal(result.status, 401);
  });

  it("token tanpa sub ditolak 401", async () => {
    const { sub: _sub, ...payload } = validPayload();
    const token = signJwt({ payload });
    const result = await verifyAdminToken(token, options);
    assert.equal(result.status, 401);
  });

  it("token dengan iat di masa depan ditolak 401", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = signJwt({
      payload: validPayload({ iat: nowSec + 3600, exp: nowSec + 7200 }),
    });
    const result = await verifyAdminToken(token, options);
    assert.equal(result.status, 401);
  });

  it("token malformed ditolak 401", async () => {
    for (const bad of ["", "bukan-token", "a.b", "a.b.c.d", null, undefined, 123]) {
      const result = await verifyAdminToken(bad, options);
      assert.equal(result.status, 401, `diharapkan 401 untuk ${String(bad)}`);
    }
  });

  it("alg bukan RS256 ditolak 401", async () => {
    const token = signJwt({ payload: validPayload(), header: { alg: "HS256" } });
    const result = await verifyAdminToken(token, options);
    assert.equal(result.status, 401);
  });

  it("kid yang tidak dikenal ditolak 401", async () => {
    const token = signJwt({ payload: validPayload(), header: { kid: "kid-asing" } });
    const result = await verifyAdminToken(token, options);
    assert.equal(result.status, 401);
  });

  it("kunci Google tidak bisa diambil menjawab 503", async () => {
    const token = signJwt({ payload: validPayload() });
    const failingOptions = {
      projectId: PROJECT_ID,
      fetchKeys: async () => {
        throw new Error("jaringan putus");
      },
    };
    const result = await verifyAdminToken(token, failingOptions);
    assert.equal(result.status, 503);
  });
});

describe("requireAdmin", () => {
  it("header Bearer dengan token admin mengembalikan uid", async () => {
    const token = signJwt({ payload: validPayload() });
    const result = await requireAdmin(
      fakeRequest(`Bearer ${token}`),
      options,
    );
    assert.deepEqual(result, { uid: UID });
  });

  it("tanpa header Authorization ditolak 401", async () => {
    const result = await requireAdmin(fakeRequest(null), options);
    assert.equal(result.status, 401);
  });

  it("skema bukan Bearer ditolak 401", async () => {
    const token = signJwt({ payload: validPayload() });
    const result = await requireAdmin(fakeRequest(`Basic ${token}`), options);
    assert.equal(result.status, 401);
  });

  it("token non-admin lewat header ditolak 403", async () => {
    const { admin: _admin, ...payload } = validPayload();
    const token = signJwt({ payload });
    const result = await requireAdmin(fakeRequest(`Bearer ${token}`), options);
    assert.equal(result.status, 403);
  });
});
