/* Loader khusus test wiring rute API (node:test, QA-04).
 * Rute Next.js memakai alias `@/` (jsconfig) dan modul
 * `next/server` yang tidak dikenal Node polos. Loader ini memetakan
 * keduanya supaya handler rute bisa diimpor langsung dan dipanggil
 * dengan Request tiruan:
 *   - `next/server` -> stub lib/route-test-next-server.mjs
 *   - `@/x` -> web/x (dengan akhiran .js bila perlu)
 *   - berkas `.json` dimuat sebagai modul JSON (dipakai seed
 *     web/data/companies.json lewat impor dinamis di companies.js)
 * Dipakai HANYA oleh lib/api-routes.test.js lewat
 * module.register(); tidak dipakai kode produksi maupun build Next.
 * Semua yang lain diteruskan ke resolve/load bawaan Node. */
import { pathToFileURL, fileURLToPath } from "node:url";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const WEB_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const NEXT_SERVER_STUB = pathToFileURL(
  path.join(WEB_ROOT, "lib", "route-test-next-server.mjs"),
).href;

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return { url: NEXT_SERVER_STUB, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const base = path.join(WEB_ROOT, rel);
    const candidates = [base, `${base}.js`, path.join(base, "index.js")];
    for (const candidate of candidates) {
      if (isFile(candidate)) {
        return {
          url: pathToFileURL(candidate).href,
          shortCircuit: true,
        };
      }
    }
    /* Tidak ditemukan: teruskan supaya Node melaporkan error
     * resolve yang jelas, bukan diam-diam gagal. */
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    const filePath = fileURLToPath(url);
    if (existsSync(filePath)) {
      const source = readFileSync(filePath, "utf8");
      return { format: "json", source, shortCircuit: true };
    }
  }
  return nextLoad(url, context);
}
