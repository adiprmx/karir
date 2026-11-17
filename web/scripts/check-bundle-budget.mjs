/* Anggaran bundle Karir (P-01, DX-11; anggarannya diturunkan P-10).
 * Dijalankan sesudah `next build` (di CI: langkah sesudah Build).
 * Keluar 1 bila ada halaman atau chunk yang melewati anggaran,
 * 0 bila semua dalam anggaran, 2 bila hasil build tidak ditemukan.
 *
 * Cara ukur: untuk tiap rute halaman, kumpulkan seluruh chunk JS
 * klien dari `page_client-reference-manifest.js` rute itu ditambah
 * `rootMainFiles` dari `build-manifest.json` (chunk bersama yang
 * dimuat semua halaman), lalu jumlahkan ukuran mentahnya (byte
 * asli berkas, bukan gzip — angka PERF-01 juga ukuran mentah).
 * Chunk malas (async) ikut dihitung: anggaran membatasi total JS
 * yang dapat dimuat halaman, bukan hanya yang dimuat pertama.
 * Rute API dan berkas statis tidak punya manifest klien dan tidak
 * dihitung — mereka tidak mengirim JS ke browser.
 *
 * Anggaran awal (diukur dari build 17 Nov 2026, Next.js 16.4.5
 * Turbopack, sebelum paket ini):
 * - Satu chunk paling besar: 579,3 KiB (chunk Firebase, sesuai
 *   PERF-01 yang mencatat 580 KB) -> batas 580 KiB.
 * - Total JS satu halaman paling besar: 1290,2 KiB (/admin;
 *   beranda 1264,5 KiB) -> batas 1300 KiB.
 * Kedua batas ini menahan bundle di ukuran saat ini sampai P-10
 * (caching, rendering & bundle) menurunkannya secara struktural.
 * Jangan menaikkan batas untuk membuat CI hijau — bila build
 * melewati batas, kecilkan bundle atau minta keputusan tercatat
 * di laporan paket yang mengubahnya.
 *
 * Jalankan dari web/: node scripts/check-bundle-budget.mjs */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const KIB = 1024;
/* Batas chunk tunggal: 580 KiB (PERF-01: chunk Firebase 580 KB;
 * terukur 579,3 KiB pada 17 Nov 2026). */
const MAX_CHUNK_BYTES = 580 * KIB;
/* Batas total JS per halaman: 1300 KiB (terukur maks 1290,2 KiB
 * di /admin pada 17 Nov 2026). */
const MAX_PAGE_BYTES = 1300 * KIB;

const NEXT_DIR = new URL("../.next/", import.meta.url).pathname;

function readJson(relPath) {
  return JSON.parse(readFileSync(join(NEXT_DIR, relPath), "utf8"));
}

function chunkSize(relPath) {
  const local = relPath.replace(/^\/_next\//, "");
  try {
    return statSync(join(NEXT_DIR, local)).size;
  } catch {
    return 0;
  }
}

/* Kumpulkan manifest klien tiap rute (page_client-reference-manifest.js
 * di bawah .next/server/app). */
function collectManifests(dir, routePrefix, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectManifests(full, `${routePrefix}/${entry.name}`, out);
    } else if (entry.name === "page_client-reference-manifest.js") {
      out.push({ route: routePrefix || "/", file: full });
    }
  }
  return out;
}

function parseManifest(file) {
  const src = readFileSync(file, "utf8");
  /* Isi berkas: `globalThis.__RSC_MANIFEST = ... || {};` lalu
   * `globalThis.__RSC_MANIFEST["..."] = {...};`. JSON yang dicari
   * adalah objek sesudah tanda `= {` TERAKHIR — kurung pertama di
   * berkas adalah `{}` kosong dari baris inisialisasi, bukan data. */
  const marker = src.lastIndexOf("= {");
  const start = marker < 0 ? -1 : marker + 2;
  const end = src.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    return JSON.parse(src.slice(start, end + 1));
  } catch {
    return null;
  }
}

function main() {
  let buildManifest;
  try {
    buildManifest = readJson("build-manifest.json");
  } catch {
    console.error(
      "check-bundle-budget: .next/build-manifest.json tidak ditemukan. " +
        "Jalankan `npm run build` dulu.",
    );
    return 2;
  }
  const rootFiles = (buildManifest.rootMainFiles || []).filter((f) =>
    f.endsWith(".js"),
  );

  const manifests = collectManifests(join(NEXT_DIR, "server", "app"), "", []);
  if (manifests.length === 0) {
    console.error(
      "check-bundle-budget: tidak ada page_client-reference-manifest.js " +
        "di .next/server/app — hasil build tidak seperti yang diharapkan.",
    );
    return 2;
  }

  const rows = [];
  let largestChunk = { file: "", size: 0 };
  const seenChunks = new Set();
  for (const { route, file } of manifests) {
    const manifest = parseManifest(file);
    if (!manifest) {
      console.error(
        `check-bundle-budget: manifest rute ${route} tidak bisa diparse.`,
      );
      return 2;
    }
    const chunks = new Set(rootFiles);
    for (const mod of Object.values(manifest.clientModules || {})) {
      for (const chunk of mod.chunks || []) {
        if (typeof chunk === "string" && chunk.endsWith(".js")) {
          chunks.add(chunk);
        }
      }
    }
    let total = 0;
    for (const chunk of chunks) {
      const size = chunkSize(chunk);
      total += size;
      if (!seenChunks.has(chunk)) {
        seenChunks.add(chunk);
        if (size > largestChunk.size) largestChunk = { file: chunk, size };
      }
    }
    rows.push({ route, total, count: chunks.size });
  }
  rows.sort((a, b) => b.total - a.total);

  const fmt = (bytes) => `${(bytes / KIB).toFixed(1)} KiB`;
  console.log("Anggaran bundle (P-01):");
  console.log(
    `  batas per chunk: ${fmt(MAX_CHUNK_BYTES)}; batas per halaman: ${fmt(MAX_PAGE_BYTES)}`,
  );
  console.log(`  chunk terbesar: ${fmt(largestChunk.size)} (${largestChunk.file})`);
  for (const row of rows) {
    const over = row.total > MAX_PAGE_BYTES ? "  <-- MELEWATI ANGGARAN" : "";
    console.log(
      `  ${row.route.padEnd(28)} ${fmt(row.total).padStart(10)} (${row.count} chunk)${over}`,
    );
  }

  let failed = false;
  if (largestChunk.size > MAX_CHUNK_BYTES) {
    console.error(
      `GAGAL: chunk ${largestChunk.file} (${fmt(largestChunk.size)}) ` +
        `melewati batas ${fmt(MAX_CHUNK_BYTES)}.`,
    );
    failed = true;
  }
  for (const row of rows) {
    if (row.total > MAX_PAGE_BYTES) {
      console.error(
        `GAGAL: halaman ${row.route} (${fmt(row.total)}) melewati batas ` +
          `${fmt(MAX_PAGE_BYTES)}.`,
      );
      failed = true;
    }
  }
  if (!failed) {
    console.log(
      `Lolos: ${rows.length} halaman dalam anggaran; chunk terbesar ${fmt(largestChunk.size)}.`,
    );
  }
  return failed ? 1 : 0;
}

process.exit(main());
