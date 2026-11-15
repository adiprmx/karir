/* Test unit lib/push.js (T10, notifikasi web push) — memakai test
 * runner bawaan Node. Dijalankan dengan:
 *   node --test lib/push.test.js
 * (koordinator menambahkan berkas ini ke skrip `npm test`.)
 *
 * Yang dites: validasi bentuk langganan, ID dokumen SHA-256,
 * klasifikasi hasil kirim (410/404/401/403/429/5xx), pembangunan
 * payload digest, dan pengiriman digest dengan web-push di-mock —
 * tidak ada push sungguhan dan tidak ada Firestore live. Kunci
 * VAPID uji dibuat lewat generateVAPIDKeys (kunci asli yang
 * dibuat di tempat, bukan kunci produksi). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateVAPIDKeys, WebPushError } from "web-push";
import {
  classifyPushError,
  classifyPushStatus,
  formatPushPayload,
  parseSubscriptionDoc,
  sendPushDigest,
  subscriptionDocId,
  subscriptionFields,
  validateEndpoint,
  validateSubscription,
} from "./push.js";

/* --- Langganan tiruan yang bentuknya benar --- */
function validKeys() {
  const p256dh = Buffer.alloc(65);
  p256dh[0] = 0x04;
  p256dh[1] = 0xab;
  const auth = Buffer.alloc(16, 0x11);
  return {
    p256dh: p256dh.toString("base64url"),
    auth: auth.toString("base64url"),
  };
}

function validSubscription(endpoint = "https://fcm.googleapis.com/fcm/send/uji-123") {
  return { endpoint, keys: validKeys() };
}

const VAPID = generateVAPIDKeys();
const ALERTS = [
  {
    id: "new-target-1-2026-11-16",
    type: "new-target",
    companyNo: 1,
    perusahaan: "PT Maju Bersama",
    posisi: "Cleaning Service",
  },
  {
    id: "new-target-2-2026-11-16",
    type: "new-target",
    companyNo: 2,
    perusahaan: "PT Sejahtera Abadi",
    posisi: "Helper Gudang",
  },
];

describe("subscriptionDocId (T10)", () => {
  it("SHA-256 hex 64 karakter dari endpoint, deterministik", () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/uji-123";
    const expected = createHash("sha256")
      .update(endpoint, "utf8")
      .digest("hex");
    assert.equal(subscriptionDocId(endpoint), expected);
    assert.equal(subscriptionDocId(endpoint).length, 64);
    assert.match(subscriptionDocId(endpoint), /^[0-9a-f]{64}$/);
    assert.equal(subscriptionDocId(endpoint), subscriptionDocId(endpoint));
  });

  it("vektor SHA-256 yang dikenal: sha256('abc')", () => {
    assert.equal(
      subscriptionDocId("abc"),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("endpoint berbeda menghasilkan ID berbeda", () => {
    assert.notEqual(
      subscriptionDocId("https://example.com/a"),
      subscriptionDocId("https://example.com/b"),
    );
  });
});

describe("validateEndpoint (T10)", () => {
  it("endpoint https yang benar lolos", () => {
    assert.deepEqual(
      validateEndpoint("https://fcm.googleapis.com/fcm/send/abc"),
      { ok: true },
    );
  });

  it("endpoint http ditolak", () => {
    const res = validateEndpoint("http://example.com/push");
    assert.equal(res.ok, false);
    assert.equal(typeof res.error, "string");
  });

  it("endpoint kosong / bukan string / bukan URL ditolak", () => {
    assert.equal(validateEndpoint("").ok, false);
    assert.equal(validateEndpoint(null).ok, false);
    assert.equal(validateEndpoint(123).ok, false);
    assert.equal(validateEndpoint("https://").ok, false);
  });

  it("endpoint lebih dari 2000 karakter ditolak", () => {
    assert.equal(
      validateEndpoint(`https://example.com/${"a".repeat(2000)}`).ok,
      false,
    );
  });
});

describe("validateSubscription (T10)", () => {
  it("langganan yang bentuknya benar lolos", () => {
    assert.deepEqual(validateSubscription(validSubscription()), {
      ok: true,
    });
  });

  it("bukan objek / tanpa endpoint / tanpa keys ditolak", () => {
    assert.equal(validateSubscription(null).ok, false);
    assert.equal(validateSubscription("teks").ok, false);
    assert.equal(validateSubscription([]).ok, false);
    assert.equal(validateSubscription({ keys: validKeys() }).ok, false);
    assert.equal(
      validateSubscription({
        endpoint: "https://example.com/push",
      }).ok,
      false,
    );
  });

  it("endpoint http ditolak", () => {
    assert.equal(
      validateSubscription(validSubscription("http://example.com/push"))
        .ok,
      false,
    );
  });

  it("p256dh bukan 65 byte ditolak", () => {
    const keys = validKeys();
    keys.p256dh = Buffer.alloc(64, 0x04).toString("base64url");
    assert.equal(
      validateSubscription({ endpoint: "https://example.com/p", keys })
        .ok,
      false,
    );
  });

  it("p256dh yang byte pertamanya bukan 0x04 ditolak", () => {
    const raw = Buffer.alloc(65, 0x02);
    const keys = { p256dh: raw.toString("base64url"), auth: validKeys().auth };
    assert.equal(
      validateSubscription({ endpoint: "https://example.com/p", keys })
        .ok,
      false,
    );
  });

  it("auth bukan 16 byte ditolak", () => {
    const keys = validKeys();
    keys.auth = Buffer.alloc(15, 0x11).toString("base64url");
    assert.equal(
      validateSubscription({ endpoint: "https://example.com/p", keys })
        .ok,
      false,
    );
  });

  it("karakter di luar base64url ditolak (bukan diam-diam diabaikan)", () => {
    const keys = validKeys();
    keys.auth = "!!!bukan-base64url!!!";
    assert.equal(
      validateSubscription({ endpoint: "https://example.com/p", keys })
        .ok,
      false,
    );
  });

  it("padding base64 standar ditolak (harus base64url tanpa padding)", () => {
    const keys = validKeys();
    keys.auth = `${keys.auth}==`;
    assert.equal(
      validateSubscription({ endpoint: "https://example.com/p", keys })
        .ok,
      false,
    );
  });
});

describe("classifyPushStatus / classifyPushError (T10)", () => {
  it("200/201 -> sent", () => {
    assert.equal(classifyPushStatus(200), "sent");
    assert.equal(classifyPushStatus(201), "sent");
  });

  it("410/404 -> prune (langganan kedaluwarsa, hapus)", () => {
    assert.equal(classifyPushStatus(410), "prune");
    assert.equal(classifyPushStatus(404), "prune");
  });

  it("401/403 -> config (masalah VAPID, jangan hapus)", () => {
    assert.equal(classifyPushStatus(401), "config");
    assert.equal(classifyPushStatus(403), "config");
  });

  it("429/5xx -> retry (transient, simpan untuk besok)", () => {
    assert.equal(classifyPushStatus(429), "retry");
    assert.equal(classifyPushStatus(500), "retry");
    assert.equal(classifyPushStatus(502), "retry");
    assert.equal(classifyPushStatus(503), "retry");
  });

  it("status lain yang tidak dikenal -> retry (jangan hapus atas sinyal ambigu)", () => {
    assert.equal(classifyPushStatus(400), "retry");
    assert.equal(classifyPushStatus(302), "retry");
    assert.equal(classifyPushStatus(418), "retry");
  });

  it("WebPushError diklasifikasi dari statusCode; error tanpa status -> retry", () => {
    assert.equal(
      classifyPushError(new WebPushError("gone", 410, {}, "", "https://x")),
      "prune",
    );
    assert.equal(
      classifyPushError(new WebPushError("unauth", 401, {}, "", "https://x")),
      "config",
    );
    assert.equal(classifyPushError(new Error("jaringan putus")), "retry");
    assert.equal(classifyPushError(null), "retry");
    assert.equal(classifyPushError(undefined), "retry");
  });
});

describe("formatPushPayload (T10)", () => {
  it("daftar kosong -> null", () => {
    assert.equal(formatPushPayload([], "2026-11-16"), null);
    assert.equal(formatPushPayload(null, "2026-11-16"), null);
  });

  it("1 alert dengan posisi: nama perusahaan + posisi", () => {
    const payload = formatPushPayload([ALERTS[0]], "2026-11-16");
    assert.equal(payload.title, "Lowongan baru di Karir");
    assert.equal(payload.body, "PT Maju Bersama — Cleaning Service");
    assert.deepEqual(payload.data, {
      url: "/",
      date: "2026-11-16",
      tag: "karir-digest-2026-11-16",
    });
  });

  it("1 alert tanpa posisi: kalimat lowongan baru", () => {
    const payload = formatPushPayload(
      [{ ...ALERTS[0], posisi: "" }],
      "2026-11-16",
    );
    assert.equal(payload.body, "PT Maju Bersama — lowongan baru.");
  });

  it("2 perusahaan: keduanya disebut, tanpa 'dan 0 lagi'", () => {
    const payload = formatPushPayload(ALERTS, "2026-11-16");
    assert.equal(
      payload.body,
      "2 lowongan baru hari ini: PT Maju Bersama dan PT Sejahtera Abadi.",
    );
  });

  it("3+ perusahaan: 2 nama + hitungan sisanya", () => {
    const alerts = [
      ...ALERTS,
      {
        id: "new-target-3-2026-11-16",
        type: "new-target",
        companyNo: 3,
        perusahaan: "PT Cahaya Baru",
        posisi: "",
      },
      {
        id: "new-target-4-2026-11-16",
        type: "new-target",
        companyNo: 4,
        perusahaan: "PT Delta Jaya",
        posisi: "",
      },
    ];
    const payload = formatPushPayload(alerts, "2026-11-16");
    assert.equal(
      payload.body,
      "4 lowongan baru hari ini: PT Maju Bersama, PT Sejahtera Abadi, dan 2 lagi.",
    );
  });

  it("perusahaan yang sama di dua alert dihitung sekali (deduplikasi per nomor)", () => {
    const alerts = [
      ALERTS[0],
      {
        id: "deadline-1-2026-11-18",
        type: "deadline",
        companyNo: 1,
        perusahaan: "PT Maju Bersama",
        posisi: "Cleaning Service",
      },
      ALERTS[1],
    ];
    const payload = formatPushPayload(alerts, "2026-11-16");
    assert.equal(
      payload.body,
      "2 lowongan baru hari ini: PT Maju Bersama dan PT Sejahtera Abadi.",
    );
  });

  it("badan panjang dipotong aman (maks 200 karakter)", () => {
    const payload = formatPushPayload(
      [
        {
          id: "new-target-9-2026-11-16",
          type: "new-target",
          companyNo: 9,
          perusahaan: "PT Nama Perusahaan Yang Sangat Panjang Sekali",
          posisi: `Posisi ${"dengan keterangan yang sangat panjang ".repeat(10)}`,
        },
      ],
      "2026-11-16",
    );
    assert.ok(payload.body.length <= 200);
    assert.ok(payload.body.endsWith("…"));
  });
});

describe("subscriptionFields (T10)", () => {
  it("bentuk field Firestore lengkap + userAgent dipotong 500 karakter", () => {
    const fields = subscriptionFields({
      uid: "uid-uji",
      subscription: validSubscription(),
      userAgent: `Mozilla/5.0 ${"x".repeat(600)}`,
      nowIso: "2026-11-16T01:00:00.000Z",
    });
    assert.equal(fields.uid.stringValue, "uid-uji");
    assert.equal(
      fields.endpoint.stringValue,
      "https://fcm.googleapis.com/fcm/send/uji-123",
    );
    assert.equal(fields.p256dh.stringValue, validKeys().p256dh);
    assert.equal(fields.auth.stringValue, validKeys().auth);
    assert.equal(fields.userAgent.stringValue.length, 500);
    assert.equal(fields.createdAt.stringValue, "2026-11-16T01:00:00.000Z");
    assert.equal(fields.updatedAt.stringValue, "2026-11-16T01:00:00.000Z");
  });

  it("tanpa userAgent: field tetap ada, string kosong", () => {
    const fields = subscriptionFields({
      uid: "uid-uji",
      subscription: validSubscription(),
      userAgent: undefined,
      nowIso: "2026-11-16T01:00:00.000Z",
    });
    assert.equal(fields.userAgent.stringValue, "");
  });
});

describe("parseSubscriptionDoc (T10)", () => {
  it("dokumen lengkap diparse ke bentuk web-push", () => {
    const keys = validKeys();
    const doc = parseSubscriptionDoc({
      name: "projects/p/databases/(default)/documents/push_subscriptions/abc123",
      fields: {
        endpoint: { stringValue: "https://example.com/push" },
        p256dh: { stringValue: keys.p256dh },
        auth: { stringValue: keys.auth },
      },
    });
    assert.deepEqual(doc, {
      id: "abc123",
      endpoint: "https://example.com/push",
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
  });

  it("dokumen yang field-nya tidak lengkap -> null (bukan crash)", () => {
    assert.equal(parseSubscriptionDoc(null), null);
    assert.equal(parseSubscriptionDoc({}), null);
    assert.equal(
      parseSubscriptionDoc({
        name: "projects/p/documents/push_subscriptions/abc",
        fields: { endpoint: { stringValue: "https://example.com/p" } },
      }),
      null,
    );
  });
});

describe("sendPushDigest (T10)", () => {
  const base = {
    fsBase: "https://firestore.googleapis.com/v1/projects/uji/databases/(default)/documents",
    token: "token-uji",
    alerts: ALERTS,
    todayIso: "2026-11-16",
    vapidPublicKey: VAPID.publicKey,
    vapidPrivateKey: VAPID.privateKey,
  };

  function subDoc(id, endpoint) {
    return {
      id,
      endpoint: endpoint || `https://example.com/push/${id}`,
      p256dh: validKeys().p256dh,
      auth: validKeys().auth,
    };
  }

  it("tanpa kunci VAPID: skipped-no-vapid, daftar tidak dibaca", async () => {
    let listed = false;
    const result = await sendPushDigest({
      ...base,
      vapidPublicKey: "",
      vapidPrivateKey: "",
      listImpl: async () => {
        listed = true;
        return { subscriptions: [], hasMore: false };
      },
    });
    assert.equal(result.push, "skipped-no-vapid");
    assert.equal(listed, false);
    assert.deepEqual(
      [result.pushSent, result.pushFailed, result.pushPruned],
      [0, 0, 0],
    );
  });

  it("tanpa alert baru: none", async () => {
    const result = await sendPushDigest({
      ...base,
      alerts: [],
      listImpl: async () => ({ subscriptions: [], hasMore: false }),
    });
    assert.equal(result.push, "none");
  });

  it("daftar langganan gagal (mis. Firestore 429): failed, tanpa crash", async () => {
    const result = await sendPushDigest({
      ...base,
      listImpl: async () => {
        throw new Error("Firestore baca gagal: HTTP 429");
      },
    });
    assert.equal(result.push, "failed");
    assert.equal(result.pushSent, 0);
  });

  it("tidak ada langganan: sent dengan hitungan nol", async () => {
    const result = await sendPushDigest({
      ...base,
      listImpl: async () => ({ subscriptions: [], hasMore: false }),
    });
    assert.equal(result.push, "sent");
    assert.equal(result.pushSent, 0);
  });

  it("semua kirim sukses: sent + hitungan benar + payload digest terkirim", async () => {
    const sentPayloads = [];
    const result = await sendPushDigest({
      ...base,
      listImpl: async () => ({
        subscriptions: [subDoc("a"), subDoc("b")],
        hasMore: false,
      }),
      sendImpl: async (subscription, payloadJson) => {
        sentPayloads.push(JSON.parse(payloadJson));
        return { statusCode: 201 };
      },
    });
    assert.equal(result.push, "sent");
    assert.equal(result.pushSent, 2);
    assert.equal(result.pushFailed, 0);
    assert.equal(result.pushPruned, 0);
    assert.equal(sentPayloads.length, 2);
    assert.equal(sentPayloads[0].title, "Lowongan baru di Karir");
    assert.equal(
      sentPayloads[0].body,
      "2 lowongan baru hari ini: PT Maju Bersama dan PT Sejahtera Abadi.",
    );
    assert.equal(sentPayloads[0].data.tag, "karir-digest-2026-11-16");
  });

  it("endpoint tidak valid (kirim melempar error umum): gagal bersih, bukan crash", async () => {
    const result = await sendPushDigest({
      ...base,
      listImpl: async () => ({
        subscriptions: [subDoc("rusak", "bukan-url")],
        hasMore: false,
      }),
      sendImpl: async () => {
        throw new Error("endpoint tidak valid");
      },
      deleteImpl: async () => {
        throw new Error("hapus tidak boleh dipanggil untuk error umum");
      },
    });
    assert.equal(result.push, "failed");
    assert.equal(result.pushFailed, 1);
    assert.equal(result.pushPruned, 0);
  });

  it("dokumen langganan rusak (null dari parse): dihitung gagal, bukan crash", async () => {
    const result = await sendPushDigest({
      ...base,
      listImpl: async () => ({
        subscriptions: [null, subDoc("baik")],
        hasMore: false,
      }),
      sendImpl: async () => ({ statusCode: 201 }),
    });
    assert.equal(result.push, "sent");
    assert.equal(result.pushSent, 1);
    assert.equal(result.pushFailed, 1);
  });

  it("410 -> langganan dihapus (prune), 429 -> dipertahankan (retry)", async () => {
    const deleted = [];
    const result = await sendPushDigest({
      ...base,
      listImpl: async () => ({
        subscriptions: [subDoc("kedaluwarsa"), subDoc("sibuk"), subDoc("ok")],
        hasMore: false,
      }),
      sendImpl: async (subscription) => {
        if (subscription.endpoint.endsWith("/kedaluwarsa")) {
          throw new WebPushError("gone", 410, {}, "", subscription.endpoint);
        }
        if (subscription.endpoint.endsWith("/sibuk")) {
          throw new WebPushError("too many", 429, {}, "", subscription.endpoint);
        }
        return { statusCode: 201 };
      },
      deleteImpl: async (id) => {
        deleted.push(id);
      },
    });
    assert.equal(result.push, "sent");
    assert.equal(result.pushSent, 1);
    assert.equal(result.pushFailed, 1);
    assert.equal(result.pushPruned, 1);
    assert.deepEqual(deleted, ["kedaluwarsa"]);
  });

  it("404 juga di-prune seperti 410", async () => {
    const deleted = [];
    const result = await sendPushDigest({
      ...base,
      listImpl: async () => ({
        subscriptions: [subDoc("hilang")],
        hasMore: false,
      }),
      sendImpl: async () => {
        throw new WebPushError("not found", 404, {}, "", "https://x");
      },
      deleteImpl: async (id) => {
        deleted.push(id);
      },
    });
    assert.equal(result.pushPruned, 1);
    assert.deepEqual(deleted, ["hilang"]);
  });

  it("hapus dokumen prune yang gagal: dihitung gagal, bukan terhapus", async () => {
    const result = await sendPushDigest({
      ...base,
      listImpl: async () => ({
        subscriptions: [subDoc("kedaluwarsa")],
        hasMore: false,
      }),
      sendImpl: async () => {
        throw new WebPushError("gone", 410, {}, "", "https://x");
      },
      deleteImpl: async () => {
        throw new Error("Firestore hapus gagal: HTTP 500");
      },
    });
    assert.equal(result.pushPruned, 0);
    assert.equal(result.pushFailed, 1);
  });

  it("401 -> failed + pengiriman dihentikan (sisa langganan tidak dicoba)", async () => {
    let sends = 0;
    const result = await sendPushDigest({
      ...base,
      concurrency: 1,
      listImpl: async () => ({
        subscriptions: [subDoc("satu"), subDoc("dua"), subDoc("tiga")],
        hasMore: false,
      }),
      sendImpl: async () => {
        sends += 1;
        throw new WebPushError("unauthorized", 401, {}, "", "https://x");
      },
      deleteImpl: async () => {
        throw new Error("401 tidak boleh menghapus langganan");
      },
    });
    assert.equal(result.push, "failed");
    assert.equal(sends, 1);
    assert.equal(result.pushPruned, 0);
  });

  it("kunci VAPID tidak benar: failed tanpa memanggil daftar kirim", async () => {
    let sends = 0;
    const result = await sendPushDigest({
      ...base,
      vapidPublicKey: "bukan-kunci",
      vapidPrivateKey: "bukan-kunci",
      listImpl: async () => ({
        subscriptions: [subDoc("a")],
        hasMore: false,
      }),
      sendImpl: async () => {
        sends += 1;
        return { statusCode: 201 };
      },
    });
    assert.equal(result.push, "failed");
    assert.equal(sends, 0);
  });

  it("anggaran habis di tengah daftar: truncated, sisanya dilewati", async () => {
    /* Versi lama test ini (anggaran 60 ms, tiap kirim 50 ms)
     * flaky secara struktural, bukan karena beban semata: satu
     * kirim hanya selesai bila dimulai sebelum anggaran habis,
     * sementara chunk berikutnya hanya dilewati bila anggaran
     * habis TEPAT di jeda antar-chunk (sub-milidetik) — kedua
     * syarat itu saling meniadakan marginnya. Di bawah beban
     * paralel, kirim pertama terpotong timeout (pushSent 0)
     * atau kirim kedua sempat mulai lalu gagal (pushFailed 1).
     * Menaikkan anggaran atau mempercepat kirim saja tidak
     * memperbaiki: keduanya mengubah hasil (lebih banyak
     * terkirim / tidak terpotong sama sekali) — dibuktikan
     * probe B4 (qa-b4/probe-flaky.mjs). Versi ini menghabiskan
     * anggaran secara deterministik lewat hapus prune (200 ms,
     * jauh di atas anggaran 100 ms): kirim pertama terkirim,
     * langganan kedaluwarsa dihapus, lalu chunk ketiga dilewati
     * karena anggaran habis. Aserti perilaku tidak berubah. */
    const result = await sendPushDigest({
      ...base,
      budgetMs: 100,
      concurrency: 1,
      listImpl: async () => ({
        subscriptions: [subDoc("a"), subDoc("kedaluwarsa-b"), subDoc("c")],
        hasMore: false,
      }),
      sendImpl: async (sub) => {
        if (sub.endpoint.includes("kedaluwarsa")) {
          throw new WebPushError("gone", 410, {}, "", "https://x");
        }
        return { statusCode: 201 };
      },
      deleteImpl: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      },
    });
    assert.equal(result.pushTruncated, true);
    assert.equal(result.pushSent, 1);
    assert.equal(result.pushFailed, 0);
  });

  it("hapus prune dihitung ke anggaran: anggaran habis di tengah prune -> terpotong, hapus berikutnya dilewati", async () => {
    const deleted = [];
    const started = Date.now();
    const result = await sendPushDigest({
      ...base,
      budgetMs: 200,
      listImpl: async () => ({
        subscriptions: [subDoc("kedaluwarsa-a"), subDoc("kedaluwarsa-b")],
        hasMore: false,
      }),
      sendImpl: async () => {
        throw new WebPushError("gone", 410, {}, "", "https://x");
      },
      deleteImpl: async (id) => {
        deleted.push(id);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      },
    });
    const elapsed = Date.now() - started;
    /* Kode lama: kedua hapus jalan berurutan di luar anggaran
     * (~3000 ms) dan pushTruncated tetap false. Kode baru: hanya
     * hapus pertama yang jalan; sebelum hapus kedua, anggaran
     * sudah habis -> dilewati, run dicatat terpotong. Langganan
     * kedua tetap ada dan akan 410 lagi besok. */
    assert.ok(
      elapsed < 2500,
      `elapsed ${elapsed} ms: hapus kedua tidak boleh jalan`,
    );
    assert.equal(result.pushTruncated, true);
    assert.equal(result.pushPruned, 1);
    assert.deepEqual(deleted, ["kedaluwarsa-a"]);
  });

  it("kirim yang menggantung: timeout per kirim, dihitung gagal (bukan macet)", async () => {
    const started = Date.now();
    const result = await sendPushDigest({
      ...base,
      budgetMs: 200,
      listImpl: async () => ({
        subscriptions: [subDoc("macet")],
        hasMore: false,
      }),
      sendImpl: async () => new Promise(() => {}),
    });
    assert.ok(Date.now() - started < 5000, "tidak boleh menggantung lama");
    assert.equal(result.push, "failed");
    assert.equal(result.pushFailed, 1);
    assert.equal(result.pushPruned, 0);
  });

  it("langganan melebihi satu halaman: tetap kirim halaman pertama", async () => {
    const result = await sendPushDigest({
      ...base,
      listImpl: async () => ({
        subscriptions: [subDoc("a")],
        hasMore: true,
      }),
      sendImpl: async () => ({ statusCode: 201 }),
    });
    assert.equal(result.push, "sent");
    assert.equal(result.pushSent, 1);
  });
});
