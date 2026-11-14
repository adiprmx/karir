/* Tes unit untuk lib/analytics-server.js, memakai test runner bawaan Node.
 * Dijalankan dengan: npm test
 * Yang dites: validasi event, pembersihan teks pencarian, hashing IP
 * harian, rate limit, tulis event (mock fetch), token service account,
 * pembersihan retensi (mock fetch), dan kontrak rules-vs-kode.
 * IP mentah tidak pernah muncul di output fungsi apa pun. Tidak ada
 * panggilan jaringan live di file ini: semua fetch di-mock. */
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import {
  EVENT_TYPES,
  ANALYTICS_RETENTION_DAYS,
  CLEANUP_MAX_DELETE,
  validateEvent,
  sanitizeQuery,
  hashVisitor,
  todayJakarta,
  createRateLimiter,
  buildFirestoreFields,
  getServiceAccountAccessToken,
  resetServiceAccountTokenCache,
  writeAnalyticsEvent,
  cleanupOldEvents,
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

  it("kesembilan type sah diterima", () => {
    assert.equal(EVENT_TYPES.length, 9);
    for (const type of EVENT_TYPES) {
      assert.equal(validateEvent({ type, path: "/" }).ok, true);
    }
  });

  it("type baru ANALITIK-12 ada di daftar", () => {
    for (const type of ["onboarding", "report", "channel_copy"]) {
      assert.equal(EVENT_TYPES.includes(type), true);
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

  it("uid dari body klien diabaikan, hanya uid terverifikasi dipakai (SEC-07)", () => {
    /* Klien lama masih mengirim uid di body: event tetap lolos,
     * tapi uid-nya dibuang — nilainya tidak pernah dipercaya. */
    const fromBody = validateEvent(validEvent({ uid: "u123" }));
    assert.equal(fromBody.ok, true);
    assert.equal("uid" in fromBody.event, false);
    const forged = validateEvent(validEvent({ uid: "uid-korban" }));
    assert.equal("uid" in forged.event, false);
    /* UID hanya masuk lewat argumen kedua (diisi route dari ID
     * token Firebase yang sudah diverifikasi). */
    const verified = validateEvent(validEvent(), "u123");
    assert.equal(verified.ok, true);
    assert.equal(verified.event.uid, "u123");
    assert.equal(validateEvent(validEvent(), "a".repeat(128)).ok, true);
    assert.equal(validateEvent(validEvent(), "a".repeat(129)).ok, false);
    assert.equal(validateEvent(validEvent(), 42).ok, false);
    assert.equal(validateEvent(validEvent(), "").ok, false);
  });

  it("results wajib int 0-10000 (ANALITIK-03)", () => {
    assert.equal(
      validateEvent({ type: "search", path: "/cari", q: "gudang", results: 0 }).ok,
      true,
    );
    assert.equal(
      validateEvent({ type: "search", path: "/cari", q: "gudang", results: 610 }).ok,
      true,
    );
    assert.equal(
      validateEvent({ type: "search", path: "/cari", results: -1 }).ok,
      false,
    );
    assert.equal(
      validateEvent({ type: "search", path: "/cari", results: 10001 }).ok,
      false,
    );
    assert.equal(
      validateEvent({ type: "search", path: "/cari", results: 1.5 }).ok,
      false,
    );
    assert.equal(
      validateEvent({ type: "search", path: "/cari", results: "3" }).ok,
      false,
    );
    const { event } = validateEvent({
      type: "search",
      path: "/cari",
      q: "gudang",
      results: 0,
    });
    assert.equal(event.results, 0);
  });

  it("filter wajib string maks 100 karakter (ANALITIK-04)", () => {
    const value = "kategori:Logistik|status:Ada lowongan";
    const { ok, event } = validateEvent({
      type: "filter",
      path: "/cari",
      filter: value,
    });
    assert.equal(ok, true);
    assert.equal(event.filter, value);
    assert.equal(
      validateEvent({ type: "filter", path: "/cari", filter: "a".repeat(101) }).ok,
      false,
    );
    assert.equal(
      validateEvent({ type: "filter", path: "/cari", filter: 42 }).ok,
      false,
    );
  });

  it("kontrak klien-server portal_click: Number dari path lolos, string ditolak (ANALITIK-01)", () => {
    /* Bentuk yang dikirim klien setelah perbaikan: nomor diambil
     * dari path /perusahaan/<no> lalu diubah ke angka. */
    const path = "/perusahaan/299";
    const m = path.match(/^\/perusahaan\/([^/]+)$/);
    const fixed = validateEvent({
      type: "portal_click",
      path,
      companyNo: Number(m[1]),
      action: "portal",
    });
    assert.equal(fixed.ok, true);
    assert.equal(fixed.event.companyNo, 299);
    assert.equal(fixed.event.action, "portal");
    /* Bentuk lama (string mentah dari match) tetap ditolak server:
     * validasi server tidak dilonggarkan, klien yang diperbaiki. */
    assert.equal(
      validateEvent({ type: "portal_click", path, companyNo: m[1] }).ok,
      false,
    );
    /* Kanal WA/email memakai action yang sama dan lolos. */
    for (const channel of ["wa", "email"]) {
      assert.equal(
        validateEvent({ type: "portal_click", path, companyNo: 299, action: channel }).ok,
        true,
      );
    }
  });

  it("body bukan objek ditolak", () => {
    assert.equal(validateEvent(null).ok, false);
    assert.equal(validateEvent("pageview").ok, false);
    assert.equal(validateEvent([]).ok, false);
  });
});

describe("hashVisitor", () => {
  /* hashVisitor tidak punya garam default: test memasang salt uji di
   * env, lalu mengembalikannya seperti semula. */
  const SALT_UJI = "garam-uji-analytics-bukan-rahasia";
  let saltLama;
  before(() => {
    saltLama = process.env.ANALYTICS_SALT;
    process.env.ANALYTICS_SALT = SALT_UJI;
  });
  after(() => {
    if (saltLama === undefined) delete process.env.ANALYTICS_SALT;
    else process.env.ANALYTICS_SALT = saltLama;
  });

  it("tanpa garam, hashVisitor melempar (tidak memakai default lemah)", () => {
    delete process.env.ANALYTICS_SALT;
    try {
      assert.throws(
        () => hashVisitor("203.0.113.7", "2026-11-07"),
        /Variabel ANALYTICS_SALT belum dipasang/,
      );
    } finally {
      process.env.ANALYTICS_SALT = SALT_UJI;
    }
  });

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

  it("garam yang berbeda menghasilkan hash yang beda", () => {
    const a = hashVisitor("203.0.113.7", "2026-11-07", "garam-satu");
    const b = hashVisitor("203.0.113.7", "2026-11-07", "garam-dua");
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

describe("sanitizeQuery (ANALITIK-09)", () => {
  it("alamat email disamarkan", () => {
    const out = sanitizeQuery("hubungi saya di nama@contoh.com ya");
    assert.equal(out, "hubungi saya di [email] ya");
    assert.equal(out.includes("nama@contoh.com"), false);
  });

  it("nomor telepon disamarkan, angka pendek tidak", () => {
    assert.equal(sanitizeQuery("gudang 081234567890"), "gudang [telepon]");
    assert.equal(sanitizeQuery("hubungi 0812-3456-7890"), "hubungi [telepon]");
    assert.equal(sanitizeQuery("wa +62 812 3456 7890"), "wa [telepon]");
    assert.equal(sanitizeQuery("gudang 2026"), "gudang 2026");
    assert.equal(sanitizeQuery("lowongan 2 orang"), "lowongan 2 orang");
  });

  it("teks dipotong ke 100 karakter", () => {
    assert.equal(sanitizeQuery("a".repeat(150)).length, 100);
    assert.equal(sanitizeQuery("gudang").length, 6);
  });

  it("validateEvent menyimpan q versi bersih", () => {
    const { event } = validateEvent({
      type: "search",
      path: "/cari",
      q: "gudang nama@contoh.com 081234567890",
    });
    assert.equal(event.q, "gudang [email] [telepon]");
  });
});

describe("buildFirestoreFields (field baru)", () => {
  it("results dan filter ditulis bila ada", () => {
    const { fields } = buildFirestoreFields(
      { type: "search", path: "/cari", q: "gudang", results: 0 },
      "a".repeat(64),
      "2026-11-07",
      "2026-11-07T03:00:00.000Z",
    );
    assert.equal(fields.results.integerValue, "0");
    const filtered = buildFirestoreFields(
      {
        type: "filter",
        path: "/cari",
        filter: "kategori:Logistik|status:Ada lowongan",
      },
      "a".repeat(64),
      "2026-11-07",
      "2026-11-07T03:00:00.000Z",
    );
    assert.equal(
      filtered.fields.filter.stringValue,
      "kategori:Logistik|status:Ada lowongan",
    );
  });

  it("ts selalu timestampValue, bukan string (BE-02)", () => {
    const { fields } = buildFirestoreFields(
      { type: "pageview", path: "/" },
      "a".repeat(64),
      "2026-11-07",
      "2026-11-07T03:00:00.000Z",
    );
    assert.equal(fields.ts.timestampValue, "2026-11-07T03:00:00.000Z");
    assert.equal("stringValue" in fields.ts, false);
  });
});

/* Helper mock fetch: rute berdasarkan URL, catat panggilan. */
function mockFetch(routes) {
  const calls = [];
  const fn = async (url, options = {}) => {
    calls.push({ url, options });
    for (const [match, respond] of routes) {
      if (url.includes(match)) return respond(url, options);
    }
    throw new Error(`URL mock tidak dikenal: ${url}`);
  };
  fn.calls = calls;
  return fn;
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("token service account (mock fetch)", () => {
  let saLama;
  let privateKeyUji;
  before(() => {
    saLama = process.env.FIREBASE_SERVICE_ACCOUNT;
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    privateKeyUji = privateKey.export({ type: "pkcs8", format: "pem" });
  });
  after(() => {
    if (saLama === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
    else process.env.FIREBASE_SERVICE_ACCOUNT = saLama;
    resetServiceAccountTokenCache();
  });
  beforeEach(() => {
    resetServiceAccountTokenCache();
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
      client_email: "uji@proyek-uji.iam.gserviceaccount.com",
      private_key: privateKeyUji,
    });
  });
  afterEach(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    resetServiceAccountTokenCache();
  });

  it("tanpa SA di env, token null dan fetch tidak dipanggil", async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const fetchJanganPanggil = () => {
      throw new Error("fetch tidak boleh dipanggil");
    };
    assert.equal(
      await getServiceAccountAccessToken({ fetchImpl: fetchJanganPanggil }),
      null,
    );
  });

  it("SA JSON rusak → null", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = "{bukan-json";
    const fetchJanganPanggil = () => {
      throw new Error("fetch tidak boleh dipanggil");
    };
    assert.equal(
      await getServiceAccountAccessToken({ fetchImpl: fetchJanganPanggil }),
      null,
    );
  });

  it("token ditukar sekali lalu dipakai ulang dari cache", async () => {
    let tokenCalls = 0;
    const fetchMock = mockFetch([
      [
        "oauth2.googleapis.com/token",
        () => {
          tokenCalls++;
          return jsonResponse({ access_token: "tok-uji-1" });
        },
      ],
    ]);
    const nowMs = Date.now();
    assert.equal(
      await getServiceAccountAccessToken({ fetchImpl: fetchMock, nowMs }),
      "tok-uji-1",
    );
    assert.equal(
      await getServiceAccountAccessToken({ fetchImpl: fetchMock, nowMs }),
      "tok-uji-1",
    );
    assert.equal(tokenCalls, 1);
  });

  it("token endpoint 500 → null", async () => {
    const fetchMock = mockFetch([
      ["oauth2.googleapis.com/token", () => jsonResponse({}, 500)],
    ]);
    assert.equal(
      await getServiceAccountAccessToken({ fetchImpl: fetchMock }),
      null,
    );
  });
});

describe("writeAnalyticsEvent (mock fetch)", () => {
  let envLama;
  let privateKeyUji;
  before(() => {
    envLama = {
      project: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      sa: process.env.FIREBASE_SERVICE_ACCOUNT,
    };
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    privateKeyUji = privateKey.export({ type: "pkcs8", format: "pem" });
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "kunci-uji";
  });
  after(() => {
    for (const [key, value] of [
      ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", envLama.project],
      ["NEXT_PUBLIC_FIREBASE_API_KEY", envLama.apiKey],
      ["FIREBASE_SERVICE_ACCOUNT", envLama.sa],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetServiceAccountTokenCache();
  });
  beforeEach(() => {
    resetServiceAccountTokenCache();
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
      client_email: "uji@proyek-uji.iam.gserviceaccount.com",
      private_key: privateKeyUji,
    });
  });
  afterEach(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    resetServiceAccountTokenCache();
  });

  it("jalur SA: Bearer token, tanpa ?key=, ts timestamp (SEC-06/BE-02)", async () => {
    const fetchMock = mockFetch([
      [
        "oauth2.googleapis.com/token",
        () => jsonResponse({ access_token: "tok-uji-1" }),
      ],
      [
        "firestore.googleapis.com",
        () => jsonResponse({ name: "projects/proyek-uji/databases/(default)/documents/analytics_events/abc" }),
      ],
    ]);
    const ok = await writeAnalyticsEvent(
      { type: "pageview", path: "/" },
      "a".repeat(64),
      "2026-11-07",
      false,
      { fetchImpl: fetchMock },
    );
    assert.equal(ok, true);
    const tulis = fetchMock.calls.find((c) =>
      c.url.includes("firestore.googleapis.com"),
    );
    assert.ok(tulis);
    assert.equal(tulis.url.includes("?key="), false);
    assert.equal(tulis.options.headers.Authorization, "Bearer tok-uji-1");
    const body = JSON.parse(tulis.options.body);
    assert.ok(body.fields.ts.timestampValue);
    assert.equal(body.fields.type.stringValue, "pageview");
  });

  it("fallback API key bila SA tidak ada", async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const fetchMock = mockFetch([
      ["firestore.googleapis.com", () => jsonResponse({ name: "x" })],
    ]);
    const ok = await writeAnalyticsEvent(
      { type: "pageview", path: "/" },
      "a".repeat(64),
      "2026-11-07",
      false,
      { fetchImpl: fetchMock },
    );
    assert.equal(ok, true);
    assert.equal(fetchMock.calls.length, 1);
    assert.equal(fetchMock.calls[0].url.includes("?key=kunci-uji"), true);
    assert.equal(
      "Authorization" in fetchMock.calls[0].options.headers,
      false,
    );
  });

  it("tanpa projectId → false tanpa fetch", async () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    try {
      const fetchJanganPanggil = () => {
        throw new Error("fetch tidak boleh dipanggil");
      };
      assert.equal(
        await writeAnalyticsEvent(
          { type: "pageview", path: "/" },
          "a".repeat(64),
          "2026-11-07",
          false,
          { fetchImpl: fetchJanganPanggil },
        ),
        false,
      );
    } finally {
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
    }
  });

  it("Firestore 403 → false (dan dicatat ke log, ADM-05)", async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const fetchMock = mockFetch([
      ["firestore.googleapis.com", () => jsonResponse({}, 403)],
    ]);
    const warnLama = console.warn;
    let warned = "";
    console.warn = (msg) => {
      warned = String(msg);
    };
    try {
      assert.equal(
        await writeAnalyticsEvent(
          { type: "pageview", path: "/" },
          "a".repeat(64),
          "2026-11-07",
          false,
          { fetchImpl: fetchMock },
        ),
        false,
      );
    } finally {
      console.warn = warnLama;
    }
    assert.match(warned, /HTTP 403/);
  });
});

describe("cleanupOldEvents (ANALITIK-10, mock fetch)", () => {
  let envLama;
  let privateKeyUji;
  before(() => {
    envLama = {
      project: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      sa: process.env.FIREBASE_SERVICE_ACCOUNT,
    };
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    privateKeyUji = privateKey.export({ type: "pkcs8", format: "pem" });
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
      client_email: "uji@proyek-uji.iam.gserviceaccount.com",
      private_key: privateKeyUji,
    });
  });
  after(() => {
    for (const [key, value] of [
      ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", envLama.project],
      ["FIREBASE_SERVICE_ACCOUNT", envLama.sa],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetServiceAccountTokenCache();
  });
  beforeEach(() => {
    resetServiceAccountTokenCache();
  });

  function tokenRoute() {
    return [
      "oauth2.googleapis.com/token",
      () => jsonResponse({ access_token: "tok-uji-1" }),
    ];
  }

  it("retensi default 90 hari, batas hapus 200 (S8)", () => {
    assert.equal(ANALYTICS_RETENTION_DAYS, 90);
    assert.equal(CLEANUP_MAX_DELETE, 200);
  });

  it("hapus dokumen lama, kembalikan jumlah + cutoff + hasMore", async () => {
    const docs = [
      "projects/proyek-uji/databases/(default)/documents/analytics_events/lama1",
      "projects/proyek-uji/databases/(default)/documents/analytics_events/lama2",
    ];
    let queryBody;
    let batchBody;
    const fetchMock = mockFetch([
      tokenRoute(),
      [
        ":runQuery",
        (_url, options) => {
          queryBody = JSON.parse(options.body);
          return jsonResponse(docs.map((name) => ({ document: { name } })));
        },
      ],
      [
        ":batchWrite",
        (_url, options) => {
          batchBody = JSON.parse(options.body);
          return jsonResponse({});
        },
      ],
    ]);
    const result = await cleanupOldEvents({
      fetchImpl: fetchMock,
      now: new Date("2026-11-15T00:00:00.000Z"),
    });
    assert.equal(result.deleted, 2);
    assert.equal(result.cutoff, "2026-08-17T00:00:00.000Z");
    assert.equal(result.hasMore, false);
    assert.equal(
      queryBody.structuredQuery.from[0].collectionId,
      "analytics_events",
    );
    assert.equal(queryBody.structuredQuery.limit, 200);
    assert.equal(
      queryBody.structuredQuery.where.fieldFilter.value.timestampValue,
      "2026-08-17T00:00:00.000Z",
    );
    assert.deepEqual(batchBody.writes, [
      { delete: docs[0] },
      { delete: docs[1] },
    ]);
  });

  it("tidak ada dokumen lama → tidak ada batchWrite", async () => {
    const fetchMock = mockFetch([
      tokenRoute(),
      [":runQuery", () => jsonResponse([])],
      [
        ":batchWrite",
        () => {
          throw new Error("batchWrite tidak boleh dipanggil");
        },
      ],
    ]);
    const result = await cleanupOldEvents({
      fetchImpl: fetchMock,
      now: new Date("2026-11-15T00:00:00.000Z"),
    });
    assert.deepEqual(result, {
      deleted: 0,
      cutoff: "2026-08-17T00:00:00.000Z",
      hasMore: false,
    });
  });

  it("hasil penuh (== maxDelete) → hasMore true", async () => {
    const docs = [
      "projects/proyek-uji/databases/(default)/documents/analytics_events/a",
      "projects/proyek-uji/databases/(default)/documents/analytics_events/b",
    ];
    const fetchMock = mockFetch([
      tokenRoute(),
      [
        ":runQuery",
        () => jsonResponse(docs.map((name) => ({ document: { name } }))),
      ],
      [":batchWrite", () => jsonResponse({})],
    ]);
    const result = await cleanupOldEvents({
      fetchImpl: fetchMock,
      maxDelete: 2,
      now: new Date("2026-11-15T00:00:00.000Z"),
    });
    assert.equal(result.deleted, 2);
    assert.equal(result.hasMore, true);
  });

  it("tanpa SA → melempar (pembersihan batal, bukan diam)", async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    try {
      const fetchJanganPanggil = () => {
        throw new Error("fetch tidak boleh dipanggil");
      };
      await assert.rejects(
        cleanupOldEvents({
          fetchImpl: fetchJanganPanggil,
          now: new Date("2026-11-15T00:00:00.000Z"),
        }),
        /Token service account tidak tersedia/,
      );
    } finally {
      process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
        client_email: "uji@proyek-uji.iam.gserviceaccount.com",
        private_key: privateKeyUji,
      });
    }
  });

  it("runQuery 500 → melempar", async () => {
    const fetchMock = mockFetch([
      tokenRoute(),
      [":runQuery", () => jsonResponse({}, 500)],
    ]);
    await assert.rejects(
      cleanupOldEvents({
        fetchImpl: fetchMock,
        now: new Date("2026-11-15T00:00:00.000Z"),
      }),
      /Query event lama gagal: HTTP 500/,
    );
  });
});

describe("kontrak rules-vs-kode", () => {
  /* Test ini membaca web/firestore.rules dan memastikan aturan yang
   * diterbitkan koordinator selaras dengan kode: tanpa ini, BE-02
   * bisa terulang diam-diam (kode menulis satu bentuk, rules
   * menuntut bentuk lain). */
  const rules = readFileSync(
    new URL("../firestore.rules", import.meta.url),
    "utf8",
  );

  function block(startMarker, endMarker) {
    const start = rules.indexOf(startMarker);
    assert.notEqual(start, -1, `blok rules tidak ditemukan: ${startMarker}`);
    const end = endMarker ? rules.indexOf(endMarker, start) : rules.length;
    return rules.slice(start, end === -1 ? rules.length : end);
  }

  it("analytics_events: create langsung ditutup, baca admin dipertahankan (SEC-06)", () => {
    const analytics = block("match /analytics_events/{doc} {");
    assert.match(analytics, /allow create: if false;/);
    assert.match(analytics, /allow read, update, delete: if isAdmin\(\);/);
    assert.equal(analytics.includes("allow create: if request.resource"), false);
  });

  it("analytics_events: tidak ada lagi syarat ts string (BE-02)", () => {
    const analytics = block("match /analytics_events/{doc} {");
    assert.equal(analytics.includes("ts is string"), false);
  });

  it("reports: update admin-only hanya status + ditanganiPada, hapus dilarang (DUKUNG-02)", () => {
    const reports = block(
      "match /reports/{doc} {",
      "match /changes/{doc} {",
    );
    assert.match(reports, /allow update: if isAdmin\(\)/);
    assert.equal(
      reports.includes("hasOnly(['status', 'ditanganiPada'])"),
      true,
    );
    assert.equal(
      reports.includes("in ['baru', 'ditangani']"),
      true,
    );
    assert.match(reports, /allow delete: if false;/);
    assert.equal(reports.includes("allow update, delete: if false;"), false);
  });

  it("proteksi lain tidak tersentuh: isAdmin + marker T15 tetap ada", () => {
    assert.match(rules, /function isAdmin\(\)/);
    assert.equal(rules.includes("lastChange"), true);
    assert.equal(rules.includes("request.auth.token.admin == true"), true);
  });
});
