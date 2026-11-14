/* Impor perusahaan dari seed ke Firestore (proyek karir-9d53a, koleksi companies).
 * Menulis SEMUA 13 field (no angka + 12 string, termasuk email_hrd,
 * wa_hrd, kontak_lain, batas_lamar) — sama seperti impor kanonis
 * agent-side import_canonical.py. Impor 9 field adalah bug lama yang
 * menghapus kanal melamar dan batas lamar dari dokumen live (DATA-02).
 * Memakai endpoint create per dokumen (POST .../documents/companies
 * ?documentId={no}), BUKAN batchWrite — batchWrite dengan `update`
 * ditolak aturan saat ini (403), sementara create per dokumen lolos.
 * Hanya jalan bila aturan Firestore mengizinkan tulis (dibuka sementara
 * saat impor, dikunci lagi sesudahnya). ID dokumen = nomor baris, jadi
 * impor ulang menabrak 409 (bukan ganda) — script berhenti dan lapor.
 * Kunci API dibaca dari web/.env.local (gitignored) — jangan hardcode.
 * Variabel lingkungan FIRESTORE_BASE (khusus pengujian) boleh menimpa
 * alamat dasar Firestore REST, mis. ke server mock lokal; bawaan:
 * firestore.googleapis.com.
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
const BASE =
  process.env.FIRESTORE_BASE ||
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

/* Ke-13 field dokumen perusahaan. Urutan sama dengan kolom CSV. */
const FIELDS = [
  "no",
  "perusahaan",
  "kategori",
  "link_karir",
  "status",
  "tanggal_cek",
  "catatan",
  "lokasi",
  "posisi",
  "email_hrd",
  "wa_hrd",
  "kontak_lain",
  "batas_lamar",
];

function str(v) {
  return { stringValue: v == null ? "" : String(v) };
}

/* Bangun badan dokumen Firestore dari satu entri seed (13 field). */
function toFields(c) {
  return {
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
      email_hrd: str(c.email_hrd),
      wa_hrd: str(c.wa_hrd),
      kontak_lain: str(c.kontak_lain),
      batas_lamar: str(c.batas_lamar),
    },
  };
}

async function createOne(c) {
  const res = await fetch(
    `${BASE}/companies?documentId=${c.no}&key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toFields(c)),
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
/* Verifikasi 13 field: tiap dokumen wajib punya SEMUA kunci field —
 * dokumen yang kehilangan email_hrd/wa_hrd/kontak_lain/batas_lamar
 * adalah bukti impor 9 field yang lama (DATA-02). */
const incomplete = [];
for (const d of docs) {
  const keys = new Set(Object.keys(d.fields || {}));
  const missing = FIELDS.filter((f) => !keys.has(f));
  if (missing.length > 0) {
    incomplete.push(`${d.name.split("/").pop()}: tanpa ${missing.join(", ")}`);
  }
}
if (incomplete.length > 0) {
  console.error(
    `DOKUMEN TIDAK LENGKAP: ${incomplete.length} dokumen kehilangan field:`,
  );
  for (const line of incomplete.slice(0, 10)) console.error(" -", line);
  process.exit(1);
}
console.log("semua dokumen punya 13 field");
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
