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
 * -> 400. Sebelum menulis, route membaca dokumen langganan bila
 * ada: bila dokumen sudah milik UID lain, subscribe ditolak 409
 * (pesan generik, tanpa menyebut pemilik) — satu pengguna tidak
 * bisa merebut langganan pengguna lain diam-diam (mis. perangkat
 * dipakai bersama). Subscribe ulang milik sendiri tetap
 * idempotent (200). DELETE menerima { endpoint }, memeriksa UID
 * pemilik dokumen, dan menjawab 200 { ok: true, subscribed: false } —
 * termasuk bila dokumen tidak ada atau milik pengguna lain
 * (idempotent, dan tidak membocorkan keberadaan langganan
 * orang lain lewat status berbeda).
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
  firestoreDelete,
  firestoreFetch,
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
  /* Bila dokumen langganan sudah ada milik pengguna lain, tolak
   * (409) — subscribe tidak boleh merebut langganan orang lain
   * diam-diam (mis. perangkat dipakai bersama: A keluar, B masuk
   * di browser yang sama lalu menekan "Aktifkan notifikasi").
   * Pesan generik, tanpa menyebut pemilik. Satu baca per subscribe
   * adalah aksi langka; subscribe ulang milik sendiri tetap
   * idempotent (lanjut ke PATCH di bawah). */
  let existing;
  try {
    existing = await firestoreGet(docUrl, ctx.token);
  } catch {
    console.warn("Langganan push gagal: baca dokumen gagal.");
    return NextResponse.json(
      { error: "Langganan tidak bisa disimpan. Coba lagi nanti." },
      { status: 500 },
    );
  }
  const ownerUid = existing?.fields?.uid?.stringValue;
  if (existing && ownerUid !== auth.uid) {
    return NextResponse.json(
      { error: "Langganan ini sudah dipakai akun lain di perangkat ini." },
      { status: 409 },
    );
  }
  try {
    /* PATCH tanpa updateMask: membuat dokumen bila belum ada,
     * menimpa bila sudah ada (subscribe idempotent). */
    await firestoreFetch(
      docUrl,
      ctx.token,
      {
        method: "PATCH",
        body: JSON.stringify({
          fields: subscriptionFields({
            uid: auth.uid,
            subscription,
            userAgent,
            nowIso,
          }),
        }),
      },
    );
  } catch {
    console.warn("Langganan push gagal: tulis dokumen gagal.");
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
  /* Dokumen tidak ada -> tetap 200 (idempotent: hasil akhirnya
   * sama — tidak ada langganan). Dokumen milik pengguna lain ->
   * 200 yang sama, tanpa menghapus dan tanpa membocorkan
   * keberadaan langganan itu. */
  if (!doc) {
    return NextResponse.json({ ok: true, subscribed: false });
  }
  const ownerUid = doc.fields?.uid?.stringValue;
  if (ownerUid !== auth.uid) {
    return NextResponse.json({ ok: true, subscribed: false });
  }
  try {
    await firestoreDelete(docUrl, ctx.token);
  } catch {
    console.warn("Berhenti langganan push gagal: hapus dokumen gagal.");
    return NextResponse.json(
      { error: "Langganan tidak bisa dihapus. Coba lagi nanti." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, subscribed: false });
}
