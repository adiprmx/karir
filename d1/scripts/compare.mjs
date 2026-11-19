#!/usr/bin/env node
/* Perbandingan isi D1 vs Firestore (P-08, H2 — pemeriksaan harian).
 *
 * Dipakai selama dual-write untuk mendeteksi divergensi SEBELUM
 * situs bergantung pada D1: bandingkan dua snapshot katalog
 * (13 field per perusahaan) dan laporkan selisih apa pun —
 * dokumen hilang di satu sisi, atau field yang berbeda.
 *
 * Sumber per sisi: berkas JSON larik perusahaan polos, atau
 * larik dokumen REST Firestore ({name, fields}). Cara mendapat
 * snapshot D1 (sesudah O-02):
 *   wrangler d1 execute karir-data \
 *     --command "SELECT * FROM companies ORDER BY no" --json
 * lalu ubah ke larik perusahaan polos (kolom D1 = nama field).
 *
 * Pemakaian:
 *   node d1/scripts/compare.mjs <snapshot-a.json> <snapshot-b.json>
 * Kode keluar: 0 = identik, 1 = ada selisih, 2 = kesalahan pakai.
 * Selama H2, selisih apa pun diselidiki pada hari yang sama dan
 * hitungan 3 hari 0-selisih diulang dari nol (rencana-migrasi
 * §7.4).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COMPANY_FIELDS, diffCompany, firestoreDocToCompany } from "./import.mjs";

export function loadSnapshot(path) {
  const data = JSON.parse(readFileSync(resolve(path), "utf8"));
  const docs = Array.isArray(data) ? data : data.documents || [];
  if (!docs.length) return [];
  return docs[0] && docs[0].fields
    ? docs.map(firestoreDocToCompany)
    : docs;
}

/* Bandingkan dua snapshot. Kembalikan:
 * {totalA, totalB, onlyA: [no], onlyB: [no],
 *  differing: [{no, fields}], identical: bool} */
export function compareCatalogs(a, b) {
  const mapA = new Map(a.map((c) => [c.no, c]));
  const mapB = new Map(b.map((c) => [c.no, c]));
  const onlyA = [];
  const onlyB = [];
  const differing = [];
  for (const [no, ca] of mapA) {
    const cb = mapB.get(no);
    if (!cb) {
      onlyA.push(no);
      continue;
    }
    const fields = diffCompany(ca, cb);
    if (fields.length) differing.push({ no, fields });
  }
  for (const no of mapB.keys()) {
    if (!mapA.has(no)) onlyB.push(no);
  }
  return {
    totalA: a.length,
    totalB: b.length,
    onlyA: onlyA.sort((x, y) => x - y),
    onlyB: onlyB.sort((x, y) => x - y),
    differing,
    identical: onlyA.length === 0 && onlyB.length === 0 && differing.length === 0,
  };
}

/* Ringkasan hitungan per status — pemeriksaan harian H2 memakai ini
 * sebagai sinyal cepat sebelum perbandingan per field. */
export function countByStatus(companies) {
  const counts = {};
  for (const c of companies) {
    counts[c.status] = (counts[c.status] || 0) + 1;
  }
  return counts;
}

function main(argv) {
  if (argv.length !== 2 || argv.includes("--help")) {
    console.log("Pemakaian: node d1/scripts/compare.mjs <snapshot-a.json> <snapshot-b.json>");
    return argv.includes("--help") ? 0 : 2;
  }
  const a = loadSnapshot(argv[0]);
  const b = loadSnapshot(argv[1]);
  const result = compareCatalogs(a, b);
  console.log(`A: ${result.totalA} perusahaan; B: ${result.totalB} perusahaan.`);
  console.log(`Hitungan status A: ${JSON.stringify(countByStatus(a))}`);
  console.log(`Hitungan status B: ${JSON.stringify(countByStatus(b))}`);
  if (result.identical) {
    console.log("IDENTIK — 0 selisih.");
    return 0;
  }
  if (result.onlyA.length) console.log(`Hanya di A (${result.onlyA.length}): ${result.onlyA.join(", ")}`);
  if (result.onlyB.length) console.log(`Hanya di B (${result.onlyB.length}): ${result.onlyB.join(", ")}`);
  for (const d of result.differing) {
    console.log(`Berbeda no ${d.no}: ${d.fields.join(", ")}`);
  }
  console.log(`SELISIH: ${result.onlyA.length + result.onlyB.length} dokumen hilang + ${result.differing.length} dokumen berbeda.`);
  return 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`Gagal: ${err.message}`);
    process.exitCode = 2;
  }
}
