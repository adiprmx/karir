/* Notifikasi web push Karir (T10) — server saja.
 * Modul ini tidak pernah diimpor kode klien: ia memakai library
 * `web-push` dan kunci privat VAPID dari env server.
 *
 * Konsep (lihat laporan desain B1):
 * - Langganan tersimpan satu dokumen per langganan di koleksi
 *   `push_subscriptions`, ID dokumen = SHA-256 hex dari endpoint
 *   (subscribe idempotent, unsubscribe tanpa query). Rules
 *   menutup koleksi ini total untuk klien dan admin; semua akses
 *   lewat service account.
 * - Isi notifikasi: digest harian untuk semua pelanggan, dibangun
 *   dari `freshAlerts` yang sama dengan pesan Telegram cron
 *   recheck. Selalu Bahasa Indonesia.
 * - Kirim best-effort total: kegagalan apa pun tidak pernah
 *   menggagalkan run cron; anggaran sendiri 10 detik, konkurensi
 *   10. Endpoint langganan TIDAK PERNAH ditulis ke log.
 *
 * Penanganan hasil kirim per langganan:
 * - 410/404 -> langganan kedaluwarsa -> hapus dokumennya.
 * - 401/403 -> masalah konfigurasi VAPID server -> JANGAN hapus;
 *   catat peringatan keras dan hentikan pengiriman run ini.
 * - 429/5xx/timeout -> transient -> simpan, coba lagi besok.
 * - Status lain yang tidak dikenal -> simpan (jangan hapus atas
 *   sinyal yang ambigu).
 *
 * P-07: daftar langganan DIPAGINASI — batas 500 langganan
 * dihapus (P1): sendPushDigest berjalan halaman demi halaman
 * sampai habis atau anggaran habis, dan mencatat jumlah halaman
 * (pushPages). Status "sent" hanya bila minimal satu langganan
 * benar-benar dikirimi; nol langganan dicatat "none" (P3).
 * Dokumen malformed dibersihkan job cleanup lewat
 * cleanupMalformedSubscriptions (P4) — kriteria penghapusannya
 * dicatat di classifySubscriptionDoc. */
import { createHash } from "node:crypto";
import { setVapidDetails, sendNotification } from "web-push";
import { firestoreDelete, firestoreFetch } from "./firestore-server.js";
import {
  emitObservabilityEvent,
  OBS_CODES,
} from "./observability.js";

export const PUSH_COLLECTION = "push_subscriptions";
/* Anggaran fase kirim push di dalam run cron (10 detik) dan
 * konkurensi kirim paralel. */
export const PUSH_BUDGET_MS = 10_000;
export const PUSH_CONCURRENCY = 10;
/* TTL 24 jam: digest harian; perangkat yang offline lebih dari
 * sehari tidak perlu menerima kabar basi. */
export const PUSH_TTL_SECONDS = 86_400;
export const PUSH_VAPID_SUBJECT = "mailto:adiprmx@gmail.com";
/* Ukuran satu halaman daftar langganan (P-07/K1): sendPushDigest
 * berjalan halaman demi halaman sampai habis — 500 bukan lagi
 * batas langganan yang dilayani, hanya ukuran halaman daftar. */
export const PUSH_PAGE_SIZE = 500;
/* Pembersihan malformed (P-07/K3): batas hapus dan batas periksa
 * per run, mengikuti pola retensi cleanup (maks 100 hapus per
 * koleksi per run; workflow memanggil lagi bila ada sisa). */
export const PUSH_CLEANUP_MAX_DELETE = 100;
export const PUSH_CLEANUP_MAX_EXAMINE = 1000;
/* Panjang sidik kunci VAPID (P-07/K5): 12 karakter pertama SHA-256
 * hex kunci publik — cukup untuk membedakan epoch kunci, bukan
 * rahasia (kunci publik memang dibagikan ke browser). */
export const PUSH_VAPID_KEY_HASH_LEN = 12;
/* Panjang maksimum badan notifikasi (karakter). */
export const PUSH_BODY_MAX = 200;
export const PUSH_ENDPOINT_MAX = 2000;
export const PUSH_USER_AGENT_MAX = 500;
/* Batas satu kirim: tidak boleh menggantung tanpa batas dan
 * memakan seluruh anggaran fase. Kirim yang kehabisan waktu
 * dihitung gagal (transient) dan dicoba lagi besok. */
export const PUSH_SEND_TIMEOUT_MS = 8_000;

/* ID dokumen langganan: SHA-256 hex (64 karakter) dari endpoint.
 * Deterministik: subscribe ulang menimpa dokumen yang sama. */
export function subscriptionDocId(endpoint) {
  return createHash("sha256").update(endpoint, "utf8").digest("hex");
}

/* Decode base64url secara ketat: Buffer.from(.., "base64url")
 * sendiri longgar (karakter tak dikenal diabaikan), jadi bentuk
 * dicek dulu dengan regex lalu hasil decode di-encode ulang dan
 * dibandingkan — padding atau karakter liar langsung ditolak. */
function decodeBase64urlStrict(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value) return null;
  return bytes;
}

/* Validasi ringan endpoint saja (untuk unsubscribe): string,
 * diawali https://, tidak melebihi batas, dan bisa diparse sebagai
 * URL. */
export function validateEndpoint(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return { ok: false, error: "Endpoint tidak ada." };
  }
  if (!endpoint.startsWith("https://")) {
    return { ok: false, error: "Endpoint harus memakai https." };
  }
  if (endpoint.length > PUSH_ENDPOINT_MAX) {
    return { ok: false, error: "Endpoint terlalu panjang." };
  }
  try {
    new URL(endpoint);
  } catch {
    return { ok: false, error: "Endpoint bukan URL yang benar." };
  }
  return { ok: true };
}

/* Klasifikasi bentuk field langganan (P-07/K3): dipakai validasi
 * subscribe (validateSubscription) dan pembersihan malformed
 * (classifySubscriptionDoc) — satu definisi "bentuk benar" untuk
 * kedua jalur, supaya dokumen yang lolos subscribe tidak pernah
 * dianggap malformed oleh job pembersihan. Alasan memakai kode
 * mesin ("endpoint" | "p256dh" | "auth") supaya job pembersihan
 * bisa menghitung per alasan; pesan untuk pengguna dipetakan
 * pemanggil. Kembalikan { valid: true, reason: "" } bila bentuk
 * benar, atau { valid: false, reason, detail } bila tidak. */
export function classifySubscriptionFields({ endpoint, p256dh, auth }) {
  const endpointCheck = validateEndpoint(endpoint);
  if (!endpointCheck.ok) {
    return { valid: false, reason: "endpoint", detail: endpointCheck.error };
  }
  const p256dhBytes = decodeBase64urlStrict(p256dh);
  if (!p256dhBytes || p256dhBytes.length !== 65 || p256dhBytes[0] !== 0x04) {
    return {
      valid: false,
      reason: "p256dh",
      detail: "Kunci langganan tidak berbentuk benar.",
    };
  }
  const authBytes = decodeBase64urlStrict(auth);
  if (!authBytes || authBytes.length !== 16) {
    return {
      valid: false,
      reason: "auth",
      detail: "Kunci langganan tidak berbentuk benar.",
    };
  }
  return { valid: true, reason: "" };
}

/* Validasi bentuk langganan push (hasil subscription.toJSON()
 * dari browser). Fungsi murni, bisa diuji tanpa server:
 * - endpoint: URL https, maks 2000 karakter.
 * - keys.p256dh: base64url yang setelah decode tepat 65 byte dan
 *   byte pertama 0x04 (titik kurva P-256 uncompressed).
 * - keys.auth: base64url yang setelah decode tepat 16 byte.
 * Pesan error ditujukan ke pengguna (tanpa detail internal). */
export function validateSubscription(subscription) {
  if (
    !subscription ||
    typeof subscription !== "object" ||
    Array.isArray(subscription)
  ) {
    return { ok: false, error: "Langganan tidak berbentuk benar." };
  }
  const endpointCheck = validateEndpoint(subscription.endpoint);
  if (!endpointCheck.ok) return endpointCheck;
  const keys = subscription.keys;
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) {
    return { ok: false, error: "Kunci langganan tidak ada." };
  }
  const classified = classifySubscriptionFields({
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });
  if (!classified.valid) {
    return { ok: false, error: classified.detail };
  }
  return { ok: true };
}

/* Klasifikasi satu hasil kirim dari kode status HTTP push service:
 * "sent" (terkirim), "prune" (langganan kedaluwarsa, hapus),
 * "config" (masalah VAPID server, jangan hapus, hentikan run),
 * "retry" (transient atau tidak dikenal, simpan untuk besok). */
export function classifyPushStatus(status) {
  if (status === 200 || status === 201) return "sent";
  if (status === 410 || status === 404) return "prune";
  if (status === 401 || status === 403) return "config";
  return "retry";
}

/* Klasifikasi dari error kirim (WebPushError membawa statusCode;
 * error jaringan/timeout tanpa statusCode dianggap transient). */
export function classifyPushError(err) {
  const status =
    err && typeof err.statusCode === "number" ? err.statusCode : null;
  if (status === null) return "retry";
  return classifyPushStatus(status);
}

function shortText(text, max) {
  const s = (text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

/* Bangun satu payload digest dari alert baru run ini (fungsi
 * murni, selalu Bahasa Indonesia). Perusahaan dideduplikasi per
 * nomor — satu perusahaan bisa muncul sebagai new-target dan
 * deadline sekaligus. Angka N adalah jumlah perusahaan unik,
 * bukan jumlah alert, supaya kalimat "dan N lagi" tetap benar
 * (bila N memakai jumlah alert, kalimat bisa menyebut perusahaan
 * ketiga yang sebenarnya tidak ada).
 * - 1 perusahaan: "{Perusahaan} — {posisi}" (atau
 *   "{Perusahaan} — lowongan baru." bila posisi kosong).
 * - 2 perusahaan: "2 lowongan baru hari ini: {A} dan {B}."
 * - N perusahaan: "N lowongan baru hari ini: {A}, {B}, dan
 *   {N-2} lagi."
 * Tag per hari membuat notifikasi hari yang sama saling
 * mengganti, bukan menumpuk. Daftar kosong -> null (pemanggil
 * tidak mengirim apa pun). */
export function formatPushPayload(alerts, todayIso) {
  const list = alerts || [];
  if (list.length === 0) return null;
  const seen = new Set();
  const companies = [];
  for (const alert of list) {
    const no = Number(alert.companyNo);
    if (seen.has(no)) continue;
    seen.add(no);
    companies.push({
      no,
      perusahaan: alert.perusahaan || "",
      posisi: alert.posisi || "",
    });
  }
  if (companies.length === 0) return null;
  let body;
  if (companies.length === 1) {
    const only = companies[0];
    body = only.posisi
      ? `${only.perusahaan} — ${shortText(only.posisi, 140)}`
      : `${only.perusahaan} — lowongan baru.`;
  } else if (companies.length === 2) {
    body =
      `2 lowongan baru hari ini: ${companies[0].perusahaan} ` +
      `dan ${companies[1].perusahaan}.`;
  } else {
    body =
      `${companies.length} lowongan baru hari ini: ` +
      `${companies[0].perusahaan}, ${companies[1].perusahaan}, ` +
      `dan ${companies.length - 2} lagi.`;
  }
  return {
    title: "Lowongan baru di Karir",
    body: shortText(body, PUSH_BODY_MAX),
    data: {
      url: "/",
      date: todayIso,
      tag: `karir-digest-${todayIso}`,
    },
  };
}

/* Sidik kunci publik VAPID (P-07/K5): 12 karakter pertama SHA-256
 * hex dari kunci publik. Disimpan di dokumen langganan sebagai
 * field `vapidKeyHash` saat subscribe, supaya run digest bisa
 * menghitung berapa langganan yang masih memakai epoch kunci lama
 * sesudah rotasi (pushStaleKey) — tanpa menyimpan kunci itu
 * sendiri di dokumen. Kunci publik bukan rahasia, dan sidiknya
 * lebih bukan rahasia lagi. Kunci kosong -> "" (epoch tidak
 * diketahui, dihitung pushUnknownKey). */
export function vapidKeyHash(publicKey) {
  if (typeof publicKey !== "string" || publicKey.length === 0) return "";
  return createHash("sha256")
    .update(publicKey, "utf8")
    .digest("hex")
    .slice(0, PUSH_VAPID_KEY_HASH_LEN);
}

/* Field Firestore untuk satu dokumen langganan (dipakai route
 * subscribe). createdAt ditulis sama dengan updatedAt pada setiap
 * subscribe; stempel buat yang tepat tidak dipakai logika apa pun.
 * Route subscribe membaca dokumen dulu sebelum menulis (cek pemilik
 * — subscribe atas langganan milik akun lain ditolak 409), jadi
 * createdAt di sini hanya nilai awal bila dokumen belum ada.
 * userAgent dipotong ke 500 karakter di server.
 * vapidPublicKey (opsional): sidik epoch kunci publik saat
 * subscribe (P-07/K5) — bila tidak diisi, field vapidKeyHash
 * tidak ditulis (dokumen lama juga tidak punya field ini). */
export function subscriptionFields({
  uid,
  subscription,
  userAgent,
  nowIso,
  vapidPublicKey = "",
}) {
  const ua =
    typeof userAgent === "string" ? userAgent.slice(0, PUSH_USER_AGENT_MAX) : "";
  const fields = {
    uid: { stringValue: uid },
    endpoint: { stringValue: subscription.endpoint },
    p256dh: { stringValue: subscription.keys.p256dh },
    auth: { stringValue: subscription.keys.auth },
    userAgent: { stringValue: ua },
    createdAt: { stringValue: nowIso },
    updatedAt: { stringValue: nowIso },
  };
  const keyHash = vapidKeyHash(vapidPublicKey);
  if (keyHash) fields.vapidKeyHash = { stringValue: keyHash };
  return fields;
}

/* Parse satu dokumen Firestore dari daftar langganan ke bentuk
 * yang dipakai web-push. Dokumen yang field-nya tidak lengkap
 * dikembalikan null (pemanggil menghitungnya gagal, bukan crash).
 * ID dokumen diambil dari segmen terakhir `name`. vapidKeyHash
 * diteruskan apa adanya ("" bila dokumen lama yang belum punya
 * field itu — dihitung pushUnknownKey oleh sendPushDigest). */
export function parseSubscriptionDoc(doc) {
  if (!doc || typeof doc !== "object") return null;
  const name = typeof doc.name === "string" ? doc.name : "";
  const id = name.split("/").pop() || "";
  const fields = doc.fields || {};
  const endpoint = fields.endpoint?.stringValue;
  const p256dh = fields.p256dh?.stringValue;
  const auth = fields.auth?.stringValue;
  if (!id || !endpoint || !p256dh || !auth) return null;
  return {
    id,
    endpoint,
    p256dh,
    auth,
    vapidKeyHash: fields.vapidKeyHash?.stringValue || "",
  };
}

/* Klasifikasi satu dokumen langganan mentah untuk pembersihan
 * (P-07/K3, P4). Kriteria penghapusan — DICATAT di sini, di
 * runbook rotasi/pembersihan, dan di laporan paket — dokumen
 * DIHAPUS hanya bila TIDAK BISA menerima push sama sekali:
 * - reason "endpoint": endpoint hilang, bukan https, lebih dari
 *   2000 karakter, atau bukan URL yang benar.
 * - reason "p256dh": kunci p256dh hilang atau setelah decode
 *   bukan 65 byte diawali 0x04.
 * - reason "auth": kunci auth hilang atau setelah decode bukan
 *   16 byte.
 * Yang SENGAJA TIDAK dihapus:
 * - Dokumen tanpa UID (uid hilang/kosong): endpoint + kunci masih
 *   bisa menerima digest, dan pemiliknya bisa mengklaim ulang
 *   lewat subscribe (P-07/K4) — menghapusnya berarti mencabut
 *   notifikasi pelanggan yang sah tanpa persetujuan.
 * - ID dokumen tidak sama dengan SHA-256 endpoint: pengiriman
 *   memakai endpoint + kunci, bukan ID — dokumen tetap bisa
 *   menerima digest. (Unsubscribe lewat endpoint memang tidak
 *   menemukannya; itu ditangani prune 410, bukan penghapusan.)
 * Kembalikan { valid: true, id, name } atau { valid: false,
 * reason, detail, id, name }. `name` adalah nama resource
 * Firestore penuh (dipakai batchWrite hapus). */
export function classifySubscriptionDoc(doc) {
  const name = doc && typeof doc.name === "string" ? doc.name : "";
  const id = name.split("/").pop() || "";
  const fields = doc && typeof doc === "object" ? doc.fields || {} : {};
  const classified = classifySubscriptionFields({
    endpoint: fields.endpoint?.stringValue,
    p256dh: fields.p256dh?.stringValue,
    auth: fields.auth?.stringValue,
  });
  if (classified.valid) return { valid: true, reason: "", id, name };
  return {
    valid: false,
    reason: classified.reason,
    detail: classified.detail,
    id,
    name,
  };
}

/* Satu halaman mentah daftar langganan (dokumen REST Firestore
 * apa adanya, tanpa parse) — dipakai listSubscriptions (parse)
 * dan cleanupMalformedSubscriptions (klasifikasi + hapus).
 * Melempar bila daftar gagal. */
async function listSubscriptionDocsPage(fsBase, token, pageToken = "") {
  const tokenParam = pageToken
    ? `&pageToken=${encodeURIComponent(pageToken)}`
    : "";
  const body = await firestoreFetch(
    `${fsBase}/${PUSH_COLLECTION}?pageSize=${PUSH_PAGE_SIZE}${tokenParam}`,
    token,
  );
  const documents = Array.isArray(body.documents) ? body.documents : [];
  const nextPageToken =
    typeof body.nextPageToken === "string" ? body.nextPageToken : "";
  return { documents, nextPageToken, hasMore: nextPageToken !== "" };
}

/* Daftar langganan SATU halaman (maks PUSH_PAGE_SIZE), diparse ke
 * bentuk web-push. pageToken kosong = halaman pertama. Melempar
 * bila daftar gagal — pemanggil (sendPushDigest) mengubahnya
 * menjadi "failed" dan run cron tetap sukses. */
export async function listSubscriptions(fsBase, token, pageToken = "") {
  const page = await listSubscriptionDocsPage(fsBase, token, pageToken);
  return {
    subscriptions: page.documents.map(parseSubscriptionDoc),
    hasMore: page.hasMore,
    nextPageToken: page.nextPageToken,
  };
}

/* Hapus dokumen langganan malformed lewat batchWrite (P-07/K3):
 * satu panggilan menghapus sampai 500 dokumen; pemanggil membagi
 * per kelompok bila perlu. Melempar bila hapus gagal. */
async function batchDeleteSubscriptions(fsBase, token, names) {
  const base = fsBase.replace(/\/documents$/, "");
  await firestoreFetch(`${base}/documents:batchWrite`, token, {
    method: "POST",
    body: JSON.stringify({
      writes: names.map((name) => ({ delete: name })),
    }),
  });
}

/* Bersihkan dokumen langganan malformed (P-07/K3, P4) — dipakai
 * job cleanup mingguan (route /api/cron/cleanup). Daftar seluruh
 * langganan halaman demi halaman, klasifikasikan tiap dokumen
 * (classifySubscriptionDoc), hapus yang malformed lewat
 * batchWrite. TIDAK PERNAH melempar: kegagalan daftar/hapus
 * dikembalikan sebagai ringkasan supaya route cleanup bisa
 * mencatatnya di heartbeat dan menjawab 500.
 *
 * Balasan: { examined, malformed, cleaned, failed, hasMore,
 * truncated, dryRun, listFailed, reasons: { endpoint, p256dh, auth } }.
 * - examined: dokumen yang diklasifikasi run ini.
 * - malformed: dokumen yang memenuhi kriteria hapus.
 * - cleaned: dokumen yang benar-benar terhapus.
 * - failed: hapus yang gagal (batchWrite gagal — seluruh kelompok
 *   dihitung gagal; run berikut mencoba lagi).
 * - hasMore: masih ada dokumen yang belum diperiksa (batas
 *   periksa/hapus tercapai) — workflow cleanup memanggil lagi.
 * - truncated: anggaran waktu habis di tengah jalan.
 * - dryRun: true bila mode simulasi — klasifikasi jalan, hapus
 *   TIDAK jalan (dipakai verifikasi hitungan sebelum eksekusi
 *   live pertama; cleaned selalu 0).
 * - listFailed: true bila daftar langganan gagal dibaca (mis.
 *   Firestore 429) — tanpa ini, kegagalan daftar total tidak
 *   bisa dibedakan dari koleksi kosong (keduanya examined 0).
 *
 * KEAMANAN EKSEKUSI: fungsi ini MENGHAPUS data. Route cleanup
 * hanya memanggilnya bila env PUSH_MALFORMED_CLEANUP_ENABLED=1 —
 * flag itu baru dinyalakan sesudah cadangan push_subscriptions
 * Fase B (P-03) terverifikasi (lihat runbook). Sebelum itu,
 * kode ini hanya berjalan di tes mock.
 *
 * Parameter yang bisa disuntik (untuk test): listPageImpl
 * (pageToken) => { documents, nextPageToken, hasMore },
 * batchDeleteImpl (names) => hapus kelompok, serta batas dan
 * anggaran. */
export async function cleanupMalformedSubscriptions({
  fsBase,
  token,
  maxDelete = PUSH_CLEANUP_MAX_DELETE,
  maxExamine = PUSH_CLEANUP_MAX_EXAMINE,
  budgetMs = 30_000,
  dryRun = false,
  listPageImpl = null,
  batchDeleteImpl = null,
}) {
  const startedAt = Date.now();
  const reasons = { endpoint: 0, p256dh: 0, auth: 0 };
  let examined = 0;
  let malformed = 0;
  let cleaned = 0;
  let failed = 0;
  let hasMore = false;
  let truncated = false;
  let listFailed = false;

  const listPage = listPageImpl
    ? (pageToken) => listPageImpl(pageToken)
    : (pageToken) => listSubscriptionDocsPage(fsBase, token, pageToken);
  const deleteBatch = batchDeleteImpl
    ? (names) => batchDeleteImpl(names)
    : (names) => batchDeleteSubscriptions(fsBase, token, names);

  const result = () => ({
    examined,
    malformed,
    cleaned,
    failed,
    hasMore,
    truncated,
    dryRun,
    listFailed,
    reasons: { ...reasons },
  });

  try {
    let pageToken = "";
    let toDelete = [];
    let pagesListed = 0;
    for (;;) {
      if (Date.now() - startedAt > budgetMs) {
        truncated = true;
        hasMore = true;
        break;
      }
      let page;
      try {
        page = await listPage(pageToken);
      } catch {
        console.warn(
          "Pembersihan langganan malformed gagal: daftar langganan " +
            "tidak bisa dibaca.",
        );
        listFailed = true;
        failed += toDelete.length;
        return result();
      }
      pagesListed += 1;
      const documents = Array.isArray(page.documents) ? page.documents : [];
      for (const doc of documents) {
        if (examined >= maxExamine) {
          hasMore = true;
          break;
        }
        examined += 1;
        const classified = classifySubscriptionDoc(doc);
        if (classified.valid) continue;
        malformed += 1;
        if (reasons[classified.reason] !== undefined) {
          reasons[classified.reason] += 1;
        }
        /* Batas hapus: dokumen malformed di luar batas dicatat
         * (malformed) tapi tidak dihapus run ini — hasMore
         * mengundang pemanggilan berikut. */
        if (toDelete.length < maxDelete) {
          toDelete.push(classified.name);
        } else {
          hasMore = true;
        }
      }
      const nextToken =
        typeof page.nextPageToken === "string" ? page.nextPageToken : "";
      const more = page.hasMore === true || nextToken !== "";
      if (!more || examined >= maxExamine || hasMore) {
        hasMore = hasMore || more;
        break;
      }
      pageToken = nextToken;
      /* Pengaman: daftar tidak boleh berputar tanpa henti bila
       * API mengembalikan token yang sama berulang kali. */
      if (pagesListed > 100) {
        console.warn(
          "Pembersihan langganan malformed dihentikan: terlalu banyak halaman.",
        );
        truncated = true;
        hasMore = true;
        break;
      }
    }
    if (toDelete.length > 0 && !dryRun) {
      /* Hapus per kelompok 500 (batas batchWrite) — di dalam
       * anggaran: kelompok yang belum sempat jalan dihitung gagal
       * (run berikut mencoba lagi), bukan dilewati diam-diam. */
      for (let i = 0; i < toDelete.length; i += 500) {
        const batch = toDelete.slice(i, i + 500);
        if (Date.now() - startedAt > budgetMs) {
          truncated = true;
          failed += batch.length;
          hasMore = true;
          continue;
        }
        try {
          await deleteBatch(batch);
          cleaned += batch.length;
        } catch {
          failed += batch.length;
        }
      }
    }
    if (toDelete.length > 0 && dryRun) {
      /* Mode simulasi: tidak ada hapus — hasMore true bila masih
       * ada malformed yang akan dihapus eksekusi live. */
      hasMore = hasMore || malformed > 0;
    }
    return result();
  } catch {
    console.warn(
      "Pembersihan langganan malformed gagal karena kesalahan tak terduga.",
    );
    return result();
  }
}

async function defaultSend(subscription, payloadJson) {
  return sendNotification(subscription, payloadJson, {
    TTL: PUSH_TTL_SECONDS,
    urgency: "normal",
  });
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("Kirim push kehabisan waktu.");
      err.name = "PushTimeoutError";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timer),
  );
}

/* Kirim digest harian ke semua pelanggan (dipanggil route recheck
 * di fase alert, sesudah Telegram, hanya bila ada alert baru).
 * Best-effort total: fungsi ini TIDAK PERNAH melempar — setiap
 * kegagalan dikembalikan sebagai ringkasan supaya run cron tetap
 * sukses. Balasan: {push, pushSent, pushFailed, pushPruned,
 * pushTruncated, pushTotal, pushHasMore, pushMalformed, pushPages,
 * pushConfigError, pushStaleKey, pushUnknownKey}; `push` salah
 * satu dari "sent" | "failed" | "skipped-no-vapid" | "none".
 * - "sent": minimal satu langganan benar-benar dikirimi (atau
 *   di-prune) — pengiriman berjalan sebagaimana mestinya.
 * - "none": tidak ada alert, ATAU nol langganan di seluruh
 *   koleksi (P-07/P3 — dulu nol langganan dicatat "sent", yang
 *   menyesatkan watcher dan penanda pushed).
 * - "failed": fase kirim tidak berjalan sebagaimana mestinya
 *   (daftar gagal, konfigurasi VAPID bermasalah, atau tidak satu
 *   pun kirim berhasil); hasil per langganan ada di pencacah.
 * pushTotal = jumlah dokumen langganan yang dibaca di SEMUA
 * halaman (P-07/K1 — bukan lagi hanya halaman pertama);
 * pushHasMore = masih ada halaman yang belum dibaca karena run
 * berhenti lebih awal (anggaran habis, error konfigurasi, atau
 * listImpl lawas tanpa token halaman); pushMalformed = dokumen
 * yang gagal di-parse (null) — tetap dihitung ke pushFailed
 * (perilaku lama), tetapi dipisah supaya watcher bisa membedakan
 * "dokumen rusak" dari "kirim gagal" (P-06/P2); pushPages =
 * jumlah halaman daftar yang dibaca; pushConfigError = true bila
 * push service menolak kredensial VAPID (401/403) atau kunci
 * VAPID tidak berbentuk benar (P-07/K5 — sinyal rotasi kunci);
 * pushStaleKey = langganan yang sidik kunci VAPID-nya berbeda
 * dari kunci saat ini (belum subscribe ulang sesudah rotasi);
 * pushUnknownKey = langganan tanpa sidik kunci (dokumen lama,
 * dibuat sebelum P-07).
 *
 * Paginasi (P-07/K1): langganan dibaca halaman demi halaman
 * (PUSH_PAGE_SIZE per halaman) dan tiap halaman langsung dikirim
 * — tidak ada lagi batas 500 langganan. Tiap halaman dicatat di
 * log (nomor halaman + jumlah) sebagai bukti kelompok. Bila
 * anggaran habis di tengah halaman berikut, run dicatat
 * terpotong (pushTruncated) dan halaman yang belum dibaca
 * dilaporkan (pushHasMore) supaya run berikut (endpoint digest
 * 01:30 WIB) mencoba lagi.
 *
 * Parameter yang bisa disuntik (untuk test): sendImpl (pengganti
 * web-push), listImpl (lawas: satu halaman — bila hasMore true
 * tanpa nextPageToken, run berhenti dengan pushHasMore true),
 * listPageImpl (pageToken) => { subscriptions, hasMore,
 * nextPageToken } (baru: paginasi penuh), deleteImpl, serta
 * kunci VAPID, anggaran, dan konkurensi. Hapus prune ikut
 * dihitung ke anggaran: bila anggaran habis di tengah prune,
 * sisa hapus dilewati dan pushTruncated: true (langganan yang
 * belum terhapus dicoba lagi run berikut). */
export async function sendPushDigest({
  fsBase,
  token,
  alerts,
  todayIso,
  vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "",
  budgetMs = PUSH_BUDGET_MS,
  concurrency = PUSH_CONCURRENCY,
  sendImpl = defaultSend,
  listImpl = null,
  listPageImpl = null,
  deleteImpl = null,
}) {
  const startedAt = Date.now();
  let pushSent = 0;
  let pushFailed = 0;
  let pushPruned = 0;
  let pushTruncated = false;
  let pushTotal = 0;
  let pushHasMore = false;
  let pushMalformed = 0;
  let pushPages = 0;
  let pushConfigError = false;
  let pushStaleKey = 0;
  let pushUnknownKey = 0;
  const result = (push) => ({
    push,
    pushSent,
    pushFailed,
    pushPruned,
    pushTruncated,
    pushTotal,
    pushHasMore,
    pushMalformed,
    pushPages,
    pushConfigError,
    pushStaleKey,
    pushUnknownKey,
  });

  try {
    if (!vapidPublicKey || !vapidPrivateKey) {
      return result("skipped-no-vapid");
    }
    if (!alerts || alerts.length === 0) {
      return result("none");
    }
    const payload = formatPushPayload(alerts, todayIso);
    if (!payload) return result("none");
    const payloadJson = JSON.stringify(payload);

    /* Kunci VAPID divalidasi SEBELUM daftar dibaca (P-07): kunci
     * yang tidak berbentuk benar gagal cepat tanpa membakar baca
     * Firestore — dan dicatat sebagai error konfigurasi, bukan
     * sekadar "failed" tanpa sebab. */
    try {
      setVapidDetails(PUSH_VAPID_SUBJECT, vapidPublicKey, vapidPrivateKey);
    } catch {
      console.warn(
        "Digest push gagal: konfigurasi VAPID tidak benar. " +
          "Periksa env VAPID_PRIVATE_KEY dan NEXT_PUBLIC_VAPID_PUBLIC_KEY.",
      );
      pushConfigError = true;
      return result("failed");
    }
    const currentKeyHash = vapidKeyHash(vapidPublicKey);

    const deleteOne = deleteImpl
      ? (id) => deleteImpl(id)
      : (id) =>
          firestoreDelete(`${fsBase}/${PUSH_COLLECTION}/${id}`, token);
    /* listImpl lawas hanya tahu satu halaman; listPageImpl dan
     * jalur Firestore asli bisa berjalan halaman demi halaman. */
    const canPage = Boolean(listPageImpl) || !listImpl;
    const listOnePage = async (pageToken) => {
      if (listPageImpl) return listPageImpl(pageToken);
      if (listImpl) return listImpl();
      return listSubscriptions(fsBase, token, pageToken);
    };
    let configError = false;

    /* Kirim satu halaman langganan dalam chunk konkurensi.
     * Mengubah pencacah; mengembalikan true bila pengiriman run
     * ini harus berhenti (error konfigurasi VAPID). */
    const sendPage = async (subscriptions) => {
      for (let i = 0; i < subscriptions.length; i += concurrency) {
        if (Date.now() - startedAt > budgetMs) {
          pushTruncated = true;
          console.warn(
            `Digest push terpotong anggaran ${budgetMs / 1000} detik; ` +
              `${subscriptions.length - i} langganan halaman ini dilewati hari ini.`,
          );
          return false;
        }
        const chunk = subscriptions.slice(i, i + concurrency);
        const outcomes = await Promise.all(
          chunk.map(async (sub) => {
            if (!sub) return "retry";
            const remaining = Math.max(
              0,
              budgetMs - (Date.now() - startedAt),
            );
            const timeoutMs = Math.min(PUSH_SEND_TIMEOUT_MS, remaining);
            try {
              await withTimeout(
                sendImpl(
                  {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth },
                  },
                  payloadJson,
                ),
                Math.max(timeoutMs, 1),
              );
              return "sent";
            } catch (err) {
              return classifyPushError(err);
            }
          }),
        );
        for (let j = 0; j < chunk.length; j += 1) {
          const outcome = outcomes[j];
          const sub = chunk[j];
          if (outcome === "sent") {
            pushSent += 1;
          } else if (outcome === "prune") {
            /* Langganan kedaluwarsa: hapus dokumennya — TAPI hanya
             * bila anggaran fase masih tersisa. Hapus yang lambat
             * (timeout Firestore 10 detik per hapus) tidak boleh
             * lolos dari anggaran: bila anggaran habis di tengah
             * prune, sisa hapus dilewati dan run dicatat terpotong;
             * langganan yang belum terhapus tetap ada di koleksi
             * dan akan 410 lagi besok (SEDANG-2). Satu hapus yang
             * sudah terlanjur jalan tetap ditunggu sampai selesai —
             * pelampauan dibatasi satu hapus, bukan N hapus. */
            if (Date.now() - startedAt > budgetMs) {
              pushTruncated = true;
              continue;
            }
            try {
              await deleteOne(sub.id);
              pushPruned += 1;
            } catch {
              pushFailed += 1;
            }
          } else if (outcome === "config") {
            /* 401/403 = kunci VAPID salah / tidak cocok dengan
             * langganan (mis. kunci baru sesudah rotasi, langganan
             * belum subscribe ulang). Bukan salah langganan:
             * JANGAN hapus. Hentikan pengiriman run ini — semua
             * kirim berikut akan gagal sama. */
            console.warn(
              "Digest push dihentikan: push service menolak " +
                "kredensial VAPID (401/403). Periksa env VAPID.",
            );
            pushFailed += 1;
            pushConfigError = true;
            configError = true;
          } else {
            pushFailed += 1;
          }
        }
        if (configError) return true;
      }
      return false;
    };

    let pageToken = "";
    let lastPageHasMore = false;
    for (;;) {
      if (Date.now() - startedAt > budgetMs) {
        /* Anggaran habis sebelum halaman berikut dibaca: halaman
         * yang belum dibaca dilaporkan supaya run berikut mencoba
         * lagi (bila halaman terakhir memang punya berikut). */
        pushTruncated = true;
        pushHasMore = lastPageHasMore;
        break;
      }
      let page;
      try {
        page = await listOnePage(pageToken);
      } catch {
        /* Daftar gagal (termasuk Firestore 429): kirim hari ini
         * tidak lengkap — run dicatat failed walau sebagian
         * halaman sudah terkirim, supaya endpoint digest 01:30
         * mencoba lagi. Pencacah parsial dipertahankan. */
        console.warn(
          "Digest push tidak lengkap: daftar langganan tidak bisa dibaca.",
        );
        pushHasMore = lastPageHasMore;
        return result("failed");
      }
      pushPages += 1;
      const subscriptions = page.subscriptions || [];
      pushTotal += subscriptions.length;
      pushMalformed += subscriptions.filter((sub) => !sub).length;
      for (const sub of subscriptions) {
        if (!sub) continue;
        if (!sub.vapidKeyHash) pushUnknownKey += 1;
        else if (sub.vapidKeyHash !== currentKeyHash) pushStaleKey += 1;
      }
      /* Bukti log per kelompok (K1): tiap halaman diterbitkan
       * sebagai kejadian observabilitas level "info" (sink
       * Sentry + incidents mengabaikannya; baris konsol
       * di-throttle 1/menit/kode). Endpoint TIDAK PERNAH
       * ditulis ke log. */
      emitObservabilityEvent({
        code: OBS_CODES.PUSH_DIGEST_PAGE,
        level: "info",
        component: "push",
        message:
          `Digest push: halaman ${pushPages} — ` +
          `${subscriptions.length} langganan dibaca ` +
          `(${pushTotal} sejauh ini).`,
        meta: {
          page: pushPages,
          read: subscriptions.length,
          cumulative: pushTotal,
        },
      });
      const stop = await sendPage(subscriptions);
      if (stop) {
        /* Error konfigurasi: halaman berikut tidak dicoba (akan
         * gagal sama). pushHasMore mencerminkan halaman terakhir
         * yang sudah diketahui. */
        const nextToken =
          typeof page.nextPageToken === "string" ? page.nextPageToken : "";
        pushHasMore = page.hasMore === true || nextToken !== "";
        break;
      }
      if (pushTruncated) {
        /* Anggaran habis di tengah halaman: halaman berikut (bila
         * ada) belum dibaca — laporkan supaya run berikut mencoba
         * lagi. */
        const nextToken =
          typeof page.nextPageToken === "string" ? page.nextPageToken : "";
        pushHasMore = page.hasMore === true || nextToken !== "";
        break;
      }
      const nextToken =
        typeof page.nextPageToken === "string" ? page.nextPageToken : "";
      lastPageHasMore = page.hasMore === true || nextToken !== "";
      if (!lastPageHasMore) break;
      if (!canPage) {
        /* listImpl lawas: halaman berikut diketahui ada tapi tidak
         * bisa diambil (tanpa token halaman) — laporkan jujur. */
        console.warn(
          `Langganan push melebihi ${PUSH_PAGE_SIZE}; hanya halaman ` +
            "pertama yang dikirimi digest hari ini.",
        );
        pushHasMore = true;
        break;
      }
      if (!nextToken) {
        /* hasMore tanpa token: tidak bisa lanjut (jaga-jaga bila
         * API berubah) — laporkan jujur, jangan berputar. */
        pushHasMore = true;
        break;
      }
      pageToken = nextToken;
    }

    if (configError) return result("failed");
    /* P-07/P3: nol langganan di seluruh koleksi BUKAN "sent" —
     * tidak ada satu pun yang menerima digest. */
    if (pushTotal === 0) return result("none");
    if (pushSent === 0 && pushPruned === 0 && pushFailed > 0) {
      return result("failed");
    }
    return result("sent");
  } catch {
    /* Best-effort: kegagalan tak terduga apa pun tidak boleh
     * menggagalkan run cron. */
    console.warn("Digest push gagal karena kesalahan tak terduga.");
    return result("failed");
  }
}
