/* Satu-satunya tempat penukaran service account menjadi access token
 * Firestore (BE2-24, P-04). Sebelumnya ada DUA salinan logika ini:
 * getAccessToken di lib/firestore-server.js (tanpa cache, melempar
 * saat gagal) dan getServiceAccountAccessToken di
 * lib/analytics-server.js (dengan cache, mengembalikan null saat
 * gagal). Keduanya kini memanggil fungsi inti yang sama di sini
 * dan berbagi SATU cache token — satu proses server hanya menukar
 * JWT sekali per service account per jam, apa pun jalur pemanggilnya.
 *
 * Kontrak fungsi inti: kembalikan access token (string), atau null
 * bila service account tidak tersedia/tidak valid atau penukaran
 * gagal. TIDAK PERNAH melempar — pemanggil yang butuh kegagalan
 * keras (route cron) membungkusnya sendiri (lihat getAccessToken
 * di lib/firestore-server.js).
 *
 * Cache: satu Map yang dikunci per client_email, token berlaku
 * 1 jam dan dipakai ulang dengan margin aman 5 menit (sama seperti
 * perilaku lama analytics-server). Margin mencegah token dipakai
 * di detik-detik terakhir masa berlakunya saat request berikutnya
 * masih berjalan.
 *
 * Observabilitas (P-06, BE2-11): kelima titik kegagalan yang dulu
 * mengembalikan null diam-diam kini mencatat log terstruktur
 * throttled (SA_TOKEN_FAILED) dengan jenis kegagalan — tanpa
 * pernah mencatat client_email atau detail kunci. */
import { createSign } from "node:crypto";
import { OBS_CODES, emitObservabilityEvent } from "./observability.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_SCOPE = "https://www.googleapis.com/auth/datastore";
const TOKEN_TTL_MS = 3600 * 1000;
const CACHE_MARGIN_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

/* Satu cache untuk semua pemanggil: client_email -> { token,
 * expiresAtMs }. Kunci per client_email supaya dua service account
 * berbeda (mis. di test) tidak saling menimpa token. */
const tokenCache = new Map();

/* Kosongkan cache token (dipakai test supaya tiap kasus mulai dari
 * keadaan bersih). */
export function resetServiceAccountTokenCache() {
  tokenCache.clear();
}

/* Baca service account dari env FIREBASE_SERVICE_ACCOUNT (string
 * JSON). Kembalikan null bila tidak dipasang, bukan JSON, atau
 * tidak lengkap. */
function parseServiceAccountEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    if (!sa.client_email || !sa.private_key) return null;
    return sa;
  } catch {
    return null;
  }
}

/* Tukar service account menjadi access token Firestore. Parameter
 * `sa` opsional: bila tidak diberikan, service account dibaca dari
 * env FIREBASE_SERVICE_ACCOUNT. `fetchImpl` dan `nowMs` bisa
 * di-inject untuk test. Kembalikan token, atau null bila SA tidak
 * tersedia/tidak valid, tanda tangan gagal, atau penukaran gagal. */
export async function getServiceAccountAccessToken({
  sa = null,
  fetchImpl = fetch,
  nowMs = Date.now(),
} = {}) {
  const account = sa || parseServiceAccountEnv();
  if (!account || !account.client_email || !account.private_key) {
    emitObservabilityEvent({
      code: OBS_CODES.SA_TOKEN_FAILED,
      component: "service-account-token",
      message: "Token service account gagal: service account tidak tersedia.",
      meta: { kind: "missing" },
    });
    return null;
  }
  const cached = tokenCache.get(account.client_email);
  if (cached && cached.expiresAtMs > nowMs + CACHE_MARGIN_MS) {
    return cached.token;
  }
  const now = Math.floor(nowMs / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: account.client_email,
      scope: TOKEN_SCOPE,
      aud: TOKEN_URL,
      exp: now + 3600,
      iat: now,
    }),
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  let signature;
  try {
    signature = signer.sign(account.private_key, "base64url");
  } catch {
    emitObservabilityEvent({
      code: OBS_CODES.SA_TOKEN_FAILED,
      component: "service-account-token",
      message: "Token service account gagal: tanda tangan JWT gagal.",
      meta: { kind: "sign-failed" },
    });
    return null;
  }
  const jwt = `${header}.${payload}.${signature}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }).toString(),
    });
  } catch {
    emitObservabilityEvent({
      code: OBS_CODES.SA_TOKEN_FAILED,
      component: "service-account-token",
      message: "Token service account gagal: penukaran token tidak terjangkau.",
      meta: { kind: "network" },
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    emitObservabilityEvent({
      code: OBS_CODES.SA_TOKEN_FAILED,
      component: "service-account-token",
      message: "Token service account gagal: penukaran token ditolak.",
      meta: { kind: `http-${res.status}` },
    });
    return null;
  }
  const body = await res.json().catch(() => null);
  if (!body || !body.access_token) {
    emitObservabilityEvent({
      code: OBS_CODES.SA_TOKEN_FAILED,
      component: "service-account-token",
      message: "Token service account gagal: respons tanpa access token.",
      meta: { kind: "no-token" },
    });
    return null;
  }
  tokenCache.set(account.client_email, {
    token: body.access_token,
    expiresAtMs: nowMs + TOKEN_TTL_MS,
  });
  return body.access_token;
}
