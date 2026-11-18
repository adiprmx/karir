/* Test autentikasi gabungan endpoint cron (P-05), memakai test
 * runner bawaan Node. Dijalankan dengan:
 *   node --test lib/cron-auth.test.js
 *
 * JWT QStash uji ditandatangani di tempat (lihat
 * lib/qstash-verify.test.js untuk detail klaim). Tidak ada
 * jaringan, tidak ada secret asli. */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  authorizeCronRequest,
  sanitizeTrigger,
} from "./cron-auth.js";
import { hashRawBody } from "./qstash-verify.js";

const URL = "https://karir-adiprmx.vercel.app/api/cron/recheck";
const CURRENT_KEY = "kunci-penandatangan-current-uji";

function fakeRequest(headers = {}) {
  return {
    url: URL,
    headers: new Headers(headers),
  };
}

function buatJwtQstash() {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "Upstash",
      sub: URL,
      exp: nowSec + 300,
      nbf: nowSec - 10,
      body: hashRawBody(""),
    }),
  ).toString("base64url");
  const input = `${header}.${payload}`;
  const sig = createHmac("sha256", CURRENT_KEY)
    .update(input, "utf8")
    .digest()
    .toString("base64url");
  return `${input}.${sig}`;
}

describe("sanitizeTrigger", () => {
  it("label valid dipertahankan (huruf kecil)", () => {
    assert.equal(sanitizeTrigger("github-actions"), "github-actions");
    assert.equal(sanitizeTrigger("GitHub-Actions"), "github-actions");
    assert.equal(sanitizeTrigger("  qstash  "), "qstash");
  });

  it("label tidak valid / kosong -> cron-secret", () => {
    assert.equal(sanitizeTrigger(undefined), "cron-secret");
    assert.equal(sanitizeTrigger(""), "cron-secret");
    assert.equal(sanitizeTrigger("a/b"), "cron-secret");
    assert.equal(sanitizeTrigger("label dengan spasi"), "cron-secret");
    assert.equal(sanitizeTrigger("x".repeat(33)), "cron-secret");
    assert.equal(sanitizeTrigger("<script>"), "cron-secret");
  });
});

describe("authorizeCronRequest", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "secret-cron-uji-bukan-asli";
    process.env.QSTASH_CURRENT_SIGNING_KEY = CURRENT_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;
  });

  it("Bearer CRON_SECRET valid: ok via cron-secret", () => {
    const hasil = authorizeCronRequest(
      fakeRequest({ authorization: "Bearer secret-cron-uji-bukan-asli" }),
    );
    assert.equal(hasil.ok, true);
    assert.equal(hasil.via, "cron-secret");
    assert.equal(hasil.trigger, "cron-secret");
    assert.equal(hasil.error, null);
  });

  it("Bearer + header X-Karir-Trigger: label pemicu terbaca", () => {
    const hasil = authorizeCronRequest(
      fakeRequest({
        authorization: "Bearer secret-cron-uji-bukan-asli",
        "x-karir-trigger": "github-actions",
      }),
    );
    assert.equal(hasil.ok, true);
    assert.equal(hasil.trigger, "github-actions");
  });

  it("Bearer + label pemicu jahat: label dibersihkan, auth tetap ok", () => {
    const hasil = authorizeCronRequest(
      fakeRequest({
        authorization: "Bearer secret-cron-uji-bukan-asli",
        "x-karir-trigger": "x\"; DROP TABLE",
      }),
    );
    assert.equal(hasil.ok, true);
    assert.equal(hasil.trigger, "cron-secret");
  });

  it("tanpa auth apa pun: unauthorized", () => {
    const hasil = authorizeCronRequest(fakeRequest());
    assert.equal(hasil.ok, false);
    assert.equal(hasil.error, "unauthorized");
  });

  it("Bearer salah: unauthorized", () => {
    const hasil = authorizeCronRequest(
      fakeRequest({ authorization: "Bearer salah" }),
    );
    assert.equal(hasil.ok, false);
    assert.equal(hasil.error, "unauthorized");
  });

  it("signature QStash valid: ok via qstash, trigger qstash", () => {
    const hasil = authorizeCronRequest(
      fakeRequest({ "upstash-signature": buatJwtQstash() }),
      { rawBody: "" },
    );
    assert.equal(hasil.ok, true);
    assert.equal(hasil.via, "qstash");
    assert.equal(hasil.trigger, "qstash");
  });

  it("signature QStash palsu: unauthorized", () => {
    const hasil = authorizeCronRequest(
      fakeRequest({ "upstash-signature": "palsu.bukan.jwt" }),
      { rawBody: "" },
    );
    assert.equal(hasil.ok, false);
    assert.equal(hasil.error, "unauthorized");
  });

  it("kunci QStash belum dipasang: signature ditolak, Bearer tetap jalan", () => {
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    const qstash = authorizeCronRequest(
      fakeRequest({ "upstash-signature": buatJwtQstash() }),
      { rawBody: "" },
    );
    assert.equal(qstash.ok, false);
    assert.equal(qstash.error, "unauthorized");
    const bearer = authorizeCronRequest(
      fakeRequest({ authorization: "Bearer secret-cron-uji-bukan-asli" }),
    );
    assert.equal(bearer.ok, true);
  });

  it("CRON_SECRET belum dipasang: unconfigured (route jawab 503)", () => {
    delete process.env.CRON_SECRET;
    const hasil = authorizeCronRequest(
      fakeRequest({ authorization: "Bearer apa-pun" }),
    );
    assert.equal(hasil.ok, false);
    assert.equal(hasil.error, "unconfigured");
  });

  it("Bearer didahulukan atas signature QStash bila keduanya ada", () => {
    const hasil = authorizeCronRequest(
      fakeRequest({
        authorization: "Bearer secret-cron-uji-bukan-asli",
        "upstash-signature": "palsu.bukan.jwt",
      }),
      { rawBody: "" },
    );
    assert.equal(hasil.ok, true);
    assert.equal(hasil.via, "cron-secret");
  });
});
