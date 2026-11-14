/* Tes unit untuk lib/rate-limit.js dan getClientIp baru di
 * lib/api-guard.js, memakai test runner bawaan Node.
 * Dijalankan dengan: npm test
 * Semua fetch di sini mock: tidak ada jaringan, tidak ada token
 * atau secret asli yang dipakai maupun dicatat. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryStore,
  createUpstashStore,
  createFirestoreStore,
  createRateLimiter,
  getSharedLimiter,
  resetSharedLimiter,
  buildRateLimitFields,
  parseRateLimitDoc,
  firestoreDocId,
  scopedKey,
  FIRESTORE_SYNC_EVERY,
} from "./rate-limit.js";
import { getClientIp } from "./api-guard.js";

/* Request tiruan dengan header yang bisa diatur. */
function fakeRequest(headers) {
  return { headers: new Headers(headers) };
}

const NOW = 1_000_000;

describe("getClientIp", () => {
  it("x-real-ip dipakai dulu, karena ditulis edge", () => {
    const req = fakeRequest({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.9, 203.0.113.7",
    });
    assert.equal(getClientIp(req), "203.0.113.7");
  });

  it("tanpa x-real-ip, elemen TERAKHIR x-forwarded-for dipakai", () => {
    const req = fakeRequest({
      "x-forwarded-for": "198.51.100.9, 10.0.0.1, 203.0.113.7",
    });
    assert.equal(getClientIp(req), "203.0.113.7");
  });

  it("elemen pertama x-forwarded-for TIDAK dipakai (bisa dipalsukan)", () => {
    const req = fakeRequest({ "x-forwarded-for": "1.2.3.4" });
    assert.notEqual(getClientIp(req), "9.9.9.9");
    assert.equal(getClientIp(req), "1.2.3.4");
    const spoofed = fakeRequest({
      "x-forwarded-for": "9.9.9.9, 203.0.113.7",
    });
    assert.equal(getClientIp(spoofed), "203.0.113.7");
  });

  it("tanpa header apa pun kembalikan unknown", () => {
    assert.equal(getClientIp(fakeRequest({})), "unknown");
  });
});

describe("scopedKey", () => {
  it("menggabungkan cakupan dan hash dengan pemisah titik dua", () => {
    assert.equal(scopedKey("companies", "abc123"), "companies:abc123");
    assert.equal(scopedKey("company", "abc123"), "company:abc123");
  });

  it("cakupan berbeda menghasilkan kunci berbeda untuk hash yang sama (BE-03)", () => {
    assert.notEqual(
      scopedKey("companies", "abc123"),
      scopedKey("index", "abc123"),
    );
    assert.notEqual(
      scopedKey("stats", "abc123"),
      scopedKey("analytics", "abc123"),
    );
  });

  it("menolak cakupan kosong atau berkarakter tidak aman", () => {
    assert.throws(() => scopedKey("", "abc123"), /cakupan/);
    assert.throws(() => scopedKey("a:b", "abc123"), /cakupan/);
    assert.throws(() => scopedKey("a b", "abc123"), /cakupan/);
    assert.throws(() => scopedKey(null, "abc123"), /cakupan/);
  });

  it("ember ber-cakupan tidak saling mengunci (BE-03)", async () => {
    const store = createMemoryStore();
    const hash = "hash-pengunjung-sama";
    for (let i = 0; i < 30; i++) {
      await store.check(scopedKey("companies", hash), 30, 60_000, NOW + i);
    }
    /* Ember companies penuh, tetapi ember index untuk pengunjung
     * yang sama masih kosong. */
    assert.equal(await store.check(scopedKey("companies", hash), 30, 60_000, NOW + 30), false);
    assert.equal(await store.check(scopedKey("index", hash), 30, 60_000, NOW + 30), true);
    assert.equal(await store.check(scopedKey("analytics", hash), 30, 60_000, NOW + 30), true);
  });
});

describe("createMemoryStore", () => {
  it("batas dilewati ditolak", async () => {
    const store = createMemoryStore();
    for (let i = 0; i < 30; i++) {
      assert.equal(await store.check("k", 30, 60_000, NOW + i), true);
    }
    assert.equal(await store.check("k", 30, 60_000, NOW + 30), false);
  });

  it("kunci lain tidak kena batas kunci pertama", async () => {
    const store = createMemoryStore();
    for (let i = 0; i < 30; i++) {
      await store.check("a", 30, 60_000, NOW + i);
    }
    assert.equal(await store.check("b", 30, 60_000, NOW), true);
  });

  it("jendela baru setelah 60 detik mengizinkan lagi", async () => {
    const store = createMemoryStore();
    for (let i = 0; i < 30; i++) {
      await store.check("k", 30, 60_000, NOW + i);
    }
    assert.equal(await store.check("k", 30, 60_000, NOW + 60_001), true);
  });
});

describe("createUpstashStore", () => {
  function mockFetch(calls, zcard) {
    return async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => [
          { result: 1 },
          { result: 1 },
          { result: zcard },
          { result: 1 },
        ],
      };
    };
  }

  it("satu pemeriksaan memakai satu pipeline empat perintah", async () => {
    const calls = [];
    const store = createUpstashStore({
      url: "https://contoh.upstash.io",
      token: "token-uji",
      fetchImpl: mockFetch(calls, 3),
    });
    assert.equal(await store.check("index:abc", 30, 60_000, NOW), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://contoh.upstash.io/pipeline");
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.length, 4);
    assert.equal(body[0][0], "ZADD");
    assert.equal(body[0][1], "rl:index:abc");
    assert.equal(body[1][0], "ZREMRANGEBYSCORE");
    assert.equal(body[1][3], NOW - 60_000);
    assert.deepEqual(body[2], ["ZCARD", "rl:index:abc"]);
    assert.deepEqual(body[3], ["EXPIRE", "rl:index:abc", 120]);
    assert.equal(
      calls[0].options.headers.Authorization,
      "Bearer token-uji",
    );
  });

  it("jumlah hit di atas batas ditolak", async () => {
    const store = createUpstashStore({
      url: "https://contoh.upstash.io",
      token: "token-uji",
      fetchImpl: mockFetch([], 31),
    });
    assert.equal(await store.check("index:abc", 30, 60_000, NOW), false);
  });

  it("jumlah hit sama dengan batas masih diizinkan", async () => {
    const store = createUpstashStore({
      url: "https://contoh.upstash.io",
      token: "token-uji",
      fetchImpl: mockFetch([], 30),
    });
    assert.equal(await store.check("index:abc", 30, 60_000, NOW), true);
  });

  it("fetch gagal membuka pintu (fail-open), bukan mematikan situs", async () => {
    const store = createUpstashStore({
      url: "https://contoh.upstash.io",
      token: "token-uji",
      fetchImpl: async () => {
        throw new Error("jaringan putus");
      },
    });
    assert.equal(await store.check("index:abc", 30, 60_000, NOW), true);
  });

  it("respons bukan OK atau bentuk tak dikenal membuka pintu", async () => {
    const notOk = createUpstashStore({
      url: "https://contoh.upstash.io",
      token: "token-uji",
      fetchImpl: async () => ({ ok: false, status: 500 }),
    });
    assert.equal(await notOk.check("k", 30, 60_000, NOW), true);
    const weird = createUpstashStore({
      url: "https://contoh.upstash.io",
      token: "token-uji",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ bukan: "pipeline" }),
      }),
    });
    assert.equal(await weird.check("k", 30, 60_000, NOW), true);
  });

  it("tanpa url atau token membuka pintu", async () => {
    const store = createUpstashStore({ fetchImpl: async () => {
      throw new Error("tidak boleh dipanggil");
    } });
    assert.equal(await store.check("k", 30, 60_000, NOW), true);
  });
});

describe("createFirestoreStore", () => {
  it("dokumen lama dimuat saat kunci pertama kali terlihat", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, method: options?.method || "GET" });
      if ((options?.method || "GET") === "GET") {
        return {
          ok: true,
          json: async () => ({
            fields: {
              hits: {
                arrayValue: {
                  values: Array.from({ length: 29 }, (_, i) => ({
                    integerValue: String(NOW - 1000 + i),
                  })),
                },
              },
            },
          }),
        };
      }
      return { ok: true, status: 200 };
    };
    const store = createFirestoreStore({
      projectId: "proyek-uji",
      apiKey: "kunci-uji",
      fetchImpl,
      syncEvery: 100,
    });
    /* 29 hit lama + 1 hit ini = 30, masih diizinkan. */
    assert.equal(await store.check("index:abc", 30, 60_000, NOW), true);
    /* Hit berikutnya melewati 30, ditolak dari cache memori. */
    assert.equal(await store.check("index:abc", 30, 60_000, NOW + 1), false);
    assert.equal(calls.filter((c) => c.method === "GET").length, 1);
  });

  it("tulis balik tiap syncEvery hit, bukan tiap request", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, method: options?.method || "GET" });
      if ((options?.method || "GET") === "GET") {
        return { ok: false, status: 404 };
      }
      return { ok: true, status: 200 };
    };
    const store = createFirestoreStore({
      projectId: "proyek-uji",
      apiKey: "kunci-uji",
      fetchImpl,
      syncEvery: 2,
    });
    await store.check("index:abc", 30, 60_000, NOW);
    assert.equal(calls.filter((c) => c.method === "PATCH").length, 0);
    await store.check("index:abc", 30, 60_000, NOW + 1);
    const patches = calls.filter((c) => c.method === "PATCH");
    assert.equal(patches.length, 1);
    assert.match(patches[0].url, /rate_limits\/index-abc/);
  });

  it("PATCH 404 dilanjut POST untuk membuat dokumen", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, method: options?.method || "GET" });
      if ((options?.method || "GET") === "GET") {
        return { ok: false, status: 404 };
      }
      if (options?.method === "PATCH") {
        return { ok: false, status: 404 };
      }
      return { ok: true, status: 200 };
    };
    const store = createFirestoreStore({
      projectId: "proyek-uji",
      apiKey: "kunci-uji",
      fetchImpl,
      syncEvery: 1,
    });
    assert.equal(await store.check("index:abc", 30, 60_000, NOW), true);
    assert.equal(calls.filter((c) => c.method === "POST").length, 1);
    assert.match(
      calls.find((c) => c.method === "POST").url,
      /documentId=index-abc/,
    );
  });

  it("Firestore gagal tetap mengizinkan dari cache memori", async () => {
    const store = createFirestoreStore({
      projectId: "proyek-uji",
      apiKey: "kunci-uji",
      fetchImpl: async () => {
        throw new Error("jaringan putus");
      },
      syncEvery: 1,
    });
    for (let i = 0; i < 30; i++) {
      assert.equal(await store.check("k", 30, 60_000, NOW + i), true);
    }
    assert.equal(await store.check("k", 30, 60_000, NOW + 30), false);
  });

  it("buildRateLimitFields dan parseRateLimitDoc saling cocok", () => {
    const fields = buildRateLimitFields(
      [NOW, NOW + 1],
      "2026-11-08T00:00:00.000Z",
    );
    assert.equal(
      fields.fields.hits.arrayValue.values[0].integerValue,
      String(NOW),
    );
    assert.equal(
      fields.fields.updatedAt.timestampValue,
      "2026-11-08T00:00:00.000Z",
    );
    assert.deepEqual(parseRateLimitDoc(fields), [NOW, NOW + 1]);
    assert.deepEqual(parseRateLimitDoc({}), []);
    assert.deepEqual(parseRateLimitDoc(null), []);
  });

  it("firestoreDocId hanya berisi karakter aman", () => {
    assert.equal(firestoreDocId("index:abc123"), "index-abc123");
    assert.equal(firestoreDocId(FIRESTORE_SYNC_EVERY + ""), "10");
  });
});

describe("createRateLimiter", () => {
  const dummyFetch = async () => {
    throw new Error("tidak boleh dipanggil saat memilih store");
  };

  it("env KV memilih store upstash", () => {
    const limiter = createRateLimiter({
      fetchImpl: dummyFetch,
      env: {
        KV_REST_API_URL: "https://contoh.upstash.io",
        KV_REST_API_TOKEN: "token-uji",
      },
    });
    assert.equal(limiter.kind, "upstash");
  });

  it("tanpa KV tapi ada env Firebase memilih store firestore", () => {
    const limiter = createRateLimiter({
      fetchImpl: dummyFetch,
      env: {
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "proyek-uji",
        NEXT_PUBLIC_FIREBASE_API_KEY: "kunci-uji",
      },
    });
    assert.equal(limiter.kind, "firestore");
  });

  it("tanpa env apa pun memakai memori", () => {
    const limiter = createRateLimiter({ fetchImpl: dummyFetch, env: {} });
    assert.equal(limiter.kind, "memory");
  });

  it("getSharedLimiter memakai satu instance yang sama", () => {
    resetSharedLimiter();
    const a = getSharedLimiter({ fetchImpl: dummyFetch, env: {} });
    const b = getSharedLimiter({ fetchImpl: dummyFetch, env: {} });
    assert.equal(a, b);
    assert.equal(a.kind, "memory");
    resetSharedLimiter();
  });
});
