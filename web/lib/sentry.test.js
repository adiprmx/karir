/* Test akses Sentry yang aman-gagal (P-06, K3).
 * Dijalankan dengan: node --test lib/sentry.test.js
 * Tanpa DSN dan tanpa SDK asli: semua jalur fail-safe dites dengan
 * implementasi tiruan yang disuntik (__setSentryImpl). */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CRON_MONITOR_SLUG,
  __resetSentryForTests,
  __setSentryImpl,
  checkInCron,
  cronMonitorConfig,
  flushSentry,
  isSentryConfigured,
  scrubSentryEvent,
  sentrySink,
} from "./sentry.js";

describe("isSentryConfigured", () => {
  it("benar hanya bila SENTRY_DSN terisi", () => {
    assert.equal(isSentryConfigured({}), false);
    assert.equal(isSentryConfigured({ SENTRY_DSN: "" }), false);
    assert.equal(
      isSentryConfigured({ SENTRY_DSN: "https://kunci@o0.ingest.sentry.io/1" }),
      true,
    );
  });
});

describe("sentrySink (fail-safe)", () => {
  beforeEach(() => {
    __resetSentryForTests();
    delete process.env.SENTRY_DSN;
  });
  afterEach(() => {
    __resetSentryForTests();
    delete process.env.SENTRY_DSN;
  });

  it("tanpa DSN: no-op diam, mengembalikan false", async () => {
    const sent = await sentrySink({
      code: "MARKER_READ_FAILED",
      component: "companies",
      message: "gagal",
      meta: {},
    });
    assert.equal(sent, false);
  });

  it("dengan SDK tiruan: captureException dipanggil sekali per kode per jam", async () => {
    const calls = [];
    __setSentryImpl({
      captureException: (err, opts) => calls.push({ err, opts }),
    });
    const event = {
      code: "MARKER_READ_FAILED",
      component: "companies",
      message: "baca marker gagal",
      meta: { status: 429, token: "rahasia" },
    };
    assert.equal(await sentrySink(event), true);
    assert.equal(await sentrySink(event), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].err.name, "ObservabilityError:MARKER_READ_FAILED");
    assert.equal(calls[0].opts.tags.observability_code, "MARKER_READ_FAILED");
    assert.equal(calls[0].opts.tags.component, "companies");
    assert.equal(calls[0].opts.extra.status, 429);
    assert.equal(calls[0].opts.extra.token, "[disamarkan]");
  });

  it("kode berbeda tidak saling men-dedup", async () => {
    let n = 0;
    __setSentryImpl({ captureException: () => { n += 1; } });
    await sentrySink({ code: "KODE_A", message: "a" });
    await sentrySink({ code: "KODE_B", message: "b" });
    assert.equal(n, 2);
  });

  it("SDK tiruan yang melempar tidak merusak sink", async () => {
    __setSentryImpl({
      captureException: () => {
        throw new Error("sdk rusak");
      },
    });
    assert.equal(
      await sentrySink({ code: "KODE_A", message: "a" }),
      false,
    );
  });

  it("event tanpa kode diabaikan", async () => {
    let n = 0;
    __setSentryImpl({ captureException: () => { n += 1; } });
    assert.equal(await sentrySink({ message: "tanpa kode" }), false);
    assert.equal(n, 0);
  });

  it("event level info (P-07) diabaikan — kabar rutin bukan exception", async () => {
    let n = 0;
    __setSentryImpl({ captureException: () => { n += 1; } });
    assert.equal(
      await sentrySink({
        code: "PUSH_DIGEST_PAGE",
        level: "info",
        component: "push",
        message: "Digest push: halaman 1 — 500 langganan dibaca.",
        meta: { page: 1 },
      }),
      false,
    );
    assert.equal(n, 0);
  });
});

describe("checkInCron", () => {
  beforeEach(() => {
    __resetSentryForTests();
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_CRON_MONITOR_SLUG;
  });
  afterEach(() => {
    __resetSentryForTests();
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_CRON_MONITOR_SLUG;
  });

  it("tanpa DSN: no-op, mengembalikan null", async () => {
    assert.equal(
      await checkInCron({ status: "in_progress", includeConfig: true }),
      null,
    );
  });

  it("status tidak dikenal ditolak", async () => {
    __setSentryImpl({ captureCheckIn: () => "id-1" });
    assert.equal(await checkInCron({ status: "selesai" }), null);
  });

  it("check-in awal menyertakan monitorConfig; check-in akhir memakai id", async () => {
    const calls = [];
    __setSentryImpl({
      captureCheckIn: (payload) => {
        calls.push(payload);
        return "checkin-123";
      },
    });
    const id = await checkInCron({
      status: "in_progress",
      includeConfig: true,
    });
    assert.equal(id, "checkin-123");
    assert.equal(calls[0].monitorSlug, DEFAULT_CRON_MONITOR_SLUG);
    assert.equal(calls[0].status, "in_progress");
    assert.deepEqual(calls[0].monitorConfig, cronMonitorConfig());
    const end = await checkInCron({ status: "ok", checkInId: id });
    assert.equal(end, "checkin-123");
    assert.equal(calls[1].checkInId, "checkin-123");
    assert.equal(calls[1].monitorConfig, undefined);
  });

  it("slug dari env dipakai bila ada", async () => {
    process.env.SENTRY_CRON_MONITOR_SLUG = "karir-recheck-uji";
    let seen;
    __setSentryImpl({
      captureCheckIn: (payload) => {
        seen = payload;
        return "id";
      },
    });
    await checkInCron({ status: "ok" });
    assert.equal(seen.monitorSlug, "karir-recheck-uji");
  });

  it("cronMonitorConfig: crontab 01:00 WIB dengan margin 15 menit", () => {
    const config = cronMonitorConfig();
    assert.deepEqual(config.schedule, {
      type: "crontab",
      value: "0 18 * * *",
    });
    assert.equal(config.checkinMargin, 15);
    assert.equal(config.maxRuntime, 5);
    assert.equal(config.timezone, "Asia/Jakarta");
  });

  it("flushSentry: tanpa DSN no-op; dengan SDK tiruan memanggil flush", async () => {
    await flushSentry(10);
    let flushedWith = null;
    __setSentryImpl({
      flush: async (ms) => {
        flushedWith = ms;
      },
    });
    await flushSentry(1234);
    assert.equal(flushedWith, 1234);
  });
});

describe("scrubSentryEvent", () => {
  it("menghapus user, header, dan cookie; menyamarkan kunci sensitif", () => {
    const event = {
      message: "gagal untuk admin@contoh.id",
      user: { id: "uid-1", email: "admin@contoh.id" },
      request: {
        url: "https://karir.local/api/stats",
        headers: { authorization: "Bearer x", "user-agent": "test" },
        cookies: { sesi: "abc" },
      },
      extra: {
        token: "rahasia",
        status: 500,
        nested: { password: "p", count: 2 },
      },
      tags: { component: "companies" },
    };
    const clean = scrubSentryEvent(event);
    assert.equal(clean.user, undefined);
    assert.equal(clean.request.headers, undefined);
    assert.equal(clean.request.cookies, undefined);
    assert.equal(clean.request.url, "https://karir.local/api/stats");
    assert.equal(clean.extra.token, "[disamarkan]");
    assert.equal(clean.extra.status, 500);
    assert.equal(clean.extra.nested.password, "[disamarkan]");
    assert.equal(clean.extra.nested.count, 2);
    assert.ok(!clean.message.includes("admin@contoh.id"));
    /* Event asli tidak diubah. */
    assert.equal(event.user.id, "uid-1");
    assert.equal(event.extra.token, "rahasia");
  });

  it("membersihkan breadcrumbs tanpa menghapus isinya yang sah", () => {
    const event = {
      breadcrumbs: [
        {
          message: "hubungi admin@contoh.id",
          data: { apiKey: "k", step: "load" },
        },
      ],
    };
    const clean = scrubSentryEvent(event);
    assert.ok(!clean.breadcrumbs[0].message.includes("admin@contoh.id"));
    assert.equal(clean.breadcrumbs[0].data.apiKey, "[disamarkan]");
    assert.equal(clean.breadcrumbs[0].data.step, "load");
  });

  it("mengembalikan event bukan-objek apa adanya", () => {
    assert.equal(scrubSentryEvent(null), null);
    assert.equal(scrubSentryEvent("teks"), "teks");
  });
});
