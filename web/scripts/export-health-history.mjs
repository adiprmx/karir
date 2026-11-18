#!/usr/bin/env node
/* Ekspor riwayat kesehatan harian (P-06, K8): mengambil snapshot
 * /api/health situs live + insiden 24 jam terakhir + heartbeat
 * cron/watcher dari Firestore, lalu menulisnya sebagai
 * docs/status-history/YYYY-MM-DD.md di repo.
 *
 * Tujuan: riwayat kesehatan yang bisa dibaca siapa pun tanpa
 * mengakses dasbor Vercel/Firebase (log runtime Vercel Hobby
 * hanya 1 jam). Workflow export-health-history.yml menjalankan
 * skrip ini tiap hari 03:00 WIB dan meng-commit hasilnya bila
 * berubah.
 *
 * Idempoten: isi file deterministik untuk tanggal yang sama
 * (urutan insiden diurutkan, tidak ada stempel waktu jalan) —
 * run ulang pada hari yang sama menghasilkan file yang identik
 * bila datanya tidak berubah, jadi workflow tidak membuat commit
 * kosong.
 *
 * Keamanan: file hasil ekspor MASUK REPO PUBLIK. Pesan insiden
 * sudah disanitasi saat ditulis (lib/observability.js), tetapi
 * skrip ini menyamarkan ulang alamat email sebagai pertahanan
 * berlapis sebelum menulis. Tidak ada field yang berisi token,
 * UID, atau email yang pernah ditulis ke file ini.
 *
 * Dipakai: node scripts/export-health-history.mjs [--date YYYY-MM-DD]
 *   [--out-dir DIR] [--base-url URL]
 *   --date       tanggal yang diekspor (WIB, default: hari ini)
 *   --out-dir    direktori keluaran (default: docs/status-history,
 *                relatif terhadap akar repo)
 *   --base-url   alamat situs live (default: env BASE_URL, lalu
 *                https://karir-adiprmx.vercel.app/)
 *   --help       tampilkan bantuan
 *
 * Kredensial Firestore (OPSIONAL): FIREBASE_SERVICE_ACCOUNT atau
 * FIRESTORE_ACCESS_TOKEN + FIRESTORE_BASE (pengujian). Tanpa
 * kredensial, file tetap ditulis hanya dari /api/health dengan
 * catatan bahwa data Firestore tidak tersedia. Bila kredensial
 * ada tetapi baca Firestore gagal, kegagalan dicatat DI DALAM
 * file (itu data riwayat, bukan kegagalan skrip).
 *
 * Kode keluar: 0 = file ditulis; 1 = /api/health tidak bisa
 * diambil (file kegagalan tetap ditulis bila memungkinkan);
 * 2 = argumen tidak valid. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getServiceAccountAccessToken } from "../lib/analytics-server.js";

/* Alamat situs live bawaan. */
export const DEFAULT_BASE_URL = "https://karir-adiprmx.vercel.app/";

/* Jendela insiden yang diekspor (jam ke belakang). */
export const INCIDENT_WINDOW_HOURS = 24;

/* Batas insiden per ekspor (insiden per kode per jam, jadi 100
 * sudah jauh di atas jumlah normal; lebih dari itu dipotong dan
 * dicatat). */
export const INCIDENT_LIMIT = 100;

const USAGE = `Pemakaian: node scripts/export-health-history.mjs [--date YYYY-MM-DD] [--out-dir DIR] [--base-url URL]
Menulis riwayat kesehatan harian ke docs/status-history/YYYY-MM-DD.md.
  --date       tanggal yang diekspor, WIB (default: hari ini)
  --out-dir    direktori keluaran (default: docs/status-history)
  --base-url   alamat situs live (default: env BASE_URL, lalu ${DEFAULT_BASE_URL})
  --help       tampilkan bantuan ini
Kredensial Firestore (opsional): FIREBASE_SERVICE_ACCOUNT, atau
FIRESTORE_ACCESS_TOKEN + FIRESTORE_BASE (pengujian).`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseArgs(argv) {
  const parsed = { date: null, outDir: null, baseUrl: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--date") {
      const value = argv[i + 1];
      if (!value || !DATE_RE.test(value)) {
        throw new Error("--date membutuhkan tanggal YYYY-MM-DD.");
      }
      parsed.date = value;
      i += 1;
    } else if (arg === "--out-dir") {
      const value = argv[i + 1];
      if (!value) throw new Error("--out-dir membutuhkan direktori.");
      parsed.outDir = value;
      i += 1;
    } else if (arg === "--base-url") {
      const value = argv[i + 1];
      if (!value) throw new Error("--base-url membutuhkan URL.");
      parsed.baseUrl = value;
      i += 1;
    } else {
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }
  }
  return parsed;
}

/* Tanggal WIB (YYYY-MM-DD) dari sebuah Date. */
export function wibDateString(now = new Date()) {
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

/* Samarkan alamat email di teks yang akan masuk repo publik
 * (pertahanan berlapis; pesan insiden sudah disanitasi di hulu). */
export function scrubForPublic(text) {
  if (typeof text !== "string") return "";
  return text.replace(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    "[email]",
  );
}

/* Ambil nilai string/integer/boolean dari field Firestore REST. */
function fieldString(field) {
  return typeof field?.stringValue === "string" ? field.stringValue : null;
}
function fieldInt(field) {
  return field?.integerValue !== undefined
    ? Number(field.integerValue)
    : null;
}
function fieldBool(field) {
  return typeof field?.booleanValue === "boolean"
    ? field.booleanValue
    : null;
}

/* Susun isi file riwayat dari data yang terkumpul. Semua masukan
 * sudah berupa nilai polos (bukan respons Firestore mentah). */
export function buildHistoryMarkdown({
  date,
  health,
  healthError,
  incidents,
  incidentsError,
  heartbeats,
  firestoreUnavailable,
}) {
  const lines = [];
  lines.push(`# Riwayat kesehatan — ${date}`);
  lines.push("");
  lines.push(
    "Snapshot harian otomatis (P-06): status situs, insiden 24 jam " +
      "terakhir, dan heartbeat cron/watcher. Dibuat workflow " +
      "export-health-history (03:00 WIB).",
  );
  lines.push("");
  lines.push("## Status situs (/api/health)");
  lines.push("");
  if (healthError) {
    lines.push(`- **Tidak bisa diambil:** ${healthError}`);
    lines.push("");
  } else if (health) {
    const status = health.degraded ? "TERDEGRADASI" : "SEHAT";
    lines.push(`- Status: **${status}** (sumber: ${health.source || "?"})`);
    lines.push(`- Revisi data: ${health.rev ?? "?"}`);
    lines.push(`- Tanggal seed: ${health.seedDate ?? "?"}`);
    lines.push(
      `- Estimasi baca Firestore hari ini: ${health.readsEstimate ?? "?"} ` +
        `(${health.quotaPercent ?? "?"}% kuota harian)`,
    );
    lines.push(`- Mode seed: ${health.seedModeMinutes ?? "?"} menit`);
    lines.push(
      `- Run cron terakhir: ${health.lastCronRun?.date ?? "?"} ` +
        `(${health.lastCronRun?.status ?? "?"}, pemicu ${health.lastCronRun?.trigger ?? "?"})`,
    );
    lines.push(`- Cache hangat: ${health.cacheWarm ? "ya" : "tidak"}`);
    lines.push("");
  }
  lines.push("## Insiden 24 jam terakhir");
  lines.push("");
  if (firestoreUnavailable) {
    lines.push(
      "- Data Firestore tidak tersedia saat ekspor (tanpa kredensial).",
    );
    lines.push("");
  } else if (incidentsError) {
    lines.push(`- **Gagal dibaca:** ${incidentsError}`);
    lines.push("");
  } else if (!incidents || incidents.length === 0) {
    lines.push("- Tidak ada insiden.");
    lines.push("");
  } else {
    lines.push("| Kode | Jumlah | Pertama | Terakhir | Pesan |");
    lines.push("| --- | ---: | --- | --- | --- |");
    for (const inc of incidents) {
      lines.push(
        `| ${inc.code} | ${inc.count} | ${inc.firstSeen} | ` +
          `${inc.lastSeen} | ${scrubForPublic(inc.message).replace(/\|/g, "\\|")} |`,
      );
    }
    lines.push("");
  }
  lines.push("## Heartbeat");
  lines.push("");
  if (firestoreUnavailable) {
    lines.push(
      "- Data Firestore tidak tersedia saat ekspor (tanpa kredensial).",
    );
    lines.push("");
  } else {
    const rows = Object.entries(heartbeats || {});
    if (rows.length === 0) {
      lines.push("- Tidak ada heartbeat yang ditemukan.");
      lines.push("");
    } else {
      lines.push("| Dokumen | Status | Keterangan |");
      lines.push("| --- | --- | --- |");
      for (const [doc, hb] of rows) {
        lines.push(`| ${doc} | ${hb.status} | ${hb.note} |`);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
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

async function resolveToken(env) {
  if (env.FIRESTORE_ACCESS_TOKEN) return env.FIRESTORE_ACCESS_TOKEN;
  if (!env.FIREBASE_SERVICE_ACCOUNT) return null;
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  return getServiceAccountAccessToken(account);
}

/* Kueri insiden 24 jam terakhir via runQuery (filter lastSeen >=
 * batas — perbandingan string ISO 8601 UTC urut secara leksikal).
 * Mengembalikan { incidents, error }. */
async function fetchIncidents(base, token, fetchImpl, now) {
  const cutoff = new Date(
    now.getTime() - INCIDENT_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();
  let res;
  try {
    res = await fetchImpl(`${base}:runQuery`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "incidents" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "lastSeen" },
              op: "GREATER_THAN_OR_EQUAL",
              value: { stringValue: cutoff },
            },
          },
          orderBy: [{ field: { fieldPath: "lastSeen" }, direction: "DESCENDING" }],
          limit: INCIDENT_LIMIT,
        },
      }),
    });
  } catch (err) {
    return { incidents: null, error: err.message };
  }
  if (!res.ok) {
    return { incidents: null, error: `HTTP ${res.status}` };
  }
  let rows;
  try {
    rows = await res.json();
  } catch {
    return { incidents: null, error: "respons bukan JSON" };
  }
  const incidents = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const fields = row.document?.fields;
    if (!fields) continue;
    incidents.push({
      code: fieldString(fields.code) || "?",
      count: fieldInt(fields.count) ?? "?",
      firstSeen: fieldString(fields.firstSeen) || "?",
      lastSeen: fieldString(fields.lastSeen) || "?",
      message: fieldString(fields.message) || "",
    });
  }
  /* Urutkan deterministik (kode, lalu firstSeen) supaya run ulang
   * menghasilkan file identik. */
  incidents.sort(
    (a, b) =>
      a.code.localeCompare(b.code) ||
      String(a.firstSeen).localeCompare(String(b.firstSeen)),
  );
  return { incidents, error: null };
}

/* Baca satu dokumen heartbeat; kembalikan ringkasan { status, note }. */
async function fetchHeartbeat(base, token, fetchImpl, docPath) {
  let res;
  try {
    res = await fetchImpl(`${base}/${docPath}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    return { status: "gagal-baca", note: err.message };
  }
  if (res.status === 404) {
    return { status: "tidak-ada", note: "dokumen belum pernah ditulis" };
  }
  if (!res.ok) {
    return { status: "gagal-baca", note: `HTTP ${res.status}` };
  }
  const doc = await res.json().catch(() => null);
  const fields = doc?.fields || {};
  if (docPath === "meta/watcher") {
    const ok = fieldBool(fields.lastRunOk);
    const at = fieldString(fields.lastRunAt);
    return {
      status: ok === false ? "gagal" : ok === true ? "ok" : "?",
      note: `run terakhir ${at || "?"}, alarm terkirim ${fieldInt(fields.alarmsSent) ?? "?"}`,
    };
  }
  const status = fieldString(fields.status) || "?";
  const error = fieldString(fields.error);
  const finished = fieldString(fields.finishedAt);
  const parts = [`selesai ${finished || "?"}`];
  if (error) parts.push(`error: ${scrubForPublic(error)}`);
  const skip = fieldString(fields.skipReason);
  if (skip) parts.push(`alasan dilewati: ${skip}`);
  return { status, note: parts.join("; ") };
}

export async function run(
  argv,
  {
    env = process.env,
    fetchImpl = fetch,
    now = new Date(),
    repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
    ),
  } = {},
) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`Argumen tidak valid: ${err.message}`);
    console.error(USAGE);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const date = args.date || wibDateString(now);
  const outDir = args.outDir
    ? path.resolve(args.outDir)
    : path.join(repoRoot, "docs", "status-history");
  const baseUrl = (args.baseUrl || env.BASE_URL || DEFAULT_BASE_URL).replace(
    /\/$/,
    "",
  );

  /* 1. Snapshot /api/health (wajib). */
  let health = null;
  let healthError = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let res;
    try {
      res = await fetchImpl(`${baseUrl}/api/health`, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      healthError = `HTTP ${res.status}`;
    } else {
      health = await res.json();
    }
  } catch (err) {
    healthError =
      err && err.name === "AbortError" ? "timeout 15 detik" : err.message;
  }

  /* 2. Data Firestore (opsional — tanpa kredensial, lewati). */
  let firestoreUnavailable = false;
  let incidents = null;
  let incidentsError = null;
  let heartbeats = {};
  const base = resolveBase(env);
  let token = null;
  try {
    token = await resolveToken(env);
  } catch (err) {
    incidentsError = `gagal menukar service account: ${err.message}`;
  }
  if (!base || !token) {
    firestoreUnavailable = true;
  } else {
    const inc = await fetchIncidents(base, token, fetchImpl, now);
    incidents = inc.incidents;
    incidentsError = inc.error;
    /* Heartbeat recheck + digest hari ini dan kemarin, dan watcher. */
    const yesterday = wibDateString(
      new Date(now.getTime() - 24 * 60 * 60 * 1000),
    );
    const docs = [
      `cron-runs/recheck-${date}`,
      `cron-runs/recheck-${yesterday}`,
      `cron-runs/digest-${date}`,
      "meta/watcher",
    ];
    for (const docPath of docs) {
      heartbeats[docPath] = await fetchHeartbeat(
        base,
        token,
        fetchImpl,
        docPath,
      );
    }
  }

  const markdown = buildHistoryMarkdown({
    date,
    health,
    healthError,
    incidents,
    incidentsError,
    heartbeats,
    firestoreUnavailable,
  });
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${date}.md`);
  await writeFile(file, markdown, "utf8");
  console.log(`Riwayat kesehatan ditulis: ${file}`);
  if (healthError) {
    console.error(`/api/health tidak bisa diambil: ${healthError}`);
    return 1;
  }
  return 0;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await run(process.argv.slice(2));
}
