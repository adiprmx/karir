/* Tes unit untuk scripts/export-auth.mjs, memakai test runner
 * bawaan Node. Dijalankan dengan: node --test scripts/export-auth.test.js
 * Yang dites: uraian argumen, pemetaan pengguna minimal (hash kata
 * sandi TIDAK PERNAH ikut, claim admin dibaca dari customAttributes),
 * paginasi accounts:list, penukaran token JWT scope cloud-platform
 * (dengan kunci RSA yang dibuat di tempat — bukan kunci asli), dan
 * jalan end-to-end run() dengan fetch tiruan. Tanpa jaringan nyata,
 * tanpa email pengguna asli. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import {
  IDENTITY_SCOPE,
  getIdentityToolkitToken,
  listUsers,
  mapUser,
  parseArgs,
  run,
} from "./export-auth.mjs";

const BASE = "https://mock.invalid/v1/projects/karir-9d53a";

function response({ ok = true, status = 200, body = {} } = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    json: async () => JSON.parse(text),
    text: async () => text,
  };
}

function rawUser(overrides = {}) {
  return {
    localId: "uid-1",
    email: "pengguna@contoh.test",
    emailVerified: true,
    disabled: false,
    passwordHash: "HASH-YANG-TIDAK-BOLEH-KELUAR",
    salt: "GARAM-YANG-TIDAK-BOLEH-KELUAR",
    createdAt: "1730000000000",
    lastLoginAt: "1790000000000",
    customAttributes: JSON.stringify({ admin: true }),
    providerUserInfo: [
      { providerId: "google.com", federatedId: "pengguna@contoh.test" },
      { providerId: "password" },
      { providerId: "google.com" },
    ],
    ...overrides,
  };
}

describe("parseArgs", () => {
  it("bawaan: tanpa out, tanpa dry-run", () => {
    assert.deepEqual(parseArgs([]), { out: null, dryRun: false, help: false });
  });

  it("menerima --out dan --dry-run", () => {
    assert.deepEqual(parseArgs(["--out", "hasil", "--dry-run"]), {
      out: "hasil",
      dryRun: true,
      help: false,
    });
    assert.equal(parseArgs(["--out=hasil"]).out, "hasil");
  });

  it("menolak argumen tak dikenal dan nilai yang hilang", () => {
    assert.throws(() => parseArgs(["--tidak-ada"]), {
      message: /Argumen tidak dikenal/,
    });
    assert.throws(() => parseArgs(["--out"]), {
      message: /--out butuh nilai direktori/,
    });
  });
});

describe("mapUser", () => {
  it("memetakan field minimal + admin + providers (tanpa duplikat)", () => {
    assert.deepEqual(mapUser(rawUser()), {
      localId: "uid-1",
      email: "pengguna@contoh.test",
      emailVerified: true,
      disabled: false,
      createdAt: "2024-10-27T03:33:20.000Z",
      lastLoginAt: "2026-09-21T14:13:20.000Z",
      isAdmin: true,
      providers: ["google.com", "password"],
    });
  });

  it("hash kata sandi dan salt TIDAK PERNAH ikut", () => {
    const mapped = mapUser(rawUser());
    const text = JSON.stringify(mapped);
    assert.ok(!text.includes("HASH-YANG-TIDAK-BOLEH-KELUAR"));
    assert.ok(!text.includes("GARAM-YANG-TIDAK-BOLEH-KELUAR"));
    assert.ok(!("passwordHash" in mapped));
    assert.ok(!("salt" in mapped));
  });

  it("tanpa customAttributes berarti bukan admin; JSON rusak berarti bukan admin", () => {
    assert.equal(mapUser(rawUser({ customAttributes: undefined })).isAdmin, false);
    assert.equal(mapUser(rawUser({ customAttributes: "bukan-json" })).isAdmin, false);
    assert.equal(
      mapUser(rawUser({ customAttributes: JSON.stringify({ admin: false }) })).isAdmin,
      false,
    );
    assert.equal(
      mapUser(rawUser({ customAttributes: JSON.stringify({ admin: "ya" }) })).isAdmin,
      false,
    );
  });

  it("stempel waktu tidak valid menjadi null; tanpa localId menjadi null", () => {
    const mapped = mapUser(
      rawUser({ createdAt: "bukan-angka", lastLoginAt: undefined }),
    );
    assert.equal(mapped.createdAt, null);
    assert.equal(mapped.lastLoginAt, null);
    assert.equal(mapUser({ email: "tanpa-uid@contoh.test" }), null);
    assert.equal(mapUser(null), null);
  });

  it("tanpa providerUserInfo berarti providers kosong", () => {
    assert.deepEqual(
      mapUser(rawUser({ providerUserInfo: undefined })).providers,
      [],
    );
  });
});

describe("getIdentityToolkitToken", () => {
  it("menukar JWT scope cloud-platform menjadi token", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const env = {
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
        client_email: "uji@proyek-uji.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
      }),
    };
    let jwtBody = "";
    const fetchImpl = async (url, options) => {
      assert.ok(String(url).includes("oauth2.googleapis.com/token"));
      jwtBody = options.body;
      return response({ body: { access_token: "token-identitas-uji" } });
    };
    const token = await getIdentityToolkitToken({ env, fetchImpl });
    assert.equal(token, "token-identitas-uji");
    /* JWT membawa scope cloud-platform (bukan datastore). */
    const assertion = new URLSearchParams(jwtBody).get("assertion");
    const payload = JSON.parse(
      Buffer.from(assertion.split(".")[1], "base64url").toString("utf8"),
    );
    assert.equal(payload.scope, IDENTITY_SCOPE);
    assert.equal(payload.iss, "uji@proyek-uji.iam.gserviceaccount.com");
  });

  it("mengembalikan null tanpa SA / SA rusak / penukaran gagal", async () => {
    assert.equal(
      await getIdentityToolkitToken({
        env: {},
        fetchImpl: async () => response({ body: {} }),
      }),
      null,
    );
    assert.equal(
      await getIdentityToolkitToken({
        env: { FIREBASE_SERVICE_ACCOUNT: "bukan-json" },
        fetchImpl: async () => response({ body: {} }),
      }),
      null,
    );
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const env = {
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
        client_email: "uji@proyek-uji.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
      }),
    };
    assert.equal(
      await getIdentityToolkitToken({
        env,
        fetchImpl: async () => response({ ok: false, status: 400, body: {} }),
      }),
      null,
    );
  });
});

describe("listUsers", () => {
  it("mengikuti pageToken sampai habis", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (!url.includes("pageToken=")) {
        return response({
          body: { users: [rawUser()], nextPageToken: "lanjut" },
        });
      }
      return response({ body: { users: [rawUser({ localId: "uid-2" })] } });
    };
    const users = await listUsers({ fetchImpl, base: BASE, token: "t" });
    assert.equal(users.length, 2);
    assert.equal(calls.length, 2);
    assert.match(calls[0], /accounts\?pageSize=100/);
  });

  it("403 memberi pesan peran Auth yang jelas", async () => {
    await assert.rejects(
      listUsers({
        fetchImpl: async () =>
          response({ ok: false, status: 403, body: { error: "ditolak" } }),
        base: BASE,
        token: "t",
      }),
      { message: /service account.*peran baca Firebase Auth/ },
    );
  });
});

describe("run", () => {
  it("dry-run keluar 0 tanpa memanggil fetch", async () => {
    let called = 0;
    const code = await run(["--dry-run"], {
      env: {},
      fetchImpl: async () => { called += 1; throw new Error("tidak boleh dipanggil"); },
    });
    assert.equal(code, 0);
    assert.equal(called, 0);
  });

  it("tanpa kredensial keluar 1", async () => {
    const code = await run([], {
      env: {},
      fetchImpl: async () => response({ body: {} }),
    });
    assert.equal(code, 1);
  });

  it("end-to-end: menulis berkas ekspor minimal + hitungan admin", async () => {
    const out = await mkdtemp(join(tmpdir(), "karir-auth-uji-"));
    const fetchImpl = async () =>
      response({
        body: {
          users: [
            rawUser(),
            rawUser({
              localId: "uid-2",
              email: "biasa@contoh.test",
              customAttributes: JSON.stringify({}),
            }),
            { email: "tanpa-uid@contoh.test" },
          ],
        },
      });
    const code = await run(["--out", out], {
      env: { FIRESTORE_ACCESS_TOKEN: "token-uji", IDENTITY_TOOLKIT_BASE: BASE },
      fetchImpl,
    });
    assert.equal(code, 0);
    const files = await readdir(out);
    assert.equal(files.length, 1);
    assert.match(files[0], /^auth-export-\d{4}-\d{2}-\d{2}\.json$/);
    const payload = JSON.parse(await readFile(join(out, files[0]), "utf8"));
    assert.equal(payload.project, "karir-9d53a");
    assert.equal(payload.totalUsers, 2);
    assert.equal(payload.adminUsers, 1);
    assert.equal(payload.users[0].localId, "uid-1");
    assert.equal(payload.users[1].localId, "uid-2");
    assert.ok(!JSON.stringify(payload).includes("HASH-YANG-TIDAK-BOLEH-KELUAR"));
  });

  it("argumen tidak valid keluar 2", async () => {
    const code = await run(["--tidak-ada"], {
      env: {},
      fetchImpl: async () => response({ body: {} }),
    });
    assert.equal(code, 2);
  });
});
