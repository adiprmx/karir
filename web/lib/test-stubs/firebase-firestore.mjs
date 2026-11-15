/* Stub Firestore untuk test saveUserProfile (AKUN-14).
 * Dipakai HANYA lewat firebase-stub-loader.mjs di test
 * lib/akun-profile.test.js; tidak dipakai kode produksi maupun
 * build Next. Perilaku dikendalikan lewat globalThis:
 *   globalThis.__t16bFirestoreStub = { calls: [], fail: false }
 * setDoc mencatat tiap panggilan (ref, data, options) dan melempar
 * bila fail true, supaya jalur gagal saveUserProfile bisa dites
 * tanpa jaringan dan tanpa kuota baca live. */
export function doc(_db, ...segments) {
  return { path: segments.join("/") };
}

export function collection(_db, ...segments) {
  return { path: segments.join("/") };
}

export async function setDoc(ref, data, options) {
  const ctl = globalThis.__t16bFirestoreStub;
  if (ctl) ctl.calls.push({ ref, data, options });
  if (ctl && ctl.fail) throw new Error("tulis gagal (stub)");
}

export async function getDocs() {
  throw new Error("getDocs tidak dipakai di test ini (stub)");
}

export function writeBatch() {
  throw new Error("writeBatch tidak dipakai di test ini (stub)");
}

export async function deleteDoc() {
  throw new Error("deleteDoc tidak dipakai di test ini (stub)");
}
