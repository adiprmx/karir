/* Helper server untuk Firestore lewat REST API memakai service
 * account (melewati rules). Diekstrak dari route cron recheck
 * (app/api/cron/recheck/route.js, T10) tanpa mengubah perilaku —
 * dipakai route recheck, route subscribe push
 * (app/api/push/subscribe/route.js), dan pengirim digest push
 * (lib/push.js). Penukaran token service account tinggal di
 * lib/service-account-token.js (BE2-24, P-04): satu implementasi
 * + satu cache yang dipakai bersama lib/analytics-server.js;
 * getAccessToken di sini hanya pembungkus yang melempar saat
 * penukaran gagal (kontrak lama yang dipakai route cron).
 *
 * Semua panggilan bertimeout 10 detik, termasuk membaca body
 * (jsonWithTimeout, BE-09): return langsung mematikan timer
 * AbortController di finally sebelum body dibaca, jadi tanpa
 * timeout body panggilan bisa menggantung selamanya saat body
 * stall. */
import { jsonWithTimeout } from "./companies.js";
import { getServiceAccountAccessToken } from "./service-account-token.js";

const FETCH_TIMEOUT_MS = 10_000;

/* Tukar service account menjadi access token Firestore. Melempar
 * bila penukaran gagal (kontrak lama: route cron menjawab 503).
 * Token dipakai ulang dari cache bersama bila masih berlaku
 * (lihat lib/service-account-token.js). `fetchImpl` hanya untuk
 * test; produksi memakai fetch global. */
export async function getAccessToken(sa, { fetchImpl = fetch } = {}) {
  const token = await getServiceAccountAccessToken({ sa, fetchImpl });
  if (!token) throw new Error("Token tukar gagal.");
  return token;
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
