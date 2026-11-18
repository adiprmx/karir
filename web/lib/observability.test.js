/* Test log terstruktur observabilitas (P-06, K1/K3).
 * Dijalankan dengan: node --test lib/observability.test.js */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  OBS_CODES,
  OBS_CONSOLE_THROTTLE_MS,
  emitObservabilityEvent,
  registerObservabilitySink,
  resetObservabilityForTests,
  sanitizeMessage,
  sanitizeMeta,
} from "./observability.js";

describe("sanitizeMessage", () => {
  it("menyamarkan alamat email di dalam teks", () => {
    const out = sanitizeMessage("gagal kirim ke pengguna@contoh.id tadi");
    assert.equal(out, "gagal kirim ke [email] tadi");
    assert.ok(!out.includes("pengguna@contoh.id"));
  });

  it("menyamarkan kredensial di dalam URL", () => {
    const out = sanitizeMessage("fetch https://user:rahasia@host.test/x gagal");
    assert.ok(!out.includes("rahasia"));
    assert.ok(out.includes("://[kredensial]@host.test/x"));
  });

  it("memotong pesan panjang dan merapikan spasi", () => {
    const out = sanitizeMessage(`  ${"a".repeat(600)}  `, 10);
    assert.equal(out.length, 10);
    assert.ok(out.endsWith("…"));
  });

  it("mengembalikan string kosong untuk bukan-string", () => {
    assert.equal(sanitizeMessage(null), "");
    assert.equal(sanitizeMessage(42), "");
  });
});

describe("sanitizeMeta", () => {
  it("menyamarkan kunci sensitif tanpa menghapus field-nya", () => {
    const out = sanitizeMeta({
      token: "abc123",
      apiKey: "kunci",
      clientIp: "203.0.113.1",
      userId: "uid-1",
      endpoint: "https://push.test/xyz",
      status: 429,
    });
    assert.equal(out.token, "[disamarkan]");
    assert.equal(out.apiKey, "[disamarkan]");
    assert.equal(out.clientIp, "[disamarkan]");
    assert.equal(out.userId, "[disamarkan]");
    assert.equal(out.endpoint, "[disamarkan]");
    assert.equal(out.status, 429);
  });

  it("TIDAK menyamarkan kunci sah yang mengandung 'ip'/'key' di tengah kata", () => {
    const out = sanitizeMeta({
      skipReason: "seed-only",
      principal: "cron",
      monkey: "test",
      publicKey: "kunci-publik",
    });
    assert.equal(out.skipReason, "seed-only");
    assert.equal(out.principal, "cron");
    assert.equal(out.monkey, "test");
    assert.equal(out.publicKey, "kunci-publik");
  });

  it("mengganti nilai kompleks dengan penanda dan membatasi kunci", () => {
    const meta = { nested: { a: 1 }, list: [1, 2] };
    for (let i = 0; i < 15; i += 1) meta[`k${i}`] = i;
    const out = sanitizeMeta(meta);
    assert.equal(out.nested, "[nilai-kompleks]");
    assert.equal(out.list, "[nilai-kompleks]");
    assert.ok(Object.keys(out).length <= 10);
  });

  it("mengembalikan objek kosong untuk bukan-objek", () => {
    assert.deepEqual(sanitizeMeta(null), {});
    assert.deepEqual(sanitizeMeta("teks"), {});
    assert.deepEqual(sanitizeMeta([1]), {});
  });
});

describe("emitObservabilityEvent", () => {
  let warned;
  let warnAsli;
  beforeEach(() => {
    resetObservabilityForTests();
    warned = [];
    warnAsli = console.warn;
    console.warn = (...args) => {
      warned.push(args.join(" "));
    };
  });
  afterEach(() => {
    console.warn = warnAsli;
    resetObservabilityForTests();
  });

  it("menerbitkan event terstruktur satu baris JSON", () => {
    const event = emitObservabilityEvent({
      code: OBS_CODES.MARKER_READ_FAILED,
      component: "companies",
      message: "baca marker gagal",
      meta: { status: 429 },
      nowMs: 1000000,
    });
    assert.equal(event.code, "MARKER_READ_FAILED");
    assert.equal(event.level, "warn");
    assert.equal(event.component, "companies");
    assert.equal(event.meta.status, 429);
    assert.equal(warned.length, 1);
    assert.ok(warned[0].startsWith("[observability] "));
    const parsed = JSON.parse(warned[0].replace("[observability] ", ""));
    assert.equal(parsed.code, "MARKER_READ_FAILED");
  });

  it("throttle console: kode yang sama hanya 1 baris per menit", () => {
    emitObservabilityEvent({
      code: OBS_CODES.REFILL_FAILED_SEED_FALLBACK,
      message: "a",
      nowMs: 1000000,
    });
    emitObservabilityEvent({
      code: OBS_CODES.REFILL_FAILED_SEED_FALLBACK,
      message: "b",
      nowMs: 1000000 + 30000,
    });
    assert.equal(warned.length, 1);
    emitObservabilityEvent({
      code: OBS_CODES.REFILL_FAILED_SEED_FALLBACK,
      message: "c",
      nowMs: 1000000 + OBS_CONSOLE_THROTTLE_MS,
    });
    assert.equal(warned.length, 2);
  });

  it("kode berbeda tidak saling men-throttle", () => {
    emitObservabilityEvent({ code: "KODE_A", message: "a", nowMs: 1000000 });
    emitObservabilityEvent({ code: "KODE_B", message: "b", nowMs: 1000000 });
    assert.equal(warned.length, 2);
  });

  it("sink menerima SEMUA kejadian walau console di-throttle", () => {
    const received = [];
    registerObservabilitySink((event) => received.push(event));
    emitObservabilityEvent({ code: "KODE_A", message: "a", nowMs: 1000000 });
    emitObservabilityEvent({ code: "KODE_A", message: "b", nowMs: 1001000 });
    assert.equal(received.length, 2);
    assert.equal(warned.length, 1);
  });

  it("sink yang melempar tidak merusak emit", () => {
    registerObservabilitySink(() => {
      throw new Error("sink rusak");
    });
    const event = emitObservabilityEvent({
      code: "KODE_A",
      message: "a",
      nowMs: 1000000,
    });
    assert.equal(event.code, "KODE_A");
    assert.equal(warned.length, 1);
  });

  it("membersihkan pesan dan meta sebelum diterbitkan", () => {
    const received = [];
    registerObservabilitySink((event) => received.push(event));
    emitObservabilityEvent({
      code: "KODE_A",
      message: "hubungi admin@contoh.id",
      meta: { token: "rahasia", status: 500 },
      nowMs: 1000000,
    });
    assert.ok(!received[0].message.includes("admin@contoh.id"));
    assert.equal(received[0].meta.token, "[disamarkan]");
    assert.equal(received[0].meta.status, 500);
  });
});
