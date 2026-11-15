/* Loader khusus test lib/cron-recheck.test.js (node:test, T10).
 * Memetakan impor `web-push` (dipakai lib/push.js) ke stub test
 * (lib/webpush-test-stub.mjs) supaya test wiring recheck ->
 * sendPushDigest bisa mengamati pemanggilan kirim tanpa jaringan.
 * Dipakai HANYA oleh test itu lewat module.register() — didaftar
 * BERSAMA route-test-loader.mjs; tidak dipakai kode produksi
 * maupun build Next. Semua yang lain diteruskan ke resolve
 * berikutnya. */
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const WEBPUSH_STUB = pathToFileURL(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "webpush-test-stub.mjs",
  ),
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "web-push") {
    return { url: WEBPUSH_STUB, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
