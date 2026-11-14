/* Impor perusahaan dari CSV ke Firestore (proyek karir-9d53a, koleksi companies).
 * Memakai endpoint create per dokumen (POST .../documents/companies
 * ?documentId={no}), BUKAN batchWrite — batchWrite dengan `update`
 * ditolak aturan saat ini (403), sementara create per dokumen lolos.
 * Hanya jalan bila aturan Firestore mengizinkan tulis (dibuka sementara
 * saat impor, dikunci lagi sesudahnya). ID dokumen = nomor baris, jadi
 * impor ulang menabrak 409 (bukan ganda) — script berhenti dan lapor.
 * Kunci API dibaca dari web/.env.local (gitignored) — jangan hardcode.
 *
 * Pakai: node scripts/import-firestore.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(join(root, ".env.local"), "utf8");
const apiKey = env
  .split("\n")
  .find((l) => l.startsWith("NEXT_PUBLIC_FIREBASE_API_KEY="))
  ?.split("=")[1]
  ?.trim();
if (!apiKey) {
  console.error("NEXT_PUBLIC_FIREBASE_API_KEY tidak ada di .env.local");
  process.exit(1);
}

const companies = JSON.parse(
  readFileSync(join(root, "data", "companies.json"), "utf8"),
);
console.log("baris:", companies.length);

const PROJECT = "karir-9d53a";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function str(v) {
  return { stringValue: v == null ? "" : String(v) };
}

async function createOne(c) {
  const res = await fetch(
    `${BASE}/companies?documentId=${c.no}&key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          no: { integerValue: String(c.no) },
          perusahaan: str(c.perusahaan),
          kategori: str(c.kategori),
          link_karir: str(c.link_karir),
          status: str(c.status),
          tanggal_cek: str(c.tanggal_cek),
          catatan: str(c.catatan),
          lokasi: str(c.lokasi),
          posisi: str(c.posisi),
        },
      }),
    },
  );
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Error(`no ${c.no}: HTTP ${res.status} ${text}`);
  }
}

const CONCURRENCY = 10;
let done = 0;
let failed = null;
for (let i = 0; i < companies.length && !failed; i += CONCURRENCY) {
  const chunk = companies.slice(i, i + CONCURRENCY);
  const results = await Promise.allSettled(chunk.map(createOne));
  for (const r of results) {
    if (r.status === "fulfilled") done++;
    else if (!failed) failed = r.reason;
  }
  process.stdout.write(`\rterkirim: ${done}/${companies.length}`);
}
console.log("");
if (failed) {
  console.error("GAGAL:", failed.message);
  process.exit(1);
}
console.log("create OK:", done, "dokumen");

// Verifikasi: hitung SEMUA dokumen (ikuti nextPageToken) + cek 3 baris kunci.
let docs = [];
let token = "";
do {
  const url =
    `${BASE}/companies?pageSize=300&key=${apiKey}` +
    (token ? `&pageToken=${token}` : "");
  const listRes = await fetch(url);
  if (!listRes.ok) {
    console.error("verifikasi list gagal:", listRes.status);
    process.exit(1);
  }
  const list = await listRes.json();
  docs = docs.concat(list.documents || []);
  token = list.nextPageToken || "";
} while (token);
console.log("dokumen di Firestore:", docs.length);
const byId = new Map(docs.map((d) => [d.name.split("/").pop(), d]));
for (const no of ["406", "212", "115"]) {
  const d = byId.get(no);
  console.log(
    no,
    "->",
    d
      ? d.fields.perusahaan.stringValue + " | " + d.fields.status.stringValue
      : "TIDAK ADA",
  );
}
if (docs.length !== companies.length) {
  console.error("JUMLAH TIDAK COCOK");
  process.exit(1);
}
console.log("impor terverifikasi");
