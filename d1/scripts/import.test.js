/* Tes skrip impor Firestore/CSV -> D1 (P-08, H1).
 * Dijalankan: node --test d1/ (dari akar repo).
 * Semua tes memakai SQLite in-memory (node:sqlite) — tanpa akun. */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COMPANY_FIELDS,
  GROUP_SIZE,
  csvToCompanies,
  diffCompany,
  firestoreDocToCompany,
  groupCompanies,
  groupPasses,
  groupToSql,
  loadSource,
  parseCsv,
  readBackGroup,
  runDryRun,
  runLivePlan,
  upsertGroup,
  verifyGroup,
  createDatabase,
} from "./import.mjs";

function makeCompany(no, overrides = {}) {
  return {
    no,
    perusahaan: `Perusahaan ${no}`,
    kategori: "Teknologi",
    link_karir: `https://contoh.test/karir/${no}`,
    status: "Ada lowongan",
    tanggal_cek: "2026-11-19",
    catatan: "",
    lokasi: "Jakarta",
    posisi: "",
    email_hrd: "",
    wa_hrd: "",
    kontak_lain: "",
    batas_lamar: "",
    ...overrides,
  };
}

test("parseCsv menangani kutip, koma, dan baris baru di dalam field", () => {
  const text =
    'no,perusahaan,catatan\n1,PT A,"Satu, dua"\n2,PT B,"Baris satu\nBaris dua"\n3,PT C,"Kutip ""dalam"" teks"\n';
  const rows = parseCsv(text);
  assert.equal(rows.length, 4);
  assert.equal(rows[1][2], "Satu, dua");
  assert.equal(rows[2][2], "Baris satu\nBaris dua");
  assert.equal(rows[3][2], 'Kutip "dalam" teks');
});

test("csvToCompanies memetakan 13 kolom dan menolak kolom hilang", () => {
  const header = COMPANY_FIELDS.join(",");
  const text = `${header}\n1,PT A,FMCG,https://a.test,Ada lowongan,2026-11-19,cat,JKT,Pos,e@a.test,081,,-\n`;
  const [c] = csvToCompanies(text);
  assert.equal(c.no, 1);
  assert.equal(c.perusahaan, "PT A");
  assert.equal(c.status, "Ada lowongan");
  assert.throws(() => csvToCompanies("no,perusahaan\n1,PT A\n"), /Kolom CSV hilang/);
});

test("firestoreDocToCompany memetakan dokumen REST + gagal_cek opsional", () => {
  const doc = {
    name: "projects/p/databases/(default)/documents/companies/7",
    fields: {
      no: { integerValue: "7" },
      perusahaan: { stringValue: "PT Tujuh" },
      status: { stringValue: "Tidak ada lowongan" },
      gagal_cek: { integerValue: "3" },
    },
  };
  const c = firestoreDocToCompany(doc);
  assert.equal(c.no, 7);
  assert.equal(c.perusahaan, "PT Tujuh");
  assert.equal(c.gagal_cek, 3);
  assert.equal(c.kategori, "");
  const doc2 = { fields: { no: { integerValue: "8" } } };
  assert.ok(!("gagal_cek" in firestoreDocToCompany(doc2)));
});

test("groupCompanies: 743 perusahaan -> 8 kelompok (7x100 + 43)", () => {
  const companies = Array.from({ length: 743 }, (_, i) => makeCompany(i + 1));
  const groups = groupCompanies(companies);
  assert.equal(groups.length, 8);
  assert.equal(groups[0].length, GROUP_SIZE);
  assert.equal(groups[6].length, GROUP_SIZE);
  assert.equal(groups[7].length, 43);
  assert.equal(groups[7][0].no, 701);
  assert.equal(groups[7][42].no, 743);
});

test("diffCompany mendeteksi field yang berubah, kosong bila identik", () => {
  const a = makeCompany(1);
  assert.deepEqual(diffCompany(a, { ...a }), []);
  assert.deepEqual(diffCompany(a, { ...a, status: "Tidak ada lowongan" }), ["status"]);
  assert.deepEqual(
    diffCompany(a, { ...a, status: "X", lokasi: "Y" }),
    ["status", "lokasi"],
  );
});

test("ambang gagal: 1 dari 100 lolos (1% persis), 2 dari 100 gagal, 1 dari 43 gagal", () => {
  const group100 = Array.from({ length: 100 }, (_, i) => makeCompany(i + 1));
  const readBack = new Map(group100.map((c) => [c.no, { ...c }]));
  // 1 gagal dari 100 = 1% persis -> lolos (aturan: LEBIH DARI 1%).
  readBack.set(5, { ...group100[4], status: "Berbeda" });
  assert.equal(groupPasses(verifyGroup(group100, readBack)), true);
  // 2 gagal dari 100 = 2% -> dihentikan.
  readBack.set(6, { ...group100[5], status: "Berbeda" });
  assert.equal(groupPasses(verifyGroup(group100, readBack)), false);
  // 1 gagal dari 43 = 2,3% -> dihentikan.
  const group43 = Array.from({ length: 43 }, (_, i) => makeCompany(701 + i));
  const readBack43 = new Map(group43.map((c) => [c.no, { ...c }]));
  readBack43.set(701, { ...group43[0], status: "Berbeda" });
  assert.equal(groupPasses(verifyGroup(group43, readBack43)), false);
});

test("verifyGroup melaporkan dokumen hilang sebagai gagal", () => {
  const group = [makeCompany(1), makeCompany(2)];
  const readBack = new Map([[1, { ...group[0] }]]);
  const v = verifyGroup(group, readBack);
  assert.equal(v.failed, 1);
  assert.equal(v.failures[0].no, 2);
  assert.deepEqual(v.failures[0].fields, ["<hilang>"]);
});

test("round-trip dry-run: impor + baca-balik 13 field cocok semua", () => {
  const companies = [
    makeCompany(1, { catatan: 'Koma, "kutip", dan\nbaris baru' }),
    makeCompany(2, { status: "Portal tidak bisa dibuka", gagal_cek: 2 }),
    makeCompany(3, { email_hrd: "hrd@contoh.test", batas_lamar: "2026-12-01" }),
  ];
  const { results, allPassed, total, db } = runDryRun(companies, { rev: 1 });
  assert.equal(allPassed, true);
  assert.equal(total, 3);
  assert.equal(results.length, 1);
  assert.equal(results[0].failed, 0);
  // Meta rev ikut naik hanya bila semua kelompok lolos.
  const rev = db.prepare("SELECT value FROM meta WHERE key = 'rev'").get();
  assert.equal(rev.value, "1");
});

test("round-trip dry-run 250 baris: 3 kelompok, semua lolos", () => {
  const companies = Array.from({ length: 250 }, (_, i) =>
    makeCompany(i + 1, { status: i % 2 ? "Ada lowongan" : "Tidak ada lowongan" }),
  );
  const { results, allPassed, total } = runDryRun(companies, { rev: 1 });
  assert.equal(allPassed, true);
  assert.equal(total, 250);
  assert.equal(results.length, 3);
  assert.deepEqual(results.map((r) => r.total), [100, 100, 50]);
});

test("upsert menimpa baris lama (idempotent, aman diulang)", () => {
  const db = createDatabase();
  const group = [makeCompany(1, { status: "Ada lowongan" })];
  upsertGroup(db, group, 1, "2026-11-19T00:00:00.000Z");
  upsertGroup(db, [{ ...group[0], status: "Tidak ada lowongan" }], 2, "2026-11-19T01:00:00.000Z");
  const row = readBackGroup(db, group).get(1);
  assert.equal(row.status, "Tidak ada lowongan");
  assert.equal(row.rev, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM companies").get().n, 1);
});

test("groupToSql meng-escape kutip tunggal (ganda) dan membungkus transaksi", () => {
  const sql = groupToSql([makeCompany(1, { perusahaan: "PT O'Neil" })], 1, "2026-11-19T00:00:00.000Z");
  assert.match(sql, /PT O''Neil/);
  assert.match(sql, /^BEGIN TRANSACTION;/m);
  assert.match(sql, /COMMIT;\n$/);
  assert.match(sql, /ON CONFLICT\(no\) DO UPDATE/);
});

test("runLivePlan menulis 1 berkas per kelompok + zz-meta-rev.sql terakhir", () => {
  const outDir = mkdtempSync(join(tmpdir(), "karir-d1-live-"));
  const companies = Array.from({ length: 150 }, (_, i) => makeCompany(i + 1));
  const plan = runLivePlan(companies, { rev: 1, outDir });
  const files = readdirSync(outDir).sort();
  assert.deepEqual(files, ["g01-1-100.sql", "g02-101-150.sql", "zz-meta-rev.sql"]);
  assert.equal(plan.groups, 2);
  const meta = readFileSync(join(outDir, "zz-meta-rev.sql"), "utf8");
  assert.match(meta, /UPDATE meta SET value = '1' WHERE key = 'rev'/);
  assert.match(meta, /TERAKHIR/);
});

test("loadSource membaca CSV dan seed repo (terurut, 13 field)", () => {
  for (const source of ["csv", "seed"]) {
    const companies = loadSource(source);
    assert.ok(companies.length > 0, `${source} kosong`);
    for (let i = 1; i < companies.length; i++) {
      assert.ok(companies[i].no > companies[i - 1].no, `${source} tidak terurut`);
    }
    for (const f of COMPANY_FIELDS) {
      assert.ok(f in companies[0], `${source}: field ${f} hilang`);
    }
  }
  // CSV dan seed memuat jumlah yang sama (dijaga check-consistency.py).
  assert.equal(loadSource("csv").length, loadSource("seed").length);
});
