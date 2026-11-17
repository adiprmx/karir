/* Arsip bulanan riwayat changes Karir (P-03, D4): mengambil dokumen
 * `changes` berumur lebih dari 150 hari dari Firestore dan
 * menyimpannya sebagai JSON per bulan di data/archives/
 * (changes-archive-{YYYY-MM}.json) sebelum cron cleanup menghapus
 * dokumen berumur >180 hari. Jalankan dari web/:
 *   node scripts/archive-changes.mjs [--out-dir DIR]
 *       [--older-than-days N] [--dry-run]
 *
 * MENGAPA 150 HARI: arsip berjalan tiap tanggal 1; dokumen yang
 * melewati 150 hari diarsipkan pada run berikutnya (paling lambat
 * 30 hari kemudian, saat umurnya paling banyak 180 hari), sementara
 * cleanup hanya menghapus dokumen yang SUDAH melewati 180 hari
 * (perbandingan LESS_THAN terhadap cutoff). Margin 30 hari ini
 * memastikan tidak ada dokumen yang terhapus sebelum diarsipkan.
 * Arsip adalah prasyarat penghapusan, bukan kegiatan sesudahnya.
 *
 * Isi arsip adalah DATA PUBLIK (nomor, nama perusahaan, status
 * lama/baru, tanggal) tanpa data pengguna — aman di-commit ke repo.
 * Format entri didekode ke objek polos (bukan format mentah REST)
 * supaya mudah dibaca dan dibandingkan. Bila berkas bulan yang sama
 * sudah ada, entri digabung berdasarkan ID dokumen (tanpa duplikat).
 *
 * Autentikasi: pola yang sama dengan backup-firestore.mjs —
 * FIREBASE_SERVICE_ACCOUNT ditukar menjadi token lewat
 * getServiceAccountAccessToken; khusus pengujian,
 * FIRESTORE_ACCESS_TOKEN + FIRESTORE_BASE.
 * --dry-run hanya mencetak rencana tanpa memanggil jaringan.
 * Kode keluar: 0 sukses, 1 kegagalan operasional, 2 argumen salah.
 * Tanpa kredensial, skrip berhenti dengan pesan yang jelas. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getServiceAccountAccessToken } from "../lib/analytics-server.js";

export const PROJECT_ID = "karir-9d53a";
export const DEFAULT_OLDER_THAN_DAYS = 150;
const PAGE_SIZE = 500;
const REQUEST_TIMEOUT_MS = 30_000;

function firestoreBase(env) {
  return (
    env.FIRESTORE_BASE ||
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
  );
}

/* Direktori arsip bawaan: data/archives/ di root repo (skrip ini
 * tinggal di web/scripts/, jadi naik dua tingkat). */
export function defaultOutDir() {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "data", "archives");
}

const USAGE = `Pakai: node scripts/archive-changes.mjs [opsi]

  --out-dir DIR          Direktori arsip (bawaan: data/archives/).
  --older-than-days N    Arsipkan dokumen lebih tua dari N hari
                         (bawaan: 150).
  --dry-run              Cetak rencana saja, tanpa jaringan.
  --help                 Tampilkan bantuan ini.

Autentikasi lewat env FIREBASE_SERVICE_ACCOUNT (string JSON service
account). Khusus pengujian: FIRESTORE_ACCESS_TOKEN (token langsung)
dan FIRESTORE_BASE (alamat dasar REST).`;

export function parseArgs(argv) {
  const options = {
    outDir: null,
    olderThanDays: DEFAULT_OLDER_THAN_DAYS,
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--out-dir" || arg === "--older-than-days") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} butuh nilai`);
      }
      if (arg === "--out-dir") {
        options.outDir = value;
      } else {
        options.olderThanDays = parseDays(value);
      }
      i += 1;
    } else if (arg.startsWith("--out-dir=")) {
      const value = arg.slice("--out-dir=".length);
      if (!value) throw new Error("--out-dir butuh nilai");
      options.outDir = value;
    } else if (arg.startsWith("--older-than-days=")) {
      options.olderThanDays = parseDays(arg.slice("--older-than-days=".length));
    } else {
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }
  }
  return options;
}

function parseDays(value) {
  const days = Number(value);
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error(`--older-than-days harus bilangan bulat positif: ${value}`);
  }
  return days;
}

/* Dekode satu dokumen changes mentah REST ke entri arsip polos.
 * Kembalikan null bila dokumen tidak punya createdAt yang valid
 * (tidak dapat dikelompokkan per bulan — dilewati dengan hitungan
 * eksplisit, bukan ditebak bulannya). */
export function decodeChangeEntry(doc) {
  const fields = doc?.fields || {};
  const createdAt = fields.createdAt?.stringValue || "";
  if (!/^\d{4}-\d{2}-\d{2}T/.test(createdAt)) return null;
  const id = typeof doc?.name === "string" ? doc.name.split("/").pop() : "";
  return {
    id,
    companyNo: Number(fields.companyNo?.integerValue || 0),
    perusahaan: fields.perusahaan?.stringValue || "",
    from: fields.from?.stringValue || "",
    to: fields.to?.stringValue || "",
    checkedAt: fields.checkedAt?.stringValue || "",
    createdAt,
  };
}

/* Kelompokkan entri per bulan (YYYY-MM dari createdAt). */
export function groupByMonth(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const month = entry.createdAt.slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(entry);
  }
  return groups;
}

/* Gabung entri baru ke entri lama per bulan (dedupe berdasarkan id;
 * entri lama dipertahankan bila id sama). Kembalikan { merged, added }. */
export function mergeEntries(existing, incoming) {
  const seen = new Set(existing.map((e) => e.id));
  const merged = [...existing];
  let added = 0;
  for (const entry of incoming) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      merged.push(entry);
      added += 1;
    }
  }
  merged.sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );
  return { merged, added };
}

async function fetchWithTimeout(fetchImpl, url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorDetail(res) {
  try {
    const text = await res.text();
    return text.slice(0, 300);
  } catch {
    return "";
  }
}

/* Ambil seluruh dokumen changes dengan createdAt < cutoff lewat
 * runQuery (limit + offset, supaya tidak ada pemotongan diam-diam).
 * Mengembalikan larik dokumen mentah. */
export async function fetchOldChanges({ fetchImpl, base, token, cutoff }) {
  const documents = [];
  let offset = 0;
  for (;;) {
    const res = await fetchWithTimeout(
      fetchImpl,
      `${base}:runQuery`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: "changes" }],
            where: {
              fieldFilter: {
                field: { fieldPath: "createdAt" },
                op: "LESS_THAN",
                value: { stringValue: cutoff },
              },
            },
            orderBy: [{ field: { fieldPath: "createdAt" }, direction: "ASCENDING" }],
            limit: PAGE_SIZE,
            offset,
          },
        }),
      },
      REQUEST_TIMEOUT_MS,
    );
    if (!res.ok) {
      throw new Error(
        `Gagal membaca changes lama: HTTP ${res.status} ${await readErrorDetail(res)}`,
      );
    }
    const rows = await res.json().catch(() => null);
    if (!Array.isArray(rows)) {
      throw new Error("Gagal membaca changes lama: respons bukan larik");
    }
    const page = rows
      .map((row) => row?.document)
      .filter((doc) => doc && typeof doc === "object");
    documents.push(...page);
    if (page.length < PAGE_SIZE) return documents;
    offset += page.length;
  }
}

export async function run(argv, { env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(`Argumen tidak valid: ${err.message}`);
    console.error(USAGE);
    return 2;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const outDir = options.outDir || defaultOutDir();
  const cutoff = new Date(
    now.getTime() - options.olderThanDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  if (options.dryRun) {
    console.log("Rencana arsip changes (dry-run, tanpa jaringan):");
    console.log(`  Proyek: ${PROJECT_ID}`);
    console.log(`  Ambang umur: > ${options.olderThanDays} hari (createdAt < ${cutoff})`);
    console.log(`  Direktori keluaran: ${outDir}`);
    return 0;
  }

  const hasDirectToken = Boolean(
    env.FIRESTORE_ACCESS_TOKEN && env.FIRESTORE_ACCESS_TOKEN.trim(),
  );
  const token = hasDirectToken
    ? env.FIRESTORE_ACCESS_TOKEN
    : await getServiceAccountAccessToken({ fetchImpl });
  if (!token) {
    console.error(
      "Arsip gagal: tidak ada kredensial Firestore. Pasang env " +
        "FIREBASE_SERVICE_ACCOUNT atau, khusus pengujian, " +
        "FIRESTORE_ACCESS_TOKEN.",
    );
    return 1;
  }

  let documents;
  try {
    documents = await fetchOldChanges({
      fetchImpl,
      base: firestoreBase(env),
      token,
      cutoff,
    });
  } catch (err) {
    console.error(`Arsip gagal: ${err.message}`);
    return 1;
  }
  const entries = [];
  let skipped = 0;
  for (const doc of documents) {
    const entry = decodeChangeEntry(doc);
    if (entry) entries.push(entry);
    else skipped += 1;
  }
  console.log(
    `Ditemukan ${documents.length} dokumen changes lebih tua dari ${options.olderThanDays} hari` +
      (skipped > 0 ? ` (${skipped} tanpa createdAt valid — dilewati)` : ""),
  );
  if (entries.length === 0) {
    console.log("Tidak ada entri yang dapat diarsipkan.");
    return 0;
  }

  const groups = groupByMonth(entries);
  try {
    await mkdir(outDir, { recursive: true });
  } catch (err) {
    console.error(`Arsip gagal membuat direktori ${outDir}: ${err.message}`);
    return 1;
  }
  let totalAdded = 0;
  for (const [month, monthEntries] of [...groups.entries()].sort()) {
    const file = `${outDir}/changes-archive-${month}.json`;
    let existing = [];
    try {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.entries)) existing = parsed.entries;
    } catch {
      /* Berkas belum ada (atau rusak — bila rusak, ditulis ulang
       * dari entri run ini; berkas arsip lama yang rusak tidak dapat
       * dipulihkan dari sini dan harus diperiksa manual). */
    }
    const { merged, added } = mergeEntries(existing, monthEntries);
    const archive = {
      month,
      archivedAt: now.toISOString(),
      documents: merged.length,
      range: {
        from: merged[0].createdAt,
        to: merged[merged.length - 1].createdAt,
      },
      entries: merged,
    };
    try {
      await writeFile(file, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
    } catch (err) {
      console.error(`Arsip gagal menulis ${file}: ${err.message}`);
      return 1;
    }
    console.log(
      `${month}: ${added} entri baru ditambahkan (${merged.length} total) -> ${file}`,
    );
    totalAdded += added;
  }
  console.log(`Arsip selesai: ${totalAdded} entri baru di ${groups.size} berkas bulan.`);
  return 0;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await run(process.argv.slice(2));
}
