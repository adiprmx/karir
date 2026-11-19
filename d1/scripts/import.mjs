#!/usr/bin/env node
/* Impor Firestore/CSV -> D1, per kelompok 100 nomor (P-08, H1).
 *
 * Sumber (pilih satu):
 *   --source csv ............ data/daftar-link-karir.csv (default)
 *   --source seed ........... web/data/companies.json
 *   --source <berkas>.json .. ekspor Firestore: larik dokumen REST
 *                             ({name, fields}) ATAU larik objek
 *                             perusahaan polos (13 field).
 * Catatan: sumber kanonis impor adalah EKSPOR FIRESTORE (baseline
 * live, rencana-migrasi.md §7.2 butir 3), bukan CSV mentah — CSV
 * dan seed dipakai untuk dry-run tanpa akun dan untuk verifikasi
 * silang. Field live `gagal_cek` hanya ada di ekspor Firestore.
 *
 * Mode:
 *   --mode dry-run (default) .. impor ke SQLite in-memory
 *     (node:sqlite), verifikasi baca-balik 13 field per dokumen,
 *     TANPA akun dan tanpa menyentuh layanan apa pun.
 *   --mode live .............. tulis berkas SQL per kelompok ke
 *     d1/out/ + cetak perintah wrangler yang harus dijalankan
 *     manual sesudah O-02. Skrip ini TIDAK PERNAH mengeksekusi
 *     SQL ke D1 sendiri (tanpa akun, tanpa kredensial di repo).
 *
 * Ambang gagal (risiko §11.3, rencana-migrasi §7.2 butir 4):
 * bila dokumen yang GAGAL verifikasi baca-balik dalam satu
 * kelompok LEBIH DARI 1% jumlah dokumen kelompok itu, impor
 * kelompok tersebut DIHENTIKAN dan kelompok berikutnya TIDAK
 * dijalankan (kode keluar 1). 1% persis (mis. 1 dari 100) lolos
 * dengan peringatan.
 *
 * Rev impor: impor awal memakai rev=1 untuk semua baris + meta
 * rev=1, supaya klien baru yang memanggil /v1/delta?rev=0
 * menerima snapshot awal penuh (baris rev > 0). Penulis berikutnya
 * (dual-write H2) memakai rev+1.
 *
 * Pemakaian:
 *   node d1/scripts/import.mjs [--source csv|seed|berkas.json]
 *     [--mode dry-run|live] [--only AWAL-AKHIR] [--rev N]
 *     [--out DIR]
 * Contoh resume kelompok ke-3 saja:
 *   node d1/scripts/import.mjs --mode live --only 201-300
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const SCHEMA_PATH = join(HERE, "..", "schema.sql");

export const GROUP_SIZE = 100;
export const FAIL_THRESHOLD = 0.01; // > 1% gagal -> hentikan kelompok

export const COMPANY_FIELDS = [
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

/* --- Parser CSV (RFC 4180: kutip ganda, koma di dalam kutip,
 * baris baru di dalam kutip, "" sebagai kutip literal). --- */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

export function csvToCompanies(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV kosong atau tanpa baris data.");
  const header = rows[0].map((h) => h.trim());
  const missing = COMPANY_FIELDS.filter((f) => !header.includes(f));
  if (missing.length) {
    throw new Error(`Kolom CSV hilang: ${missing.join(", ")}`);
  }
  return rows.slice(1).map((r) => {
    const c = {};
    for (const f of COMPANY_FIELDS) {
      const v = r[header.indexOf(f)] ?? "";
      c[f] = f === "no" ? Number(v) : v;
    }
    return c;
  });
}

/* Dokumen REST Firestore -> objek perusahaan (13 field + gagal_cek
 * bila ada). Cermin docToCompany di web/lib/companies.js. */
export function firestoreDocToCompany(d) {
  const f = d.fields || {};
  const s = (k) => (f[k] && f[k].stringValue != null ? f[k].stringValue : "");
  const company = {
    no: f.no && f.no.integerValue != null ? Number(f.no.integerValue) : 0,
    perusahaan: s("perusahaan"),
    kategori: s("kategori"),
    link_karir: s("link_karir"),
    status: s("status"),
    tanggal_cek: s("tanggal_cek"),
    catatan: s("catatan"),
    lokasi: s("lokasi"),
    posisi: s("posisi"),
    email_hrd: s("email_hrd"),
    wa_hrd: s("wa_hrd"),
    kontak_lain: s("kontak_lain"),
    batas_lamar: s("batas_lamar"),
  };
  if (f.gagal_cek && f.gagal_cek.integerValue != null) {
    company.gagal_cek = Number(f.gagal_cek.integerValue);
  }
  return company;
}

/* Muat sumber apa pun menjadi larik perusahaan, diurutkan per `no`. */
export function loadSource(source) {
  let companies;
  if (source === "csv") {
    const text = readFileSync(join(REPO, "data", "daftar-link-karir.csv"), "utf8");
    companies = csvToCompanies(text);
  } else if (source === "seed") {
    companies = JSON.parse(
      readFileSync(join(REPO, "web", "data", "companies.json"), "utf8"),
    );
  } else {
    const data = JSON.parse(readFileSync(resolve(source), "utf8"));
    const docs = Array.isArray(data) ? data : data.documents || [];
    if (!docs.length) throw new Error("Berkas JSON sumber kosong.");
    companies = docs[0] && docs[0].fields
      ? docs.map(firestoreDocToCompany)
      : docs;
  }
  return [...companies].sort((a, b) => a.no - b.no);
}

/* Bagi larik menjadi kelompok GROUP_SIZE (100) berdasarkan urutan
 * `no`. Kelompok terakhir boleh lebih kecil (743 -> 7x100 + 43). */
export function groupCompanies(companies, size = GROUP_SIZE) {
  const groups = [];
  for (let i = 0; i < companies.length; i += size) {
    groups.push(companies.slice(i, i + size));
  }
  return groups;
}

/* Bandingkan 13 field satu dokumen sumber vs baris hasil baca-balik.
 * Kembalikan daftar field yang berbeda (kosong = cocok). */
export function diffCompany(expected, actual) {
  const diffs = [];
  for (const f of COMPANY_FIELDS) {
    const a = expected[f] ?? (f === "no" ? 0 : "");
    const b = actual[f] ?? (f === "no" ? 0 : "");
    if (String(a) !== String(b)) diffs.push(f);
  }
  return diffs;
}

/* Verifikasi satu kelompok: bandingkan setiap dokumen sumber dengan
 * hasil baca-balik (Map no -> baris). Kembalikan {total, failed,
 * failures: [{no, fields}]}. */
export function verifyGroup(group, readBackByNo) {
  const failures = [];
  for (const c of group) {
    const actual = readBackByNo.get(c.no);
    if (!actual) {
      failures.push({ no: c.no, fields: ["<hilang>"] });
      continue;
    }
    const fields = diffCompany(c, actual);
    if (fields.length) failures.push({ no: c.no, fields });
  }
  return { total: group.length, failed: failures.length, failures };
}

export function groupPasses(verification) {
  return verification.failed / verification.total <= FAIL_THRESHOLD;
}

/* --- Dry-run: SQLite in-memory via node:sqlite. --- */

const UPSERT_SQL = `INSERT INTO companies
  (no, perusahaan, kategori, link_karir, status, tanggal_cek, catatan,
   lokasi, posisi, email_hrd, wa_hrd, kontak_lain, batas_lamar,
   gagal_cek, rev, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(no) DO UPDATE SET
    perusahaan=excluded.perusahaan, kategori=excluded.kategori,
    link_karir=excluded.link_karir, status=excluded.status,
    tanggal_cek=excluded.tanggal_cek, catatan=excluded.catatan,
    lokasi=excluded.lokasi, posisi=excluded.posisi,
    email_hrd=excluded.email_hrd, wa_hrd=excluded.wa_hrd,
    kontak_lain=excluded.kontak_lain, batas_lamar=excluded.batas_lamar,
    gagal_cek=excluded.gagal_cek, rev=excluded.rev,
    updated_at=excluded.updated_at`;

export function createDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  return db;
}

export function upsertGroup(db, group, rev, updatedAt) {
  const stmt = db.prepare(UPSERT_SQL);
  for (const c of group) {
    stmt.run(
      c.no,
      c.perusahaan ?? "",
      c.kategori ?? "",
      c.link_karir ?? "",
      c.status ?? "",
      c.tanggal_cek ?? "",
      c.catatan ?? "",
      c.lokasi ?? "",
      c.posisi ?? "",
      c.email_hrd ?? "",
      c.wa_hrd ?? "",
      c.kontak_lain ?? "",
      c.batas_lamar ?? "",
      c.gagal_cek ?? 0,
      rev,
      updatedAt,
    );
  }
}

export function readBackGroup(db, group) {
  const stmt = db.prepare("SELECT * FROM companies WHERE no = ?");
  const map = new Map();
  for (const c of group) {
    const row = stmt.get(c.no);
    if (row) map.set(c.no, row);
  }
  return map;
}

export function runDryRun(companies, { rev = 1, only = null } = {}) {
  const db = createDatabase();
  const updatedAt = new Date().toISOString();
  let groups = groupCompanies(companies);
  if (only) {
    groups = groups.filter((g) => g.some((c) => c.no >= only[0] && c.no <= only[1]));
    if (!groups.length) throw new Error(`Rentang --only ${only[0]}-${only[1]} tidak cocok kelompok mana pun.`);
  }
  const results = [];
  for (const group of groups) {
    upsertGroup(db, group, rev, updatedAt);
    const verification = verifyGroup(group, readBackGroup(db, group));
    const passed = groupPasses(verification);
    results.push({
      from: group[0].no,
      to: group[group.length - 1].no,
      ...verification,
      passed,
    });
    if (!passed) break; // Hentikan: kelompok berikutnya tidak dijalankan.
  }
  const allPassed = results.every((r) => r.passed);
  if (allPassed && !only) {
    db.prepare("UPDATE meta SET value = ? WHERE key = 'rev'").run(String(rev));
    db.prepare("UPDATE meta SET value = ? WHERE key = 'updatedAt'").run(updatedAt);
  }
  const total = db.prepare("SELECT COUNT(*) AS n FROM companies").get().n;
  return { results, allPassed, total, db };
}

/* --- Mode live: hasilkan berkas SQL per kelompok (tanpa eksekusi). --- */

function sqlString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

export function groupToSql(group, rev, updatedAt) {
  const lines = [
    `-- Kelompok no ${group[0].no}-${group[group.length - 1].no} (${group.length} baris).`,
    `-- Jalankan: wrangler d1 execute karir-data --file=<berkas-ini>`,
    "BEGIN TRANSACTION;",
  ];
  for (const c of group) {
    const vals = [
      c.no,
      sqlString(c.perusahaan),
      sqlString(c.kategori),
      sqlString(c.link_karir),
      sqlString(c.status),
      sqlString(c.tanggal_cek),
      sqlString(c.catatan),
      sqlString(c.lokasi),
      sqlString(c.posisi),
      sqlString(c.email_hrd),
      sqlString(c.wa_hrd),
      sqlString(c.kontak_lain),
      sqlString(c.batas_lamar),
      c.gagal_cek ?? 0,
      rev,
      sqlString(updatedAt),
    ].join(", ");
    lines.push(
      `INSERT INTO companies (no, perusahaan, kategori, link_karir, status, tanggal_cek, catatan, lokasi, posisi, email_hrd, wa_hrd, kontak_lain, batas_lamar, gagal_cek, rev, updated_at) VALUES (${vals}) ON CONFLICT(no) DO UPDATE SET perusahaan=excluded.perusahaan, kategori=excluded.kategori, link_karir=excluded.link_karir, status=excluded.status, tanggal_cek=excluded.tanggal_cek, catatan=excluded.catatan, lokasi=excluded.lokasi, posisi=excluded.posisi, email_hrd=excluded.email_hrd, wa_hrd=excluded.wa_hrd, kontak_lain=excluded.kontak_lain, batas_lamar=excluded.batas_lamar, gagal_cek=excluded.gagal_cek, rev=excluded.rev, updated_at=excluded.updated_at;`,
    );
  }
  lines.push("COMMIT;");
  return lines.join("\n") + "\n";
}

export function runLivePlan(companies, { rev = 1, only = null, outDir }) {
  const updatedAt = new Date().toISOString();
  let groups = groupCompanies(companies);
  if (only) {
    groups = groups.filter((g) => g.some((c) => c.no >= only[0] && c.no <= only[1]));
    if (!groups.length) throw new Error(`Rentang --only ${only[0]}-${only[1]} tidak cocok kelompok mana pun.`);
  }
  mkdirSync(outDir, { recursive: true });
  const files = [];
  groups.forEach((group, i) => {
    const name = `g${String(i + 1).padStart(2, "0")}-${group[0].no}-${group[group.length - 1].no}.sql`;
    const path = join(outDir, name);
    writeFileSync(path, groupToSql(group, rev, updatedAt));
    files.push(path);
  });
  const metaPath = join(outDir, "zz-meta-rev.sql");
  writeFileSync(
    metaPath,
    `-- Terapkan TERAKHIR, hanya sesudah SEMUA kelompok terverifikasi baca-balik.\nUPDATE meta SET value = '${rev}' WHERE key = 'rev';\nUPDATE meta SET value = '${updatedAt}' WHERE key = 'updatedAt';\n`,
  );
  files.push(metaPath);
  return { files, groups: groups.length, total: companies.length, rev, updatedAt };
}

/* --- CLI --- */

function parseArgs(argv) {
  const opts = { source: "csv", mode: "dry-run", rev: 1, only: null, out: join(REPO, "d1", "out") };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--source") opts.source = argv[++i];
    else if (arg === "--mode") opts.mode = argv[++i];
    else if (arg === "--rev") opts.rev = Number(argv[++i]);
    else if (arg === "--out") opts.out = resolve(argv[++i]);
    else if (arg === "--only") {
      const m = /^(\d+)-(\d+)$/.exec(argv[++i] || "");
      if (!m) throw new Error("--only memakai format AWAL-AKHIR, mis. --only 201-300.");
      opts.only = [Number(m[1]), Number(m[2])];
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else {
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }
  }
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log("Pemakaian: node d1/scripts/import.mjs [--source csv|seed|berkas.json] [--mode dry-run|live] [--only AWAL-AKHIR] [--rev N] [--out DIR]");
    return 0;
  }
  if (!["dry-run", "live"].includes(opts.mode)) {
    throw new Error(`--mode harus dry-run atau live (dapat: ${opts.mode}).`);
  }
  if (!Number.isInteger(opts.rev) || opts.rev < 1) {
    throw new Error("--rev harus bilangan bulat >= 1.");
  }
  const companies = loadSource(opts.source);
  console.log(`Sumber: ${opts.source} — ${companies.length} perusahaan, ${groupCompanies(companies).length} kelompok.`);

  if (opts.mode === "dry-run") {
    const { results, allPassed, total } = runDryRun(companies, opts);
    for (const r of results) {
      const pct = ((r.failed / r.total) * 100).toFixed(1);
      console.log(
        `Kelompok ${r.from}-${r.to}: ${r.total - r.failed}/${r.total} cocok` +
          (r.failed ? ` — GAGAL ${r.failed} (${pct}%): ${r.failures.map((f) => `${f.no} [${f.fields.join(",")}]`).join("; ")}` : "") +
          (r.passed ? " — LOLOS" : " — DIHENTIKAN (>1%)"),
      );
    }
    console.log(`Total di D1 (in-memory): ${total}. ${allPassed ? "Semua kelompok lolos." : "IMPOR DIHENTIKAN — perbaiki dan ulangi dari kelompok yang gagal."}`);
    return allPassed ? 0 : 1;
  }

  const plan = runLivePlan(companies, { rev: opts.rev, only: opts.only, outDir: opts.out });
  console.log(`Mode live: ${plan.groups} berkas kelompok + zz-meta-rev.sql ditulis ke ${opts.out}.`);
  console.log("Skrip ini TIDAK mengeksekusi apa pun. Sesudah O-02, jalankan per kelompok:");
  console.log("  wrangler d1 execute karir-data --file=d1/out/g01-....sql   (lalu verifikasi baca-balik kelompok itu)");
  console.log("  ... ulangi per kelompok; zz-meta-rev.sql TERAKHIR, hanya bila semua kelompok lolos.");
  console.log("Verifikasi baca-balik live per kelompok: dump D1 ke JSON lalu bandingkan 13 field:");
  console.log("  wrangler d1 execute karir-data --command \"SELECT * FROM companies WHERE no BETWEEN 1 AND 100 ORDER BY no\" --json > /tmp/d1-g01.json");
  console.log("  node d1/scripts/compare.mjs /tmp/d1-g01.json <snapshot-firestore-g01.json>");
  return 0;
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
