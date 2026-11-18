/* Tes unit untuk penjaga SSRF di lib/check.js, memakai test runner
 * bawaan Node. Dijalankan dengan: node --test lib/check.test.js
 * Semua fetch dan DNS di sini mock: tidak ada request jaringan nyata
 * dan tidak ada resolve DNS nyata. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkUrl,
  checkUrlWithRetry,
  decideRecheckAction,
  isBlockedIp,
} from "./check.js";

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

describe("checkUrl — kredensial dihapus dari URL (BE2-26, P-04)", () => {
  it("userinfo tidak pernah dikirim ke server dan tidak muncul di finalUrl", async () => {
    const fetchImpl = mockFetch({
      "https://example.com/lowongan": { status: 200 },
    });
    const result = await checkUrl("https://pengguna:kata-sandi@example.com/lowongan", {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.finalUrl, "https://example.com/lowongan");
    assert.equal(fetchImpl.calls.length, 1);
    assert.equal(fetchImpl.calls[0].url, "https://example.com/lowongan");
    assert.equal(fetchImpl.calls[0].url.includes("pengguna"), false);
    assert.equal(fetchImpl.calls[0].url.includes("kata-sandi"), false);
  });

  it("kredensial di target redirect ikut dihapus", async () => {
    const fetchImpl = mockFetch({
      "HEAD https://example.com/lama": {
        status: 301,
        location: "https://pengguna:kata-sandi@example.com/baru",
      },
      "HEAD https://example.com/baru": { status: 200 },
    });
    const result = await checkUrl("https://example.com/lama", {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.finalUrl, "https://example.com/baru");
    for (const call of fetchImpl.calls) {
      assert.equal(call.url.includes("pengguna"), false);
      assert.equal(call.url.includes("kata-sandi"), false);
    }
  });

  it("kredensial tidak muncul di finalUrl saat cek gagal", async () => {
    const fetchImpl = mockFetch({});
    const result = await checkUrl("https://pengguna:kata-sandi@hilang.example.com/", {
      fetchImpl,
      lookupImpl: mockLookup({ "hilang.example.com": "ENOTFOUND" }),
    });
    assert.deepEqual(result, {
      ok: false,
      status: null,
      finalUrl: "https://hilang.example.com/",
    });
  });

  it("URL tanpa kredensial tidak berubah (tanpa normalisasi liar)", async () => {
    const fetchImpl = mockFetch({ "https://example.com": { status: 200 } });
    const result = await checkUrl("https://example.com", {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.equal(result.finalUrl, "https://example.com");
  });
});

describe("checkUrl — badan respons GET fallback dibatalkan (BE2-26, P-04)", () => {
  it("badan respons GET akhir dibatalkan, badan HEAD tidak disentuh", async () => {
    let cancelled = 0;
    const fetchImpl = async (url, options = {}) => {
      const target = String(url);
      if (options.method === "HEAD") {
        return { status: 405, headers: new Headers(), url: target };
      }
      return {
        status: 200,
        headers: new Headers(),
        url: target,
        body: {
          cancel: async () => {
            cancelled += 1;
          },
        },
      };
    };
    const result = await checkUrl(PUBLIC, {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(cancelled, 1);
  });

  it("badan tiap hop redirect GET ikut dibatalkan", async () => {
    let cancelled = 0;
    const withBody = (status, location) => {
      const headers = new Headers();
      if (location) headers.set("location", location);
      return {
        status,
        headers,
        body: {
          cancel: async () => {
            cancelled += 1;
          },
        },
      };
    };
    const fetchImpl = async (url, options = {}) => {
      if (options.method === "HEAD") {
        return { status: 405, headers: new Headers(), url: String(url) };
      }
      if (String(url) === PUBLIC) {
        return withBody(301, "https://example.com/baru");
      }
      return withBody(200);
    };
    const result = await checkUrl(PUBLIC, {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.finalUrl, "https://example.com/baru");
    /* Respons redirect GET + respons akhir GET: keduanya dibatalkan. */
    assert.equal(cancelled, 2);
  });
});

describe("checkUrlWithRetry — retry 1x (P-04, kriteria 2)", () => {
  /* fetch tiruan berurutan: tiap panggilan memakai respons
   * berikutnya dari daftar; respons terakhir diulang bila daftar
   * habis. */
  function sequentialFetch(responses) {
    let calls = 0;
    const fn = async (url, options = {}) => {
      const route =
        responses[Math.min(calls, responses.length - 1)];
      calls += 1;
      if (route.error) throw route.error;
      const headers = new Headers();
      if (route.location) headers.set("location", route.location);
      return { status: route.status, headers, url: String(url) };
    };
    fn.calls = () => calls;
    return fn;
  }

  it("berhasil di percobaan pertama: tanpa retry", async () => {
    const fetchImpl = sequentialFetch([{ status: 200 }]);
    const { result, retried } = await checkUrlWithRetry(PUBLIC, {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.deepEqual(result, { ok: true, status: 200, finalUrl: PUBLIC });
    assert.equal(retried, false);
    assert.equal(fetchImpl.calls(), 1);
  });

  it("gagal jangkau lalu pulih: hasil retry yang menang", async () => {
    const fetchImpl = sequentialFetch([
      { error: new Error("koneksi putus") },
      { status: 200 },
    ]);
    const { result, retried } = await checkUrlWithRetry(PUBLIC, {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(retried, true);
    assert.equal(fetchImpl.calls(), 2);
  });

  it("404 dua kali: hasil akhir tetap 404 sesudah 1x retry", async () => {
    const fetchImpl = sequentialFetch([{ status: 404 }, { status: 404 }]);
    const { result, retried } = await checkUrlWithRetry(PUBLIC, {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.deepEqual(result, {
      ok: false,
      status: 404,
      finalUrl: PUBLIC,
    });
    assert.equal(retried, true);
    assert.equal(fetchImpl.calls(), 2);
  });

  it("404 lalu gagal jangkau di retry: hasil akhir tidak diketahui", async () => {
    const fetchImpl = sequentialFetch([
      { status: 404 },
      { error: new Error("timeout") },
    ]);
    const { result, retried } = await checkUrlWithRetry(PUBLIC, {
      fetchImpl,
      lookupImpl: mockLookup(),
    });
    assert.deepEqual(result, {
      ok: false,
      status: null,
      finalUrl: PUBLIC,
    });
    assert.equal(retried, true);
  });

  it("retry tetap melewati penjaga SSRF (target privat tidak pernah di-fetch)", async () => {
    const fetchImpl = sequentialFetch([{ status: 200 }]);
    const { result, retried } = await checkUrlWithRetry(
      "http://127.0.0.1/admin",
      { fetchImpl, lookupImpl: mockLookup() },
    );
    assert.deepEqual(result, {
      ok: false,
      status: null,
      finalUrl: "http://127.0.0.1/admin",
    });
    assert.equal(retried, true);
    assert.equal(fetchImpl.calls(), 0);
  });
});

describe("decideRecheckAction — keputusan recheck (P-04/K-11)", () => {
  const OPEN = "Ada lowongan";
  const DEAD = "Portal tidak bisa dibuka";
  const UNVERIFIED = "Tidak dapat diverifikasi";
  const NONE = "Tidak ada lowongan";
  const alive = { ok: true, status: 200, finalUrl: PUBLIC };
  const unreachable = { ok: false, status: null, finalUrl: PUBLIC };
  const notFound = { ok: false, status: 404, finalUrl: PUBLIC };
  const gone = { ok: false, status: 410, finalUrl: PUBLIC };
  const forbidden = { ok: false, status: 403, finalUrl: PUBLIC };
  const serverError = { ok: false, status: 500, finalUrl: PUBLIC };

  it("portal hidup + status lama terbuka: tetap, tanpa flip", () => {
    assert.deepEqual(decideRecheckAction(OPEN, alive), {
      outcome: "alive",
      newStatus: null,
    });
  });

  it("portal hidup + status lama mati: flip ke Tidak dapat diverifikasi", () => {
    assert.deepEqual(decideRecheckAction(DEAD, alive), {
      outcome: "alive",
      newStatus: UNVERIFIED,
    });
  });

  it("gagal jangkau: tidak diketahui, status TIDAK diubah (BE2-01)", () => {
    assert.deepEqual(decideRecheckAction(OPEN, unreachable), {
      outcome: "unreachable",
      newStatus: null,
    });
    assert.deepEqual(decideRecheckAction(DEAD, unreachable), {
      outcome: "unreachable",
      newStatus: null,
    });
  });

  it("403: diblokir, TIDAK PERNAH di-flip (K-11)", () => {
    assert.deepEqual(decideRecheckAction(OPEN, forbidden), {
      outcome: "blocked",
      newStatus: null,
    });
  });

  it("4xx lain (401, 429): diblokir, bukan portal mati", () => {
    for (const status of [400, 401, 429, 451]) {
      assert.deepEqual(
        decideRecheckAction(OPEN, { ok: false, status, finalUrl: PUBLIC }),
        { outcome: "blocked", newStatus: null },
      );
    }
  });

  it("404/410 sesudah retry: portal terbuka flip ke mati", () => {
    assert.deepEqual(decideRecheckAction(OPEN, notFound), {
      outcome: "dead",
      newStatus: DEAD,
    });
    assert.deepEqual(decideRecheckAction(OPEN, gone), {
      outcome: "dead",
      newStatus: DEAD,
    });
  });

  it("404 pada portal yang sudah mati: tetap mati, tanpa flip", () => {
    assert.deepEqual(decideRecheckAction(DEAD, notFound), {
      outcome: "dead",
      newStatus: null,
    });
  });

  it("5xx strike pertama: dicatat, TIDAK di-flip", () => {
    assert.deepEqual(decideRecheckAction(OPEN, serverError), {
      outcome: "server-error",
      newStatus: null,
    });
    assert.deepEqual(
      decideRecheckAction(OPEN, serverError, { struckYesterday: false }),
      { outcome: "server-error", newStatus: null },
    );
  });

  it("5xx strike kedua (kemarin juga 5xx): portal terbuka flip ke mati", () => {
    assert.deepEqual(
      decideRecheckAction(OPEN, serverError, { struckYesterday: true }),
      { outcome: "server-error", newStatus: DEAD },
    );
  });

  it("5xx strike kedua pada portal sudah mati: tetap mati", () => {
    assert.deepEqual(
      decideRecheckAction(DEAD, serverError, { struckYesterday: true }),
      { outcome: "server-error", newStatus: null },
    );
  });

  it("status lain (Tidak ada lowongan) tidak pernah di-flip", () => {
    assert.deepEqual(decideRecheckAction(NONE, notFound), {
      outcome: "dead",
      newStatus: null,
    });
    assert.deepEqual(
      decideRecheckAction(NONE, serverError, { struckYesterday: true }),
      { outcome: "server-error", newStatus: null },
    );
  });
});
