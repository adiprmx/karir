/* Helper server untuk Firestore lewat REST API memakai service
 * account (melewati rules). Diekstrak dari route cron recheck
 * (app/api/cron/recheck/route.js, T10) tanpa mengubah perilaku —
 * dipakai route recheck, route subscribe push
 * (app/api/push/subscribe/route.js), dan pengirim digest push
 * (lib/push.js). lib/analytics-server.js punya salinannya sendiri
 * dan sengaja tidak disentuh (di luar cakupan T10).
 *
 * Semua panggilan bertimeout 10 detik, termasuk membaca body
 * (jsonWithTimeout, BE-09): return langsung mematikan timer
 * AbortController di finally sebelum body dibaca, jadi tanpa
 * timeout body panggilan bisa menggantung selamanya saat body
 * stall. */
import { createSign } from "node:crypto";
import { jsonWithTimeout } from "./companies.js";

const FETCH_TIMEOUT_MS = 10_000;

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

/* Tukar service account menjadi access token Firestore. */
export async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(sa.private_key, "base64url");
  const jwt = `${header}.${payload}.${signature}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }).toString(),
    });
    if (!res.ok) {
      throw new Error(`Token tukar gagal: HTTP ${res.status}`);
    }
    const body = await res.json();
    if (!body.access_token) throw new Error("Token tidak ada di balasan.");
    return body.access_token;
  } finally {
    clearTimeout(timer);
  }
}

/* Panggil REST Firestore (tulis atau baca daftar). Melempar bila
 * status bukan 2xx. Body yang bukan JSON dianggap {} (beberapa
 * balasan tulis Firestore tidak membawa body JSON). */
export async function firestoreFetch(url, token, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Firestore tulis gagal: HTTP ${res.status}`);
    }
    /* res.json() di sini WAJIB bertimeout (BE-09): return langsung
     * mematikan timer AbortController di finally sebelum body
     * dibaca, jadi tanpa jsonWithTimeout panggilan ini bisa
     * menggantung selamanya saat body stall. */
    return jsonWithTimeout(res, FETCH_TIMEOUT_MS).catch(() => ({}));
  } finally {
    clearTimeout(timer);
  }
}

/* Baca satu dokumen Firestore. Kembalikan null bila dokumen belum ada
 * (HTTP 404); lempar untuk kegagalan lain. */
export async function firestoreGet(url, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Firestore baca gagal: HTTP ${res.status}`);
    }
    /* Lihat catatan di firestoreFetch: res.json() tanpa timeout
     * bisa menggantung selamanya karena timer sudah dimatikan. */
    return jsonWithTimeout(res, FETCH_TIMEOUT_MS);
  } finally {
    clearTimeout(timer);
  }
}

/* Hapus satu dokumen Firestore. Kembalikan true bila dokumen
 * terhapus, false bila dokumen sudah tidak ada (HTTP 404 — hapus
 * yang idempotent, dipakai unsubscribe push); lempar untuk
 * kegagalan lain. */
export async function firestoreDelete(url, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "DELETE",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return false;
    if (!res.ok) {
      throw new Error(`Firestore hapus gagal: HTTP ${res.status}`);
    }
    return true;
  } finally {
    clearTimeout(timer);
  }
}
