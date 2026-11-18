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
 * dibuat di tempat, bukan kunci produksi). P-07 menambah:
 * paginasi daftar langganan (600 langganan simulasi), status
 * jujur nol langganan ("none"), klasifikasi + pembersihan dokumen
 * malformed (mock), dan sidik epoch kunci VAPID. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateVAPIDKeys, WebPushError } from "web-push";
import {
  OBS_CODES,
  registerObservabilitySink,
  resetObservabilityForTests,
} from "./observability.js";
import {
  classifyPushError,
  classifyPushStatus,
  classifySubscriptionDoc,
  classifySubscriptionFields,
  cleanupMalformedSubscriptions,
  formatPushPayload,
  listSubscriptions,
  parseSubscriptionDoc,
  sendPushDigest,
  subscriptionDocId,
  subscriptionFields,
  validateEndpoint,
  validateSubscription,
  vapidKeyHash,
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
      /* P-07/K5: dokumen lama tanpa field vapidKeyHash -> "". */
      vapidKeyHash: "",
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

  it("tidak ada langganan: none dengan hitungan nol (P-07/P3)", async () => {
    /* Dulu: "sent" saat nol langganan — menyesatkan (tidak ada
     * satu pun yang menerima digest). P-07: "none". */
    const result = await sendPushDigest({
      ...base,
      listImpl: async () => ({ subscriptions: [], hasMore: false }),
    });
    assert.equal(result.push, "none");
    assert.equal(result.pushSent, 0);
    assert.equal(result.pushTotal, 0);
    assert.equal(result.pushPages, 1);
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
    /* P-06/P2: dokumen rusak dipisah ke pushMalformed (tetap
     * dihitung gagal — perilaku lama dipertahankan). */
    assert.equal(result.pushMalformed, 1);
    assert.equal(result.pushTotal, 2);
    assert.equal(result.pushHasMore, false);
  });

  it("P-06/P2: pushTotal + pushHasMore diteruskan saat halaman penuh", async () => {
    const result = await sendPushDigest({
      ...base,
      listImpl: async () => ({
        subscriptions: [subDoc("satu"), subDoc("dua")],
        hasMore: true,
      }),
      sendImpl: async () => ({ statusCode: 201 }),
    });
    assert.equal(result.push, "sent");
    assert.equal(result.pushSent, 2);
    assert.equal(result.pushTotal, 2);
    assert.equal(result.pushHasMore, true);
    assert.equal(result.pushMalformed, 0);
  });

  it("P-06/P2: daftar gagal -> pushTotal tetap 0", async () => {
    const result = await sendPushDigest({
      ...base,
      listImpl: async () => {
        throw new Error("Firestore 429");
      },
    });
    assert.equal(result.push, "failed");
    assert.equal(result.pushTotal, 0);
    assert.equal(result.pushHasMore, false);
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

  it("langganan melebihi satu halaman: SEMUA halaman dikirim (P-07/K1)", async () => {
    /* Dulu (P1): hanya halaman pertama yang dikirimi digest.
     * P-07: paginasi berjalan sampai habis. */
    const pages = {
      "": {
        subscriptions: [subDoc("a")],
        hasMore: true,
        nextPageToken: "halaman-2",
      },
      "halaman-2": {
        subscriptions: [subDoc("b")],
        hasMore: false,
        nextPageToken: "",
      },
    };
    const result = await sendPushDigest({
      ...base,
      listPageImpl: async (pageToken) => pages[pageToken],
      sendImpl: async () => ({ statusCode: 201 }),
    });
    assert.equal(result.push, "sent");
    assert.equal(result.pushSent, 2);
    assert.equal(result.pushTotal, 2);
    assert.equal(result.pushPages, 2);
    assert.equal(result.pushHasMore, false);
  });

  it("listImpl lawas tanpa token halaman: halaman berikut dilaporkan jujur (P-07/K1)", async () => {
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
    assert.equal(result.pushHasMore, true);
    assert.equal(result.pushPages, 1);
  });

  it("600 langganan simulasi: seluruh 600 menerima digest, 2 halaman, log per kelompok (P-07/K1)", async () => {
    /* Kriteria paket P-07 no. 1: tes dengan 600 langganan simulasi
     * membuktikan seluruh 600 menerima digest. Halaman 1 = 500
     * (PUSH_PAGE_SIZE produksi), halaman 2 = 100. */
    const pages = {
      "": {
        subscriptions: Array.from({ length: 500 }, (_, i) =>
          subDoc(`hal1-${i}`),
        ),
        hasMore: true,
        nextPageToken: "halaman-2",
      },
      "halaman-2": {
        subscriptions: Array.from({ length: 100 }, (_, i) =>
          subDoc(`hal2-${i}`),
        ),
        hasMore: false,
        nextPageToken: "",
      },
    };
    /* Bukti log per kelompok: kejadian observabilitas per
     * halaman, ditangkap lewat sink (bukan console.log — aturan
     * lint melarang console.log di kode produksi). */
    resetObservabilityForTests();
    const events = [];
    registerObservabilitySink((event) => {
      events.push(event);
    });
    let sent = 0;
    try {
      const result = await sendPushDigest({
        ...base,
        budgetMs: 60_000,
        listPageImpl: async (pageToken) => pages[pageToken],
        sendImpl: async () => {
          sent += 1;
          return { statusCode: 201 };
        },
      });
      assert.equal(result.push, "sent");
      assert.equal(result.pushSent, 600);
      assert.equal(sent, 600);
      assert.equal(result.pushTotal, 600);
      assert.equal(result.pushPages, 2);
      assert.equal(result.pushHasMore, false);
      assert.equal(result.pushFailed, 0);
      const pageEvents = events.filter(
        (event) => event.code === OBS_CODES.PUSH_DIGEST_PAGE,
      );
      assert.equal(pageEvents.length, 2);
      assert.equal(pageEvents[0].level, "info");
      assert.match(
        pageEvents[0].message,
        /halaman 1 — 500 langganan dibaca/,
      );
      assert.match(
        pageEvents[1].message,
        /halaman 2 — 100 langganan dibaca/,
      );
      assert.equal(pageEvents[0].meta.page, 1);
      assert.equal(pageEvents[0].meta.read, 500);
      assert.equal(pageEvents[1].meta.cumulative, 600);
      /* Tidak ada endpoint di log. */
      assert.equal(
        events.some((event) => event.message.includes("example.com/push")),
        false,
      );
    } finally {
      resetObservabilityForTests();
    }
  });

  it("dokumen malformed dihitung per halaman, terakumulasi (P-07/K1)", async () => {
    const pages = {
      "": {
        subscriptions: [null, subDoc("baik-1")],
        hasMore: true,
        nextPageToken: "halaman-2",
      },
      "halaman-2": {
        subscriptions: [null, null, subDoc("baik-2")],
        hasMore: false,
        nextPageToken: "",
      },
    };
    const result = await sendPushDigest({
      ...base,
      listPageImpl: async (pageToken) => pages[pageToken],
      sendImpl: async () => ({ statusCode: 201 }),
    });
    assert.equal(result.push, "sent");
    assert.equal(result.pushSent, 2);
    assert.equal(result.pushMalformed, 3);
    assert.equal(result.pushFailed, 3);
    assert.equal(result.pushTotal, 5);
    assert.equal(result.pushPages, 2);
  });

  it("anggaran habis di tengah paginasi: terpotong + halaman berikut dilaporkan (P-07/K1)", async () => {
    /* Deterministik lewat hapus prune yang lambat (pola yang sama
     * dengan tes "anggaran habis di tengah daftar"): halaman 1
     * berisi satu langganan 410 yang hapusnya memakan 200 ms
     * (anggaran 100 ms) — sesudah halaman 1, cek anggaran di
     * awal putaran berikut terpicu sebelum halaman 2 dibaca. */
    const pages = {
      "": {
        subscriptions: [subDoc("kedaluwarsa")],
        hasMore: true,
        nextPageToken: "halaman-2",
      },
      "halaman-2": {
        subscriptions: [subDoc("b")],
        hasMore: false,
        nextPageToken: "",
      },
    };
    const result = await sendPushDigest({
      ...base,
      budgetMs: 100,
      listPageImpl: async (pageToken) => pages[pageToken],
      sendImpl: async () => {
        throw new WebPushError("gone", 410, {}, "", "https://x");
      },
      deleteImpl: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      },
    });
    assert.equal(result.push, "sent");
    assert.equal(result.pushPruned, 1);
    assert.equal(result.pushTruncated, true);
    assert.equal(result.pushHasMore, true);
    assert.equal(result.pushPages, 1);
  });

  it("daftar halaman kedua gagal: failed dengan hitungan parsial (P-07/K1)", async () => {
    const pages = {
      "": {
        subscriptions: [subDoc("a")],
        hasMore: true,
        nextPageToken: "halaman-2",
      },
    };
    const result = await sendPushDigest({
      ...base,
      listPageImpl: async (pageToken) => {
        if (pageToken === "halaman-2") {
          throw new Error("Firestore baca gagal: HTTP 429");
        }
        return pages[pageToken];
      },
      sendImpl: async () => ({ statusCode: 201 }),
    });
    assert.equal(result.push, "failed");
    assert.equal(result.pushSent, 1);
    assert.equal(result.pushTotal, 1);
    assert.equal(result.pushHasMore, true);
    assert.equal(result.pushPages, 1);
  });

  it("401 menandai pushConfigError (P-07/K5)", async () => {
    const result = await sendPushDigest({
      ...base,
      concurrency: 1,
      listImpl: async () => ({
        subscriptions: [subDoc("satu")],
        hasMore: false,
      }),
      sendImpl: async () => {
        throw new WebPushError("unauthorized", 401, {}, "", "https://x");
      },
    });
    assert.equal(result.push, "failed");
    assert.equal(result.pushConfigError, true);
  });

  it("kunci VAPID tidak benar menandai pushConfigError (P-07/K5)", async () => {
    let listed = false;
    const result = await sendPushDigest({
      ...base,
      vapidPublicKey: "bukan-kunci",
      vapidPrivateKey: "bukan-kunci",
      listImpl: async () => {
        listed = true;
        return { subscriptions: [subDoc("a")], hasMore: false };
      },
      sendImpl: async () => ({ statusCode: 201 }),
    });
    assert.equal(result.push, "failed");
    assert.equal(result.pushConfigError, true);
    /* Gagal cepat: daftar tidak dibaca bila kunci tidak benar. */
    assert.equal(listed, false);
    assert.equal(result.pushTotal, 0);
  });

  it("sidik kunci VAPID: langganan lama vs tanpa sidik dihitung terpisah (P-07/K5)", async () => {
    const currentHash = vapidKeyHash(VAPID.publicKey);
    const result = await sendPushDigest({
      ...base,
      listImpl: async () => ({
        subscriptions: [
          { ...subDoc("kini"), vapidKeyHash: currentHash },
          { ...subDoc("lama"), vapidKeyHash: "sidiklamaxyz" },
          subDoc("tanpa-sidik"),
        ],
        hasMore: false,
      }),
      sendImpl: async () => ({ statusCode: 201 }),
    });
    assert.equal(result.push, "sent");
    assert.equal(result.pushSent, 3);
    assert.equal(result.pushStaleKey, 1);
    assert.equal(result.pushUnknownKey, 1);
  });
});

describe("vapidKeyHash + subscriptionFields (P-07/K5)", () => {
  it("vapidKeyHash: 12 karakter hex, deterministik, kosong bila kunci kosong", () => {
    const hash = vapidKeyHash(VAPID.publicKey);
    assert.equal(hash.length, 12);
    assert.match(hash, /^[0-9a-f]{12}$/);
    assert.equal(hash, vapidKeyHash(VAPID.publicKey));
    assert.notEqual(hash, vapidKeyHash(generateVAPIDKeys().publicKey));
    assert.equal(vapidKeyHash(""), "");
    assert.equal(vapidKeyHash(null), "");
  });

  it("subscriptionFields menulis vapidKeyHash bila kunci publik diisi", () => {
    const fields = subscriptionFields({
      uid: "uid-uji",
      subscription: validSubscription(),
      userAgent: "UA Uji",
      nowIso: "2026-11-18T00:00:00.000Z",
      vapidPublicKey: VAPID.publicKey,
    });
    assert.equal(
      fields.vapidKeyHash.stringValue,
      vapidKeyHash(VAPID.publicKey),
    );
  });

  it("subscriptionFields tanpa kunci publik: field vapidKeyHash tidak ditulis", () => {
    const fields = subscriptionFields({
      uid: "uid-uji",
      subscription: validSubscription(),
      userAgent: "UA Uji",
      nowIso: "2026-11-18T00:00:00.000Z",
    });
    assert.equal("vapidKeyHash" in fields, false);
  });

  it("parseSubscriptionDoc meneruskan vapidKeyHash; dokumen lama -> string kosong", () => {
    const withHash = parseSubscriptionDoc({
      name: "x/push_subscriptions/abc",
      fields: {
        endpoint: { stringValue: "https://example.com/push/1" },
        p256dh: { stringValue: validKeys().p256dh },
        auth: { stringValue: validKeys().auth },
        vapidKeyHash: { stringValue: "sidiklamaxyz" },
      },
    });
    assert.equal(withHash.vapidKeyHash, "sidiklamaxyz");
    const legacy = parseSubscriptionDoc({
      name: "x/push_subscriptions/def",
      fields: {
        endpoint: { stringValue: "https://example.com/push/2" },
        p256dh: { stringValue: validKeys().p256dh },
        auth: { stringValue: validKeys().auth },
      },
    });
    assert.equal(legacy.vapidKeyHash, "");
  });
});

describe("listSubscriptions dengan pageToken (P-07/K1)", () => {
  it("halaman pertama mengembalikan nextPageToken; halaman kedua menghabiskannya", async () => {
    const fetchAsli = globalThis.fetch;
    const urls = [];
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      const u = String(url);
      const page1 = !u.includes("pageToken=");
      return {
        ok: true,
        status: 200,
        json: async () =>
          page1
            ? {
                documents: [
                  {
                    name: "x/push_subscriptions/satu",
                    fields: {
                      endpoint: {
                        stringValue: "https://example.com/push/1",
                      },
                      p256dh: { stringValue: validKeys().p256dh },
                      auth: { stringValue: validKeys().auth },
                    },
                  },
                ],
                nextPageToken: "token-halaman-2",
              }
            : { documents: [] },
      };
    };
    try {
      const first = await listSubscriptions(
        "https://firestore.googleapis.com/v1/projects/uji/databases/(default)/documents",
        "token-uji",
      );
      assert.equal(first.subscriptions.length, 1);
      assert.equal(first.hasMore, true);
      assert.equal(first.nextPageToken, "token-halaman-2");
      const second = await listSubscriptions(
        "https://firestore.googleapis.com/v1/projects/uji/databases/(default)/documents",
        "token-uji",
        first.nextPageToken,
      );
      assert.equal(second.subscriptions.length, 0);
      assert.equal(second.hasMore, false);
      assert.equal(second.nextPageToken, "");
      assert.equal(urls.length, 2);
      assert.match(urls[1], /pageToken=token-halaman-2/);
    } finally {
      globalThis.fetch = fetchAsli;
    }
  });
});

describe("classifySubscriptionFields / classifySubscriptionDoc (P-07/K3)", () => {
  it("field lengkap dan benar -> valid", () => {
    assert.deepEqual(
      classifySubscriptionFields({
        endpoint: "https://example.com/push/1",
        p256dh: validKeys().p256dh,
        auth: validKeys().auth,
      }),
      { valid: true, reason: "" },
    );
  });

  it("alasan endpoint: hilang / http / terlalu panjang", () => {
    assert.equal(
      classifySubscriptionFields({
        endpoint: undefined,
        p256dh: validKeys().p256dh,
        auth: validKeys().auth,
      }).reason,
      "endpoint",
    );
    assert.equal(
      classifySubscriptionFields({
        endpoint: "http://example.com/push",
        p256dh: validKeys().p256dh,
        auth: validKeys().auth,
      }).reason,
      "endpoint",
    );
  });

  it("alasan p256dh: bukan 65 byte / byte pertama bukan 0x04", () => {
    assert.equal(
      classifySubscriptionFields({
        endpoint: "https://example.com/push/1",
        p256dh: Buffer.alloc(32).toString("base64url"),
        auth: validKeys().auth,
      }).reason,
      "p256dh",
    );
    assert.equal(
      classifySubscriptionFields({
        endpoint: "https://example.com/push/1",
        p256dh: Buffer.alloc(65, 0x02).toString("base64url"),
        auth: validKeys().auth,
      }).reason,
      "p256dh",
    );
  });

  it("alasan auth: bukan 16 byte", () => {
    assert.equal(
      classifySubscriptionFields({
        endpoint: "https://example.com/push/1",
        p256dh: validKeys().p256dh,
        auth: Buffer.alloc(8).toString("base64url"),
      }).reason,
      "auth",
    );
  });

  function docRest(id, fields) {
    return {
      name:
        `projects/uji/databases/(default)/documents/push_subscriptions/${id}`,
      fields,
    };
  }

  function fieldsBaik(overrides = {}) {
    return {
      uid: { stringValue: "uid-uji" },
      endpoint: { stringValue: "https://example.com/push/1" },
      p256dh: { stringValue: validKeys().p256dh },
      auth: { stringValue: validKeys().auth },
      ...overrides,
    };
  }

  it("dokumen lengkap -> valid, dengan id + nama resource", () => {
    const out = classifySubscriptionDoc(docRest("doc-1", fieldsBaik()));
    assert.equal(out.valid, true);
    assert.equal(out.id, "doc-1");
    assert.ok(out.name.endsWith("/push_subscriptions/doc-1"));
  });

  it("dokumen tanpa endpoint -> malformed alasan endpoint", () => {
    const fields = fieldsBaik();
    delete fields.endpoint;
    const out = classifySubscriptionDoc(docRest("doc-2", fields));
    assert.equal(out.valid, false);
    assert.equal(out.reason, "endpoint");
  });

  it("dokumen tanpa UID TIDAK malformed (masih bisa menerima digest, bisa diklaim ulang)", () => {
    const fields = fieldsBaik();
    delete fields.uid;
    const out = classifySubscriptionDoc(docRest("doc-3", fields));
    assert.equal(out.valid, true);
  });

  it("ID dokumen bukan SHA-256 endpoint TIDAK malformed (pengiriman memakai endpoint, bukan ID)", () => {
    const out = classifySubscriptionDoc(
      docRest("id-sembarang-bukan-sha256", fieldsBaik()),
    );
    assert.equal(out.valid, true);
  });

  it("dokumen tanpa field sama sekali -> malformed alasan endpoint", () => {
    const out = classifySubscriptionDoc(docRest("doc-4", {}));
    assert.equal(out.valid, false);
    assert.equal(out.reason, "endpoint");
  });

  it("dokumen null/bukan objek -> malformed alasan endpoint", () => {
    assert.equal(classifySubscriptionDoc(null).valid, false);
    assert.equal(classifySubscriptionDoc(null).reason, "endpoint");
  });
});

describe("cleanupMalformedSubscriptions (P-07/K3)", () => {
  const FS_BASE =
    "https://firestore.googleapis.com/v1/projects/uji/databases/(default)/documents";

  function docRest(id, fields) {
    return {
      name: `${FS_BASE}/push_subscriptions/${id}`,
      fields,
    };
  }

  function fieldsBaik(endpoint = "https://example.com/push/baik") {
    return {
      uid: { stringValue: "uid-uji" },
      endpoint: { stringValue: endpoint },
      p256dh: { stringValue: validKeys().p256dh },
      auth: { stringValue: validKeys().auth },
    };
  }

  it("dokumen malformed dihapus per kelompok; yang baik dan yatim dipertahankan", async () => {
    const deletedNames = [];
    const pages = {
      "": {
        documents: [
          docRest("baik-1", fieldsBaik()),
          docRest("buruk-endpoint", {
            ...fieldsBaik(),
            endpoint: { stringValue: "http://example.com/push" },
          }),
          docRest(
            "yatim",
            (() => {
              const f = fieldsBaik("https://example.com/push/yatim");
              delete f.uid;
              return f;
            })(),
          ),
        ],
        hasMore: true,
        nextPageToken: "halaman-2",
      },
      "halaman-2": {
        documents: [
          docRest("buruk-p256dh", {
            ...fieldsBaik("https://example.com/push/2"),
            p256dh: { stringValue: Buffer.alloc(32).toString("base64url") },
          }),
          docRest("buruk-auth", {
            ...fieldsBaik("https://example.com/push/3"),
            auth: { stringValue: Buffer.alloc(8).toString("base64url") },
          }),
        ],
        hasMore: false,
        nextPageToken: "",
      },
    };
    const result = await cleanupMalformedSubscriptions({
      fsBase: FS_BASE,
      token: "token-uji",
      listPageImpl: async (pageToken) => pages[pageToken],
      batchDeleteImpl: async (names) => {
        deletedNames.push(...names);
      },
    });
    assert.equal(result.examined, 5);
    assert.equal(result.malformed, 3);
    assert.equal(result.cleaned, 3);
    assert.equal(result.failed, 0);
    assert.equal(result.hasMore, false);
    assert.equal(result.listFailed, false);
    assert.deepEqual(result.reasons, { endpoint: 1, p256dh: 1, auth: 1 });
    assert.equal(deletedNames.length, 3);
    assert.equal(
      deletedNames.some((n) => n.endsWith("/baik-1")),
      false,
    );
    assert.equal(
      deletedNames.some((n) => n.endsWith("/yatim")),
      false,
    );
  });

  it("dryRun: klasifikasi jalan, hapus TIDAK jalan", async () => {
    let deletes = 0;
    const result = await cleanupMalformedSubscriptions({
      fsBase: FS_BASE,
      token: "token-uji",
      dryRun: true,
      listPageImpl: async () => ({
        documents: [
          docRest("buruk", {
            ...fieldsBaik(),
            endpoint: { stringValue: "http://example.com/push" },
          }),
        ],
        hasMore: false,
        nextPageToken: "",
      }),
      batchDeleteImpl: async () => {
        deletes += 1;
      },
    });
    assert.equal(result.malformed, 1);
    assert.equal(result.cleaned, 0);
    assert.equal(deletes, 0);
    assert.equal(result.dryRun, true);
  });

  it("batas hapus: malformed di luar batas dicatat tapi tidak dihapus run ini, hasMore true", async () => {
    const deletedNames = [];
    const docs = Array.from({ length: 5 }, (_, i) =>
      docRest(`buruk-${i}`, {
        ...fieldsBaik(`https://example.com/push/${i}`),
        endpoint: { stringValue: "http://example.com/push" },
      }),
    );
    const result = await cleanupMalformedSubscriptions({
      fsBase: FS_BASE,
      token: "token-uji",
      maxDelete: 2,
      listPageImpl: async () => ({
        documents: docs,
        hasMore: false,
        nextPageToken: "",
      }),
      batchDeleteImpl: async (names) => {
        deletedNames.push(...names);
      },
    });
    assert.equal(result.examined, 5);
    assert.equal(result.malformed, 5);
    assert.equal(result.cleaned, 2);
    assert.equal(result.hasMore, true);
    assert.equal(deletedNames.length, 2);
  });

  it("batas periksa: dokumen di luar batas tidak diperiksa, hasMore true", async () => {
    const docs = Array.from({ length: 5 }, (_, i) =>
      docRest(`baik-${i}`, fieldsBaik(`https://example.com/push/${i}`)),
    );
    const result = await cleanupMalformedSubscriptions({
      fsBase: FS_BASE,
      token: "token-uji",
      maxExamine: 3,
      listPageImpl: async () => ({
        documents: docs,
        hasMore: false,
        nextPageToken: "",
      }),
    });
    assert.equal(result.examined, 3);
    assert.equal(result.hasMore, true);
  });

  it("daftar gagal: listFailed true, tanpa crash, tanpa hapus", async () => {
    let deletes = 0;
    const result = await cleanupMalformedSubscriptions({
      fsBase: FS_BASE,
      token: "token-uji",
      listPageImpl: async () => {
        throw new Error("Firestore baca gagal: HTTP 429");
      },
      batchDeleteImpl: async () => {
        deletes += 1;
      },
    });
    assert.equal(result.listFailed, true);
    assert.equal(result.examined, 0);
    assert.equal(result.cleaned, 0);
    assert.equal(deletes, 0);
  });

  it("hapus kelompok gagal: seluruh kelompok dihitung gagal, run berikut mencoba lagi", async () => {
    const result = await cleanupMalformedSubscriptions({
      fsBase: FS_BASE,
      token: "token-uji",
      listPageImpl: async () => ({
        documents: [
          docRest("buruk-1", {
            ...fieldsBaik(),
            endpoint: { stringValue: "http://example.com/push" },
          }),
          docRest("buruk-2", {
            ...fieldsBaik("https://example.com/push/2"),
            endpoint: { stringValue: "http://example.com/push" },
          }),
        ],
        hasMore: false,
        nextPageToken: "",
      }),
      batchDeleteImpl: async () => {
        throw new Error("Firestore hapus gagal: HTTP 500");
      },
    });
    assert.equal(result.malformed, 2);
    assert.equal(result.cleaned, 0);
    assert.equal(result.failed, 2);
  });

  it("anggaran habis di tengah paginasi: truncated + hasMore, tanpa crash", async () => {
    const result = await cleanupMalformedSubscriptions({
      fsBase: FS_BASE,
      token: "token-uji",
      budgetMs: 10,
      listPageImpl: async (pageToken) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (pageToken === "") {
          return {
            documents: [docRest("baik-1", fieldsBaik())],
            hasMore: true,
            nextPageToken: "halaman-2",
          };
        }
        return { documents: [], hasMore: false, nextPageToken: "" };
      },
    });
    assert.equal(result.examined, 1);
    assert.equal(result.truncated, true);
    assert.equal(result.hasMore, true);
  });
});
