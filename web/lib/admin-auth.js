/* Verifikasi ID token Firebase untuk rute server (server-side).
 * Tanpa dependensi baru: tanda tangan RS256 diverifikasi manual pakai
 * node:crypto, mengikuti pola JWT manual yang sudah ada di
 * app/api/cron/recheck/route.js (di sana untuk menandatangani, di sini
 * untuk memverifikasi).
 *
 * Dua verifier memakai inti yang sama (verifyTokenCore):
 * - verifyIdToken: token siapa pun yang masuk (dipakai rute
 *   analitik untuk menempel UID terverifikasi ke event, SEC-07).
 * - verifyAdminToken: token admin saja (cek klaim admin: true).
 *
 * Peran admin memakai custom claim Firebase Auth (admin: true) — satu
 * sumber kebenaran di token untuk aturan Firestore dan API. Klaim
 * dipasang owner lewat Admin API (lihat skrip sekali pakai di
 * hidden_files/fullstack-impl-2026-11-14/fase1/set-admin-claim.mjs),
 * bukan dari repo ini.
 *
 * Kontrak (dipakai tim lain, jangan diubah bentuknya):
 * - verifyIdToken(idToken) -> Promise<{uid}> bila token valid;
 *   Promise<{error, status}> bila gagal: 401 token tidak ada /
 *   tidak valid / kedaluwarsa, 503 verifikasi tidak bisa jalan
 *   (mis. kunci Google tidak bisa diambil atau konfigurasi proyek
 *   tidak ada).
 * - verifyAdminToken(idToken) -> kontrak yang sama, ditambah 403
 *   bila token valid tapi klaim admin tidak ada.
 * - requireAdmin(request) -> kontrak yang sama; membaca token dari
 *   header Authorization: Bearer <token>.
 * Modul ini tidak pernah mencatat token atau nilai rahasia apa pun.
 */
import { createPublicKey, createVerify } from "node:crypto";

const GOOGLE_KEYS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_MS = 60 * 60 * 1000;

/* Cache kunci publik Google di memori (per instance server). Kunci
 * Google jarang berganti; cache dihormati dari Cache-Control bila
 * ada, kalau tidak satu jam. Bila kid token tidak ada di cache,
 * kunci diambil ulang sekali sebelum token ditolak (rotasi kunci). */
let cachedKeys = null;
let cachedUntil = 0;

function projectIdFromEnv(options) {
  return (
    options.projectId ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    ""
  );
}

function parseCacheMaxAge(headerValue) {
  if (!headerValue) return DEFAULT_CACHE_MS;
  const match = /max-age=(\d+)/.exec(headerValue);
  if (!match) return DEFAULT_CACHE_MS;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_CACHE_MS;
  return Math.min(seconds, 24 * 60 * 60) * 1000;
}

async function fetchGoogleKeys() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(GOOGLE_KEYS_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`Kunci Google gagal diambil: HTTP ${res.status}`);
    const body = await res.json();
    if (!body || !Array.isArray(body.keys) || body.keys.length === 0) {
      throw new Error("Kunci Google tidak berbentuk benar.");
    }
    cachedKeys = body.keys;
    cachedUntil = Date.now() + parseCacheMaxAge(res.headers.get("cache-control"));
    return cachedKeys;
  } finally {
    clearTimeout(timer);
  }
}

/* Ambil daftar kunci JWK. Bila options.fetchKeys diisi (untuk test),
 * fungsi itu yang dipakai dan cache dilewati supaya tiap panggilan
 * memakai kunci mock yang segar. */
async function getKeys(options, forceRefresh) {
  if (typeof options.fetchKeys === "function") {
    const body = await options.fetchKeys();
    if (!body || !Array.isArray(body.keys) || body.keys.length === 0) {
      throw new Error("Kunci tidak berbentuk benar.");
    }
    return body.keys;
  }
  if (!forceRefresh && cachedKeys && Date.now() < cachedUntil) {
    return cachedKeys;
  }
  return fetchGoogleKeys();
}

function decodeJsonSegment(segment) {
  const text = Buffer.from(segment, "base64url").toString("utf8");
  return JSON.parse(text);
}

function verifySignature(headerB64, payloadB64, signatureB64, jwk) {
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  return verifier.verify(publicKey, signatureB64, "base64url");
}

/* Inti verifikasi ID token Firebase: tanda tangan RS256 + klaim
 * standar (iss, aud, sub, iat, exp). TANPA cek klaim admin — itu
 * urusan wrapper verifyAdminToken di bawah. Mengembalikan
 * { uid, admin } bila valid, { error, status } bila gagal. */
async function verifyTokenCore(idToken, options = {}) {
  const projectId = projectIdFromEnv(options);
  if (!projectId) {
    return { error: "Verifikasi tidak bisa jalan saat ini.", status: 503 };
  }
  if (typeof idToken !== "string" || !idToken) {
    return { error: "Token tidak ada.", status: 401 };
  }
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    return { error: "Token tidak valid.", status: 401 };
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  let header;
  let payload;
  try {
    header = decodeJsonSegment(headerB64);
    payload = decodeJsonSegment(payloadB64);
  } catch {
    return { error: "Token tidak valid.", status: 401 };
  }
  if (!header || header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    return { error: "Token tidak valid.", status: 401 };
  }
  if (!signatureB64) {
    return { error: "Token tidak valid.", status: 401 };
  }

  let keys;
  try {
    keys = await getKeys(options, false);
  } catch {
    return { error: "Verifikasi tidak bisa jalan saat ini.", status: 503 };
  }
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    /* Kid tidak dikenal: kunci mungkin baru dirotasi Google. Ambil
     * ulang sekali sebelum menolak token. */
    try {
      keys = await getKeys(options, true);
    } catch {
      return { error: "Verifikasi tidak bisa jalan saat ini.", status: 503 };
    }
    jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      return { error: "Token tidak valid.", status: 401 };
    }
  }

  let signatureOk;
  try {
    signatureOk = verifySignature(headerB64, payloadB64, signatureB64, jwk);
  } catch {
    return { error: "Token tidak valid.", status: 401 };
  }
  if (!signatureOk) {
    return { error: "Token tidak valid.", status: 401 };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (
    !payload ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    payload.iss !== `https://securetoken.google.com/${projectId}` ||
    payload.aud !== projectId ||
    typeof payload.exp !== "number" ||
    typeof payload.iat !== "number" ||
    payload.iat > nowSec
  ) {
    return { error: "Token tidak valid.", status: 401 };
  }
  if (payload.exp <= nowSec) {
    return { error: "Token sudah kedaluwarsa.", status: 401 };
  }
  return { uid: payload.sub, admin: payload.admin === true };
}

/* Verifikasi ID token siapa pun yang masuk (tanpa cek klaim admin).
 * Dipakai rute analitik (SEC-07): UID dari token terverifikasi
 * ditempel ke event; token yang tidak valid ditangani pemanggil
 * sebagai tamu, bukan ditolak. */
export async function verifyIdToken(idToken, options = {}) {
  const result = await verifyTokenCore(idToken, options);
  if (result.error) return result;
  return { uid: result.uid };
}

/* Verifikasi ID token admin: verifier umum + cek klaim admin. */
export async function verifyAdminToken(idToken, options = {}) {
  const result = await verifyTokenCore(idToken, options);
  if (result.error) return result;
  if (!result.admin) {
    return { error: "Akun ini bukan akun admin.", status: 403 };
  }
  return { uid: result.uid };
}

export async function requireAdmin(request, options = {}) {
  const authHeader = request?.headers?.get?.("authorization") || "";
  const match = /^Bearer (.+)$/.exec(authHeader.trim());
  if (!match) {
    return { error: "Token tidak ada.", status: 401 };
  }
  return verifyAdminToken(match[1], options);
}
