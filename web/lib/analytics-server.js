/* Logika server untuk analitik pengunjung anonim, dipisah dari route
 * supaya bisa diuji unit tanpa Next.js. Tidak ada yang di sini
 * menyimpan IP mentah: IP hanya masuk ke hash, lalu dibuang. */
import { createHash } from "node:crypto";
import { requireEnv } from "./require-env.js";

export const EVENT_TYPES = [
  "pageview",
  "search",
  "detail",
  "portal_click",
  "tracker_mark",
  "filter",
];

const MAX_PATH = 200;
const MAX_Q = 200;
const MAX_ACTION = 50;
const MAX_VISITOR = 64;
const MAX_UID = 128;

/* Tanggal hari ini (YYYY-MM-DD) di zona Asia/Jakarta. */
export function todayJakarta(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/* Periksa bentuk event dari klien. Field lain dibuang, bukan ditolak.
 * Kembalikan { ok: true, event } atau { ok: false, error }. */
export function validateEvent(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body harus objek JSON" };
  }
  if (!EVENT_TYPES.includes(body.type)) {
    return { ok: false, error: "type tidak dikenal" };
  }
  if (
    typeof body.path !== "string" ||
    body.path.length < 1 ||
    body.path.length > MAX_PATH
  ) {
    return { ok: false, error: "path harus string 1-200 karakter" };
  }
  const event = { type: body.type, path: body.path };
  if (body.q !== undefined) {
    if (typeof body.q !== "string" || body.q.length > MAX_Q) {
      return { ok: false, error: "q harus string maks 200 karakter" };
    }
    if (body.q.length > 0) event.q = body.q;
  }
  if (body.companyNo !== undefined) {
    if (
      typeof body.companyNo !== "number" ||
      !Number.isInteger(body.companyNo) ||
      body.companyNo < 1 ||
      body.companyNo > 10000
    ) {
      return { ok: false, error: "companyNo harus int 1-10000" };
    }
    event.companyNo = body.companyNo;
  }
  if (body.action !== undefined) {
    if (typeof body.action !== "string" || body.action.length > MAX_ACTION) {
      return { ok: false, error: "action harus string maks 50 karakter" };
    }
    if (body.action.length > 0) event.action = body.action;
  }
  if (body.visitor !== undefined) {
    if (typeof body.visitor !== "string" || body.visitor.length > MAX_VISITOR) {
      return { ok: false, error: "visitor harus string maks 64 karakter" };
    }
    if (body.visitor.length > 0) event.visitor = body.visitor;
  }
  /* uid opsional: pengenal anonim pengguna yang login, dibawa event.
   * Bukan email, bukan nama; maks 128 karakter. */
  if (body.uid !== undefined) {
    if (typeof body.uid !== "string" || body.uid.length > MAX_UID) {
      return { ok: false, error: "uid harus string maks 128 karakter" };
    }
    if (body.uid.length > 0) event.uid = body.uid;
  }
  return { ok: true, event };
}

/* Hash IP dengan garam harian. Garam berubah tiap hari, jadi hash yang
 * sama besok tidak bisa ditautkan ke hash hari ini. Hasilnya 64 heksa,
 * dan IP mentah tidak pernah keluar dari fungsi ini. Garam diambil dari
 * parameter saltBase bila diberikan, kalau tidak dari env
 * ANALYTICS_SALT — tanpa nilai default. Bila keduanya kosong, fungsi
 * ini melempar; pemanggil wajib menangani (jangan pernah menyimpan
 * hash dengan garam lemah). */
export function hashVisitor(ip, day, saltBase) {
  const base = saltBase || requireEnv("ANALYTICS_SALT");
  const salt = `${base}:${day}`;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/* Batas 30 request per menit per hash IP, di memori saja. */
export function createRateLimiter(limit = 30, windowMs = 60_000) {
  const hits = new Map();
  return {
    check(key, now = Date.now()) {
      const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (list.length >= limit) {
        hits.set(key, list);
        return false;
      }
      list.push(now);
      hits.set(key, list);
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}

export const rateLimiter = createRateLimiter();

/* Susun body Firestore REST untuk satu event. Tidak ada field IP.
 * uaFlag hanya ditulis bila true: menandai request yang UA-nya kosong
 * atau cocok pola bot, supaya dasbor admin bisa melihatnya. */
export function buildFirestoreFields(event, visitorHash, day, nowIso, uaFlag = false) {
  const fields = {
    type: { stringValue: event.type },
    path: { stringValue: event.path },
    visitorHash: { stringValue: visitorHash },
    ts: { timestampValue: nowIso },
    day: { stringValue: day },
  };
  if (event.q !== undefined) fields.q = { stringValue: event.q };
  if (event.companyNo !== undefined) {
    fields.companyNo = { integerValue: String(event.companyNo) };
  }
  if (event.action !== undefined) {
    fields.action = { stringValue: event.action };
  }
  if (event.visitor !== undefined) {
    fields.visitor = { stringValue: event.visitor };
  }
  if (event.uid !== undefined) {
    fields.uid = { stringValue: event.uid };
  }
  if (uaFlag) {
    fields.uaFlag = { booleanValue: true };
  }
  return { fields };
}

/* Tulis satu event ke koleksi analytics_events lewat Firestore REST.
 * Kembalikan true bila tersimpan, false bila gagal apa pun. */
export async function writeAnalyticsEvent(event, visitorHash, day, uaFlag = false) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) return false;
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/analytics_events?key=${apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildFirestoreFields(event, visitorHash, day, new Date().toISOString(), uaFlag),
      ),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
