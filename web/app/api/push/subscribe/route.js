/* POST / DELETE /api/push/subscribe — daftar dan berhenti
 * langganan notifikasi web push (T10).
 *
 * Keamanan (pola yang sama dengan route akun-export, SEC-07):
 * UID HANYA dari ID token Firebase yang terverifikasi (header
 * Authorization: Bearer <token>, lewat verifyIdToken di
 * lib/admin-auth.js). Tidak ada parameter UID di body — satu
 * pengguna tidak bisa mendaftarkan atau menghapus langganan
 * pengguna lain. UID dan token tidak pernah ditulis ke log.
 *
 * Langganan tersimpan satu dokumen per langganan di koleksi
 * `push_subscriptions`, ID dokumen = SHA-256 hex dari endpoint
 * (subscribe idempotent, unsubscribe tanpa query). Tulis dan
 * hapus memakai service account (melewati rules, yang menutup
 * koleksi ini total untuk klien dan admin — pola SEC-06).
 *
 * Batas laju: 5/menit per hash IP harian, lewat limiter bersama
 * (lib/rate-limit.js, cakupan "push-subscribe") — dihitung
 * sesudah auth, supaya request anonim tidak bisa menghabiskan
 * ember alamat bersama. Subscribe adalah aksi langka; 5/menit
 * longgar untuk pemakaian normal dan menutup pemborosan tulis.
 *
 * POST menerima { subscription, userAgent? } dan menjawab 200
 * { ok: true, subscribed: true }. Bentuk langganan divalidasi
 * server-side (lib/push.js validateSubscription); bentuk salah
 * -> 400. Penyimpanan memakai pembuatan dokumen ATOMIK
 * (P-07/K4, menutup TOCTOU P5): POST ?documentId=... dijamin
 * satu pemenang oleh Firestore — dua subscribe bersamaan untuk
 * endpoint yang sama tidak lagi saling menimpa diam-diam.
 * Bila dokumen sudah ada: milik sendiri -> PATCH refresh
 * (idempotent); milik UID lain -> 409 generik (tanpa menyebut
 * pemilik); tanpa UID (dokumen yatim) -> diklaim lewat CAS
 * PATCH dengan prasyarat updateTime (412 = kalah balapan, baca
 * ulang lalu putuskan lagi) — dokumen yatim tidak lagi terkunci
 * 409 selamanya. DELETE menerima { endpoint }, memeriksa UID
 * pemilik dokumen, dan menjawab 200 { ok: true, subscribed: false } —
 * termasuk bila dokumen tidak ada atau milik pengguna lain
 * (idempotent, dan tidak membocorkan keberadaan langganan
 * orang lain lewat status berbeda). Hapus memakai prasyarat
 * updateTime supaya dokumen yang berubah pemilik di tengah jalan
 * tidak ikut terhapus; dokumen yatim boleh dihapus pemegang
 * endpoint (tidak ada pemilik yang dirugikan).
 *
 * Bila service account tidak ada, rute menjawab 503 fail-closed.
 * Route ini tidak bergantung pada env VAPID: klien memakai kunci
 * publik dari env build, dan env VAPID hanya dipakai fase kirim. */
import { NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/admin-auth";
import { getClientIp } from "@/lib/api-guard";
import { getSharedLimiter, scopedKey } from "@/lib/rate-limit";
import { hashVisitor, todayJakarta } from "@/lib/analytics-server";
import {
  firestoreFetch,
  firestoreFetchStatus,
  firestoreGet,
  getAccessToken,
} from "@/lib/firestore-server";
import {
  PUSH_COLLECTION,
  subscriptionDocId,
  subscriptionFields,
  validateEndpoint,
  validateSubscription,
} from "@/lib/push";

export const dynamic = "force-dynamic";

const SUBSCRIBE_LIMIT_PER_MINUTE = 5;
/* Batas putaran simpan/hapus atomik: dokumen yang berubah dua
 * kali berturut-turut di tengah operasi menandakan kondisi tidak
 * normal — fail-closed 500, pemanggil mencoba lagi. */
const SUBSCRIBE_MAX_ATTEMPTS = 2;

/* Baca service account dari env dan tukar menjadi access token
 * Firestore. Mengembalikan { fsBase, token } atau null bila env
 * tidak ada / tidak lengkap / token gagal dibuat (pemanggil
 * menjawab 503 generik — pesan tidak menyebut variabel mana). */
async function serviceAccountContext() {
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!saRaw) return null;
  let sa;
  try {
    sa = JSON.parse(saRaw);
  } catch {
    return null;
  }
  if (!sa.client_email || !sa.private_key || !sa.project_id) {
    return null;
  }
  try {
    const token = await getAccessToken(sa);
    return {
      fsBase: `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`,
      token,
    };
  } catch {
    return null;
  }
}

/* Auth + batas laju bersama untuk POST dan DELETE (kontrak yang
 * sama dengan requireAdmin di lib/admin-auth.js): mengembalikan
 * { uid } bila lolos, atau { error, status } bila tidak. */
async function authorize(request) {
  const authHeader = (request.headers.get("authorization") || "").trim();
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) {
    return { error: "Masuk dulu untuk mengatur notifikasi.", status: 401 };
  }
  const verified = await verifyIdToken(match[1]);
  if (verified.error) {
    return { error: verified.error, status: verified.status };
  }
  let visitorHash;
  try {
    visitorHash = hashVisitor(getClientIp(request), todayJakarta());
  } catch {
    console.warn(
      "Langganan push dilewati: env ANALYTICS_SALT belum dipasang.",
    );
    return { error: "Layanan belum siap. Coba lagi nanti.", status: 503 };
  }
  if (
    !(await getSharedLimiter().check(
      scopedKey("push-subscribe", visitorHash),
      SUBSCRIBE_LIMIT_PER_MINUTE,
      60_000,
    ))
  ) {
    return {
      error: "Terlalu banyak permintaan. Coba lagi sebentar.",
      status: 429,
    };
  }
  return { uid: verified.uid };
}

function errorResponse(auth) {
  return NextResponse.json({ error: auth.error }, { status: auth.status });
}

async function readJsonBody(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }
    return body;
  } catch {
    return null;
  }
}

/* Simpan langganan secara atomik (P-07/K4 — menutup TOCTOU P5).
 * Alur:
 * 1. Buat dokumen atomik (POST ?documentId=...): Firestore
 *    menjamin satu pemenang — dua subscribe bersamaan untuk
 *    endpoint yang sama, satu dapat 200, satunya 409. Tidak ada
 *    lagi jendela "baca lalu tulis" tempat dua penulis saling
 *    menimpa diam-diam.
 * 2. Bila 409 (dokumen sudah ada): baca pemiliknya.
 *    - Milik sendiri -> PATCH refresh (idempotent; dua subscribe
 *      bersamaan milik UID yang sama menulis isi yang sama, jadi
 *      balapan di sini tidak berbahaya).
 *    - Milik UID lain -> "conflict" (409 generik, tanpa menyebut
 *      pemilik) — satu pengguna tidak bisa merebut langganan
 *      pengguna lain diam-diam (mis. perangkat dipakai bersama:
 *      A keluar, B masuk di browser yang sama lalu menekan
 *      "Aktifkan notifikasi").
 *    - Tanpa UID (dokumen yatim — mis. dibuat sebelum field uid
 *      ada) -> klaim lewat CAS PATCH dengan prasyarat updateTime:
 *      hanya satu pengklaim yang menang (412 = kalah balapan,
 *      baca ulang lalu putuskan sekali lagi). Dokumen yatim
 *      tidak lagi terkunci 409 selamanya.
 *    - Dokumen lenyap di antara 409 dan baca -> coba buat lagi
 *      sekali.
 * Kembalikan "ok" | "conflict" | "error". */
async function claimSubscription({ ctx, docId, docUrl, fields, uid }) {
  const collectionUrl = `${ctx.fsBase}/${PUSH_COLLECTION}`;
  for (let attempt = 0; attempt < SUBSCRIBE_MAX_ATTEMPTS; attempt += 1) {
    let created;
    try {
      created = await firestoreFetchStatus(
        `${collectionUrl}?documentId=${encodeURIComponent(docId)}`,
        ctx.token,
        {
          method: "POST",
          body: JSON.stringify({ fields }),
        },
      );
    } catch {
      console.warn("Langganan push gagal: tulis dokumen gagal.");
      return "error";
    }
    if (created.ok) return "ok";
    if (created.status !== 409) {
      console.warn("Langganan push gagal: tulis dokumen gagal.");
      return "error";
    }
    /* 409: dokumen sudah ada — baca pemiliknya. */
    let existing;
    try {
      existing = await firestoreGet(docUrl, ctx.token);
    } catch {
      console.warn("Langganan push gagal: baca dokumen gagal.");
      return "error";
    }
    if (!existing) continue;
    const ownerUid = existing?.fields?.uid?.stringValue;
    if (ownerUid === uid) {
      /* Milik sendiri: PATCH refresh (subscribe idempotent). */
      try {
        await firestoreFetch(docUrl, ctx.token, {
          method: "PATCH",
          body: JSON.stringify({ fields }),
        });
      } catch {
        console.warn("Langganan push gagal: tulis dokumen gagal.");
        return "error";
      }
      return "ok";
    }
    if (ownerUid) {
      /* Milik UID lain: tolak tanpa menyebut pemilik. */
      return "conflict";
    }
    /* Dokumen tanpa UID (yatim): klaim lewat compare-and-swap
     * dengan prasyarat updateTime — dua pengklaim bersamaan,
     * hanya satu yang menang. */
    const updateTime =
      typeof existing.updateTime === "string" ? existing.updateTime : "";
    const mask = Object.keys(fields)
      .map((k) => `updateMask.fieldPaths=${k}`)
      .join("&");
    const precondition = updateTime
      ? `&currentDocument.updateTime=${encodeURIComponent(updateTime)}`
      : "";
    let claimed;
    try {
      claimed = await firestoreFetchStatus(
        `${docUrl}?${mask}${precondition}`,
        ctx.token,
        {
          method: "PATCH",
          body: JSON.stringify({ fields }),
        },
      );
    } catch {
      console.warn("Langganan push gagal: tulis dokumen gagal.");
      return "error";
    }
    if (claimed.ok) return "ok";
    if (claimed.status === 412) {
      /* Kalah balapan klaim: baca ulang sekali — bila sekarang
       * milik sendiri, sukses; milik orang lain, 409; masih
       * yatim, putaran berikut mencoba klaim lagi. */
      let reread;
      try {
        reread = await firestoreGet(docUrl, ctx.token);
      } catch {
        console.warn("Langganan push gagal: baca dokumen gagal.");
        return "error";
      }
      if (!reread) continue;
      const newOwner = reread?.fields?.uid?.stringValue;
      if (newOwner === uid) return "ok";
      if (newOwner) return "conflict";
      continue;
    }
    console.warn("Langganan push gagal: tulis dokumen gagal.");
    return "error";
  }
  console.warn("Langganan push gagal: dokumen tidak stabil.");
  return "error";
}

export async function POST(request) {
  const auth = await authorize(request);
  if (auth.error) return errorResponse(auth);

  const body = await readJsonBody(request);
  if (!body) {
    return NextResponse.json(
      { error: "Langganan tidak berbentuk benar." },
      { status: 400 },
    );
  }
  const validation = validateSubscription(body.subscription);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const subscription = body.subscription;
  /* User-Agent: dari body bila dikirim klien, kalau tidak dari
   * header request; dipotong ke 500 karakter di server
   * (subscriptionFields). */
  const userAgent =
    typeof body.userAgent === "string" && body.userAgent
      ? body.userAgent
      : request.headers.get("user-agent") || "";

  const ctx = await serviceAccountContext();
  if (!ctx) {
    console.warn("Langganan push gagal: service account tidak tersedia.");
    return NextResponse.json(
      { error: "Layanan belum siap. Coba lagi nanti." },
      { status: 503 },
    );
  }
  const nowIso = new Date().toISOString();
  const docId = subscriptionDocId(subscription.endpoint);
  const docUrl = `${ctx.fsBase}/${PUSH_COLLECTION}/${docId}`;
  /* Sidik epoch kunci VAPID (P-07/K5) dicatat di dokumen supaya
   * run digest bisa menghitung langganan yang belum subscribe
   * ulang sesudah rotasi. */
  const fields = subscriptionFields({
    uid: auth.uid,
    subscription,
    userAgent,
    nowIso,
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  });
  const outcome = await claimSubscription({
    ctx,
    docId,
    docUrl,
    fields,
    uid: auth.uid,
  });
  if (outcome === "conflict") {
    return NextResponse.json(
      { error: "Langganan ini sudah dipakai akun lain di perangkat ini." },
      { status: 409 },
    );
  }
  if (outcome === "error") {
    return NextResponse.json(
      { error: "Langganan tidak bisa disimpan. Coba lagi nanti." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, subscribed: true });
}

export async function DELETE(request) {
  const auth = await authorize(request);
  if (auth.error) return errorResponse(auth);

  const body = await readJsonBody(request);
  if (!body) {
    return NextResponse.json(
      { error: "Endpoint tidak ada." },
      { status: 400 },
    );
  }
  const endpointCheck = validateEndpoint(body.endpoint);
  if (!endpointCheck.ok) {
    return NextResponse.json(
      { error: endpointCheck.error },
      { status: 400 },
    );
  }

  const ctx = await serviceAccountContext();
  if (!ctx) {
    console.warn("Berhenti langganan push gagal: service account tidak tersedia.");
    return NextResponse.json(
      { error: "Layanan belum siap. Coba lagi nanti." },
      { status: 503 },
    );
  }
  const docId = subscriptionDocId(body.endpoint);
  const docUrl = `${ctx.fsBase}/${PUSH_COLLECTION}/${docId}`;
  /* Dokumen tidak ada -> tetap 200 (idempotent: hasil akhirnya
   * sama — tidak ada langganan). Dokumen milik pengguna lain ->
   * 200 yang sama, tanpa menghapus dan tanpa membocorkan
   * keberadaan langganan itu. Dokumen tanpa UID (yatim) BOLEH
   * dihapus pemegang endpoint — tidak ada pemilik yang
   * dirugikan, dan tanpanya dokumen yatim tidak pernah bisa
   * dibersihkan pemilik perangkatnya (P-07/K4).
   * Hapus memakai prasyarat updateTime (CAS): bila dokumen
   * berubah pemilik di antara baca dan hapus, hapus ditolak 412
   * dan dibaca ulang — dokumen orang lain tidak ikut terhapus. */
  for (let attempt = 0; attempt < SUBSCRIBE_MAX_ATTEMPTS; attempt += 1) {
    let doc;
    try {
      doc = await firestoreGet(docUrl, ctx.token);
    } catch {
      console.warn("Berhenti langganan push gagal: baca dokumen gagal.");
      return NextResponse.json(
        { error: "Langganan tidak bisa dihapus. Coba lagi nanti." },
        { status: 500 },
      );
    }
    if (!doc) {
      return NextResponse.json({ ok: true, subscribed: false });
    }
    const ownerUid = doc.fields?.uid?.stringValue;
    if (ownerUid && ownerUid !== auth.uid) {
      return NextResponse.json({ ok: true, subscribed: false });
    }
    const updateTime =
      typeof doc.updateTime === "string" ? doc.updateTime : "";
    const precondition = updateTime
      ? `?currentDocument.updateTime=${encodeURIComponent(updateTime)}`
      : "";
    let deleted;
    try {
      deleted = await firestoreFetchStatus(`${docUrl}${precondition}`, ctx.token, {
        method: "DELETE",
      });
    } catch {
      console.warn("Berhenti langganan push gagal: hapus dokumen gagal.");
      return NextResponse.json(
        { error: "Langganan tidak bisa dihapus. Coba lagi nanti." },
        { status: 500 },
      );
    }
    if (deleted.ok || deleted.status === 404) {
      return NextResponse.json({ ok: true, subscribed: false });
    }
    if (deleted.status === 412) {
      /* Dokumen berubah di tengah jalan: baca ulang dan putuskan
       * lagi (putaran berikut). */
      continue;
    }
    console.warn("Berhenti langganan push gagal: hapus dokumen gagal.");
    return NextResponse.json(
      { error: "Langganan tidak bisa dihapus. Coba lagi nanti." },
      { status: 500 },
    );
  }
  console.warn("Berhenti langganan push gagal: dokumen tidak stabil.");
  return NextResponse.json(
    { error: "Langganan tidak bisa dihapus. Coba lagi nanti." },
    { status: 500 },
  );
}
