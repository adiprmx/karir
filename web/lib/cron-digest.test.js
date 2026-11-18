/* Test logika digest push mandiri (P-05), memakai test runner
 * bawaan Node. Dijalankan dengan:
 *   node --test lib/cron-digest.test.js
 *
 * Firestore di-mock lewat fetchImpl suntikan — tidak ada jaringan,
 * tidak ada Firestore live. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  alertDocToDigestAlert,
  listUnpushedAlertsToday,
  markAlertsPushed,
  wibDayUtcRange,
  DIGEST_QUERY_LIMIT,
} from "./cron-digest.js";

const FS_BASE =
  "https://firestore.googleapis.com/v1/projects/proyek-uji/databases/(default)/documents";
const TOKEN = "token-uji";

function mockResponse({ ok, status, body }) {
  return {
    ok,
    status,
    json: async () => body ?? {},
  };
}

function alertDoc(id, overrides = {}) {
  return {
    name: `${FS_BASE}/alerts/${id}`,
    fields: {
      type: { stringValue: "new-target" },
      companyNo: { integerValue: "7" },
      perusahaan: { stringValue: "Perusahaan Uji" },
      posisi: { stringValue: "Staff" },
      link: { stringValue: "https://contoh.test/karir" },
      createdAt: { stringValue: "2026-11-18T01:00:00.000Z" },
      sent: { booleanValue: false },
      ...overrides,
    },
  };
}

describe("wibDayUtcRange", () => {
  it("tanggal WIB -> rentang UTC 17:00 hari sebelum s.d. 17:00 hari itu", () => {
    assert.deepEqual(wibDayUtcRange("2026-11-18"), {
      startIso: "2026-11-17T17:00:00.000Z",
      endIso: "2026-11-18T17:00:00.000Z",
    });
  });

  it("pergantian tahun ditangani", () => {
    assert.deepEqual(wibDayUtcRange("2027-01-01"), {
      startIso: "2026-12-31T17:00:00.000Z",
      endIso: "2027-01-01T17:00:00.000Z",
    });
  });
});

describe("alertDocToDigestAlert", () => {
  it("memetakan field + id dari name", () => {
    const a = alertDocToDigestAlert(
      alertDoc("abc", {
        type: { stringValue: "deadline" },
        batasLamar: { stringValue: "2026-11-20" },
        daysLeft: { integerValue: "2" },
      }),
    );
    assert.equal(a.id, "abc");
    assert.equal(a.type, "deadline");
    assert.equal(a.companyNo, 7);
    assert.equal(a.batasLamar, "2026-11-20");
    assert.equal(a.daysLeft, 2);
    assert.equal(a.pushed, false);
  });

  it("pushed true terbaca; field hilang jadi default", () => {
    const a = alertDocToDigestAlert(
      alertDoc("x", { pushed: { booleanValue: true } }),
    );
    assert.equal(a.pushed, true);
    const kosong = alertDocToDigestAlert({ name: "a/b/c", fields: {} });
    assert.equal(kosong.id, "c");
    assert.equal(kosong.companyNo, 0);
    assert.equal(kosong.pushed, false);
    assert.equal(kosong.daysLeft, null);
  });
});

describe("listUnpushedAlertsToday", () => {
  it("hanya alert tipe digest yang belum pushed", async () => {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url: String(url), body: JSON.parse(options.body || "{}") });
      return mockResponse({
        ok: true,
        status: 200,
        body: [
          { document: alertDoc("baru-1") },
          {
            document: alertDoc("tenggat-1", {
              type: { stringValue: "deadline" },
              batasLamar: { stringValue: "2026-11-20" },
              daysLeft: { integerValue: "2" },
            }),
          },
          {
            document: alertDoc("sudah-1", {
              pushed: { booleanValue: true },
            }),
          },
          {
            document: alertDoc("kuota-1", {
              type: { stringValue: "quota" },
              companyNo: { integerValue: "0" },
            }),
          },
        ],
      });
    };
    const hasil = await listUnpushedAlertsToday({
      fsBase: FS_BASE,
      token: TOKEN,
      todayWib: "2026-11-18",
      fetchImpl,
    });
    assert.deepEqual(
      hasil.alerts.map((a) => a.id),
      ["baru-1", "tenggat-1"],
    );
    assert.equal(hasil.hasMore, false);
    assert.equal(hasil.totalToday, 4);
    /* Kueri memakai rentang WIB + batas 101 (pola C-07). */
    const q = calls[0].body.structuredQuery;
    assert.equal(q.from[0].collectionId, "alerts");
    assert.equal(q.limit, DIGEST_QUERY_LIMIT + 1);
    const filters = q.where.compositeFilter.filters;
    assert.equal(filters[0].fieldFilter.value.stringValue, "2026-11-17T17:00:00.000Z");
    assert.equal(filters[1].fieldFilter.value.stringValue, "2026-11-18T17:00:00.000Z");
    assert.ok(calls[0].url.endsWith("/documents:runQuery"));
  });

  it("lebih dari batas: hasMore true, hanya batas pertama dipakai", async () => {
    const docs = Array.from({ length: DIGEST_QUERY_LIMIT + 1 }, (_, i) => ({
      document: alertDoc(`a${i}`),
    }));
    const fetchImpl = async () =>
      mockResponse({ ok: true, status: 200, body: docs });
    const hasil = await listUnpushedAlertsToday({
      fsBase: FS_BASE,
      token: TOKEN,
      todayWib: "2026-11-18",
      fetchImpl,
    });
    assert.equal(hasil.alerts.length, DIGEST_QUERY_LIMIT);
    assert.equal(hasil.hasMore, true);
  });

  it("tidak ada alert: larik kosong, hasMore false", async () => {
    const fetchImpl = async () =>
      mockResponse({ ok: true, status: 200, body: [] });
    const hasil = await listUnpushedAlertsToday({
      fsBase: FS_BASE,
      token: TOKEN,
      todayWib: "2026-11-18",
      fetchImpl,
    });
    assert.deepEqual(hasil, { alerts: [], hasMore: false, totalToday: 0 });
  });

  it("kueri gagal (429): melempar", async () => {
    const fetchImpl = async () =>
      mockResponse({ ok: false, status: 429, body: {} });
    await assert.rejects(
      () =>
        listUnpushedAlertsToday({
          fsBase: FS_BASE,
          token: TOKEN,
          todayWib: "2026-11-18",
          fetchImpl,
        }),
      /HTTP 429/,
    );
  });
});

describe("markAlertsPushed", () => {
  it("menandai semua alert + hitungan benar", async () => {
    const patched = [];
    const fetchImpl = async (url, options = {}) => {
      patched.push({ url: String(url), body: JSON.parse(options.body || "{}") });
      return mockResponse({ ok: true, status: 200, body: {} });
    };
    const hasil = await markAlertsPushed({
      fsBase: FS_BASE,
      token: TOKEN,
      alertIds: ["a1", "a2"],
      fetchImpl,
      nowIso: "2026-11-18T01:30:00.000Z",
    });
    assert.deepEqual(hasil, { marked: 2, failed: 0 });
    assert.equal(patched.length, 2);
    assert.ok(patched[0].url.includes("/alerts/a1?"));
    assert.ok(patched[0].url.includes("updateMask.fieldPaths=pushed"));
    assert.equal(
      patched[0].body.fields.pushed.booleanValue,
      true,
    );
    assert.equal(
      patched[0].body.fields.pushedAt.stringValue,
      "2026-11-18T01:30:00.000Z",
    );
  });

  it("satu gagal: yang lain tetap ditandai, failed dihitung", async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes("/alerts/gagal")) {
        return mockResponse({ ok: false, status: 500, body: {} });
      }
      return mockResponse({ ok: true, status: 200, body: {} });
    };
    const hasil = await markAlertsPushed({
      fsBase: FS_BASE,
      token: TOKEN,
      alertIds: ["ok-1", "gagal", "ok-2"],
      fetchImpl,
    });
    assert.deepEqual(hasil, { marked: 2, failed: 1 });
  });

  it("daftar kosong: nol-nol tanpa panggilan", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return mockResponse({ ok: true, status: 200, body: {} });
    };
    const hasil = await markAlertsPushed({
      fsBase: FS_BASE,
      token: TOKEN,
      alertIds: [],
      fetchImpl,
    });
    assert.deepEqual(hasil, { marked: 0, failed: 0 });
    assert.equal(calls, 0);
  });
});
