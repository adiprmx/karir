/* Tes unit untuk lib/analytics.js (klien, QA-07) + kontrak event
 * klien vs validateEvent server — memakai test runner bawaan Node.
 * Dijalankan dengan: node --test lib/analytics-client.test.js
 * (koordinator menambahkan file ini ke skrip "test" di package.json).
 * Yang dites: getVisitorId, setAnalyticsUid/clearAnalyticsUid, dan
 * bentuk event yang dikirim trackEvent dibandingkan langsung dengan
 * validateEvent dari lib/analytics-server.js (kontrak klien-server).
 * setAnalyticsIdToken/clearAnalyticsUid untuk idToken sudah diuji
 * di lib/analytics.test.js dan tidak diulang di sini.
 * Di Node tidak ada localStorage/navigator, jadi keduanya di-stub;
 * fetch global di-stub untuk menangkap body yang dikirim. Penyegaran
 * token malas memanggil import("@/lib/firebase") yang tidak bisa
 * di-resolve di Node; kegagalannya ditelan modul (perilaku yang
 * diharapkan saat Firebase tidak tersedia). */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getVisitorId,
  setAnalyticsUid,
  clearAnalyticsUid,
  trackEvent,
} from "./analytics.js";
import { validateEvent, EVENT_TYPES } from "./analytics-server.js";

/* localStorage tiruan berbasis Map. */
function pasangLocalStorage() {
  const simpan = new Map();
  globalThis.localStorage = {
    getItem: (k) => (simpan.has(k) ? simpan.get(k) : null),
    setItem: (k, v) => {
      simpan.set(k, String(v));
    },
    removeItem: (k) => {
      simpan.delete(k);
    },
  };
  return simpan;
}

let terkirim;
let fetchAsli;
let localStorageAsli;
const navigatorDesc = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);

function pasangNavigator(stub) {
  Object.defineProperty(globalThis, "navigator", {
    value: stub,
    configurable: true,
    writable: true,
  });
}

function pulihkanNavigator() {
  if (navigatorDesc) Object.defineProperty(globalThis, "navigator", navigatorDesc);
  else delete globalThis.navigator;
}

beforeEach(() => {
  terkirim = [];
  fetchAsli = globalThis.fetch;
  localStorageAsli = globalThis.localStorage;
  globalThis.fetch = async (_url, options) => {
    terkirim.push(JSON.parse(options.body));
    return { ok: true };
  };
  clearAnalyticsUid();
});

afterEach(() => {
  globalThis.fetch = fetchAsli;
  if (localStorageAsli === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = localStorageAsli;
  pulihkanNavigator();
  clearAnalyticsUid();
});

describe("getVisitorId (QA-07)", () => {
  it("tanpa localStorage mengembalikan null", () => {
    delete globalThis.localStorage;
    assert.equal(getVisitorId(), null);
  });

  it("membuat id 32 heksa baru lalu memakai lagi id yang sama", () => {
    const simpan = pasangLocalStorage();
    const pertama = getVisitorId();
    assert.match(pertama, /^[0-9a-f]{32}$/);
    assert.equal(simpan.get("karir-visitor"), pertama);
    assert.equal(getVisitorId(), pertama);
    assert.equal(simpan.size, 1);
  });

  it("id yang sudah tersimpan dipakai apa adanya", () => {
    const simpan = pasangLocalStorage();
    simpan.set("karir-visitor", "id-tersimpan-uji");
    assert.equal(getVisitorId(), "id-tersimpan-uji");
  });

  it("localStorage yang melempar tidak merusak halaman (null)", () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error("ditolak");
      },
      setItem: () => {
        throw new Error("ditolak");
      },
    };
    assert.equal(getVisitorId(), null);
  });
});

describe("setAnalyticsUid / clearAnalyticsUid (QA-07)", () => {
  it("uid yang dipasang ikut di body event", () => {
    pasangLocalStorage();
    setAnalyticsUid("uid-uji-123");
    trackEvent({ type: "pageview", path: "/cari" });
    assert.equal(terkirim.length, 1);
    assert.equal(terkirim[0].uid, "uid-uji-123");
  });

  it("uid dipotong ke 128 karakter", () => {
    pasangLocalStorage();
    setAnalyticsUid("u".repeat(200));
    trackEvent({ type: "pageview", path: "/" });
    assert.equal(terkirim[0].uid.length, 128);
  });

  it("uid kosong atau bukan string diabaikan", () => {
    pasangLocalStorage();
    setAnalyticsUid("");
    trackEvent({ type: "pageview", path: "/" });
    assert.equal("uid" in terkirim[0], false);
    setAnalyticsUid(42);
    trackEvent({ type: "pageview", path: "/" });
    assert.equal("uid" in terkirim[1], false);
  });

  it("clearAnalyticsUid menghapus uid dari event berikut", () => {
    pasangLocalStorage();
    setAnalyticsUid("uid-uji-123");
    clearAnalyticsUid();
    trackEvent({ type: "pageview", path: "/" });
    assert.equal(terkirim.length, 1);
    assert.equal("uid" in terkirim[0], false);
  });
});

describe("trackEvent: bentuk dasar (QA-07)", () => {
  it("event tanpa type tidak mengirim apa pun", () => {
    pasangLocalStorage();
    trackEvent({});
    trackEvent(null);
    trackEvent({ type: 42, path: "/" });
    assert.equal(terkirim.length, 0);
  });

  it("path diisi lokasi halaman bila tidak disebut", () => {
    pasangLocalStorage();
    trackEvent({ type: "pageview" });
    assert.equal(terkirim[0].path, "/");
    trackEvent({ type: "pageview", path: "/cari" });
    assert.equal(terkirim[1].path, "/cari");
  });

  it("visitor dari getVisitorId ikut terkirim", () => {
    pasangLocalStorage();
    trackEvent({ type: "pageview", path: "/" });
    assert.match(terkirim[0].visitor, /^[0-9a-f]{32}$/);
  });

  it("sendBeacon yang berhasil dipakai, fetch tidak dipanggil", () => {
    pasangLocalStorage();
    const beacon = [];
    pasangNavigator({
      sendBeacon: (_url, blob) => {
        beacon.push(blob);
        return true;
      },
    });
    let fetchDipanggil = false;
    globalThis.fetch = async () => {
      fetchDipanggil = true;
      return { ok: true };
    };
    trackEvent({ type: "pageview", path: "/" });
    assert.equal(beacon.length, 1);
    assert.equal(fetchDipanggil, false);
  });

  it("sendBeacon yang gagal jatuh ke fetch", async () => {
    pasangLocalStorage();
    pasangNavigator({ sendBeacon: () => false });
    trackEvent({ type: "pageview", path: "/" });
    /* fetch dipanggil sinkron di trackEvent; beri satu giliran. */
    await new Promise((r) => setImmediate(r));
    assert.equal(terkirim.length, 1);
  });
});

describe("kontrak event klien vs validateEvent server (QA-07)", () => {
  it("setiap tipe event yang dikirim klien lolos validateEvent", () => {
    pasangLocalStorage();
    for (const type of EVENT_TYPES) {
      trackEvent({
        type,
        path: "/cari",
        q: "gudang",
        companyNo: 12,
        action: "buka",
      });
    }
    assert.equal(terkirim.length, EVENT_TYPES.length);
    for (const body of terkirim) {
      const { ok, event } = validateEvent(body);
      assert.equal(ok, true, `type ${body.type} ditolak server`);
      assert.equal(event.type, body.type);
      assert.equal(event.path, body.path);
      assert.equal(event.q, "gudang");
      assert.equal(event.companyNo, 12);
      assert.equal(event.action, "buka");
      /* uid dari body tidak pernah dipercaya server (SEC-07):
       * validateEvent membuangnya. */
      assert.equal("uid" in event, false);
    }
  });

  it("portal_click dari halaman detail: companyNo angka lolos", () => {
    pasangLocalStorage();
    trackEvent({
      type: "portal_click",
      path: "/perusahaan/299",
      companyNo: 299,
      action: "portal",
    });
    assert.equal(terkirim.length, 1);
    const { ok, event } = validateEvent(terkirim[0]);
    assert.equal(ok, true);
    assert.equal(event.companyNo, 299);
  });

  it("search dengan results 0 (tanpa hasil) lolos", () => {
    pasangLocalStorage();
    trackEvent({
      type: "search",
      path: "/cari",
      q: "gudang",
      results: 0,
    });
    const { ok, event } = validateEvent(terkirim[0]);
    assert.equal(ok, true);
    assert.equal(event.results, 0);
  });

  it("filter dengan string pasangan kategori|status|kota lolos", () => {
    pasangLocalStorage();
    trackEvent({
      type: "filter",
      path: "/cari",
      filter: "kategori:Logistik|status:Ada lowongan|kota:Depok",
    });
    const { ok, event } = validateEvent(terkirim[0]);
    assert.equal(ok, true);
    assert.equal(
      event.filter,
      "kategori:Logistik|status:Ada lowongan|kota:Depok",
    );
  });

  it("uid terverifikasi masuk lewat argumen kedua, bukan body klien", () => {
    pasangLocalStorage();
    setAnalyticsUid("uid-uji-123");
    trackEvent({ type: "pageview", path: "/" });
    const body = terkirim[0];
    /* Body klien membawa uid, tetapi server mengabaikannya. */
    assert.equal(body.uid, "uid-uji-123");
    const tanpaVerifikasi = validateEvent(body);
    assert.equal("uid" in tanpaVerifikasi.event, false);
    const terverifikasi = validateEvent(body, "uid-uji-123");
    assert.equal(terverifikasi.event.uid, "uid-uji-123");
  });
});
