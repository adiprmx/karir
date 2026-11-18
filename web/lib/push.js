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
 *   sinyal yang ambigu). */
import { createHash } from "node:crypto";
import { setVapidDetails, sendNotification } from "web-push";
import { firestoreDelete, firestoreFetch } from "./firestore-server.js";

export const PUSH_COLLECTION = "push_subscriptions";
/* Anggaran fase kirim push di dalam run cron (10 detik) dan
 * konkurensi kirim paralel. */
export const PUSH_BUDGET_MS = 10_000;
export const PUSH_CONCURRENCY = 10;
/* TTL 24 jam: digest harian; perangkat yang offline lebih dari
 * sehari tidak perlu menerima kabar basi. */
export const PUSH_TTL_SECONDS = 86_400;
export const PUSH_VAPID_SUBJECT = "mailto:adiprmx@gmail.com";
/* Satu halaman daftar langganan. Bila tercapai, run mencatat
 * peringatan (batas ditulis eksplisit untuk ditinjau). */
export const PUSH_PAGE_SIZE = 500;
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
  const p256dh = decodeBase64urlStrict(keys.p256dh);
  if (!p256dh || p256dh.length !== 65 || p256dh[0] !== 0x04) {
    return { ok: false, error: "Kunci langganan tidak berbentuk benar." };
  }
  const auth = decodeBase64urlStrict(keys.auth);
  if (!auth || auth.length !== 16) {
    return { ok: false, error: "Kunci langganan tidak berbentuk benar." };
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

/* Field Firestore untuk satu dokumen langganan (dipakai route
 * subscribe). createdAt ditulis sama dengan updatedAt pada setiap
 * subscribe; stempel buat yang tepat tidak dipakai logika apa pun.
 * Route subscribe membaca dokumen dulu sebelum menulis (cek pemilik
 * — subscribe atas langganan milik akun lain ditolak 409), jadi
 * createdAt di sini hanya nilai awal bila dokumen belum ada.
 * userAgent dipotong ke 500 karakter di server. */
export function subscriptionFields({ uid, subscription, userAgent, nowIso }) {
  const ua =
    typeof userAgent === "string" ? userAgent.slice(0, PUSH_USER_AGENT_MAX) : "";
  return {
    uid: { stringValue: uid },
    endpoint: { stringValue: subscription.endpoint },
    p256dh: { stringValue: subscription.keys.p256dh },
    auth: { stringValue: subscription.keys.auth },
    userAgent: { stringValue: ua },
    createdAt: { stringValue: nowIso },
    updatedAt: { stringValue: nowIso },
  };
}

/* Parse satu dokumen Firestore dari daftar langganan ke bentuk
 * yang dipakai web-push. Dokumen yang field-nya tidak lengkap
 * dikembalikan null (pemanggil menghitungnya gagal, bukan crash).
 * ID dokumen diambil dari segmen terakhir `name`. */
export function parseSubscriptionDoc(doc) {
  if (!doc || typeof doc !== "object") return null;
  const name = typeof doc.name === "string" ? doc.name : "";
  const id = name.split("/").pop() || "";
  const fields = doc.fields || {};
  const endpoint = fields.endpoint?.stringValue;
  const p256dh = fields.p256dh?.stringValue;
  const auth = fields.auth?.stringValue;
  if (!id || !endpoint || !p256dh || !auth) return null;
  return { id, endpoint, p256dh, auth };
}

/* Daftar semua langganan (satu halaman, maks PUSH_PAGE_SIZE).
 * Melempar bila daftar gagal — pemanggil (sendPushDigest)
 * mengubahnya menjadi "failed" dan run cron tetap sukses. */
export async function listSubscriptions(fsBase, token) {
  const body = await firestoreFetch(
    `${fsBase}/${PUSH_COLLECTION}?pageSize=${PUSH_PAGE_SIZE}`,
    token,
  );
  const documents = Array.isArray(body.documents) ? body.documents : [];
  return {
    subscriptions: documents.map(parseSubscriptionDoc),
    hasMore: typeof body.nextPageToken === "string" && body.nextPageToken !== "",
  };
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
 * pushTruncated, pushTotal, pushHasMore, pushMalformed}; `push`
 * salah satu dari "sent" | "failed" | "skipped-no-vapid" |
 * "none". "failed" berarti fase kirim tidak berjalan sebagaimana
 * mestinya (daftar gagal, konfigurasi VAPID bermasalah, atau
 * tidak satu pun kirim berhasil); hasil per langganan ada di
 * pencacah. pushTotal = jumlah dokumen langganan yang dibaca
 * halaman ini; pushHasMore = masih ada halaman berikutnya;
 * pushMalformed = dokumen yang gagal di-parse (null) — tetap
 * dihitung ke pushFailed (perilaku lama), tetapi dipisah supaya
 * watcher bisa membedakan "dokumen rusak" dari "kirim gagal"
 * (P-06/P2).
 *
 * Parameter yang bisa disuntik (untuk test): sendImpl (pengganti
 * web-push), listImpl, deleteImpl, serta kunci VAPID, anggaran,
 * dan konkurensi. Hapus prune ikut dihitung ke anggaran: bila
 * anggaran habis di tengah prune, sisa hapus dilewati dan
 * pushTruncated: true (langganan yang belum terhapus dicoba lagi
 * run berikut). */
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
  const result = (push) => ({
    push,
    pushSent,
    pushFailed,
    pushPruned,
    pushTruncated,
    pushTotal,
    pushHasMore,
    pushMalformed,
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

    let listed;
    try {
      listed = listImpl
        ? await listImpl()
        : await listSubscriptions(fsBase, token);
    } catch {
      /* Daftar gagal (termasuk Firestore 429): kirim hari ini
       * dilewati, run tetap sukses. */
      console.warn(
        "Digest push dilewati: daftar langganan tidak bisa dibaca.",
      );
      return result("failed");
    }
    const subscriptions = listed.subscriptions || [];
    pushTotal = subscriptions.length;
    pushHasMore = listed.hasMore === true;
    pushMalformed = subscriptions.filter((sub) => !sub).length;
    if (listed.hasMore) {
      console.warn(
        `Langganan push melebihi ${PUSH_PAGE_SIZE}; hanya halaman ` +
          "pertama yang dikirimi digest hari ini.",
      );
    }
    if (subscriptions.length === 0) {
      return result("sent");
    }

    try {
      setVapidDetails(PUSH_VAPID_SUBJECT, vapidPublicKey, vapidPrivateKey);
    } catch {
      console.warn(
        "Digest push gagal: konfigurasi VAPID tidak benar. " +
          "Periksa env VAPID_PRIVATE_KEY dan NEXT_PUBLIC_VAPID_PUBLIC_KEY.",
      );
      return result("failed");
    }

    const deleteOne = deleteImpl
      ? (id) => deleteImpl(id)
      : (id) =>
          firestoreDelete(`${fsBase}/${PUSH_COLLECTION}/${id}`, token);
    let configError = false;

    for (let i = 0; i < subscriptions.length; i += concurrency) {
      if (Date.now() - startedAt > budgetMs) {
        pushTruncated = true;
        console.warn(
          `Digest push terpotong anggaran ${budgetMs / 1000} detik; ` +
            `${subscriptions.length - i} langganan dilewati hari ini.`,
        );
        break;
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
           * langganan. Bukan salah langganan: JANGAN hapus.
           * Hentikan pengiriman run ini — semua kirim berikut
           * akan gagal sama. */
          console.warn(
            "Digest push dihentikan: push service menolak " +
              "kredensial VAPID (401/403). Periksa env VAPID.",
          );
          pushFailed += 1;
          configError = true;
        } else {
          pushFailed += 1;
        }
      }
      if (configError) break;
    }

    if (configError) return result("failed");
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
