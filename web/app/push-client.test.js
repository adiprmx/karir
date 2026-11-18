/* Test helper klien notifikasi web push (T10) — memakai test
 * runner bawaan Node. Dijalankan dengan:
 *   node --test app/push-client.test.js
 * (koordinator menambahkan berkas ini ke skrip `npm test`.)
 *
 * Yang dites: rollback langganan browser pada tiap jalur gagal
 * sesudah langganan dibuat — khususnya getIdToken() yang melempar
 * (RENDAH-3: jalur itu terlewat rollback di kode lama, sehingga
 * langganan browser menggantung tanpa dokumen server dan status
 * bohong "aktif"). Browser ditiru dengan global tiruan
 * (window/navigator/Notification/fetch); Firebase diganti stub
 * lewat loader test (lib/push-client-test-loader.mjs). Tidak ada
 * jaringan, tidak ada push sungguhan, tidak ada service worker
 * asli. Kunci VAPID uji dibuat lewat generateVAPIDKeys (kunci
 * asli yang dibuat di tempat, bukan kunci produksi). P-07/K5
 * menambah: deteksi kunci VAPID basi (getPushStatus "stale-key")
 * dan subscribe ulang (resubscribePush). */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { generateVAPIDKeys } from "web-push";
import { auth } from "../lib/push-client-firebase-stub.mjs";

const VAPID = generateVAPIDKeys();
const VAPID_LAMA = generateVAPIDKeys();
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID.publicKey;

/* Loader `@/lib/firebase` -> stub harus terdaftar SEBELUM
 * push-client.js diimpor, karena itu impornya dinamis di bawah. */
register("../lib/push-client-test-loader.mjs", import.meta.url);

const {
  getPushStatus,
  resubscribePush,
  subscribePush,
  unsubscribePush,
  VAPID_KEY_STORAGE_KEY,
} = await import("./push-client.js");

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/langganan-uji";
const ID_TOKEN = "token-id-uji";

/* --- Browser tiruan (di-install ulang tiap test) --- */
let fakeSubscription;
let fakeRegistration;
let fakeStorage;
let fetchCalls;
let fetchBehavior;

function installBrowserGlobals() {
  fakeSubscription = {
    endpoint: ENDPOINT,
    unsubscribed: false,
    toJSON: () => ({
      endpoint: ENDPOINT,
      keys: { p256dh: "kunci-uji", auth: "auth-uji" },
    }),
    unsubscribe: async () => {
      fakeSubscription.unsubscribed = true;
      return true;
    },
  };
  fakeRegistration = null;
  fakeStorage = {};
  fetchCalls = [];
  fetchBehavior = "ok";
  globalThis.window = {
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    PushManager: function PushManager() {},
    Notification: function Notification() {},
    localStorage: {
      getItem: (key) =>
        key in fakeStorage ? fakeStorage[key] : null,
      setItem: (key, value) => {
        fakeStorage[key] = String(value);
      },
      removeItem: (key) => {
        delete fakeStorage[key];
      },
    },
  };
  Object.defineProperty(globalThis, "navigator", {
    value: {
      userAgent: "Browser Uji/1.0",
      serviceWorker: {
        register: async () => ({
          pushManager: {
            subscribe: async () => fakeSubscription,
            getSubscription: async () => fakeSubscription,
          },
        }),
        getRegistration: async () => fakeRegistration,
      },
    },
    configurable: true,
  });
  globalThis.Notification = {
    permission: "granted",
    requestPermission: async () => "granted",
  };
  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({ url, options });
    if (fetchBehavior === "server-error") {
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: "Langganan tidak bisa disimpan." }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, subscribed: true }),
    };
  };
}

function signedInUser(getIdToken) {
  return { uid: "uid-uji-push-client", getIdToken };
}

beforeEach(() => {
  installBrowserGlobals();
  auth.currentUser = null;
});

describe("subscribePush: rollback langganan browser (T10)", () => {
  it("getIdToken() melempar: gagal + langganan browser dibatalkan (RENDAH-3)", async () => {
    auth.currentUser = signedInUser(async () => {
      throw new Error("jaringan putus saat refresh token");
    });
    const result = await subscribePush();
    assert.deepEqual(result, { ok: false, code: "gagal" });
    /* Kode lama: unsubscribe TIDAK dipanggil — langganan
     * menggantung tanpa dokumen server (status "aktif" palsu). */
    assert.equal(fakeSubscription.unsubscribed, true);
    /* Token tidak pernah didapat, jadi server tidak dihubungi. */
    assert.equal(fetchCalls.length, 0);
  });

  it("aliran sukses: ok + langganan TIDAK dibatalkan + token dikirim", async () => {
    auth.currentUser = signedInUser(async () => ID_TOKEN);
    const result = await subscribePush();
    assert.deepEqual(result, { ok: true, code: "ok" });
    assert.equal(fakeSubscription.unsubscribed, false);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "/api/push/subscribe");
    assert.equal(fetchCalls[0].options.method, "POST");
    assert.equal(
      fetchCalls[0].options.headers.Authorization,
      `Bearer ${ID_TOKEN}`,
    );
    const sent = JSON.parse(fetchCalls[0].options.body);
    assert.equal(sent.subscription.endpoint, ENDPOINT);
  });

  it("server menolak (500): gagal + langganan browser dibatalkan", async () => {
    auth.currentUser = signedInUser(async () => ID_TOKEN);
    fetchBehavior = "server-error";
    const result = await subscribePush();
    assert.deepEqual(result, { ok: false, code: "gagal" });
    assert.equal(fakeSubscription.unsubscribed, true);
    assert.equal(fetchCalls.length, 1);
  });

  it("belum masuk akun: belum-masuk + langganan browser dibatalkan", async () => {
    auth.currentUser = null;
    const result = await subscribePush();
    assert.deepEqual(result, { ok: false, code: "belum-masuk" });
    assert.equal(fakeSubscription.unsubscribed, true);
    assert.equal(fetchCalls.length, 0);
  });
});

describe("deteksi kunci VAPID basi + subscribe ulang (P-07/K5)", () => {
  function pasangRegistrasiAktif() {
    fakeRegistration = {
      pushManager: {
        getSubscription: async () => fakeSubscription,
      },
    };
  }

  it("getPushStatus: langganan aktif + kunci tersimpan sama -> active", async () => {
    pasangRegistrasiAktif();
    fakeStorage[VAPID_KEY_STORAGE_KEY] = VAPID.publicKey;
    assert.equal(await getPushStatus(), "active");
  });

  it("getPushStatus: langganan aktif tanpa kunci tersimpan (lama) -> active, bukan basi", async () => {
    pasangRegistrasiAktif();
    assert.equal(await getPushStatus(), "active");
  });

  it("getPushStatus: kunci tersimpan berbeda dengan kunci saat ini -> stale-key", async () => {
    pasangRegistrasiAktif();
    fakeStorage[VAPID_KEY_STORAGE_KEY] = VAPID_LAMA.publicKey;
    assert.equal(await getPushStatus(), "stale-key");
  });

  it("getPushStatus: tanpa langganan -> inactive walau kunci tersimpan basi", async () => {
    fakeRegistration = {
      pushManager: { getSubscription: async () => null },
    };
    fakeStorage[VAPID_KEY_STORAGE_KEY] = VAPID_LAMA.publicKey;
    assert.equal(await getPushStatus(), "inactive");
  });

  it("subscribePush sukses menyimpan kunci yang dipakai", async () => {
    auth.currentUser = signedInUser(async () => ID_TOKEN);
    const result = await subscribePush();
    assert.deepEqual(result, { ok: true, code: "ok" });
    assert.equal(fakeStorage[VAPID_KEY_STORAGE_KEY], VAPID.publicKey);
  });

  it("subscribePush gagal (server menolak) TIDAK menyimpan kunci", async () => {
    auth.currentUser = signedInUser(async () => ID_TOKEN);
    fetchBehavior = "server-error";
    const result = await subscribePush();
    assert.deepEqual(result, { ok: false, code: "gagal" });
    assert.equal(VAPID_KEY_STORAGE_KEY in fakeStorage, false);
  });

  it("unsubscribePush membersihkan kunci tersimpan", async () => {
    pasangRegistrasiAktif();
    fakeStorage[VAPID_KEY_STORAGE_KEY] = VAPID.publicKey;
    auth.currentUser = signedInUser(async () => ID_TOKEN);
    const result = await unsubscribePush();
    assert.deepEqual(result, { ok: true, code: "ok" });
    assert.equal(fakeSubscription.unsubscribed, true);
    assert.equal(VAPID_KEY_STORAGE_KEY in fakeStorage, false);
  });

  it("resubscribePush: batalkan langganan lama lalu subscribe baru + kunci baru tersimpan", async () => {
    pasangRegistrasiAktif();
    fakeStorage[VAPID_KEY_STORAGE_KEY] = VAPID_LAMA.publicKey;
    auth.currentUser = signedInUser(async () => ID_TOKEN);
    const result = await resubscribePush();
    assert.deepEqual(result, { ok: true, code: "ok" });
    /* Langganan browser lama dibatalkan. */
    assert.equal(fakeSubscription.unsubscribed, true);
    /* Dua panggilan server: DELETE dokumen lama, POST dokumen baru. */
    assert.equal(fetchCalls.length, 2);
    assert.equal(fetchCalls[0].options.method, "DELETE");
    assert.equal(fetchCalls[1].options.method, "POST");
    /* Kunci baru tersimpan — status berikutnya active. */
    assert.equal(fakeStorage[VAPID_KEY_STORAGE_KEY], VAPID.publicKey);
    assert.equal(await getPushStatus(), "active");
  });

  it("resubscribePush: batalkan lama gagal -> gagal, tidak subscribe baru", async () => {
    pasangRegistrasiAktif();
    fakeSubscription.unsubscribe = async () => {
      throw new Error("unsubscribe gagal");
    };
    auth.currentUser = signedInUser(async () => ID_TOKEN);
    const result = await resubscribePush();
    assert.deepEqual(result, { ok: false, code: "gagal" });
    assert.equal(fetchCalls.length, 0);
  });
});
