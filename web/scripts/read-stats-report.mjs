#!/usr/bin/env node
/* Laporan pengukuran baca Firestore per sumber (P-06, K7/T1):
 * membaca dokumen `read-stats/{tanggal}` selama rentang tanggal
 * (bawaan: 14 hari terakhir) dan mencetak agregat per sumber —
 * sumber baca terbesar teridentifikasi dengan angka, bukan
 * tebakan. Dipakai untuk menetapkan target penghematan P-08/P-10
 * dari hasil ukur.
 *
 * Keterbatasan yang dicetak di laporan (jujur, bukan
 * disembunyikan): angka adalah BATAS BAWAH — instance serverless
 * yang mati sebelum flush kehilangan tumpukan yang belum
 * ter-flush (maks 49/sumber/instance), dan jalur yang tidak
 * diinstrumentasi (panel admin lewat SDK, impor kanonis
 * agent-side) tidak tercatat. Hari tanpa dokumen (flush gagal
 * total / rules belum diterbitkan) dihitung sebagai hari hilang
 * dan dilaporkan, bukan dianggap nol.
 *
 * Dipakai: node scripts/read-stats-report.mjs [--days N]
 *   [--from YYYY-MM-DD --to YYYY-MM-DD]
 *   --days N     jumlah hari ke belakang dari hari ini (WIB),
 *                default 14; tidak boleh dipakai bersama --from/--to
 *   --from/--to  rentang tanggal eksplisit (inklusif, maks 31 hari)
 *   --help       tampilkan bantuan
 *
 * Kredensial: FIREBASE_SERVICE_ACCOUNT atau FIRESTORE_ACCESS_TOKEN
 * + FIRESTORE_BASE (pengujian). Tanpa kredensial, keluar 1.
 *
 * Kode keluar: 0 = laporan tercetak (walau ada hari hilang);
 * 1 = tidak ada satu pun dokumen yang bisa dibaca / kredensial
 * tidak ada; 2 = argumen tidak valid. */
import { fileURLToPath } from "node:url";
import { getServiceAccountAccessToken } from "../lib/analytics-server.js";

/* Sumber baca yang dikenal (harus selaras dengan lib/read-meter.js
 * dan aturan firestore.rules untuk read-stats). Sumber di luar
 * daftar ini tetap dilaporkan sebagai "tidak dikenal" bila muncul. */
export const KNOWN_SOURCES = [
  "web-refill",
  "web-marker",
  "web-by-id",
  "web-changes",
  "web-index-rev",
  "cron-recheck",
  "cron-cleanup",
  "watcher",
];

export const DEFAULT_DAYS = 14;
export const MAX_RANGE_DAYS = 31;

const USAGE = `Pemakaian: node scripts/read-stats-report.mjs [--days N] [--from YYYY-MM-DD --to YYYY-MM-DD]
Mengagregasi dokumen read-stats selama rentang tanggal dan mencetak
tabel per sumber.
  --days N     jumlah hari ke belakang dari hari ini, WIB (default ${DEFAULT_DAYS})
  --from/--to  rentang tanggal eksplisit, inklusif (maks ${MAX_RANGE_DAYS} hari)
  --help       tampilkan bantuan ini
Kredensial: FIREBASE_SERVICE_ACCOUNT, atau FIRESTORE_ACCESS_TOKEN +
FIRESTORE_BASE (pengujian).`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseArgs(argv) {
  const parsed = { days: null, from: null, to: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--days") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 1 || value > MAX_RANGE_DAYS) {
        throw new Error(
          `--days membutuhkan bilangan bulat 1–${MAX_RANGE_DAYS}.`,
        );
      }
      parsed.days = value;
      i += 1;
    } else if (arg === "--from") {
      const value = argv[i + 1];
      if (!value || !DATE_RE.test(value)) {
        throw new Error("--from membutuhkan tanggal YYYY-MM-DD.");
      }
      parsed.from = value;
      i += 1;
    } else if (arg === "--to") {
      const value = argv[i + 1];
      if (!value || !DATE_RE.test(value)) {
        throw new Error("--to membutuhkan tanggal YYYY-MM-DD.");
      }
      parsed.to = value;
      i += 1;
    } else {
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }
  }
  if (parsed.days !== null && (parsed.from || parsed.to)) {
    throw new Error("--days tidak boleh dipakai bersama --from/--to.");
  }
  if ((parsed.from && !parsed.to) || (!parsed.from && parsed.to)) {
    throw new Error("--from dan --to harus dipakai berpasangan.");
  }
  return parsed;
}

/* Tanggal WIB (YYYY-MM-DD) dari sebuah Date. */
export function wibDateString(now = new Date()) {
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

/* Daftar tanggal (YYYY-MM-DD) dari argumen yang sudah diparse.
 * `now` bisa diinjeksi untuk pengujian. */
export function resolveDates(args, now = new Date()) {
  if (args.from && args.to) {
    const start = Date.parse(`${args.from}T00:00:00Z`);
    const end = Date.parse(`${args.to}T00:00:00Z`);
    if (end < start) {
      throw new Error("--to tidak boleh sebelum --from.");
    }
    const count = Math.round((end - start) / 86_400_000) + 1;
    if (count > MAX_RANGE_DAYS) {
      throw new Error(`Rentang melebihi ${MAX_RANGE_DAYS} hari.`);
    }
    const dates = [];
    for (let d = 0; d < count; d += 1) {
      dates.push(
        new Date(start + d * 86_400_000).toISOString().slice(0, 10),
      );
    }
    return dates;
  }
  const days = args.days ?? DEFAULT_DAYS;
  const todayWib = wibDateString(now);
  const todayMs = Date.parse(`${todayWib}T00:00:00Z`);
  const dates = [];
  for (let d = days - 1; d >= 0; d -= 1) {
    dates.push(
      new Date(todayMs - d * 86_400_000).toISOString().slice(0, 10),
    );
  }
  return dates;
}

/* Agregasi dokumen read-stats (nilai polos { date, sources }) menjadi
 * { totals, daily, grandTotal, missingDays, largest }. */
export function aggregateReadStats(docs, dates) {
  const totals = {};
  const daily = {};
  const missingDays = [];
  const byDate = new Map(docs.map((d) => [d.date, d.sources]));
  for (const date of dates) {
    const sources = byDate.get(date);
    if (!sources) {
      missingDays.push(date);
      daily[date] = null;
      continue;
    }
    let dayTotal = 0;
    for (const [source, count] of Object.entries(sources)) {
      totals[source] = (totals[source] || 0) + count;
      dayTotal += count;
    }
    daily[date] = dayTotal;
  }
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  let largest = null;
  for (const [source, count] of Object.entries(totals)) {
    if (!largest || count > largest.count) largest = { source, count };
  }
  return { totals, daily, grandTotal, missingDays, largest };
}

/* Cetak laporan agregat ke stdout. */
export function printReport({ dates, totals, daily, grandTotal, missingDays, largest }) {
  console.log(
    `Laporan baca Firestore per sumber: ${dates[0]} s.d. ${dates[dates.length - 1]} ` +
      `(${dates.length} hari)`,
  );
  console.log("");
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) {
    console.log("Tidak ada data baca pada rentang ini.");
  } else {
    console.log("Sumber           Total    %");
    console.log("---------------  -------  -----");
    for (const [source, count] of rows) {
      const pct =
        grandTotal > 0 ? ((count / grandTotal) * 100).toFixed(1) : "0.0";
      console.log(`${source.padEnd(15)}  ${String(count).padStart(7)}  ${pct.padStart(5)}%`);
    }
    console.log("---------------  -------  -----");
    console.log(`${"TOTAL".padEnd(15)}  ${String(grandTotal).padStart(7)}  100.0%`);
    console.log("");
    console.log(
      `Sumber terbesar: ${largest.source} (${largest.count} baca, ` +
        `${grandTotal > 0 ? ((largest.count / grandTotal) * 100).toFixed(1) : "0.0"}% dari total).`,
    );
  }
  console.log("");
  console.log("Per hari:");
  for (const date of dates) {
    console.log(
      `  ${date}: ${daily[date] === null ? "tidak ada dokumen" : `${daily[date]} baca`}`,
    );
  }
  if (missingDays.length > 0) {
    console.log("");
    console.log(
      `PERHATIAN: ${missingDays.length} hari tanpa dokumen ` +
        `(${missingDays.join(", ")}). Hari-hari itu tidak dihitung nol — ` +
        `total di atas adalah batas bawah.`,
    );
  }
  console.log("");
  console.log(
    "Catatan: angka adalah batas bawah pemakaian sebenarnya — " +
      "tumpukan yang belum ter-flush hilang bila instance mati, dan " +
      "jalur yang tidak diinstrumentasi (panel admin, impor kanonis) " +
      "tidak tercatat.",
  );
}

function resolveBase(env) {
  if (env.FIRESTORE_BASE) return env.FIRESTORE_BASE;
  let projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null;
  if (!projectId && env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      projectId = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id;
    } catch {
      projectId = null;
    }
  }
  if (!projectId) return null;
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

export async function run(
  argv,
  { env = process.env, fetchImpl = fetch, now = new Date() } = {},
) {
  let args;
  try {
    args = parseArgs(argv);
    if (args.help) {
      console.log(USAGE);
      return 0;
    }
  } catch (err) {
    console.error(`Argumen tidak valid: ${err.message}`);
    console.error(USAGE);
    return 2;
  }
  let dates;
  try {
    dates = resolveDates(args, now);
  } catch (err) {
    console.error(`Argumen tidak valid: ${err.message}`);
    console.error(USAGE);
    return 2;
  }

  const base = resolveBase(env);
  if (!base) {
    console.error(
      "Tidak bisa menentukan alamat Firestore: pasang FIREBASE_SERVICE_ACCOUNT atau FIRESTORE_BASE.",
    );
    return 1;
  }
  let token = env.FIRESTORE_ACCESS_TOKEN || null;
  if (!token) {
    if (!env.FIREBASE_SERVICE_ACCOUNT) {
      console.error(
        "Kredensial tidak ditemukan: pasang FIREBASE_SERVICE_ACCOUNT (atau FIRESTORE_ACCESS_TOKEN untuk pengujian).",
      );
      return 1;
    }
    try {
      const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
      token = await getServiceAccountAccessToken(account);
    } catch (err) {
      console.error(`Gagal menukar service account: ${err.message}`);
      return 1;
    }
  }

  const docs = [];
  let readErrors = 0;
  for (const date of dates) {
    let res;
    try {
      res = await fetchImpl(`${base}/read-stats/${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      readErrors += 1;
      continue;
    }
    if (res.status === 404) continue;
    if (!res.ok) {
      readErrors += 1;
      continue;
    }
    const doc = await res.json().catch(() => null);
    const sources = {};
    const fields = doc?.fields?.sources?.mapValue?.fields || {};
    for (const [source, value] of Object.entries(fields)) {
      const n = Number(value.integerValue);
      if (Number.isFinite(n)) sources[source] = n;
    }
    docs.push({ date, sources });
  }
  if (docs.length === 0) {
    console.error(
      "Tidak ada satu pun dokumen read-stats yang bisa dibaca " +
        `(hari hilang: ${dates.length}, galat baca: ${readErrors}). ` +
        "Periksa apakah rules read-stats sudah diterbitkan dan flush pengukur sudah jalan.",
    );
    return 1;
  }
  const result = aggregateReadStats(docs, dates);
  printReport({ dates, ...result });
  return 0;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await run(process.argv.slice(2));
}
