/* Loader khusus test app/push-client.test.js (node:test).
 * push-client.js mengimpor `@/lib/firebase` secara malas; loader
 * ini memetakan impor itu ke stub test
 * (lib/push-client-firebase-stub.mjs) dan alias `@/` lainnya ke
 * web/. Dipakai HANYA oleh test itu lewat module.register();
 * tidak dipakai kode produksi maupun build Next. Semua yang lain
 * diteruskan ke resolve bawaan Node. */
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const WEB_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const FIREBASE_STUB = pathToFileURL(
  path.join(WEB_ROOT, "lib", "push-client-firebase-stub.mjs"),
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/firebase") {
    return { url: FIREBASE_STUB, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const base = path.join(WEB_ROOT, rel);
    return {
      url: pathToFileURL(rel.endsWith(".js") ? base : `${base}.js`).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
