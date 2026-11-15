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
 * asli yang dibuat di tempat, bukan kunci produksi). */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { generateVAPIDKeys } from "web-push";
import { auth } from "../lib/push-client-firebase-stub.mjs";

const VAPID = generateVAPIDKeys();
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID.publicKey;

/* Loader `@/lib/firebase` -> stub harus terdaftar SEBELUM
 * push-client.js diimpor, karena itu impornya dinamis di bawah. */
register("../lib/push-client-test-loader.mjs", import.meta.url);

const { subscribePush } = await import("./push-client.js");

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/langganan-uji";
const ID_TOKEN = "token-id-uji";

/* --- Browser tiruan (di-install ulang tiap test) --- */
let fakeSubscription;
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
  fetchCalls = [];
  fetchBehavior = "ok";
  globalThis.window = {
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    PushManager: function PushManager() {},
    Notification: function Notification() {},
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
        getRegistration: async () => null,
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
