/* Test pemangkasan respons /api/index + validasi ulang rev
 * (FIN-09/FE-16): tiap perusahaan hanya membawa 8 field pemakai
 * indeks, respons membawa rev marker, dan ?rev=N yang cocok dijawab
 * 304 tanpa isi. Handler rute diimpor lewat loader test (alias `@/`
 * + stub `next/server`); semua fetch Firestore di-mock — tidak ada
 * jaringan, tidak ada secret asli.
 * Env dummy dipasang di sini, BUKAN dari .env. Dijalankan dengan:
 *   node --test lib/index-trim.test.js
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { resetSharedLimiter } from "./rate-limit.js";
import { revalidateCompanies } from "./companies.js";
import { issueToken } from "./api-guard.js";

/* --- Env dummy (sebelum impor rute) --- */
process.env.API_TOKEN_SECRET = "rahasia-token-uji-w1g6-bukan-asli";
process.env.ANALYTICS_SALT = "garam-uji-w1g6-bukan-asli";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "kunci-uji";
for (const key of [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
]) {
  delete process.env[key];
}

/* Loader `@/` + `next/server` harus terdaftar SEBELUM rute diimpor,
 * karena itu rute diimpor dinamis di bawah. */
register("./route-test-loader.mjs", import.meta.url);

const {
  GET: getIndex,
  trimCompanyForIndex,
  INDEX_COMPANY_FIELDS,
  resetIndexRevCache,
} = await import("../app/api/index/route.js");

/* --- Konstanta uji --- */
const ORIGIN = "https://karir.local";
const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const IP = "203.0.113.21";

function fakeRequest({ url, ip, ua = BROWSER_UA, headers = {} } = {}) {
  return {
    url,
    headers: new Headers({
      "user-agent": ua,
      ...(ip ? { "x-real-ip": ip } : {}),
      ...headers,
    }),
    nextUrl: new URL(url),
  };
}

function apiRequest(path, opts = {}) {
  return fakeRequest({ url: `${ORIGIN}${path}`, ...opts });
}

function authHeaders() {
  const token = issueToken(process.env.API_TOKEN_SECRET);
  return { authorization: `Bearer ${token}` };
}

/* Dokumen Firestore tiruan dengan 13 field lengkap — seperti data
 * asli — supaya pemangkasan bisa diverifikasi. */
function companyDoc(no, perusahaan, status) {
  return {
    name: `projects/proyek-uji/databases/(default)/documents/companies/${no}`,
    fields: {
      no: { integerValue: String(no) },
      perusahaan: { stringValue: perusahaan },
      kategori: { stringValue: "Ritel" },
      link_karir: { stringValue: "https://contoh.test/karir" },
      status: { stringValue: status },
      tanggal_cek: { stringValue: "2026-11-14" },
      catatan: { stringValue: "Portal terbuka, ada lowongan gudang." },
      lokasi: { stringValue: "Depok" },
      posisi: { stringValue: "Staff Gudang" },
      batas_lamar: { stringValue: "2026-12-01" },
      email_hrd: { stringValue: "hrd@contoh.test" },
      wa_hrd: { stringValue: "6281211112222" },
      kontak_lain: { stringValue: "Instagram @contoh" },
    },
  };
}

const MARKER_DOC = {
  fields: {
    rev: { integerValue: "7" },
    updatedAt: { stringValue: "2026-11-15T00:00:00.000Z" },
    counterDay: { stringValue: "2026-11-15" },
    refillsToday: { integerValue: "0" },
    readsEstimate: { integerValue: "0" },
  },
};

/* Mode marker tiruan: "ok" | "404". */
const modes = { marker: "ok" };

function mockResponse({ ok, status, body }) {
  return {
    ok,
    status,
    headers: new Headers(),
    json: async () => body ?? {},
    text: async () => JSON.stringify(body ?? {}),
  };
}

/* --- Mock fetch global: Firestore REST --- */
globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  const method = (options.method || "GET").toUpperCase();
  /* Tulis (PATCH marker): selalu berhasil — best-effort. */
  if (method === "PATCH" || method === "POST") {
    return mockResponse({ ok: true, status: 200, body: {} });
  }
  if (u.includes("/meta/lastChange")) {
    if (modes.marker === "404") {
      return mockResponse({ ok: false, status: 404 });
    }
    return mockResponse({ ok: true, status: 200, body: MARKER_DOC });
  }
  if (u.includes("/companies?pageSize")) {
    return mockResponse({
      ok: true,
      status: 200,
      body: {
        documents: [
          companyDoc(1, "Perusahaan Uji Satu", "Ada lowongan"),
          companyDoc(2, "Perusahaan Uji Dua", "Tidak ada lowongan"),
        ],
      },
    });
  }
  return mockResponse({ ok: false, status: 404 });
};

beforeEach(() => {
  resetSharedLimiter();
  revalidateCompanies();
  resetIndexRevCache();
  modes.marker = "ok";
});

/* --- Pemangkasan field (unit) --- */
describe("trimCompanyForIndex", () => {
  it("hanya 8 field pemakai indeks yang dipertahankan", () => {
    const full = {
      no: 1,
      perusahaan: "Perusahaan Uji",
      kategori: "Ritel",
      link_karir: "https://contoh.test/karir",
      status: "Ada lowongan",
      tanggal_cek: "2026-11-14",
      catatan: "Ada lowongan gudang.",
      lokasi: "Depok",
      posisi: "Staff Gudang",
      batas_lamar: "2026-12-01",
      email_hrd: "hrd@contoh.test",
      wa_hrd: "6281211112222",
      kontak_lain: "Instagram @contoh",
    };
    const trimmed = trimCompanyForIndex(full);
    assert.deepEqual(Object.keys(trimmed).sort(), [
      ...INDEX_COMPANY_FIELDS,
    ].sort());
    assert.equal(trimmed.perusahaan, "Perusahaan Uji");
    assert.equal(trimmed.catatan, "Ada lowongan gudang.");
    assert.equal("tanggal_cek" in trimmed, false);
    assert.equal("batas_lamar" in trimmed, false);
    assert.equal("email_hrd" in trimmed, false);
    assert.equal("wa_hrd" in trimmed, false);
    assert.equal("kontak_lain" in trimmed, false);
  });

  it("field yang tidak ada tidak dibuat", () => {
    assert.deepEqual(trimCompanyForIndex({ no: 5, perusahaan: "X" }), {
      no: 5,
      perusahaan: "X",
    });
  });

  it("bukan objek menghasilkan objek kosong", () => {
    assert.deepEqual(trimCompanyForIndex(null), {});
    assert.deepEqual(trimCompanyForIndex("teks"), {});
  });
});

/* --- Respons rute --- */
describe("GET /api/index (FIN-09/FE-16)", () => {
  it("200: perusahaan terpangkas + rev marker + source live", async () => {
    const res = await getIndex(
      apiRequest("/api/index", { ip: IP, headers: authHeaders() }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, "live");
    assert.equal(body.rev, 7);
    assert.equal(body.companies.length, 2);
    for (const c of body.companies) {
      assert.deepEqual(Object.keys(c).sort(), [
        ...INDEX_COMPANY_FIELDS,
      ].sort());
    }
    assert.equal(body.companies[0].perusahaan, "Perusahaan Uji Satu");
    assert.equal(
      body.companies[0].catatan,
      "Portal terbuka, ada lowongan gudang.",
    );
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  });

  it("?rev cocok dijawab 304 tanpa isi", async () => {
    const first = await getIndex(
      apiRequest("/api/index", { ip: IP, headers: authHeaders() }),
    );
    assert.equal((await first.json()).rev, 7);
    const res = await getIndex(
      apiRequest("/api/index?rev=7", { ip: IP, headers: authHeaders() }),
    );
    assert.equal(res.status, 304);
    assert.equal(await res.text(), "");
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  });

  it("?rev tidak cocok dijawab 200 penuh", async () => {
    const res = await getIndex(
      apiRequest("/api/index?rev=99", { ip: IP, headers: authHeaders() }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.rev, 7);
    assert.equal(body.companies.length, 2);
  });

  it("?rev tidak valid diabaikan (200 penuh)", async () => {
    const res = await getIndex(
      apiRequest("/api/index?rev=bukan-angka", {
        ip: IP,
        headers: authHeaders(),
      }),
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).companies.length, 2);
  });

  it("validasi ulang tanpa token tetap dijawab 401", async () => {
    const res = await getIndex(apiRequest("/api/index?rev=7", { ip: IP }));
    assert.equal(res.status, 401);
  });

  it("marker tidak bisa dibaca: rev null, tanpa 304", async () => {
    modes.marker = "404";
    const res = await getIndex(
      apiRequest("/api/index", { ip: IP, headers: authHeaders() }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.rev, null);
    assert.equal(body.source, "live");
    const again = await getIndex(
      apiRequest("/api/index?rev=7", { ip: IP, headers: authHeaders() }),
    );
    assert.equal(again.status, 200);
    assert.equal((await again.json()).companies.length, 2);
  });
});
