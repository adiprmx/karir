/* Tes unit untuk lib/index-token.js, memakai test runner bawaan Node.
 * Dijalankan dengan: node --test lib/index-token.test.js
 * (Belum masuk ke skrip `npm test` karena package.json dipegang tim
 * server; skrip itu tetap menjalankan dua file tes yang lama.)
 * Yang dites: izin diminta sekali lalu dipakai ulang, izin yang
 * hampir habis tidak dipakai, 401 memicu satu kali ambil izin baru
 * dan satu kali ulangan, dan kegagalan diteruskan sebagai error,
 * bukan daftar kosong. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TOKEN_TTL_MS,
  TOKEN_SAFETY_MS,
  parseTokenResponse,
  isTokenFresh,
  createIndexFetcher,
} from "./index-token.js";

function companies() {
  return [{ no: 1, perusahaan: "PT Contoh" }];
}

function stubFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options, calls);
  };
  return { fetchImpl, calls };
}

function okJson(json, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => json };
}

describe("parseTokenResponse", () => {
  it("izin tanpa masa berlaku memakai 60 detik", () => {
    const parsed = parseTokenResponse({ token: "abc" }, 1000);
    assert.equal(parsed.token, "abc");
    assert.equal(parsed.expiresAt, 1000 + TOKEN_TTL_MS);
  });

  it("masa berlaku dari server dipakai bila ada", () => {
    const parsed = parseTokenResponse({ token: "abc", expiresIn: 30 }, 1000);
    assert.equal(parsed.expiresAt, 1000 + 30_000);
  });

  it("tanpa izin hasilnya null", () => {
    assert.equal(parseTokenResponse({}, 1000), null);
    assert.equal(parseTokenResponse({ token: "" }, 1000), null);
    assert.equal(parseTokenResponse(null, 1000), null);
  });
});

describe("isTokenFresh", () => {
  it("izin baru masih segar, yang tinggal kurang dari 10 detik tidak", () => {
    const cached = { token: "abc", expiresAt: 1000 + TOKEN_TTL_MS };
    assert.equal(isTokenFresh(cached, 1000), true);
    assert.equal(
      isTokenFresh(cached, 1000 + TOKEN_TTL_MS - TOKEN_SAFETY_MS),
      false,
    );
    assert.equal(isTokenFresh(cached, 1000 + TOKEN_TTL_MS), false);
    assert.equal(isTokenFresh(null, 1000), false);
  });
});

describe("createIndexFetcher", () => {
  it("izin diminta sekali lalu dipakai ulang untuk panggilan berikut", async () => {
    const { fetchImpl, calls } = stubFetch((url) => {
      if (url === "/api/token") return okJson({ token: "t1" });
      return okJson({ companies: companies() });
    });
    const { fetchIndex } = createIndexFetcher(fetchImpl);
    assert.deepEqual(await fetchIndex(), companies());
    assert.deepEqual(await fetchIndex(), companies());
    assert.equal(
      calls.filter((c) => c.url === "/api/token").length,
      1,
    );
    const indexCall = calls.find((c) => c.url === "/api/index");
    assert.equal(indexCall.options.headers.Authorization, "Bearer t1");
  });

  it("401 memicu satu izin baru dan satu ulangan, lalu berhasil", async () => {
    let tokens = 0;
    const { fetchImpl, calls } = stubFetch((url, options) => {
      if (url === "/api/token") {
        tokens += 1;
        return okJson({ token: `t${tokens}` });
      }
      const auth = options.headers.Authorization;
      if (auth === "Bearer t1") return okJson({ error: "x" }, 401);
      return okJson({ companies: companies() });
    });
    const { fetchIndex } = createIndexFetcher(fetchImpl);
    assert.deepEqual(await fetchIndex(), companies());
    assert.equal(tokens, 2);
    assert.equal(
      calls.filter((c) => c.url === "/api/index").length,
      2,
    );
  });

  it("401 kedua diteruskan sebagai error, bukan daftar kosong", async () => {
    const { fetchImpl } = stubFetch((url) => {
      if (url === "/api/token") return okJson({ token: "t1" });
      return okJson({ error: "x" }, 401);
    });
    const { fetchIndex } = createIndexFetcher(fetchImpl);
    await assert.rejects(fetchIndex(), /gagal/);
  });

  it("izin yang gagal diminta diteruskan sebagai error", async () => {
    const { fetchImpl } = stubFetch((url) => {
      if (url === "/api/token") return okJson({ error: "x" }, 401);
      return okJson({ companies: companies() });
    });
    const { fetchIndex } = createIndexFetcher(fetchImpl);
    await assert.rejects(fetchIndex(), /gagal/);
  });

  it("daftar perusahaan yang bukan array dibaca sebagai daftar kosong", async () => {
    const { fetchImpl } = stubFetch((url) => {
      if (url === "/api/token") return okJson({ token: "t1" });
      return okJson({ companies: null });
    });
    const { fetchIndex } = createIndexFetcher(fetchImpl);
    assert.deepEqual(await fetchIndex(), []);
  });
});
