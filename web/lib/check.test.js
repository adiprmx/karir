/* Tes unit untuk penjaga SSRF di lib/check.js, memakai test runner
 * bawaan Node. Dijalankan dengan: node --test lib/check.test.js
 * Semua fetch dan DNS di sini mock: tidak ada request jaringan nyata
 * dan tidak ada resolve DNS nyata. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkUrl, isBlockedIp } from "./check.js";

/* fetch tiruan: rute "METODE URL" -> { status, location? }.
 * Memakai Headers asli supaya .get("location") berperilaku sama
 * dengan fetch sungguhan. Daftar panggilan tercatat di fn.calls. */
function mockFetch(routes) {
  const calls = [];
  const fn = async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, method: options.method || "GET" });
    const route = routes[`${options.method || "GET"} ${target}`] || routes[target];
    if (!route) throw new Error(`fetch tak terduga: ${options.method} ${target}`);
    if (route.error) throw route.error;
    const headers = new Headers();
    if (route.location) headers.set("location", route.location);
    return { status: route.status, headers, url: target };
  };
  fn.calls = calls;
  return fn;
}

/* lookup tiruan: peta hostname -> alamat IP (atau "ENOTFOUND" untuk
 * kegagalan DNS). Literal IP dikembalikan apa adanya; hostname yang
 * tidak ada di peta dianggap resolve ke IP publik 93.184.216.34. */
function mockLookup(mapping = {}) {
  return async (hostname) => {
    if (mapping[hostname] === "ENOTFOUND") {
      const err = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
      err.code = "ENOTFOUND";
      throw err;
    }
    const address = mapping[hostname];
    if (address) {
      return [{ address, family: address.includes(":") ? 6 : 4 }];
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return [{ address: hostname, family: 4 }];
    }
    if (hostname.includes(":")) {
      return [{ address: hostname, family: 6 }];
    }
    return [{ address: "93.184.216.34", family: 4 }];
  };
}

const PUBLIC = "https://example.com/lowongan";

describe("isBlockedIp — tiap rentang terlarang", () => {
  const blocked = [
    "0.0.0.0",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "127.9.9.9",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "192.168.1.100",
    "::",
    "::1",
    "fe80::1",
    "febf::1",
    "fc00::1",
    "fdff::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.5",
  ];
  for (const ip of blocked) {
    it(`menolak ${ip}`, () => assert.equal(isBlockedIp(ip), true));
  }

  const allowed = [
    "8.8.8.8",
    "93.184.216.34",
    "100.63.255.255",
    "100.128.0.1",
    "172.15.255.255",
    "172.32.0.1",
    "2001:db8::1",
    "2001:4860:4860::8888",
    "::ffff:8.8.8.8",
  ];
  for (const ip of allowed) {
    it(`mengizinkan ${ip}`, () => assert.equal(isBlockedIp(ip), false));
  }

  it("mengembalikan null untuk bukan IP", () => {
    assert.equal(isBlockedIp("example.com"), null);
    assert.equal(isBlockedIp(""), null);
    assert.equal(isBlockedIp(null), null);
  });
});

describe("checkUrl — skema dan target yang diizinkan", () => {
  it("URL http valid lolos validasi", async () => {
    const fetchImpl = mockFetch({ "http://example.com/lowongan": { status: 200 } });
    const result = await checkUrl("http://example.com/lowongan", {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.deepEqual(result, {
      ok: true,
      status: 200,
      finalUrl: "http://example.com/lowongan",
    });
    assert.equal(fetchImpl.calls.length, 1);
  });

  it("URL https valid lolos validasi", async () => {
    const fetchImpl = mockFetch({ [PUBLIC]: { status: 200 } });
    const result = await checkUrl(PUBLIC, {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.finalUrl, PUBLIC);
  });

  it("redirect ke URL publik tetap diikuti", async () => {
    const fetchImpl = mockFetch({
      "HEAD https://example.com/lama": {
        status: 301,
        location: "https://example.com/baru",
      },
      "HEAD https://example.com/baru": { status: 200 },
    });
    const result = await checkUrl("https://example.com/lama", {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.finalUrl, "https://example.com/baru");
    assert.equal(fetchImpl.calls.length, 2);
  });
});

describe("checkUrl — SSRF ditolak sebelum fetch", () => {
  const cases = [
    ["127.0.0.1 ditolak", "http://127.0.0.1/admin", {}],
    ["10.x ditolak", "http://10.0.0.5/internal", {}],
    ["169.254.169.254 ditolak", "http://169.254.169.254/latest/meta-data/", {}],
    ["172.16.x ditolak", "http://172.16.4.9/panel", {}],
    ["192.168.x ditolak", "http://192.168.1.1/", {}],
    ["localhost ditolak", "http://localhost:3000/admin", {}],
    ["localhost. (titik akhir) ditolak", "http://localhost./admin", {}],
    ["::1 ditolak", "http://[::1]/admin", {}],
    ["fe80::1 ditolak", "http://[fe80::1]/", {}],
    ["file:// ditolak", "file:///etc/passwd", {}],
    ["ftp:// ditolak", "ftp://example.com/file", {}],
    [
      "hostname yang resolve ke IP privat ditolak",
      "https://evil.example.com/",
      { "evil.example.com": "192.168.1.10" },
    ],
    [
      "hostname yang resolve ke 127.0.0.1 ditolak",
      "https://rebind.example.com/",
      { "rebind.example.com": "127.0.0.1" },
    ],
  ];
  for (const [name, url, mapping] of cases) {
    it(name, async () => {
      const fetchImpl = mockFetch({});
      const result = await checkUrl(url, {
        fetchImpl,
        lookupImpl: mockLookup(mapping),
      });
      assert.deepEqual(result, { ok: false, status: null, finalUrl: url });
      assert.equal(fetchImpl.calls.length, 0);
    });
  }

  it("redirect ke IP privat ditolak (hop kedua tidak pernah di-fetch)", async () => {
    const fetchImpl = mockFetch({
      "HEAD https://example.com/lama": {
        status: 301,
        location: "http://10.1.2.3/rahasia",
      },
    });
    const result = await checkUrl("https://example.com/lama", {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.deepEqual(result, {
      ok: false,
      status: null,
      finalUrl: "https://example.com/lama",
    });
    assert.equal(fetchImpl.calls.length, 1);
  });

  it("redirect ke localhost ditolak", async () => {
    const fetchImpl = mockFetch({
      "HEAD https://example.com/lama": {
        status: 302,
        location: "http://localhost:8080/",
      },
    });
    const result = await checkUrl("https://example.com/lama", {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, null);
    assert.equal(fetchImpl.calls.length, 1);
  });

  it("redirect ke hostname yang resolve ke IP privat ditolak", async () => {
    const fetchImpl = mockFetch({
      "HEAD https://example.com/lama": {
        status: 301,
        location: "https://dalam.example.com/",
      },
    });
    const result = await checkUrl("https://example.com/lama", {
      fetchImpl,
      lookupImpl: mockLookup({ "dalam.example.com": "10.9.9.9" }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, null);
    assert.equal(fetchImpl.calls.length, 1);
  });

  it("kegagalan DNS gagal tertutup (tanpa fetch)", async () => {
    const fetchImpl = mockFetch({});
    const result = await checkUrl("https://hilang.example.com/", {
      fetchImpl,
      lookupImpl: mockLookup({ "hilang.example.com": "ENOTFOUND" }),
    });
    assert.deepEqual(result, {
      ok: false,
      status: null,
      finalUrl: "https://hilang.example.com/",
    });
    assert.equal(fetchImpl.calls.length, 0);
  });
});

describe("checkUrl — perilaku lama dipertahankan", () => {
  it("HEAD 405 → fallback GET tetap jalan", async () => {
    const fetchImpl = mockFetch({
      [`HEAD ${PUBLIC}`]: { status: 405 },
      [`GET ${PUBLIC}`]: { status: 200 },
    });
    const result = await checkUrl(PUBLIC, {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.deepEqual(
      fetchImpl.calls.map((c) => c.method),
      ["HEAD", "GET"],
    );
  });

  it("HEAD 501 → fallback GET tetap jalan", async () => {
    const fetchImpl = mockFetch({
      [`HEAD ${PUBLIC}`]: { status: 501 },
      [`GET ${PUBLIC}`]: { status: 200 },
    });
    const result = await checkUrl(PUBLIC, {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
  });

  it("fallback GET juga memvalidasi tiap hop redirect", async () => {
    const fetchImpl = mockFetch({
      [`HEAD ${PUBLIC}`]: { status: 405 },
      [`GET ${PUBLIC}`]: { status: 301, location: "http://192.168.0.9/" },
    });
    const result = await checkUrl(PUBLIC, {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, null);
    assert.equal(fetchImpl.calls.length, 2);
  });

  it("timeout tetap mengembalikan {ok:false, status:null}", async () => {
    const hangingFetch = (_url, options) =>
      new Promise((_, reject) => {
        options.signal.addEventListener("abort", () => {
          const err = new Error("Operasi dibatalkan");
          err.name = "AbortError";
          reject(err);
        });
      });
    const result = await checkUrl(PUBLIC, {
      fetchImpl: hangingFetch,
      lookupImpl: mockLookup(),
      timeoutMs: 30,
    });
    assert.deepEqual(result, { ok: false, status: null, finalUrl: PUBLIC });
  });

  it("status 404 dilaporkan apa adanya (bukan gagal total)", async () => {
    const fetchImpl = mockFetch({ [PUBLIC]: { status: 404 } });
    const result = await checkUrl(PUBLIC, {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.deepEqual(result, { ok: false, status: 404, finalUrl: PUBLIC });
  });
});
