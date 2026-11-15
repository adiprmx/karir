/* Test kontrak payload push server <-> service worker (T10) —
 * memakai test runner bawaan Node. Dijalankan dengan:
 *   node --test lib/sw-push.test.js
 * (koordinator menambahkan berkas ini ke skrip `npm test`.)
 *
 * Yang dites: service worker ASLI (web/public/sw.js) dijalankan
 * dengan `self` tiruan dan diumpani payload ASLI dari
 * formatPushPayload() (lib/push.js) — test ini mengunci kontrak
 * ujung-ke-ujung: tag harian, url, dan date yang dibangun server
 * harus tampil utuh di notifikasi (SEDANG-1: SW lama membaca
 * field di level yang salah sehingga tag selalu "karir-digest"
 * dan notifikasi beda hari saling menimpa). Juga dites:
 * notificationclick HANYA membuka URL same-origin (RENDAH-1:
 * SW lama membuka URL apa pun dari payload).
 *
 * Variabel env SW_TEST_PATH (opsional) mengganti file SW yang
 * dijalankan — dipakai untuk membuktikan test ini GAGAL pada
 * sw.js lama dan LOLOS pada sw.js baru. Tanpa variabel itu,
 * file yang diuji adalah web/public/sw.js.
 *
 * Tidak ada jaringan, tidak ada push sungguhan. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { formatPushPayload } from "./push.js";

const SW_PATH =
  process.env.SW_TEST_PATH ||
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "public",
    "sw.js",
  );
const ORIGIN = "https://karir-adiprmx.vercel.app";

function digestPayload(dateIso) {
  return formatPushPayload(
    [
      {
        companyNo: 1,
        perusahaan: "PT Maju Bersama",
        posisi: "Cleaning Service",
      },
    ],
    dateIso,
  );
}

/* Jalankan sw.js ASLI dengan `self` tiruan; kembalikan handler
 * event + state yang dicatat (notifikasi yang ditampilkan, URL
 * yang dibuka, klien yang difokuskan). */
function runServiceWorker({ openClients = [] } = {}) {
  const swSrc = readFileSync(SW_PATH, "utf8");
  const handlers = {};
  const state = { shown: null, openedUrl: null, focusedUrl: null };
  const fakeSelf = {
    location: { origin: ORIGIN },
    registration: {
      showNotification: (title, options) => {
        state.shown = { title, options };
      },
    },
    clients: {
      matchAll: async () => openClients,
      openWindow: async (url) => {
        state.openedUrl = url;
        return {};
      },
    },
    addEventListener: (type, fn) => {
      handlers[type] = fn;
    },
  };
  new Function("self", swSrc)(fakeSelf);
  return { handlers, state };
}

async function dispatchPush(handlers, payload) {
  let waited = null;
  handlers.push({
    data: payload === undefined ? null : { json: () => payload },
    waitUntil: (p) => {
      waited = p;
    },
  });
  await waited;
}

async function dispatchClick(handlers, data) {
  let waited = null;
  handlers.notificationclick({
    notification: { close: () => {}, data },
    waitUntil: (p) => {
      waited = p;
    },
  });
  await waited;
}

describe("service worker: kontrak payload (SEDANG-1)", () => {
  it("payload server: tag harian + url + date tampil utuh di notifikasi", async () => {
    const { handlers, state } = runServiceWorker();
    const payload = digestPayload("2026-11-16");
    /* Bentuk payload server (kontrak): field bertingkat di data. */
    assert.deepEqual(payload.data, {
      url: "/",
      date: "2026-11-16",
      tag: "karir-digest-2026-11-16",
    });
    await dispatchPush(handlers, payload);
    assert.equal(state.shown.title, "Lowongan baru di Karir");
    assert.equal(state.shown.options.body, "PT Maju Bersama — Cleaning Service");
    /* SW lama membaca level atas -> tag selalu "karir-digest"
     * dan date hilang; SW baru membaca data bertingkat. */
    assert.equal(state.shown.options.tag, "karir-digest-2026-11-16");
    assert.equal(state.shown.options.data.url, "/");
    assert.equal(state.shown.options.data.date, "2026-11-16");
  });

  it("tag beda hari berbeda: notifikasi Selasa tidak menimpa Senin", async () => {
    const { handlers, state } = runServiceWorker();
    await dispatchPush(handlers, digestPayload("2026-11-16"));
    const tagSenin = state.shown.options.tag;
    await dispatchPush(handlers, digestPayload("2026-11-17"));
    const tagSelasa = state.shown.options.tag;
    assert.equal(tagSenin, "karir-digest-2026-11-16");
    assert.equal(tagSelasa, "karir-digest-2026-11-17");
    assert.notEqual(tagSenin, tagSelasa);
  });

  it("push tanpa data: nilai bawaan aman, tanpa crash", async () => {
    const { handlers, state } = runServiceWorker();
    await dispatchPush(handlers, undefined);
    assert.equal(state.shown.title, "Lowongan baru di Karir");
    assert.equal(state.shown.options.tag, "karir-digest");
    assert.equal(state.shown.options.data.url, "/");
    assert.equal(state.shown.options.data.date, "");
  });

  it("push dengan JSON null: nilai bawaan aman, tanpa crash", async () => {
    const { handlers, state } = runServiceWorker();
    await dispatchPush(handlers, null);
    assert.equal(state.shown.title, "Lowongan baru di Karir");
    assert.equal(state.shown.options.tag, "karir-digest");
  });

  it("payload lama yang meratakan field tetap tampil benar (cadangan)", async () => {
    const { handlers, state } = runServiceWorker();
    await dispatchPush(handlers, {
      title: "Judul lama",
      body: "Badan lama",
      tag: "karir-digest-2026-11-16",
      url: "/pengaturan",
      date: "2026-11-16",
    });
    assert.equal(state.shown.options.tag, "karir-digest-2026-11-16");
    assert.equal(state.shown.options.data.url, "/pengaturan");
    assert.equal(state.shown.options.data.date, "2026-11-16");
  });
});

describe("service worker: notificationclick hanya same-origin (RENDAH-1)", () => {
  it("URL lintas origin ditolak: dibuka '/' bukan situs luar", async () => {
    const { handlers, state } = runServiceWorker();
    await dispatchClick(handlers, { url: "https://evil.example.com/phish" });
    /* SW lama membuka URL itu apa adanya. */
    assert.equal(state.openedUrl, "/");
  });

  it("URL protocol-relative lintas origin ditolak", async () => {
    const { handlers, state } = runServiceWorker();
    await dispatchClick(handlers, { url: "//evil.example.com/phish" });
    assert.equal(state.openedUrl, "/");
  });

  it("skema javascript: ditolak", async () => {
    const { handlers, state } = runServiceWorker();
    await dispatchClick(handlers, { url: "javascript:alert(1)" });
    assert.equal(state.openedUrl, "/");
  });

  it("URL absolut same-origin dibuka sebagai path-nya", async () => {
    const { handlers, state } = runServiceWorker();
    await dispatchClick(handlers, {
      url: `${ORIGIN}/pengaturan`,
    });
    assert.equal(state.openedUrl, "/pengaturan");
  });

  it("path relatif same-origin dibuka apa adanya", async () => {
    const { handlers, state } = runServiceWorker();
    await dispatchClick(handlers, { url: "/cari?q=gudang" });
    assert.equal(state.openedUrl, "/cari?q=gudang");
  });

  it("klik tanpa URL: dibuka '/'", async () => {
    const { handlers, state } = runServiceWorker();
    await dispatchClick(handlers, {});
    assert.equal(state.openedUrl, "/");
  });

  it("jendela sudah terbuka di path yang sama: difokuskan, bukan buka baru", async () => {
    let focusedUrl = null;
    const { handlers, state } = runServiceWorker({
      openClients: [
        {
          url: `${ORIGIN}/`,
          focus: async () => {
            focusedUrl = `${ORIGIN}/`;
            return {};
          },
        },
      ],
    });
    await dispatchClick(handlers, { url: "/" });
    assert.equal(focusedUrl, `${ORIGIN}/`);
    assert.equal(state.openedUrl, null);
  });
});
