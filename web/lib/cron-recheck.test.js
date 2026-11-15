/* Test handler rute cron recheck (NOTIF-12), memakai test runner
 * bawaan Node. Dijalankan dengan:
 *   node --test lib/cron-recheck.test.js
 * (koordinator menambahkan berkas ini ke skrip `npm test`.)
 *
 * Handler rute Next.js diimpor langsung lewat loader test
 * (route-test-loader.mjs: alias `@/` + stub `next/server`) lalu
 * dipanggil dengan Request tiruan; semua fetch (Firestore REST,
 * tukar token service account) di-mock — tidak ada jaringan, tidak
 * ada secret asli, tidak ada cron yang benar-benar jalan.
 *
 * Yang dites: gerbang CRON_SECRET (fail-closed, NOTIF-02),
 * kelengkapan service account, gagal tukar token, data seed
 * dilewati (cron hanya jalan dari data live), fase alert sebelum
 * loop cek (NOTIF-15, alert new-target + deadline, id deterministik,
 * 409 = sudah ada, gagal tulis dikeluarkan dari snapshot NOTIF-06),
 * loop cek portal (portal mati -> status berubah + perubahan
 * tercatat), marker kesegaran, dan heartbeat cron-runs (OPS-01).
 * Wiring digest web push (T10, RENDAH-5) juga dites di sini:
 * impor `web-push` di lib/push.js dipetakan ke stub test
 * (lib/webpush-test-loader.mjs) supaya pemanggilan sendPushDigest
 * + argumen freshAlerts-nya bisa diamati tanpa jaringan.
 * Logika murni notifikasi (collectNewTargetAlerts,
 * collectDeadlineAlerts, formatTelegramMessage, markAlertsSent)
 * SUDAH teruji di lib/notify.test.js dan tidak diulang di sini.
 * Kirim Telegram langsung tidak dites end-to-end (butuh token bot
 * asli); yang dites adalah cabangnya: tanpa token, pengiriman
 * dilewati dengan status skipped-no-token. */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { generateKeyPairSync } from "node:crypto";
/* Impor STATIS dari `web-push` di sini resolve ke library ASLI
 * (loader stub baru terdaftar di bawah, sesudah impor statis
 * di-link) — dipakai hanya untuk membuat pasangan kunci VAPID
 * uji. Impor `web-push` di lib/push.js (yang dimuat belakangan
 * lewat impor dinamis rute) resolve ke stub test. */
import { generateVAPIDKeys } from "web-push";
import { revalidateCompanies } from "./companies.js";
import { webpushStub } from "./webpush-test-stub.mjs";

/* --- Env dummy (sebelum impor rute) --- */
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji-t16b";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "kunci-api-uji-bukan-asli";
process.env.CRON_SECRET = "secret-cron-uji-bukan-asli";
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;

/* Kunci RSA uji untuk service account tiruan (tanda tangan JWT
 * tidak pernah diverifikasi di sini — endpoint token di-mock). */
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SA_JSON = JSON.stringify({
  client_email: "uji@proyek-uji-t16b.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  project_id: "proyek-uji-t16b",
});

/* Loader `@/` + `next/server` harus terdaftar SEBELUM rute diimpor.
 * Loader stub `web-push` didaftar bersama (untuk test wiring
 * digest push, RENDAH-5). */
register("./route-test-loader.mjs", import.meta.url);
register("./webpush-test-loader.mjs", import.meta.url);

/* Pasangan kunci VAPID uji (dibuat di tempat, bukan kunci
 * produksi) — dipasang ke env hanya di dalam test push. */
const VAPID = generateVAPIDKeys();

const { GET: getRecheck } = await import(
  "../app/api/cron/recheck/route.js"
);

/* --- Konstanta uji --- */
const ORIGIN = "https://karir.local";
const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const IP = "203.0.113.31";
const CRON = process.env.CRON_SECRET;

function todayWib() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function besokWib() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString(
    "en-CA",
    { timeZone: "Asia/Jakarta" },
  );
}

function fakeRequest({ headers = {} } = {}) {
  return {
    url: `${ORIGIN}/api/cron/recheck`,
    headers: new Headers({ "user-agent": BROWSER_UA, ...headers }),
    nextUrl: new URL(`${ORIGIN}/api/cron/recheck`),
  };
}

function cronRequest() {
  return fakeRequest({
    headers: { "x-real-ip": IP, authorization: `Bearer ${CRON}` },
  });
}

/* --- Dokumen Firestore tiruan (bentuk REST yang dibaca
 * docToCompany — sama persis dengan mock api-routes.test.js) --- */
function companyDoc(no, perusahaan, status, overrides = {}) {
  return {
    name: `projects/proyek-uji-t16b/databases/(default)/documents/companies/${no}`,
    fields: {
      no: { integerValue: String(no) },
      perusahaan: { stringValue: perusahaan },
      kategori: { stringValue: "Ritel" },
      /* localhost:9 supaya checkUrl gagal tertutup TANPA DNS
       * (penjaga SSRF menolak localhost sinkron) — jalur portal
       * mati jadi deterministik dan cepat. */
      link_karir: { stringValue: "http://localhost:9/karir" },
      status: { stringValue: status },
      tanggal_cek: { stringValue: "2026-11-14" },
      catatan: { stringValue: "" },
      lokasi: { stringValue: "Depok" },
      posisi: { stringValue: "Staff Gudang" },
      batas_lamar: { stringValue: "" },
      email_hrd: { stringValue: "" },
      wa_hrd: { stringValue: "" },
      kontak_lain: { stringValue: "" },
      ...overrides,
    },
  };
}

function markerDoc() {
  return {
    fields: {
      rev: { integerValue: "1" },
      updatedAt: { stringValue: "2026-11-15T00:00:00.000Z" },
      counterDay: { stringValue: todayWib() },
      refillsToday: { integerValue: "0" },
      readsEstimate: { integerValue: "0" },
    },
  };
}

function snapshotDoc(nos) {
  return {
    fields: {
      targetNos: {
        arrayValue: {
          values: nos.map((no) => ({ integerValue: String(no) })),
        },
      },
      updatedAt: { stringValue: "2026-11-14T00:00:00.000Z" },
    },
  };
}

/* Mode tiap sumber tiruan. `alerts` mengendalikan POST /alerts:
 * "ok" = 200 (baru dibuat), "exists" = 409, "failed" = 500.
 * `pushList` mengendalikan GET /push_subscriptions: "ok" =
 * satu langganan tiruan, "failed" = 500. */
const modes = {
  marker: "ok",
  list: "ok",
  token: "ok",
  snapshot: "missing",
  snapshotNos: [],
  alerts: "ok",
  pushList: "ok",
};
const recorded = { patch: [], post: [], alertIds: [], pushListCalls: [] };

/* Satu dokumen langganan push tiruan (bentuk REST Firestore),
 * dipakai test wiring digest (RENDAH-5). Kunci berbentuk benar
 * (p256dh 65 byte diawali 0x04, auth 16 byte); endpoint tidak
 * pernah dihubungi karena kirim memakai stub web-push. */
function pushSubscriptionDoc() {
  const p256dh = Buffer.alloc(65);
  p256dh[0] = 0x04;
  p256dh[1] = 0xab;
  const auth = Buffer.alloc(16, 0x11);
  return {
    name: "projects/proyek-uji-t16b/databases/(default)/documents/push_subscriptions/doc-uji-push",
    fields: {
      endpoint: {
        stringValue: "https://fcm.googleapis.com/fcm/send/langganan-uji",
      },
      p256dh: { stringValue: p256dh.toString("base64url") },
      auth: { stringValue: auth.toString("base64url") },
    },
  };
}

function resetModes() {
  modes.marker = "ok";
  modes.list = "ok";
  modes.token = "ok";
  modes.snapshot = "missing";
  modes.snapshotNos = [];
  modes.alerts = "ok";
  modes.pushList = "ok";
  recorded.patch.length = 0;
  recorded.post.length = 0;
  recorded.alertIds.length = 0;
  recorded.pushListCalls.length = 0;
}

function mockResponse({ ok, status, body }) {
  return {
    ok,
    status,
    headers: new Headers(),
    json: async () => body ?? {},
    text: async () => JSON.stringify(body ?? {}),
  };
}

/* --- Mock fetch global: tukar token + Firestore REST --- */
globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  const method = (options.method || "GET").toUpperCase();
  if (u.includes("oauth2.googleapis.com/token")) {
    if (modes.token === "failed") {
      return mockResponse({ ok: false, status: 500 });
    }
    return mockResponse({
      ok: true,
      status: 200,
      body: { access_token: "token-akses-uji" },
    });
  }
  if (method === "POST" && u.includes("/alerts?documentId=")) {
    const id = new URL(u).searchParams.get("documentId");
    recorded.alertIds.push(id);
    if (modes.alerts === "exists") {
      return mockResponse({ ok: false, status: 409 });
    }
    if (modes.alerts === "failed") {
      return mockResponse({ ok: false, status: 500 });
    }
    return mockResponse({ ok: true, status: 200, body: {} });
  }
  if (method === "PATCH") {
    recorded.patch.push({ url: u, body: JSON.parse(options.body || "{}") });
    return mockResponse({ ok: true, status: 200, body: {} });
  }
  if (method === "POST") {
    recorded.post.push({ url: u, body: JSON.parse(options.body || "{}") });
    return mockResponse({ ok: true, status: 200, body: {} });
  }
  if (u.includes("/meta/lastChange")) {
    if (modes.marker === "429") {
      return mockResponse({ ok: false, status: 429 });
    }
    return mockResponse({ ok: true, status: 200, body: markerDoc() });
  }
  if (u.includes("/meta/targets")) {
    if (modes.snapshot === "missing") {
      return mockResponse({ ok: false, status: 404 });
    }
    return mockResponse({
      ok: true,
      status: 200,
      body: snapshotDoc(modes.snapshotNos),
    });
  }
  if (u.includes("/companies?pageSize")) {
    if (modes.list === "429") {
      return mockResponse({ ok: false, status: 429 });
    }
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
  if (u.includes("/push_subscriptions")) {
    /* Daftar langganan push — hanya sendPushDigest yang
     * memanggil endpoint ini (test wiring RENDAH-5). */
    recorded.pushListCalls.push(u);
    if (modes.pushList === "failed") {
      return mockResponse({ ok: false, status: 500 });
    }
    return mockResponse({
      ok: true,
      status: 200,
      body: { documents: [pushSubscriptionDoc()] },
    });
  }
  return mockResponse({ ok: false, status: 404 });
};

beforeEach(() => {
  revalidateCompanies();
  resetModes();
  webpushStub.reset();
  process.env.CRON_SECRET = "secret-cron-uji-bukan-asli";
  process.env.FIREBASE_SERVICE_ACCOUNT = SA_JSON;
  delete process.env.TELEGRAM_BOT_TOKEN;
  /* Kunci VAPID hanya dipasang di dalam test push; tanpa ini,
   * sendPushDigest menjawab skipped-no-vapid sebelum membaca
   * daftar langganan. */
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

/* --- Gerbang keamanan (NOTIF-02, fail-closed) --- */
describe("gerbang cron (fail-closed)", () => {
  it("tanpa CRON_SECRET: 503, rute tidak pernah berjalan", async () => {
    delete process.env.CRON_SECRET;
    const res = await getRecheck(cronRequest());
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), {
      error: "cron belum diaktifkan",
      detail: "konfigurasi cron belum lengkap",
    });
  });

  it("Bearer salah: 401", async () => {
    const res = await getRecheck(
      fakeRequest({
        headers: {
          "x-real-ip": IP,
          authorization: "Bearer bukan-secret-ini",
        },
      }),
    );
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "Tidak diizinkan.");
  });

  it("tanpa header Authorization: 401", async () => {
    const res = await getRecheck(
      fakeRequest({ headers: { "x-real-ip": IP } }),
    );
    assert.equal(res.status, 401);
  });

  it("tanpa service account: 503 generik (tidak menyebut variabel)", async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const res = await getRecheck(cronRequest());
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "cron belum diaktifkan");
    assert.equal(body.detail.includes("FIREBASE_SERVICE_ACCOUNT"), false);
  });

  it("service account bukan JSON: 503", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = "{bukan json";
    const res = await getRecheck(cronRequest());
    assert.equal(res.status, 503);
  });

  it("service account tidak lengkap (tanpa private_key): 503", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
      client_email: "uji@proyek-uji-t16b.iam.gserviceaccount.com",
      project_id: "proyek-uji-t16b",
    });
    const res = await getRecheck(cronRequest());
    assert.equal(res.status, 503);
  });
});

/* --- Prasyarat jalan: token + data live --- */
describe("prasyarat jalan", () => {
  it("tukar token gagal: 503", async () => {
    modes.token = "failed";
    const res = await getRecheck(cronRequest());
    assert.equal(res.status, 503);
    assert.equal(
      (await res.json()).error,
      "Token service account gagal dibuat.",
    );
  });

  it("data dari seed (marker 429): run dilewati dengan 503", async () => {
    modes.marker = "429";
    const res = await getRecheck(cronRequest());
    assert.equal(res.status, 503);
    assert.equal(
      (await res.json()).error,
      "Data live tidak bisa dimuat, cron dilewati.",
    );
  });

  it("daftar gagal dibaca (list 429): run dilewati dengan 503", async () => {
    modes.list = "429";
    const res = await getRecheck(cronRequest());
    assert.equal(res.status, 503);
  });
});

/* --- Run penuh: fase alert + loop cek + marker + heartbeat --- */
describe("run penuh (snapshot belum ada)", () => {
  it("200 + ringkasan lengkap; portal mati mengubah status + tercatat", async () => {
    const res = await getRecheck(cronRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    /* Antrean: hanya perusahaan no 1 (ada lowongan + tautan);
     * no 2 (tidak ada lowongan) tidak masuk antrean. */
    assert.deepEqual(body.queue, {
      urgent: 0,
      open: 1,
      dead: 0,
      total: 1,
    });
    assert.equal(body.checked, 1);
    assert.equal(body.changed, 1);
    assert.equal(body.updated, 0);
    assert.equal(body.skipped, 0);
    assert.equal(body.truncated, false);
    assert.equal(body.openSkipped, 0);
    /* Run pertama: snapshot belum ada -> tanpa alert, snapshot ditulis. */
    assert.equal(body.alerts, 0);
    assert.equal(body.alertsFailed, 0);
    assert.equal(body.telegram, "none");
    assert.equal(body.telegramMarked, 0);
    assert.equal(body.alertPhaseTruncated, false);
    assert.equal(body.snapshotKnown, true);
    assert.equal(body.snapshotWritten, true);
    assert.equal(body.markerBumped, true);
    assert.equal(body.heartbeatWritten, true);
    /* PATCH status perusahaan no 1 ke Portal tidak bisa dibuka. */
    const statusPatch = recorded.patch.find((p) =>
      p.url.includes("/companies/1?"),
    );
    assert.ok(statusPatch, "tidak ada PATCH status perusahaan no 1");
    assert.equal(
      statusPatch.body.fields.status.stringValue,
      "Portal tidak bisa dibuka",
    );
    assert.equal(
      statusPatch.body.fields.tanggal_cek.stringValue,
      todayWib(),
    );
    /* Perubahan tercatat di koleksi changes. */
    const change = recorded.post.find((p) => p.url.endsWith("/changes"));
    assert.ok(change, "tidak ada POST changes");
    assert.equal(change.body.fields.companyNo.integerValue, "1");
    assert.equal(change.body.fields.from.stringValue, "Ada lowongan");
    assert.equal(
      change.body.fields.to.stringValue,
      "Portal tidak bisa dibuka",
    );
    /* Heartbeat ditulis ke cron-runs/{tanggal WIB}. */
    const heartbeat = recorded.patch.find((p) =>
      p.url.includes(`/cron-runs/${todayWib()}`),
    );
    assert.ok(heartbeat, "tidak ada PATCH heartbeat cron-runs");
    /* Marker rev naik (PATCH bump meta/lastChange dengan rev 2).
     * PATCH pencacah refill dari lapisan data juga menuju URL yang
     * sama, jadi dibedakan lewat updateMask rev+updatedAt. */
    const markerPatch = recorded.patch.find((p) =>
      p.url.includes("/meta/lastChange?updateMask.fieldPaths=rev"),
    );
    assert.ok(markerPatch, "tidak ada PATCH bump marker");
    assert.equal(markerPatch.body.fields.rev.integerValue, "2");
    /* Snapshot ditulis dengan nomor target saat ini (no 1). */
    const snapshotPatch = recorded.patch.find((p) =>
      p.url.includes("/meta/targets"),
    );
    assert.ok(snapshotPatch, "tidak ada PATCH snapshot");
    assert.deepEqual(
      snapshotPatch.body.fields.targetNos.arrayValue.values,
      [{ integerValue: "1" }],
    );
  });
});

/* --- Fase alert (NOTIF-01/06/15) --- */
describe("fase alert", () => {
  it("snapshot kosong + batas lamar besok: 2 alert, telegram dilewati tanpa token", async () => {
    /* Batas lamar besok membuat perusahaan no 1 memicu alert
     * deadline SEKALIGUS alert new-target (belum ada di snapshot).
     * Mock fetch diganti sementara dengan varian yang dokumen
     * perusahaannya membawa batas_lamar besok; dipulihkan di
     * finally supaya test lain tidak terpengaruh. */
    modes.snapshot = "ok";
    modes.snapshotNos = [];
    const fetchAwal = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      const u = String(url);
      const method = (options.method || "GET").toUpperCase();
      if (u.includes("oauth2.googleapis.com/token")) {
        return mockResponse({
          ok: true,
          status: 200,
          body: { access_token: "token-akses-uji" },
        });
      }
      if (method === "POST" && u.includes("/alerts?documentId=")) {
        const id = new URL(u).searchParams.get("documentId");
        recorded.alertIds.push(id);
        return mockResponse({ ok: true, status: 200, body: {} });
      }
      if (method === "PATCH") {
        recorded.patch.push({
          url: u,
          body: JSON.parse(options.body || "{}"),
        });
        return mockResponse({ ok: true, status: 200, body: {} });
      }
      if (method === "POST") {
        recorded.post.push({
          url: u,
          body: JSON.parse(options.body || "{}"),
        });
        return mockResponse({ ok: true, status: 200, body: {} });
      }
      if (u.includes("/meta/lastChange")) {
        return mockResponse({ ok: true, status: 200, body: markerDoc() });
      }
      if (u.includes("/meta/targets")) {
        return mockResponse({
          ok: true,
          status: 200,
          body: snapshotDoc([]),
        });
      }
      if (u.includes("/companies?pageSize")) {
        return mockResponse({
          ok: true,
          status: 200,
          body: {
            documents: [
              companyDoc(1, "Perusahaan Uji Satu", "Ada lowongan", {
                batas_lamar: { stringValue: besokWib() },
              }),
              companyDoc(2, "Perusahaan Uji Dua", "Tidak ada lowongan"),
            ],
          },
        });
      }
      return mockResponse({ ok: false, status: 404 });
    };
    try {
      const res = await getRecheck(cronRequest());
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.alerts, 2);
      assert.equal(body.alertsFailed, 0);
      assert.equal(body.telegram, "skipped-no-token");
      assert.equal(body.snapshotWritten, true);
      assert.deepEqual(
        [...recorded.alertIds].sort(),
        [
          `deadline-1-${besokWib()}`,
          `new-target-1-${todayWib()}`,
        ].sort(),
      );
    } finally {
      globalThis.fetch = fetchAwal;
    }
  });

  it("alert sudah ada (409): tidak dihitung baru, tidak ada telegram", async () => {
    modes.snapshot = "ok";
    modes.snapshotNos = [];
    modes.alerts = "exists";
    const res = await getRecheck(cronRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.alerts, 0);
    assert.equal(body.alertsFailed, 0);
    assert.equal(body.telegram, "none");
    assert.equal(body.snapshotWritten, true);
  });

  it("tulis alert gagal (NOTIF-06): nomor dikeluarkan dari snapshot", async () => {
    modes.snapshot = "ok";
    modes.snapshotNos = [];
    modes.alerts = "failed";
    const res = await getRecheck(cronRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.alerts, 0);
    assert.equal(body.alertsFailed, 1);
    assert.equal(body.telegram, "none");
    assert.equal(body.snapshotWritten, true);
    const snapshotPatch = recorded.patch.find((p) =>
      p.url.includes("/meta/targets"),
    );
    assert.ok(snapshotPatch, "tidak ada PATCH snapshot");
    /* Nomor 1 dikeluarkan: snapshot kosong, supaya run berikut
     * mencoba lagi, bukan hilang selamanya. */
    assert.deepEqual(
      snapshotPatch.body.fields.targetNos.arrayValue.values,
      [],
    );
  });

  it("snapshot sudah berisi no 1: tidak ada alert new-target", async () => {
    modes.snapshot = "ok";
    modes.snapshotNos = [1];
    const res = await getRecheck(cronRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.alerts, 0);
    assert.equal(recorded.alertIds.length, 0);
  });
});

/* --- Wiring digest web push (T10, RENDAH-5) --- */
describe("wiring digest web push (T10, RENDAH-5)", () => {
  function pasangVapidUji() {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID.publicKey;
    process.env.VAPID_PRIVATE_KEY = VAPID.privateKey;
  }

  it("alert baru: sendPushDigest dipanggil dengan freshAlerts yang sama, digest terkirim", async () => {
    pasangVapidUji();
    modes.snapshot = "ok";
    modes.snapshotNos = [];
    const res = await getRecheck(cronRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.alerts, 1);
    /* Daftar langganan dibaca — hanya sendPushDigest yang
     * memanggil endpoint ini. */
    assert.equal(recorded.pushListCalls.length, 1);
    assert.ok(
      recorded.pushListCalls[0].includes(
        "/push_subscriptions?pageSize=500",
      ),
    );
    /* VAPID dipasang + satu kirim ke langganan tiruan. */
    assert.equal(webpushStub.vapidCalls.length, 1);
    assert.equal(webpushStub.sendCalls.length, 1);
    assert.equal(
      webpushStub.sendCalls[0].subscription.endpoint,
      "https://fcm.googleapis.com/fcm/send/langganan-uji",
    );
    /* Payload digest dibangun dari freshAlerts run ini (bukan
     * dari data lain): perusahaan + posisi alert new-target. */
    const payload = JSON.parse(webpushStub.sendCalls[0].payload);
    assert.equal(payload.title, "Lowongan baru di Karir");
    assert.equal(payload.body, "Perusahaan Uji Satu — Staff Gudang");
    assert.equal(payload.data.tag, `karir-digest-${todayWib()}`);
    assert.equal(payload.data.date, todayWib());
    assert.equal(payload.data.url, "/");
    /* Hasil kirim masuk ringkasan. */
    assert.equal(body.push, "sent");
    assert.equal(body.pushSent, 1);
    assert.equal(body.pushFailed, 0);
    assert.equal(body.pushPruned, 0);
    assert.equal(body.pushTruncated, false);
    /* ... dan ke heartbeat cron-runs. */
    const heartbeat = recorded.patch.find((p) =>
      p.url.includes(`/cron-runs/${todayWib()}`),
    );
    assert.ok(heartbeat, "tidak ada PATCH heartbeat cron-runs");
    assert.equal(heartbeat.body.fields.push.stringValue, "sent");
    assert.equal(heartbeat.body.fields.pushSent.integerValue, "1");
  });

  it("tanpa alert baru: sendPushDigest tidak dipanggil", async () => {
    pasangVapidUji();
    modes.snapshot = "ok";
    modes.snapshotNos = [1];
    const res = await getRecheck(cronRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.alerts, 0);
    assert.equal(recorded.pushListCalls.length, 0);
    assert.equal(webpushStub.sendCalls.length, 0);
    assert.equal(body.push, "none");
    assert.equal(body.pushSent, 0);
  });

  it("daftar langganan gagal: push failed, run tetap 200", async () => {
    pasangVapidUji();
    modes.snapshot = "ok";
    modes.snapshotNos = [];
    modes.pushList = "failed";
    const res = await getRecheck(cronRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.alerts, 1);
    assert.equal(recorded.pushListCalls.length, 1);
    assert.equal(webpushStub.sendCalls.length, 0);
    assert.equal(body.push, "failed");
    assert.equal(body.pushSent, 0);
  });

  it("tanpa kunci VAPID: push dilewati, daftar tidak dibaca", async () => {
    modes.snapshot = "ok";
    modes.snapshotNos = [];
    const res = await getRecheck(cronRequest());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.alerts, 1);
    assert.equal(recorded.pushListCalls.length, 0);
    assert.equal(webpushStub.sendCalls.length, 0);
    assert.equal(body.push, "skipped-no-vapid");
  });
});
