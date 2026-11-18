/* Tes konsolidasi token service account (BE2-24, P-04): satu modul
 * lib/service-account-token.js dengan satu cache yang dipakai
 * bersama getAccessToken (lib/firestore-server.js, melempar saat
 * gagal) dan getServiceAccountAccessToken (lib/analytics-server.js,
 * null saat gagal). Dijalankan dengan:
 *   node --test lib/service-account-token.test.js
 * Semua fetch di-mock; tidak ada jaringan dan tidak ada secret asli.
 * Kunci RSA uji dibuat di tempat (tanda tangan JWT tidak pernah
 * diverifikasi — endpoint token di-mock). */
import { describe, it, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  getServiceAccountAccessToken,
  resetServiceAccountTokenCache,
} from "./service-account-token.js";
import { getAccessToken } from "./firestore-server.js";
import { getServiceAccountAccessToken as getTokenViaAnalytics } from "./analytics-server.js";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function countingTokenFetch({ token = "tok-uji-1", status = 200 } = {}) {
  let calls = 0;
  const fn = async (url) => {
    calls += 1;
    assert.ok(
      String(url).includes("oauth2.googleapis.com/token"),
      `URL tak terduga: ${url}`,
    );
    return jsonResponse(
      status === 200 ? { access_token: token } : {},
      status,
    );
  };
  fn.calls = () => calls;
  return fn;
}

describe("getServiceAccountAccessToken — satu cache bersama (BE2-24)", () => {
  let privateKeyUji;
  let saUji;
  let saLama;
  before(() => {
    saLama = process.env.FIREBASE_SERVICE_ACCOUNT;
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    privateKeyUji = privateKey.export({ type: "pkcs8", format: "pem" });
    saUji = {
      client_email: "uji@proyek-uji.iam.gserviceaccount.com",
      private_key: privateKeyUji,
      project_id: "proyek-uji",
    };
  });
  beforeEach(() => {
    resetServiceAccountTokenCache();
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
  });
  afterEach(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    resetServiceAccountTokenCache();
    if (saLama !== undefined) {
      process.env.FIREBASE_SERVICE_ACCOUNT = saLama;
    }
  });

  it("token ditukar sekali lalu dipakai ulang antar-panggilan", async () => {
    const fetchMock = countingTokenFetch();
    const nowMs = Date.now();
    const pertama = await getServiceAccountAccessToken({
      sa: saUji,
      fetchImpl: fetchMock,
      nowMs,
    });
    const kedua = await getServiceAccountAccessToken({
      sa: saUji,
      fetchImpl: fetchMock,
      nowMs,
    });
    assert.equal(pertama, "tok-uji-1");
    assert.equal(kedua, "tok-uji-1");
    assert.equal(fetchMock.calls(), 1);
  });

  it("cache dipakai bersama: analytics lalu firestore hanya menukar sekali", async () => {
    /* Bukti konsolidasi BE2-24: dua jalur pemanggil lama kini
     * berbagi satu cache — panggilan kedua (lewat pembungkus
     * firestore-server) tidak menukar JWT lagi. */
    const fetchMock = countingTokenFetch();
    const viaAnalytics = await getTokenViaAnalytics({
      sa: saUji,
      fetchImpl: fetchMock,
    });
    const viaFirestore = await getAccessToken(saUji, {
      fetchImpl: fetchMock,
    });
    assert.equal(viaAnalytics, "tok-uji-1");
    assert.equal(viaFirestore, "tok-uji-1");
    assert.equal(fetchMock.calls(), 1);
  });

  it("cache dipakai bersama arah sebaliknya: firestore lalu analytics", async () => {
    const fetchMock = countingTokenFetch();
    assert.equal(
      await getAccessToken(saUji, { fetchImpl: fetchMock }),
      "tok-uji-1",
    );
    assert.equal(
      await getTokenViaAnalytics({ sa: saUji, fetchImpl: fetchMock }),
      "tok-uji-1",
    );
    assert.equal(fetchMock.calls(), 1);
  });

  it("token kedaluwarsa (lewat margin 5 menit) ditukar ulang", async () => {
    let tokenCalls = 0;
    const fetchMock = async () => {
      tokenCalls += 1;
      return jsonResponse({ access_token: `tok-uji-${tokenCalls}` });
    };
    const nowMs = Date.now();
    assert.equal(
      await getServiceAccountAccessToken({
        sa: saUji,
        fetchImpl: fetchMock,
        nowMs,
      }),
      "tok-uji-1",
    );
    /* 56 menit kemudian: sisa masa berlaku < 5 menit → tukar ulang. */
    assert.equal(
      await getServiceAccountAccessToken({
        sa: saUji,
        fetchImpl: fetchMock,
        nowMs: nowMs + 56 * 60 * 1000,
      }),
      "tok-uji-2",
    );
    assert.equal(tokenCalls, 2);
  });

  it("service account berbeda memakai slot cache berbeda", async () => {
    let tokenCalls = 0;
    const fetchMock = async () => {
      tokenCalls += 1;
      return jsonResponse({ access_token: `tok-uji-${tokenCalls}` });
    };
    const saLain = {
      ...saUji,
      client_email: "lain@proyek-uji.iam.gserviceaccount.com",
    };
    const nowMs = Date.now();
    assert.equal(
      await getServiceAccountAccessToken({
        sa: saUji,
        fetchImpl: fetchMock,
        nowMs,
      }),
      "tok-uji-1",
    );
    assert.equal(
      await getServiceAccountAccessToken({
        sa: saLain,
        fetchImpl: fetchMock,
        nowMs,
      }),
      "tok-uji-2",
    );
    /* Panggilan ulang keduanya dari cache — tanpa tukar lagi. */
    assert.equal(
      await getServiceAccountAccessToken({
        sa: saUji,
        fetchImpl: fetchMock,
        nowMs,
      }),
      "tok-uji-1",
    );
    assert.equal(
      await getServiceAccountAccessToken({
        sa: saLain,
        fetchImpl: fetchMock,
        nowMs,
      }),
      "tok-uji-2",
    );
    assert.equal(tokenCalls, 2);
  });

  it("tanpa SA (argumen maupun env): null dan fetch tidak dipanggil", async () => {
    const fetchJanganPanggil = () => {
      throw new Error("fetch tidak boleh dipanggil");
    };
    assert.equal(
      await getServiceAccountAccessToken({
        fetchImpl: fetchJanganPanggil,
      }),
      null,
    );
  });

  it("SA dari env dipakai bila argumen sa tidak diberikan", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(saUji);
    const fetchMock = countingTokenFetch();
    assert.equal(
      await getServiceAccountAccessToken({ fetchImpl: fetchMock }),
      "tok-uji-1",
    );
    assert.equal(fetchMock.calls(), 1);
  });

  it("endpoint token 500 → null (tanpa lempar)", async () => {
    const fetchMock = countingTokenFetch({ status: 500 });
    assert.equal(
      await getServiceAccountAccessToken({
        sa: saUji,
        fetchImpl: fetchMock,
      }),
      null,
    );
  });

  it("kunci privat tidak valid → null (tanpa lempar)", async () => {
    const fetchJanganPanggil = () => {
      throw new Error("fetch tidak boleh dipanggil");
    };
    assert.equal(
      await getServiceAccountAccessToken({
        sa: { ...saUji, private_key: "bukan-kunci-privat" },
        fetchImpl: fetchJanganPanggil,
      }),
      null,
    );
  });

  it("getAccessToken (firestore-server) melempar bila penukaran gagal", async () => {
    const fetchMock = countingTokenFetch({ status: 500 });
    await assert.rejects(
      getAccessToken(saUji, { fetchImpl: fetchMock }),
      /Token tukar gagal/,
    );
  });
});
