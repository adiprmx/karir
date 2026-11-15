/* Loader khusus test saveUserProfile (AKUN-14).
 * saveUserProfile di lib/tracker-sync.js mengimpor Firebase secara
 * dinamis (`firebase/firestore` + `./firebase.js`), sehingga tidak
 * bisa dites tanpa jaringan kecuali kedua impor itu dialihkan ke
 * stub. Loader ini memetakan keduanya ke stub di lib/test-stubs/:
 *   - `firebase/firestore` -> test-stubs/firebase-firestore.mjs
 *   - `./firebase.js` (dari lib/tracker-sync.js) ->
 *     test-stubs/firebase-app.mjs
 * Dipakai HANYA oleh lib/akun-profile.test.js lewat
 * module.register(); tidak dipakai kode produksi maupun build Next.
 * Semua yang lain diteruskan ke resolve bawaan Node. */
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const WEB_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const FIRESTORE_STUB = pathToFileURL(
  path.join(WEB_ROOT, "lib", "test-stubs", "firebase-firestore.mjs"),
).href;
const APP_STUB = pathToFileURL(
  path.join(WEB_ROOT, "lib", "test-stubs", "firebase-app.mjs"),
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "firebase/firestore") {
    return { url: FIRESTORE_STUB, shortCircuit: true };
  }
  if (
    specifier === "./firebase.js" &&
    context.parentURL &&
    context.parentURL.endsWith("/lib/tracker-sync.js")
  ) {
    return { url: APP_STUB, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
