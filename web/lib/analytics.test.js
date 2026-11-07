/* Tes unit untuk lib/analytics-server.js, memakai test runner bawaan Node.
 * Dijalankan dengan: npm test
 * Yang dites: validasi event, hashing IP harian, dan rate limit.
 * IP mentah tidak pernah muncul di output fungsi apa pun. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_TYPES,
  validateEvent,
  hashVisitor,
  todayJakarta,
  createRateLimiter,
  buildFirestoreFields,
} from "./analytics-server.js";

function validEvent(overrides = {}) {
  return {
    type: "pageview",
    path: "/cari",
    q: "gudang",
    companyNo: 12,
    action: "buka",
    visitor: "abc123",
    ...overrides,
  };
}

describe("validateEvent", () => {
  it("event lengkap yang sah lolos dan field lain dibuang", () => {
    const { ok, event } = validateEvent({
      ...validEvent(),
      ip: "1.2.3.4",
      userAgent: "Mozilla",
      extra: true,
    });
    assert.equal(ok, true);
    assert.equal(event.type, "pageview");
    assert.equal(event.path, "/cari");
    assert.equal(event.q, "gudang");
    assert.equal(event.companyNo, 12);
    assert.equal(event.action, "buka");
    assert.equal(event.visitor, "abc123");
    assert.equal("ip" in event, false);
    assert.equal("userAgent" in event, false);
    assert.equal("extra" in event, false);
  });

  it("keenam type sah diterima", () => {
    for (const type of EVENT_TYPES) {
      assert.equal(EVENT_TYPES.length, 6);
      assert.equal(validateEvent({ type, path: "/" }).ok, true);
    }
  });

  it("type di luar daftar ditolak", () => {
    assert.equal(validateEvent({ type: "klik", path: "/" }).ok, false);
    assert.equal(validateEvent({ path: "/" }).ok, false);
    assert.equal(validateEvent({ type: 42, path: "/" }).ok, false);
  });

  it("path wajib string 1-200 karakter", () => {
    assert.equal(validateEvent({ type: "pageview", path: "" }).ok, false);
    assert.equal(validateEvent({ type: "pageview" }).ok, false);
    assert.equal(
      validateEvent({ type: "pageview", path: "/" + "a".repeat(200) }).ok,
      false,
    );
    assert.equal(
      validateEvent({ type: "pageview", path: "/" + "a".repeat(199) }).ok,
      true,
    );
  });

  it("q maks 200 karakter", () => {
    assert.equal(
      validateEvent(validEvent({ q: "a".repeat(201) })).ok,
      false,
    );
    assert.equal(
      validateEvent(validEvent({ q: "a".repeat(200) })).ok,
      true,
    );
    assert.equal(validateEvent(validEvent({ q: 5 })).ok, false);
  });

  it("companyNo wajib int 1-10000", () => {
    assert.equal(validateEvent(validEvent({ companyNo: 0 })).ok, false);
    assert.equal(validateEvent(validEvent({ companyNo: 10001 })).ok, false);
    assert.equal(validateEvent(validEvent({ companyNo: 1.5 })).ok, false);
    assert.equal(validateEvent(validEvent({ companyNo: "12" })).ok, false);
    assert.equal(validateEvent(validEvent({ companyNo: 1 })).ok, true);
    assert.equal(validateEvent(validEvent({ companyNo: 10000 })).ok, true);
  });

  it("action maks 50 karakter dan visitor maks 64 karakter", () => {
    assert.equal(
      validateEvent(validEvent({ action: "a".repeat(51) })).ok,
      false,
    );
    assert.equal(
      validateEvent(validEvent({ visitor: "a".repeat(65) })).ok,
      false,
    );
    assert.equal(
      validateEvent(validEvent({ action: "a".repeat(50) })).ok,
      true,
    );
    assert.equal(
      validateEvent(validEvent({ visitor: "a".repeat(64) })).ok,
      true,
    );
  });

  it("uid opsional maks 128 karakter, bukan email", () => {
    assert.equal(validateEvent(validEvent({ uid: "u123" })).ok, true);
    assert.equal(
      validateEvent(validEvent({ uid: "a".repeat(128) })).ok,
      true,
    );
    assert.equal(
      validateEvent(validEvent({ uid: "a".repeat(129) })).ok,
      false,
    );
    assert.equal(validateEvent(validEvent({ uid: 42 })).ok, false);
    const { event } = validateEvent(validEvent({ uid: "u123" }));
    assert.equal(event.uid, "u123");
  });

  it("body bukan objek ditolak", () => {
    assert.equal(validateEvent(null).ok, false);
    assert.equal(validateEvent("pageview").ok, false);
    assert.equal(validateEvent([]).ok, false);
  });
});

describe("hashVisitor", () => {
  it("IP dan hari yang sama menghasilkan hash yang sama", () => {
    const a = hashVisitor("203.0.113.7", "2026-11-07");
    const b = hashVisitor("203.0.113.7", "2026-11-07");
    assert.equal(a, b);
  });

  it("hari yang beda menghasilkan hash yang beda", () => {
    const a = hashVisitor("203.0.113.7", "2026-11-07");
    const b = hashVisitor("203.0.113.7", "2026-11-08");
    assert.notEqual(a, b);
  });

  it("IP yang beda menghasilkan hash yang beda", () => {
    const a = hashVisitor("203.0.113.7", "2026-11-07");
    const b = hashVisitor("203.0.113.8", "2026-11-07");
    assert.notEqual(a, b);
  });

  it("hash 64 heksa dan IP mentah tidak muncul di output", () => {
    const ip = "203.0.113.7";
    const hash = hashVisitor(ip, "2026-11-07");
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hash.includes(ip), false);
    assert.equal(hash.includes("203"), false);
  });

  it("garam env mengubah hash", () => {
    const a = hashVisitor("203.0.113.7", "2026-11-07", "karir");
    const b = hashVisitor("203.0.113.7", "2026-11-07", "lain");
    assert.notEqual(a, b);
  });
});

describe("todayJakarta", () => {
  it("format YYYY-MM-DD", () => {
    assert.match(todayJakarta(new Date("2026-11-07T10:00:00Z")), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("rate limit", () => {
  it("30 request lolos, ke-31 ditolak", () => {
    const limiter = createRateLimiter(30, 60_000);
    const now = 1_000_000;
    for (let i = 0; i < 30; i++) {
      assert.equal(limiter.check("hash-a", now + i), true);
    }
    assert.equal(limiter.check("hash-a", now + 30), false);
  });

  it("hash lain tidak kena batas hash pertama", () => {
    const limiter = createRateLimiter(30, 60_000);
    for (let i = 0; i < 30; i++) limiter.check("hash-a", 1_000_000 + i);
    assert.equal(limiter.check("hash-b", 1_000_000), true);
  });

  it("jendela baru setelah 60 detik mengizinkan lagi", () => {
    const limiter = createRateLimiter(30, 60_000);
    for (let i = 0; i < 30; i++) limiter.check("hash-a", 1_000_000 + i);
    assert.equal(limiter.check("hash-a", 1_000_000 + 60_001), true);
  });
});

describe("buildFirestoreFields", () => {
  it("dokumen berisi hash saja, tanpa field IP", () => {
    const { fields } = buildFirestoreFields(
      validEvent(),
      "a".repeat(64),
      "2026-11-07",
      "2026-11-07T03:00:00.000Z",
    );
    assert.equal(fields.type.stringValue, "pageview");
    assert.equal(fields.path.stringValue, "/cari");
    assert.equal(fields.q.stringValue, "gudang");
    assert.equal(fields.companyNo.integerValue, "12");
    assert.equal(fields.action.stringValue, "buka");
    assert.equal(fields.visitor.stringValue, "abc123");
    assert.equal(fields.visitorHash.stringValue, "a".repeat(64));
    assert.equal(fields.ts.timestampValue, "2026-11-07T03:00:00.000Z");
    assert.equal(fields.day.stringValue, "2026-11-07");
    assert.equal("ip" in fields, false);
    assert.equal("x-forwarded-for" in fields, false);
    assert.equal(JSON.stringify(fields).includes("203.0.113"), false);
  });

  it("field opsional yang kosong tidak ditulis", () => {
    const { fields } = buildFirestoreFields(
      { type: "pageview", path: "/" },
      "b".repeat(64),
      "2026-11-07",
      "2026-11-07T03:00:00.000Z",
    );
    assert.equal("q" in fields, false);
    assert.equal("companyNo" in fields, false);
    assert.equal("action" in fields, false);
    assert.equal("visitor" in fields, false);
    assert.equal("uid" in fields, false);
    assert.equal("uaFlag" in fields, false);
  });

  it("uid ditulis bila ada, uaFlag hanya bila true", () => {
    const flagged = buildFirestoreFields(
      { type: "pageview", path: "/", uid: "u123" },
      "a".repeat(64),
      "2026-11-07",
      "2026-11-07T03:00:00.000Z",
      true,
    );
    assert.equal(flagged.fields.uid.stringValue, "u123");
    assert.equal(flagged.fields.uaFlag.booleanValue, true);
    const clean = buildFirestoreFields(
      { type: "pageview", path: "/" },
      "a".repeat(64),
      "2026-11-07",
      "2026-11-07T03:00:00.000Z",
      false,
    );
    assert.equal("uaFlag" in clean.fields, false);
  });
});
