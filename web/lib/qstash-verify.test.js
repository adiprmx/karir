/* Test verifikasi signature QStash (P-05), memakai test runner
 * bawaan Node. Dijalankan dengan:
 *   node --test lib/qstash-verify.test.js
 *
 * JWT uji ditandatangani di tempat dengan node:crypto mengikuti
 * spesifikasi QStash (HS256, klaim iss/sub/exp/nbf/body) —
 * tidak ada jaringan dan tidak ada kunci Upstash asli. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  hashRawBody,
  verifyQstashSignature,
} from "./qstash-verify.js";

const CURRENT_KEY = "kunci-penandatangan-current-uji";
const NEXT_KEY = "kunci-penandatangan-next-uji";
const URL = "https://karir-adiprmx.vercel.app/api/cron/recheck";
const NOW_MS = Date.parse("2026-11-18T01:00:00.000Z");

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

/* Buat JWT gaya QStash: header HS256 + payload dengan klaim
 * iss/sub/exp/nbf/body (body = base64url SHA-256 raw body). */
function buatJwt({ key = CURRENT_KEY, payload = {}, header = {} } = {}) {
  const nowSec = Math.floor(NOW_MS / 1000);
  const fullPayload = {
    iss: "Upstash",
    sub: URL,
    exp: nowSec + 300,
    nbf: nowSec - 10,
    iat: nowSec,
    jti: "pesan-uji-1",
    body: hashRawBody(""),
    ...payload,
  };
  const fullHeader = { alg: "HS256", typ: "JWT", ...header };
  const input = `${b64url(fullHeader)}.${b64url(fullPayload)}`;
  const sig = createHmac("sha256", key).update(input, "utf8").digest();
  return `${input}.${sig.toString("base64url")}`;
}

function verifikasi(signature, overrides = {}) {
  return verifyQstashSignature({
    signature,
    rawBody: "",
    url: URL,
    currentSigningKey: CURRENT_KEY,
    nextSigningKey: NEXT_KEY,
    nowMs: NOW_MS,
    ...overrides,
  });
}

describe("hashRawBody", () => {
  it("hash string kosong = SHA-256 empty yang dikenal", () => {
    /* SHA-256("") base64url — nilai standar, bukan karangan. */
    assert.equal(
      hashRawBody(""),
      "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU",
    );
    assert.equal(
      hashRawBody("isi"),
      createHash("sha256").update("isi", "utf8").digest().toString("base64url"),
    );
  });
});

describe("verifyQstashSignature", () => {
  it("signature valid (current key): valid", () => {
    assert.deepEqual(verifikasi(buatJwt()), { valid: true, reason: "ok" });
  });

  it("signature valid (next key, rotasi): valid", () => {
    assert.deepEqual(verifikasi(buatJwt({ key: NEXT_KEY })), {
      valid: true,
      reason: "ok",
    });
  });

  it("payload diutak-atik sesudah ditandatangani: bad-signature", () => {
    const jwt = buatJwt();
    const [h, p, s] = jwt.split(".");
    const payload = JSON.parse(
      Buffer.from(p, "base64url").toString("utf8"),
    );
    payload.sub = "https://karir-adiprmx.vercel.app/api/cron/cleanup";
    const utakAtik = `${h}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${s}`;
    assert.deepEqual(verifikasi(utakAtik), {
      valid: false,
      reason: "bad-signature",
    });
  });

  it("kunci salah: bad-signature", () => {
    assert.deepEqual(verifikasi(buatJwt({ key: "kunci-penyerang" })), {
      valid: false,
      reason: "bad-signature",
    });
  });

  it("alg none: bad-alg (tidak pernah diterima)", () => {
    const nowSec = Math.floor(NOW_MS / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
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
    assert.deepEqual(verifikasi(`${header}.${payload}.`), {
      valid: false,
      reason: "bad-alg",
    });
  });

  it("alg RS256: bad-alg", () => {
    assert.deepEqual(verifikasi(buatJwt({ header: { alg: "RS256" } })), {
      valid: false,
      reason: "bad-alg",
    });
  });

  it("issuer bukan Upstash: bad-issuer", () => {
    assert.deepEqual(verifikasi(buatJwt({ payload: { iss: "Penyerang" } })), {
      valid: false,
      reason: "bad-issuer",
    });
  });

  it("sub endpoint lain (replay antar endpoint): bad-subject", () => {
    assert.deepEqual(
      verifikasi(
        buatJwt({
          payload: { sub: "https://karir-adiprmx.vercel.app/api/cron/cleanup" },
        }),
      ),
      { valid: false, reason: "bad-subject" },
    );
  });

  it("kedaluwarsa: expired; dalam tenggang 60 detik: masih valid", () => {
    const nowSec = Math.floor(NOW_MS / 1000);
    assert.deepEqual(
      verifikasi(buatJwt({ payload: { exp: nowSec - 61 } })),
      { valid: false, reason: "expired" },
    );
    assert.deepEqual(
      verifikasi(buatJwt({ payload: { exp: nowSec - 30 } })),
      { valid: true, reason: "ok" },
    );
    assert.deepEqual(
      verifikasi(buatJwt({ payload: { exp: "bukan-angka" } })),
      { valid: false, reason: "expired" },
    );
  });

  it("nbf di masa depan: not-yet-valid", () => {
    const nowSec = Math.floor(NOW_MS / 1000);
    assert.deepEqual(
      verifikasi(buatJwt({ payload: { nbf: nowSec + 61 } })),
      { valid: false, reason: "not-yet-valid" },
    );
  });

  it("body tidak cocok (GET dengan body / body diubah): bad-body", () => {
    assert.deepEqual(
      verifikasi(buatJwt(), { rawBody: "isi-tidak-terduga" }),
      { valid: false, reason: "bad-body" },
    );
    assert.deepEqual(
      verifikasi(buatJwt({ payload: { body: hashRawBody("lain") } })),
      { valid: false, reason: "bad-body" },
    );
  });

  it("POST dengan body cocok: valid", () => {
    const jwt = buatJwt({ payload: { body: hashRawBody("isi-post") } });
    assert.deepEqual(verifikasi(jwt, { rawBody: "isi-post" }), {
      valid: true,
      reason: "ok",
    });
  });

  it("format rusak: malformed", () => {
    assert.deepEqual(verifikasi("dua.bagian"), {
      valid: false,
      reason: "malformed",
    });
    assert.deepEqual(verifikasi("!!!.@@@.###"), {
      valid: false,
      reason: "malformed",
    });
    assert.deepEqual(verifikasi(""), {
      valid: false,
      reason: "missing-signature",
    });
  });

  it("kunci penandatanganan belum dipasang: not-configured", () => {
    assert.deepEqual(
      verifikasi(buatJwt(), {
        currentSigningKey: "",
        nextSigningKey: "",
      }),
      { valid: false, reason: "not-configured" },
    );
  });
});
