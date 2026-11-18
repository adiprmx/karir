/* Tes rute observabilitas (P-06, K3/K8): /api/health (0 baca
 * Firestore, tanpa bocor secret) + /api/client-error (bentuk ketat,
 * batas laju, sanitasi).
 * Dijalankan dengan: node --test lib/observability-routes.test.js
 * Handler rute Next.js diimpor lewat loader test (alias `@/` + stub
 * `next/server`); semua fetch Firestore di-mock — tidak ada
 * jaringan, tidak ada secret asli. */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { resetSharedLimiter } from "./rate-limit.js";
import {
  getCompanies,
  revalidateCompanies,
} from "./companies.js";
import { resetHealthStateForTests, noteCronRun } from "./health-state.js";

/* --- Env dummy (sebelum impor rute) --- */
process.env.ANALYTICS_SALT = "garam-uji-p06-bukan-asli";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
const KUNCI_UJI = "kunci-uji";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = KUNCI_UJI;
for (const key of [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
]) {
  delete process.env[key];
}

register("./route-test-loader.mjs", import.meta.url);

const { GET: getHealth } = await import("../app/api/health/route.js");
const { POST: postClientError, urlPathOnly } = await import(
  "../app/api/client-error/route.js"
);

const ORIGIN = "https://karir.local";
const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const IP = {
  health: "203.0.113.41",
  healthLimit: "203.0.113.42",
  client: "203.0.113.43",
  clientLimit: "203.0.113.44",
};

function fakeGet(path, ip) {
  return {
    url: `${ORIGIN}${path}`,
    headers: new Headers({ "user-agent": BROWSER_UA, "x-real-ip": ip }),
    nextUrl: new URL(`${ORIGIN}${path}`),
  };
}

function fakePost(path, ip, rawBody) {
  return {
    url: `${ORIGIN}${path}`,
    headers: new Headers({
      "user-agent": BROWSER_UA,
      "x-real-ip": ip,
      "content-type": "application/json",
    }),
    nextUrl: new URL(`${ORIGIN}${path}`),
    text: async () => rawBody,
  };
}

/* Mock fetch Firestore: marker + daftar sehat; hitungan panggilan
 * dipakai membuktikan /api/health 0 baca. */
let fetchCalls = 0;
const fetchAsli = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  fetchCalls += 1;
  const u = String(url);
  const method = (options.method || "GET").toUpperCase();
  if (method === "PATCH" || method === "POST") {
    return { ok: true, status: 200, json: async () => ({}) };
  }
  if (u.includes("meta/lastChange")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        fields: {
          rev: { integerValue: "7" },
          updatedAt: { stringValue: "2026-11-18T00:00:00.000Z" },
          counterDay: { stringValue: "2026-11-18" },
          refillsToday: { integerValue: "0" },
          readsEstimate: { integerValue: "0" },
        },
      }),
    };
  }
  if (u.includes("/companies")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        documents: [
          {
            name: "x/companies/1",
            fields: {
              no: { integerValue: "1" },
              perusahaan: { stringValue: "PT Uji" },
              kategori: { stringValue: "Ritel" },
              link_karir: { stringValue: "https://contoh.test/karir" },
              status: { stringValue: "Ada lowongan" },
              tanggal_cek: { stringValue: "" },
              catatan: { stringValue: "" },
              lokasi: { stringValue: "Bogor" },
              posisi: { stringValue: "Staff" },
              batas_lamar: { stringValue: "" },
            },
          },
        ],
      }),
    };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

let kejadian;
let warnAsli;
beforeEach(async () => {
  resetSharedLimiter();
  revalidateCompanies();
  resetHealthStateForTests();
  fetchCalls = 0;
  const obs = await import("./observability.js");
  obs.resetObservabilityForTests();
  kejadian = [];
  obs.registerObservabilitySink((event) => kejadian.push(event));
  warnAsli = console.warn;
  console.warn = () => {};
});
afterEach(async () => {
  console.warn = warnAsli;
  globalThis.fetch = globalThis.fetch; // mock tetap terpasang
  const obs = await import("./observability.js");
  obs.resetObservabilityForTests();
});

describe("GET /api/health (P-06/K8)", () => {
  it("instance dingin: 0 fetch, source seed, ok false, degraded true", async () => {
    const res = await getHealth(fakeGet("/api/health", IP.health));
    assert.equal(res.status, 200);
    assert.equal(fetchCalls, 0);
    const body = await res.json();
    assert.equal(body.source, "seed");
    assert.equal(body.ok, false);
    assert.equal(body.degraded, true);
    assert.equal(body.cacheWarm, false);
    assert.equal(body.liveAsOf, null);
    assert.equal(body.seedModeMinutes, 0);
    assert.equal(body.lastCronRun, null);
    assert.equal(typeof body.uptimeMs, "number");
    assert.ok(body.uptimeMs >= 0);
  });

  it("sesudah cache hangat: source live, ok true, rev + liveAsOf terisi", async () => {
    await getCompanies();
    fetchCalls = 0;
    noteCronRun({
      date: "2026-11-18",
      status: "ok",
      trigger: "github-actions",
      finishedAt: "2026-11-18T01:01:00.000Z",
    });
    const res = await getHealth(fakeGet("/api/health", IP.health));
    assert.equal(res.status, 200);
    assert.equal(fetchCalls, 0);
    const body = await res.json();
    assert.equal(body.source, "live");
    assert.equal(body.ok, true);
    assert.equal(body.degraded, false);
    assert.equal(body.rev, 7);
    assert.equal(body.cacheWarm, true);
    assert.ok(body.liveAsOf);
    assert.equal(body.readsEstimate, 1);
    assert.equal(body.quotaPercent, 0);
    assert.equal(body.lastCronRun.status, "ok");
    assert.equal(body.lastCronRun.trigger, "github-actions");
    assert.ok(body.cacheAgeMs >= 0);
    assert.equal(body.rateLimitDegraded, false);
  });

  it("respons tidak memuat secret/UID/email", async () => {
    await getCompanies();
    const res = await getHealth(fakeGet("/api/health", IP.health));
    const body = await res.json();
    const teks = JSON.stringify(body);
    assert.ok(!teks.includes("garam-uji"));
    assert.ok(!teks.includes("kunci-uji"));
    assert.ok(!teks.includes("@"));
    assert.ok(!teks.includes("ANALYTICS_SALT"));
    assert.ok(!teks.includes("FIREBASE"));
  });

  it("header Cache-Control 60 detik", async () => {
    const res = await getHealth(fakeGet("/api/health", IP.health));
    assert.equal(
      res.headers.get("Cache-Control"),
      "public, max-age=60, s-maxage=60",
    );
  });

  it("UA curl TIDAK ditolak (monitor otomatis diizinkan)", async () => {
    const req = fakeGet("/api/health", IP.health);
    req.headers = new Headers({
      "user-agent": "curl/8.5.0",
      "x-real-ip": IP.health,
    });
    const res = await getHealth(req);
    assert.equal(res.status, 200);
  });

  it("batas laju: 60 lolos, ke-61 ditolak 429", async () => {
    let terakhir;
    for (let i = 0; i < 61; i += 1) {
      terakhir = await getHealth(fakeGet("/api/health", IP.healthLimit));
    }
    assert.equal(terakhir.status, 429);
    assert.equal((await terakhir.json()).error.includes("Terlalu banyak"), true);
  });
});

describe("POST /api/client-error (P-06/K3)", () => {
  it("laporan valid -> 200 + CLIENT_ERROR tercatat (email disamarkan)", async () => {
    const res = await postClientError(
      fakePost(
        "/api/client-error",
        IP.client,
        JSON.stringify({
          message: "Gagal memuat hubungi admin@contoh.id",
          url: "https://karir-adiprmx.vercel.app/cari?q=x&token=rahasia",
          lineno: 12,
          colno: 3,
        }),
      ),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    const ev = kejadian.filter((e) => e.code === "CLIENT_ERROR");
    assert.equal(ev.length, 1);
    assert.ok(!ev[0].message.includes("admin@contoh.id"));
    assert.ok(ev[0].message.includes("[email]"));
    /* Hanya path yang tercatat — query (token) dibuang. */
    assert.equal(ev[0].meta.path, "/cari");
    assert.equal(ev[0].meta.lineno, 12);
    assert.equal(ev[0].meta.colno, 3);
  });

  it("body bukan JSON -> 400, tanpa kejadian", async () => {
    const res = await postClientError(
      fakePost("/api/client-error", IP.client, "bukan-json{"),
    );
    assert.equal(res.status, 400);
    assert.equal(kejadian.length, 0);
  });

  it("tanpa message -> 400, tanpa kejadian", async () => {
    const res = await postClientError(
      fakePost("/api/client-error", IP.client, JSON.stringify({ url: "/" })),
    );
    assert.equal(res.status, 400);
    assert.equal(kejadian.length, 0);
  });

  it("body > 4 KiB -> 413", async () => {
    const res = await postClientError(
      fakePost(
        "/api/client-error",
        IP.client,
        JSON.stringify({ message: "x".repeat(5000) }),
      ),
    );
    assert.equal(res.status, 413);
    assert.equal(kejadian.length, 0);
  });

  it("pesan dipotong 500 karakter", async () => {
    const res = await postClientError(
      fakePost(
        "/api/client-error",
        IP.client,
        JSON.stringify({ message: "y".repeat(600) }),
      ),
    );
    assert.equal(res.status, 200);
    const ev = kejadian.filter((e) => e.code === "CLIENT_ERROR");
    assert.equal(ev.length, 1);
    assert.equal(ev[0].message.length, 500);
  });

  it("body JSON array/null -> 400 'Body harus objek JSON'", async () => {
    for (const raw of ["[1,2]", "null", "\"teks\"", "123"]) {
      const res = await postClientError(
        fakePost("/api/client-error", IP.client, raw),
      );
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), {
        error: "Body harus objek JSON.",
      });
    }
    assert.equal(kejadian.length, 0);
  });

  it("request.text() gagal -> 400 'Body tidak bisa dibaca'", async () => {
    const req = fakePost("/api/client-error", IP.client, "{}");
    req.text = async () => {
      throw new Error("baca gagal");
    };
    const res = await postClientError(req);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      error: "Body tidak bisa dibaca.",
    });
    assert.equal(kejadian.length, 0);
  });

  it("tanpa ANALYTICS_SALT: batas laju dilewati, laporan tetap 200", async () => {
    const garam = process.env.ANALYTICS_SALT;
    delete process.env.ANALYTICS_SALT;
    try {
      const res = await postClientError(
        fakePost(
          "/api/client-error",
          IP.client,
          JSON.stringify({ message: "tanpa garam" }),
        ),
      );
      assert.equal(res.status, 200);
    } finally {
      process.env.ANALYTICS_SALT = garam;
    }
  });

  it("batas laju: 10 lolos, ke-11 ditolak 429", async () => {
    let terakhir;
    for (let i = 0; i < 11; i += 1) {
      terakhir = await postClientError(
        fakePost(
          "/api/client-error",
          IP.clientLimit,
          JSON.stringify({ message: `error ${i}` }),
        ),
      );
    }
    assert.equal(terakhir.status, 429);
  });
});

describe("urlPathOnly", () => {
  it("URL absolut -> path saja, query dibuang", () => {
    assert.equal(
      urlPathOnly("https://karir.local/cari?q=abc&token=x"),
      "/cari",
    );
  });
  it("path relatif dipertahankan; bukan-string -> string kosong", () => {
    assert.equal(urlPathOnly("/perusahaan/1"), "/perusahaan/1");
    assert.equal(urlPathOnly(""), "");
    assert.equal(urlPathOnly(null), "");
    assert.equal(urlPathOnly(123), "");
  });
  it("URL yang tidak bisa diparse -> string kosong", () => {
    assert.equal(urlPathOnly("https://[::1"), "");
  });
});
