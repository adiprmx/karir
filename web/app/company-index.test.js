/* Test cache indeks klien (FE-16/FIN-09): helper cache localStorage
 * ber-TTL + kunci versi, dan alur loadIndex (muat penuh, validasi
 * ulang rev 304, ganti daftar bila rev berubah, fallback ke cache
 * lama bila jaringan gagal, respons seed tidak disimpan).
 * localStorage + fetch di-stub di sini; tidak ada DOM sungguhan,
 * tidak ada jaringan. Dijalankan dengan:
 *   node --test app/company-index.test.js
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

/* --- Stub localStorage (Map) --- */
function makeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
}
let storage = makeStorage();
globalThis.localStorage = storage;

/* --- Stub fetch: /api/token + /api/index, perilaku lewat modes --- */
const LIVE_COMPANIES = [
  { no: 1, perusahaan: "Perusahaan Uji Satu", status: "Ada lowongan" },
  { no: 2, perusahaan: "Perusahaan Uji Dua", status: "Tidak ada lowongan" },
];
const NEW_COMPANIES = [
  { no: 1, perusahaan: "Perusahaan Uji Satu", status: "Ada lowongan" },
  { no: 3, perusahaan: "Perusahaan Uji Tiga", status: "Ada lowongan" },
];
const SEED_COMPANIES = [
  { no: 9, perusahaan: "Perusahaan Seed", status: "Ada lowongan" },
];
const modes = { index: "ok", rev: 7, companies: null };
let seen401 = false;
const calls = [];

function mockResponse({ ok, status, body }) {
  return {
    ok,
    status,
    headers: new Headers(),
    json: async () => body ?? {},
    text: async () => JSON.stringify(body ?? {}),
  };
}

/* Stub fetch WAJIB dipasang SEBELUM company-index.js diimpor: fetcher
 * token di modul itu menangkap referensi fetch saat dibuat. */
globalThis.fetch = async (url) => {
  const u = String(url);
  calls.push(u);
  if (u === "/api/token") {
    return mockResponse({
      ok: true,
      status: 200,
      body: { token: "token-uji", expiresIn: 60 },
    });
  }
  if (u.startsWith("/api/index")) {
    if (modes.index === "throw") throw new Error("jaringan putus (mock)");
    if (modes.index === "401-once" && !seen401) {
      seen401 = true;
      return mockResponse({ ok: false, status: 401 });
    }
    if (modes.index === "304") {
      return {
        ok: false,
        status: 304,
        headers: new Headers(),
        json: async () => {
          throw new Error("304 tanpa isi");
        },
        text: async () => "",
      };
    }
    if (modes.index === "seed") {
      return mockResponse({
        ok: true,
        status: 200,
        body: {
          companies: SEED_COMPANIES,
          source: "seed",
          seedDate: "2026-11-14",
          rev: null,
        },
      });
    }
    return mockResponse({
      ok: true,
      status: 200,
      body: {
        companies: modes.companies || LIVE_COMPANIES,
        source: "live",
        seedDate: "2026-11-14",
        rev: modes.rev,
      },
    });
  }
  return mockResponse({ ok: false, status: 404 });
};

/* Loader `@/` harus terdaftar SEBELUM company-index.js diimpor
 * (modul itu memakai alias `@/lib/...`). */
register("../lib/route-test-loader.mjs", import.meta.url);

const {
  INDEX_CACHE_KEY,
  INDEX_CACHE_TTL_MS,
  INDEX_CACHE_VERSION,
  buildIndexCacheEntry,
  isIndexCacheValid,
  readIndexCache,
  writeIndexCache,
  loadIndex,
  resetCompanyIndexForTests,
} = await import("./company-index.js");

function indexCalls() {
  return calls.filter((u) => u.startsWith("/api/index"));
}

beforeEach(() => {
  resetCompanyIndexForTests();
  storage = makeStorage();
  globalThis.localStorage = storage;
  modes.index = "ok";
  modes.rev = 7;
  modes.companies = null;
  seen401 = false;
  calls.length = 0;
});

/* --- Helper cache (murni) --- */
describe("helper cache indeks", () => {
  it("buildIndexCacheEntry membentuk entri berversi", () => {
    const entry = buildIndexCacheEntry(
      {
        companies: LIVE_COMPANIES,
        meta: { source: "live", seedDate: "2026-11-14" },
        rev: 7,
      },
      1_000_000,
    );
    assert.deepEqual(entry, {
      v: INDEX_CACHE_VERSION,
      rev: 7,
      savedAt: 1_000_000,
      companies: LIVE_COMPANIES,
      meta: { source: "live", seedDate: "2026-11-14" },
    });
  });

  it("rev bukan angka disimpan null", () => {
    const entry = buildIndexCacheEntry({
      companies: LIVE_COMPANIES,
      meta: null,
      rev: "tujuh",
    });
    assert.equal(entry.rev, null);
    assert.deepEqual(entry.meta, { source: "live", seedDate: "" });
  });

  it("isIndexCacheValid: valid, versi salah, kosong, kedaluwarsa", () => {
    const now = 2_000_000;
    const valid = buildIndexCacheEntry(
      { companies: LIVE_COMPANIES, meta: null, rev: 7 },
      now - 1000,
    );
    assert.equal(isIndexCacheValid(valid, now), true);
    assert.equal(isIndexCacheValid({ ...valid, v: 99 }, now), false);
    assert.equal(
      isIndexCacheValid({ ...valid, companies: [] }, now),
      false,
    );
    assert.equal(
      isIndexCacheValid(
        { ...valid, savedAt: now - INDEX_CACHE_TTL_MS },
        now,
      ),
      false,
    );
    assert.equal(
      isIndexCacheValid(
        { ...valid, savedAt: now - INDEX_CACHE_TTL_MS + 1000 },
        now,
      ),
      true,
    );
    assert.equal(isIndexCacheValid(null, now), false);
    assert.equal(isIndexCacheValid("teks", now), false);
  });

  it("readIndexCache: valid dibaca, rusak/kedaluwarsa/hilang jadi null", () => {
    const s = makeStorage();
    assert.equal(readIndexCache(s), null);
    s.setItem(INDEX_CACHE_KEY, "{json rusak");
    assert.equal(readIndexCache(s), null);
    const expired = buildIndexCacheEntry(
      { companies: LIVE_COMPANIES, meta: null, rev: 7 },
      Date.now() - INDEX_CACHE_TTL_MS - 1000,
    );
    s.setItem(INDEX_CACHE_KEY, JSON.stringify(expired));
    assert.equal(readIndexCache(s), null);
    const valid = buildIndexCacheEntry(
      { companies: LIVE_COMPANIES, meta: null, rev: 7 },
      Date.now(),
    );
    s.setItem(INDEX_CACHE_KEY, JSON.stringify(valid));
    assert.deepEqual(readIndexCache(s), valid);
    assert.equal(readIndexCache(null), null);
  });

  it("writeIndexCache: round-trip, gagal diam-diam bila storage melempar", () => {
    const s = makeStorage();
    const entry = buildIndexCacheEntry({
      companies: LIVE_COMPANIES,
      meta: null,
      rev: 7,
    });
    assert.equal(writeIndexCache(s, entry), true);
    assert.deepEqual(JSON.parse(s.getItem(INDEX_CACHE_KEY)), entry);
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("kuota penuh (mock)");
      },
    };
    assert.equal(writeIndexCache(throwing, entry), false);
    assert.equal(writeIndexCache(null, entry), false);
  });
});

/* --- Alur loadIndex --- */
describe("loadIndex dengan cache", () => {
  it("dingin: muat penuh lalu simpan cache ber-revisi", async () => {
    const list = await loadIndex();
    assert.deepEqual(list, LIVE_COMPANIES);
    assert.deepEqual(indexCalls(), ["/api/index"]);
    const stored = JSON.parse(storage.getItem(INDEX_CACHE_KEY));
    assert.equal(stored.v, INDEX_CACHE_VERSION);
    assert.equal(stored.rev, 7);
    assert.deepEqual(stored.companies, LIVE_COMPANIES);
    assert.deepEqual(stored.meta, {
      source: "live",
      seedDate: "2026-11-14",
    });
    /* Panggilan kedua memakai memori: tanpa fetch lagi. */
    const again = await loadIndex();
    assert.deepEqual(again, LIVE_COMPANIES);
    assert.deepEqual(indexCalls(), ["/api/index"]);
  });

  it("hangat + 304: pakai cache, validasi lewat ?rev=, stempel diperbarui", async () => {
    const before = Date.now() - 60_000;
    writeIndexCache(
      storage,
      buildIndexCacheEntry(
        {
          companies: LIVE_COMPANIES,
          meta: { source: "live", seedDate: "2026-11-14" },
          rev: 7,
        },
        before,
      ),
    );
    modes.index = "304";
    const list = await loadIndex();
    assert.deepEqual(list, LIVE_COMPANIES);
    assert.deepEqual(indexCalls(), ["/api/index?rev=7"]);
    const stored = JSON.parse(storage.getItem(INDEX_CACHE_KEY));
    assert.ok(stored.savedAt > before);
    assert.equal(stored.rev, 7);
  });

  it("hangat + rev berubah: daftar baru menggantikan cache", async () => {
    writeIndexCache(
      storage,
      buildIndexCacheEntry(
        { companies: LIVE_COMPANIES, meta: null, rev: 7 },
        Date.now() - 1000,
      ),
    );
    modes.rev = 8;
    modes.companies = NEW_COMPANIES;
    const list = await loadIndex();
    assert.deepEqual(list, NEW_COMPANIES);
    assert.deepEqual(indexCalls(), ["/api/index?rev=7"]);
    const stored = JSON.parse(storage.getItem(INDEX_CACHE_KEY));
    assert.equal(stored.rev, 8);
    assert.deepEqual(stored.companies, NEW_COMPANIES);
  });

  it("hangat + jaringan gagal: cache lama tetap dipakai (tidak melempar)", async () => {
    writeIndexCache(
      storage,
      buildIndexCacheEntry(
        { companies: LIVE_COMPANIES, meta: null, rev: 7 },
        Date.now() - 1000,
      ),
    );
    modes.index = "throw";
    const list = await loadIndex();
    assert.deepEqual(list, LIVE_COMPANIES);
  });

  it("cache kedaluwarsa: muat penuh tanpa ?rev=", async () => {
    writeIndexCache(
      storage,
      buildIndexCacheEntry(
        { companies: LIVE_COMPANIES, meta: null, rev: 7 },
        Date.now() - INDEX_CACHE_TTL_MS - 1000,
      ),
    );
    const list = await loadIndex();
    assert.deepEqual(list, LIVE_COMPANIES);
    assert.deepEqual(indexCalls(), ["/api/index"]);
  });

  it("respons seed tidak disimpan ke cache", async () => {
    modes.index = "seed";
    const list = await loadIndex();
    assert.deepEqual(list, SEED_COMPANIES);
    assert.equal(storage.getItem(INDEX_CACHE_KEY), null);
  });

  it("401 sekali: token baru diminta lalu ulang berhasil", async () => {
    modes.index = "401-once";
    const list = await loadIndex();
    assert.deepEqual(list, LIVE_COMPANIES);
    assert.deepEqual(indexCalls(), ["/api/index", "/api/index"]);
    const stored = JSON.parse(storage.getItem(INDEX_CACHE_KEY));
    assert.equal(stored.rev, 7);
  });

  it("dingin + jaringan gagal: melempar (hook menampilkan error)", async () => {
    modes.index = "throw";
    await assert.rejects(loadIndex(), /jaringan putus/);
  });
});
