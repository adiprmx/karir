/* Tes unit untuk lib/api-guard.js, memakai test runner bawaan Node.
 * Dijalankan dengan: npm test
 * Yang dites: token HMAC berumur pendek, batas laju di memori, dan
 * deteksi UA otomatis. Secret dan token tidak pernah dicatat di sini. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  issueToken,
  verifyToken,
  isBotUa,
  checkRateLimit,
} from "./api-guard.js";

const SECRET = "secret-uji";
const OTHER_SECRET = "secret-lain";

/* Rakit token dengan detik terbit yang dipilih, memakai rumus yang
 * sama dengan issueToken, supaya umur bisa diuji tanpa menunggu. */
function craftToken(secret, issuedAtSec) {
  const ts = String(issuedAtSec);
  const sig = createHmac("sha256", secret)
    .update(`karir-api-token:${ts}`)
    .digest("hex");
  return `${ts}.${sig}`;
}

describe("issueToken dan verifyToken", () => {
  it("token yang baru diterbitkan diterima", () => {
    const token = issueToken(SECRET);
    assert.equal(verifyToken(token, SECRET), true);
    assert.equal(verifyToken(token, SECRET, 60), true);
  });

  it("token berisi detik terbit dan HMAC 64 heksa", () => {
    const token = issueToken(SECRET);
    const parts = token.split(".");
    assert.equal(parts.length, 2);
    assert.match(parts[0], /^\d+$/);
    assert.match(parts[1], /^[0-9a-f]{64}$/);
  });

  it("token kedaluwarsa ditolak", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const old = craftToken(SECRET, nowSec - 61);
    assert.equal(verifyToken(old, SECRET, 60), false);
    const justInside = craftToken(SECRET, nowSec - 60);
    assert.equal(verifyToken(justInside, SECRET, 60), true);
  });

  it("token dengan secret lain ditolak", () => {
    const token = issueToken(SECRET);
    assert.equal(verifyToken(token, OTHER_SECRET), false);
    const foreign = issueToken(OTHER_SECRET);
    assert.equal(verifyToken(foreign, SECRET), false);
  });

  it("token rusak ditolak", () => {
    const token = issueToken(SECRET);
    const [ts, sig] = token.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    assert.equal(verifyToken(`${ts}.${flipped}`, SECRET), false);
    assert.equal(verifyToken(`${ts}.zzzz`, SECRET), false);
    assert.equal(verifyToken("bukan-token", SECRET), false);
    assert.equal(verifyToken("", SECRET), false);
    assert.equal(verifyToken(null, SECRET), false);
    assert.equal(verifyToken(undefined, SECRET), false);
    assert.equal(verifyToken(`${ts}.${sig}.tambahan`, SECRET), false);
  });

  it("token dari masa depan ditolak", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const future = craftToken(SECRET, nowSec + 3600);
    assert.equal(verifyToken(future, SECRET, 60), false);
  });

  it("maxAgeSec yang lebih besar menerima token yang lebih tua", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const old = craftToken(SECRET, nowSec - 120);
    assert.equal(verifyToken(old, SECRET, 60), false);
    assert.equal(verifyToken(old, SECRET, 180), true);
  });
});

describe("checkRateLimit", () => {
  it("batas dilewati ditolak", () => {
    const hits = new Map();
    const now = 1_000_000;
    for (let i = 0; i < 30; i++) {
      assert.equal(checkRateLimit(hits, "hash-a", 30, 60_000, now + i), true);
    }
    assert.equal(checkRateLimit(hits, "hash-a", 30, 60_000, now + 30), false);
  });

  it("hash lain tidak kena batas hash pertama", () => {
    const hits = new Map();
    for (let i = 0; i < 30; i++) {
      checkRateLimit(hits, "hash-a", 30, 60_000, 1_000_000 + i);
    }
    assert.equal(checkRateLimit(hits, "hash-b", 30, 60_000, 1_000_000), true);
  });

  it("jendela baru setelah 60 detik mengizinkan lagi", () => {
    const hits = new Map();
    for (let i = 0; i < 30; i++) {
      checkRateLimit(hits, "hash-a", 30, 60_000, 1_000_000 + i);
    }
    assert.equal(checkRateLimit(hits, "hash-a", 30, 60_000, 1_000_000 + 60_001), true);
  });

  it("batas 60 untuk endpoint lain dihormati", () => {
    const hits = new Map();
    for (let i = 0; i < 60; i++) {
      assert.equal(checkRateLimit(hits, "hash-a", 60, 60_000, 2_000_000 + i), true);
    }
    assert.equal(checkRateLimit(hits, "hash-a", 60, 60_000, 2_000_060), false);
  });
});

describe("isBotUa", () => {
  it("curl, wget, dan python-requests ditolak", () => {
    assert.equal(isBotUa("curl/8.5.0"), true);
    assert.equal(isBotUa("Wget/1.21.4"), true);
    assert.equal(isBotUa("python-requests/2.31.0"), true);
  });

  it("python-urllib, scrapy, go-http-client, httpie, libwww-perl, dan java ditolak", () => {
    assert.equal(isBotUa("Python-urllib/3.11"), true);
    assert.equal(isBotUa("Scrapy/2.11.0 (+https://scrapy.org)"), true);
    assert.equal(isBotUa("Go-http-client/2.0"), true);
    assert.equal(isBotUa("HTTPie/3.2.2"), true);
    assert.equal(isBotUa("libwww-perl/6.72"), true);
    assert.equal(isBotUa("Java/17.0.9"), true);
  });

  it("UA kosong ditolak", () => {
    assert.equal(isBotUa(""), true);
    assert.equal(isBotUa("   "), true);
    assert.equal(isBotUa(null), true);
    assert.equal(isBotUa(undefined), true);
  });

  it("UA browser biasa lolos", () => {
    assert.equal(
      isBotUa(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
      ),
      false,
    );
    assert.equal(
      isBotUa(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      ),
      false,
    );
    assert.equal(
      isBotUa(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      ),
      false,
    );
  });
});
