/* Test wiring gerbang rute API (QA-04): memastikan tiap rute memakai
 * gerbang yang benar — bukan hanya fungsi guard-nya yang teruji unit.
 * Handler rute Next.js diimpor langsung lewat loader test
 * (route-test-loader.mjs: alias `@/` + stub `next/server`) lalu
 * dipanggil dengan Request tiruan; semua fetch (Firestore REST,
 * JWKS Google) di-mock — tidak ada jaringan, tidak ada secret asli.
 *
 * Env dummy dipasang di sini, BUKAN dari .env: API_TOKEN_SECRET dan
 * ANALYTICS_SALT dummy supaya gerbang token + hash jalan; env
 * KV/Firebase DIHAPUS supaya limiter bersama memakai store memori
 * (deterministik, tanpa jaringan). Dijalankan dengan:
 *   node --test lib/api-routes.test.js
 * (koordinator menambahkan berkas ini ke skrip `npm test`.)
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { generateKeyPairSync, createSign } from "node:crypto";
import { resetSharedLimiter } from "./rate-limit.js";
import { revalidateCompanies } from "./companies.js";
import { revalidateChanges } from "./changes.js";
import { issueToken, TOKEN_MAX_AGE_SEC } from "./api-guard.js";

/* --- Env dummy (sebelum impor rute) --- */
process.env.API_TOKEN_SECRET = "secret-uji-t7-bukan-asli";
process.env.ANALYTICS_SALT = "garam-uji-t7-bukan-asli";
for (const key of [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
]) {
  delete process.env[key];
}

/* Loader `@/` + `next/server` harus terdaftar SEBELUM rute diimpor,
 * karena itu rute diimpor dinamis di bawah. */
register("./route-test-loader.mjs", import.meta.url);

const { GET: getCompanies } = await import("../app/api/companies/route.js");
const { GET: getCompanyByNo } = await import(
  "../app/api/companies/[no]/route.js"
);
const { GET: getStats } = await import("../app/api/stats/route.js");
const { GET: getIndex } = await import("../app/api/index/route.js");
const { GET: getToken } = await import("../app/api/token/route.js");
const { GET: getChanges } = await import("../app/api/changes/route.js");
const { GET: getLocale } = await import("../app/api/locale/route.js");
const { POST: postAnalytics } = await import(
  "../app/api/analytics/route.js"
);
const { POST: postCheckLink } = await import(
  "../app/api/admin/check-link/route.js"
);

/* --- Konstanta uji --- */
const ORIGIN = "https://karir.local";
const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const BOT_UA = "curl/8.5.0";
/* IP berbeda per kelompok test supaya ember batas laju tidak saling
 * mengganggu walau reset terlewat. */
const IP = {
  bot: "203.0.113.11",
  limit: "203.0.113.12",
  scope: "203.0.113.13",
  token: "203.0.113.14",
  changes: "203.0.113.15",
  company: "203.0.113.16",
  analytics: "203.0.113.17",
  misc: "203.0.113.18",
};

/* Request tiruan: url, headers (Headers asli), nextUrl (URL asli
 * dengan .searchParams), dan json() untuk POST. */
function fakeRequest({ url, ip, ua = BROWSER_UA, headers = {}, body } = {}) {
  return {
    url,
    headers: new Headers({
      "user-agent": ua,
      ...(ip ? { "x-real-ip": ip } : {}),
      ...headers,
    }),
    nextUrl: new URL(url),
    json: async () => {
      if (body === undefined) throw new Error("body kosong");
      return body;
    },
  };
}

function apiRequest(path, opts = {}) {
  return fakeRequest({ url: `${ORIGIN}${path}`, ...opts });
}

/* --- Dokumen Firestore tiruan (bentuk REST yang dibaca
 * docToCompany/docToChange — sama persis dengan mock
 * companies-dedup.test.js) --- */
function companyDoc(no, perusahaan, status, link_karir) {
  return {
    name: `projects/proyek-uji/databases/(default)/documents/companies/${no}`,
    fields: {
      no: { integerValue: String(no) },
      perusahaan: { stringValue: perusahaan },
      kategori: { stringValue: "Ritel" },
      link_karir: { stringValue: link_karir || "https://contoh.test/karir" },
      status: { stringValue: status },
      tanggal_cek: { stringValue: "2026-11-14" },
      catatan: { stringValue: "" },
      lokasi: { stringValue: "Depok" },
      posisi: { stringValue: "Staff Gudang" },
      batas_lamar: { stringValue: "" },
      email_hrd: { stringValue: "" },
      wa_hrd: { stringValue: "" },
      kontak_lain: { stringValue: "" },
    },
  };
}

const MARKER_DOC = {
  fields: {
    rev: { integerValue: "1" },
    updatedAt: { stringValue: "2026-11-15T00:00:00.000Z" },
    counterDay: { stringValue: "2026-11-15" },
    refillsToday: { integerValue: "0" },
    readsEstimate: { integerValue: "0" },
  },
};

const CHANGE_DOC = {
  name: "projects/proyek-uji/databases/(default)/documents/changes/abc123",
  fields: {
    companyNo: { integerValue: "1" },
    perusahaan: { stringValue: "Perusahaan Uji" },
    from: { stringValue: "Tidak dapat diverifikasi" },
    to: { stringValue: "Ada lowongan" },
    checkedAt: { stringValue: "2026-11-14" },
    createdAt: { stringValue: "2026-11-14T18:00:00.000Z" },
  },
};

/* Mode tiap sumber tiruan: "ok" | "404" | "429" | "throw". */
const modes = { marker: "ok", list: "ok", byId: "ok", changes: "ok" };
function resetModes() {
  modes.marker = "ok";
  modes.list = "ok";
  modes.byId = "ok";
  modes.changes = "ok";
}

function mockResponse({ ok, status, body }) {
  return {
    ok,
    status,
    headers: new Headers(),
    json: async () => body ?? {},
    text: async () => JSON.stringify(body ?? {}),
  };
}

function modeResponse(mode, okBody) {
  if (mode === "throw") throw new Error("jaringan putus (mock)");
  if (mode === "429") return mockResponse({ ok: false, status: 429 });
  if (mode === "404") return mockResponse({ ok: false, status: 404 });
  return mockResponse({ ok: true, status: 200, body: okBody });
}

/* Kunci RSA uji + JWT admin tiruan untuk jalur 200 check-link.
 * JWKS Google di-mock lewat fetch (lihat mock fetch di bawah). */
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const TEST_JWK = {
  ...publicKey.export({ format: "jwk" }),
  kid: "kunci-uji-t7",
  alg: "RS256",
  use: "sig",
};

function b64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function adminJwt({ admin = true, sub = "uid-admin-uji" } = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const header = b64urlJson({ alg: "RS256", kid: "kunci-uji-t7", typ: "JWT" });
  const payload = b64urlJson({
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    sub,
    admin,
    iat: nowSec - 10,
    exp: nowSec + 3600,
  });
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey, "base64url")}`;
}

/* Dokumen event analitik yang ditulis route (ditangkap dari mock
 * fetch, supaya test bisa menegaskan field uid yang tersimpan —
 * SEC-07). Dikosongkan tiap test di beforeEach. */
const writtenAnalytics = [];

/* --- Mock fetch global: Firestore REST + JWKS Google --- */
globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  const method = (options.method || "GET").toUpperCase();
  if (u.includes("service_accounts/v1/jwk")) {
    return mockResponse({ ok: true, status: 200, body: { keys: [TEST_JWK] } });
  }
  /* Tulis (PATCH marker, POST analytics/alerts): selalu berhasil —
   * semua tulis di jalur ini best-effort. Tulis event analitik
   * ditangkap supaya test SEC-07 bisa memeriksa field-nya. */
  if (method === "PATCH" || method === "POST") {
    if (u.includes("/analytics_events")) {
      try {
        writtenAnalytics.push(JSON.parse(options.body || "{}"));
      } catch {
        /* Body bukan JSON: abaikan, bukan urusan mock ini. */
      }
    }
    return mockResponse({ ok: true, status: 200, body: {} });
  }
  if (u.includes("/meta/lastChange")) {
    return modeResponse(modes.marker, MARKER_DOC);
  }
  if (u.includes("/companies?pageSize")) {
    return modeResponse(modes.list, {
      documents: [
        companyDoc(1, "Perusahaan Uji Satu", "Ada lowongan"),
        companyDoc(2, "Perusahaan Uji Dua", "Tidak ada lowongan"),
      ],
    });
  }
  const byId = u.match(/\/companies\/(\d+)\?/);
  if (byId) {
    const no = Number(byId[1]);
    /* Nomor 99999 memang tidak ada di data tiruan. */
    if (no === 99999) return mockResponse({ ok: false, status: 404 });
    /* Perusahaan no 1 memakai localhost supaya checkUrl gagal
     * tertutup TANPA DNS (isTargetAllowed menolak localhost
     * sinkron) — jalur 200 check-link jadi deterministik. */
    const link =
      no === 1 ? "http://localhost:9/karir" : "https://contoh.test/karir";
    return modeResponse(
      modes.byId,
      companyDoc(no, `Perusahaan Uji ${no}`, "Ada lowongan", link),
    );
  }
  if (u.includes("/changes?")) {
    return modeResponse(modes.changes, { documents: [CHANGE_DOC] });
  }
  return mockResponse({ ok: false, status: 404 });
};

beforeEach(() => {
  resetSharedLimiter();
  revalidateCompanies();
  revalidateChanges();
  resetModes();
  writtenAnalytics.length = 0;
  delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
});

/* --- Gerbang bot: 403 untuk UA otomatis di semua rute baca --- */
describe("gerbang bot (403)", () => {
  it("/api/companies menolak UA curl", async () => {
    const res = await getCompanies(
      apiRequest("/api/companies", { ip: IP.bot, ua: BOT_UA }),
    );
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "Permintaan otomatis ditolak.");
  });

  it("/api/stats menolak UA curl", async () => {
    const res = await getStats(
      apiRequest("/api/stats", { ip: IP.bot, ua: BOT_UA }),
    );
    assert.equal(res.status, 403);
  });

  it("/api/index menolak UA curl sebelum cek token", async () => {
    const res = await getIndex(
      apiRequest("/api/index", { ip: IP.bot, ua: BOT_UA }),
    );
    assert.equal(res.status, 403);
  });

  it("/api/token menolak UA curl", async () => {
    const res = await getToken(
      apiRequest("/api/token", {
        ip: IP.bot,
        ua: BOT_UA,
        headers: { referer: `${ORIGIN}/` },
      }),
    );
    assert.equal(res.status, 403);
  });

  it("/api/changes menolak UA curl (BE-10)", async () => {
    const res = await getChanges(
      apiRequest("/api/changes", { ip: IP.bot, ua: BOT_UA }),
    );
    assert.equal(res.status, 403);
  });

  it("/api/companies/[no] menolak UA curl", async () => {
    const res = await getCompanyByNo(
      apiRequest("/api/companies/1", { ip: IP.bot, ua: BOT_UA }),
      { params: Promise.resolve({ no: "1" }) },
    );
    assert.equal(res.status, 403);
  });

  it("/api/analytics TIDAK menolak UA bot (disengaja: alat ukur, ditandai uaFlag)", async () => {
    const res = await postAnalytics(
      apiRequest("/api/analytics", {
        ip: IP.bot,
        ua: BOT_UA,
        body: { type: "pageview", path: "/cari" },
      }),
    );
    assert.equal(res.status, 202);
  });
});

/* --- Batas laju per rute + cakupan ember (BE-03) --- */
describe("batas laju dan cakupan ember", () => {
  it("/api/companies: 60 lolos, ke-61 ditolak 429", async () => {
    for (let i = 0; i < 60; i++) {
      const res = await getCompanies(
        apiRequest("/api/companies", { ip: IP.limit }),
      );
      assert.equal(res.status, 200);
    }
    const res = await getCompanies(
      apiRequest("/api/companies", { ip: IP.limit }),
    );
    assert.equal(res.status, 429);
    assert.match((await res.json()).error, /Terlalu banyak permintaan/);
  });

  it("/api/changes: 60 lolos, ke-61 ditolak 429 (BE-10)", async () => {
    for (let i = 0; i < 60; i++) {
      const res = await getChanges(
        apiRequest("/api/changes", { ip: IP.limit }),
      );
      assert.equal(res.status, 200);
    }
    const res = await getChanges(apiRequest("/api/changes", { ip: IP.limit }));
    assert.equal(res.status, 429);
  });

  it("/api/token: 60 lolos, ke-61 ditolak 429 (BE-11)", async () => {
    for (let i = 0; i < 60; i++) {
      const res = await getToken(
        apiRequest("/api/token", {
          ip: IP.limit,
          headers: { referer: `${ORIGIN}/` },
        }),
      );
      assert.equal(res.status, 200);
    }
    const res = await getToken(
      apiRequest("/api/token", {
        ip: IP.limit,
        headers: { referer: `${ORIGIN}/` },
      }),
    );
    assert.equal(res.status, 429);
  });

  it("ember penuh di satu rute TIDAK mengunci rute lain (BE-03)", async () => {
    /* Penuhi ember /api/companies untuk satu pengunjung. */
    for (let i = 0; i < 60; i++) {
      await getCompanies(apiRequest("/api/companies", { ip: IP.scope }));
    }
    assert.equal(
      (await getCompanies(apiRequest("/api/companies", { ip: IP.scope })))
        .status,
      429,
    );
    /* Rute lain untuk pengunjung yang SAMA masih terbuka. */
    assert.equal(
      (await getStats(apiRequest("/api/stats", { ip: IP.scope }))).status,
      200,
    );
    assert.equal(
      (
        await getChanges(apiRequest("/api/changes", { ip: IP.scope }))
      ).status,
      200,
    );
    assert.equal(
      (
        await getCompanyByNo(
          apiRequest("/api/companies/1", { ip: IP.scope }),
          { params: Promise.resolve({ no: "1" }) },
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await getToken(
          apiRequest("/api/token", {
            ip: IP.scope,
            headers: { referer: `${ORIGIN}/` },
          }),
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await postAnalytics(
          apiRequest("/api/analytics", {
            ip: IP.scope,
            body: { type: "pageview", path: "/cari" },
          }),
        )
      ).status,
      202,
    );
    /* /api/index juga terbuka (dengan token valid). */
    const token = issueToken(process.env.API_TOKEN_SECRET);
    assert.equal(
      (
        await getIndex(
          apiRequest("/api/index", {
            ip: IP.scope,
            headers: { authorization: `Bearer ${token}` },
          }),
        )
      ).status,
      200,
    );
  });

  it("/api/companies/[no] memakai limiter BERSAMA (BE-07): reset limiter membuka lagi", async () => {
    for (let i = 0; i < 60; i++) {
      const res = await getCompanyByNo(
        apiRequest("/api/companies/1", { ip: IP.company }),
        { params: Promise.resolve({ no: "1" }) },
      );
      assert.equal(res.status, 200);
    }
    assert.equal(
      (
        await getCompanyByNo(
          apiRequest("/api/companies/1", { ip: IP.company }),
          { params: Promise.resolve({ no: "1" }) },
        )
      ).status,
      429,
    );
    /* Limiter Map lokal per rute TIDAK akan terpengaruh reset ini;
     * limiter bersama terpengaruh — ini yang membuktikan BE-07. */
    resetSharedLimiter();
    assert.equal(
      (
        await getCompanyByNo(
          apiRequest("/api/companies/1", { ip: IP.company }),
          { params: Promise.resolve({ no: "1" }) },
        )
      ).status,
      200,
    );
  });
});

/* --- /api/token + /api/index --- */
describe("/api/token dan /api/index", () => {
  it("/api/token tanpa Referer/Origin situs sendiri dijawab 403", async () => {
    const res = await getToken(apiRequest("/api/token", { ip: IP.token }));
    assert.equal(res.status, 403);
    assert.equal(
      (await res.json()).error,
      "Token hanya diberikan untuk situs ini.",
    );
  });

  it("/api/token mengembalikan token + expiresIn (BE-12)", async () => {
    const res = await getToken(
      apiRequest("/api/token", {
        ip: IP.token,
        headers: { referer: `${ORIGIN}/cari` },
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.token, "string");
    assert.equal(body.expiresIn, TOKEN_MAX_AGE_SEC);
    assert.equal(body.expiresIn, 60);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  });

  it("/api/index tanpa token dijawab 401", async () => {
    const res = await getIndex(apiRequest("/api/index", { ip: IP.misc }));
    assert.equal(res.status, 401);
  });

  it("/api/index dengan token dari /api/token dijawab 200", async () => {
    const tokenRes = await getToken(
      apiRequest("/api/token", {
        ip: IP.token,
        headers: { referer: `${ORIGIN}/` },
      }),
    );
    const { token } = await tokenRes.json();
    const res = await getIndex(
      apiRequest("/api/index", {
        ip: IP.token,
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, "live");
    assert.equal(body.companies.length, 2);
  });
});

/* --- /api/changes: degradasi anggun (BE-14) --- */
describe("/api/changes degradasi (BE-14)", () => {
  it("Firestore sehat: 200 + changes + degraded false", async () => {
    const res = await getChanges(
      apiRequest("/api/changes", { ip: IP.changes }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.degraded, false);
    assert.equal(body.changes.length, 1);
    assert.equal(body.changes[0].perusahaan, "Perusahaan Uji");
  });

  it("Firestore 429: 200 + daftar kosong + degraded true (bukan 503, bukan kosong polos)", async () => {
    modes.changes = "429";
    const res = await getChanges(
      apiRequest("/api/changes", { ip: IP.changes }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { changes: [], degraded: true });
  });

  it("Firestore putus total: 200 + daftar kosong + degraded true", async () => {
    modes.changes = "throw";
    const res = await getChanges(
      apiRequest("/api/changes", { ip: IP.changes }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { changes: [], degraded: true });
  });
});

/* --- /api/locale: open redirect (SEC-04) --- */
describe("/api/locale (SEC-04)", () => {
  it("next=/\\evil.com TIDAK redirect keluar origin", async () => {
    const res = await getLocale(
      apiRequest("/api/locale?lang=id&next=/\\evil.com", { ip: IP.misc }),
    );
    const location = res.headers.get("location");
    assert.equal(new URL(location).origin, ORIGIN);
    assert.equal(new URL(location).pathname, "/");
  });

  it("next absolut https://evil.com diganti /", async () => {
    const res = await getLocale(
      apiRequest("/api/locale?lang=id&next=https%3A%2F%2Fevil.com%2Fx", {
        ip: IP.misc,
      }),
    );
    assert.equal(new URL(res.headers.get("location")).pathname, "/");
  });

  it("next=//evil.com diganti /", async () => {
    const res = await getLocale(
      apiRequest("/api/locale?lang=id&next=%2F%2Fevil.com", { ip: IP.misc }),
    );
    assert.equal(new URL(res.headers.get("location")).pathname, "/");
  });

  it("next=/%5cevil.com tetap di origin sendiri", async () => {
    const res = await getLocale(
      apiRequest("/api/locale?lang=id&next=%2F%5Cevil.com", { ip: IP.misc }),
    );
    assert.equal(new URL(res.headers.get("location")).origin, ORIGIN);
  });

  it("next jalur sendiri dipertahankan beserta query", async () => {
    const res = await getLocale(
      apiRequest("/api/locale?lang=en&next=/cari%3Fq%3Dgudang", {
        ip: IP.misc,
      }),
    );
    const location = new URL(res.headers.get("location"));
    assert.equal(location.origin, ORIGIN);
    assert.equal(location.pathname, "/cari");
    assert.equal(location.search, "?q=gudang");
    assert.match(res.headers.get("set-cookie"), /karir-locale=en/);
  });
});

/* --- /api/companies/[no] + seed-first (S3/S4, jangan rusak) --- */
describe("/api/companies/[no] dan seed-first", () => {
  it("no=1 live: 200 + source live", async () => {
    const res = await getCompanyByNo(
      apiRequest("/api/companies/1", { ip: IP.company }),
      { params: Promise.resolve({ no: "1" }) },
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.company.no, 1);
    assert.equal(body.source, "live");
    assert.equal(typeof body.seedDate, "string");
  });

  it("no=99999: 404", async () => {
    const res = await getCompanyByNo(
      apiRequest("/api/companies/99999", { ip: IP.company }),
      { params: Promise.resolve({ no: "99999" }) },
    );
    assert.equal(res.status, 404);
  });

  it("no tidak valid (abc): 404, bukan 500", async () => {
    const res = await getCompanyByNo(
      apiRequest("/api/companies/abc", { ip: IP.company }),
      { params: Promise.resolve({ no: "abc" }) },
    );
    assert.equal(res.status, 404);
  });

  it("Firestore putus: 200 dari seed (bukan 503)", async () => {
    modes.byId = "throw";
    const res = await getCompanyByNo(
      apiRequest("/api/companies/1", { ip: IP.company }),
      { params: Promise.resolve({ no: "1" }) },
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, "seed");
    assert.equal(body.company.no, 1);
  });

  it("/api/companies saat marker 429: 200 dari seed 610 baris (S4)", async () => {
    modes.marker = "429";
    const res = await getCompanies(
      apiRequest("/api/companies", { ip: IP.misc }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, "seed");
    assert.equal(body.total, 610);
  });

  it("/api/companies saat Firestore sehat: source live + 2 baris tiruan", async () => {
    const res = await getCompanies(
      apiRequest("/api/companies", { ip: IP.misc }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, "live");
    assert.equal(body.total, 2);
  });

  it("/api/stats saat marker 429: 200 dari seed", async () => {
    modes.marker = "429";
    const res = await getStats(apiRequest("/api/stats", { ip: IP.misc }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, "seed");
    assert.equal(body.total, 610);
  });
});

/* --- /api/analytics --- */

/* Env supaya writeAnalyticsEvent benar-benar mencoba menulis
 * (jalur fallback API key; service account tidak dipasang di test
 * ini). Dibersihkan lagi oleh beforeEach di atas. */
function withAnalyticsWriteEnv() {
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji-t7";
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "kunci-api-uji-bukan-asli";
}

describe("/api/analytics", () => {
  it("event valid dijawab 202 {ok:true}", async () => {
    const res = await postAnalytics(
      apiRequest("/api/analytics", {
        ip: IP.analytics,
        body: { type: "pageview", path: "/cari" },
      }),
    );
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it("event tidak valid dijawab 400", async () => {
    const res = await postAnalytics(
      apiRequest("/api/analytics", {
        ip: IP.analytics,
        body: { type: "tidak-ada", path: "/cari" },
      }),
    );
    assert.equal(res.status, 400);
  });

  it("body bukan JSON dijawab 400", async () => {
    const res = await postAnalytics(
      apiRequest("/api/analytics", { ip: IP.analytics }),
    );
    assert.equal(res.status, 400);
  });

  it("30/menit: ke-31 ditolak 429 dengan pesan seragam (BE-03/BE-13)", async () => {
    for (let i = 0; i < 30; i++) {
      const res = await postAnalytics(
        apiRequest("/api/analytics", {
          ip: IP.analytics,
          body: { type: "pageview", path: "/cari" },
        }),
      );
      assert.equal(res.status, 202);
    }
    const res = await postAnalytics(
      apiRequest("/api/analytics", {
        ip: IP.analytics,
        body: { type: "pageview", path: "/cari" },
      }),
    );
    assert.equal(res.status, 429);
    assert.equal(
      (await res.json()).error,
      "Terlalu banyak permintaan. Coba lagi sebentar.",
    );
  });

  it("idToken valid di body: uid terverifikasi tersimpan, token tidak disimpan (SEC-07)", async () => {
    withAnalyticsWriteEnv();
    const token = adminJwt({ admin: false, sub: "uid-pengguna-uji" });
    const res = await postAnalytics(
      apiRequest("/api/analytics", {
        ip: IP.analytics,
        body: { type: "pageview", path: "/cari", idToken: token },
      }),
    );
    assert.equal(res.status, 202);
    assert.equal(writtenAnalytics.length, 1);
    const fields = writtenAnalytics[0].fields;
    assert.equal(fields.uid.stringValue, "uid-pengguna-uji");
    assert.equal(
      JSON.stringify(writtenAnalytics[0]).includes(token),
      false,
    );
  });

  it("idToken tidak valid di body: tetap 202 sebagai tamu, tanpa uid", async () => {
    withAnalyticsWriteEnv();
    const res = await postAnalytics(
      apiRequest("/api/analytics", {
        ip: IP.analytics,
        body: { type: "pageview", path: "/cari", idToken: "bukan-jwt" },
      }),
    );
    assert.equal(res.status, 202);
    assert.equal(writtenAnalytics.length, 1);
    assert.equal("uid" in writtenAnalytics[0].fields, false);
  });

  it("token valid di header Authorization: uid terverifikasi tersimpan", async () => {
    withAnalyticsWriteEnv();
    const token = adminJwt({ admin: false, sub: "uid-header-uji" });
    const res = await postAnalytics(
      apiRequest("/api/analytics", {
        ip: IP.analytics,
        body: { type: "pageview", path: "/cari" },
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    assert.equal(res.status, 202);
    assert.equal(writtenAnalytics.length, 1);
    assert.equal(
      writtenAnalytics[0].fields.uid.stringValue,
      "uid-header-uji",
    );
  });

  it("uid dari body dibuang walau tanpa token (SEC-07)", async () => {
    withAnalyticsWriteEnv();
    const res = await postAnalytics(
      apiRequest("/api/analytics", {
        ip: IP.analytics,
        body: { type: "pageview", path: "/cari", uid: "uid-palsu" },
      }),
    );
    assert.equal(res.status, 202);
    assert.equal(writtenAnalytics.length, 1);
    assert.equal("uid" in writtenAnalytics[0].fields, false);
  });
});

/* --- /api/admin/check-link: auth-first + envelope 200 (BE-13) --- */
describe("/api/admin/check-link", () => {
  it("tanpa token admin: 401 (auth diperiksa paling awal)", async () => {
    const res = await postCheckLink(
      apiRequest("/api/admin/check-link", { ip: IP.misc, body: { no: 1 } }),
    );
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "Token tidak ada.");
  });

  it("token non-admin: 403", async () => {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji-t7";
    try {
      const res = await postCheckLink(
        apiRequest("/api/admin/check-link", {
          ip: IP.misc,
          body: { no: 1 },
          headers: { authorization: `Bearer ${adminJwt({ admin: false })}` },
        }),
      );
      assert.equal(res.status, 403);
    } finally {
      delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    }
  });

  it("token admin + portal mati: 200 tanpa field error, pakai detail (BE-13)", async () => {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji-t7";
    try {
      const res = await postCheckLink(
        apiRequest("/api/admin/check-link", {
          ip: IP.misc,
          body: { no: 1 },
          headers: { authorization: `Bearer ${adminJwt()}` },
        }),
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.equal(body.no, 1);
      assert.equal(body.detail, "Tidak bisa dihubungi.");
      assert.equal("error" in body, false);
    } finally {
      delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    }
  });

  it("token admin + nomor kosong: 400", async () => {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji-t7";
    try {
      const res = await postCheckLink(
        apiRequest("/api/admin/check-link", {
          ip: IP.misc,
          body: {},
          headers: { authorization: `Bearer ${adminJwt()}` },
        }),
      );
      assert.equal(res.status, 400);
    } finally {
      delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    }
  });
});
