/* Tes Worker API karir-data (P-08, H1) — delta by marker + fallback.
 * Dijalankan: node --test d1/ (dari akar repo).
 * Binding D1 dimock dengan adaptor di atas SQLite nyata (node:sqlite)
 * sehingga kueri SQL Worker diuji sungguhan, tanpa akun Cloudflare. */

import test from "node:test";
import assert from "node:assert/strict";
import worker from "./src/index.js";
import { createDatabase } from "../scripts/import.mjs";

/* Adaptor D1 minimal: prepare().bind().all()/.first() di atas
 * node:sqlite. Semantiknya sama dengan binding D1 Worker
 * (placeholder `?`, .all() -> {results}, .first() -> baris|null). */
function d1FromSqlite(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const noBind = {
        all: async () => ({ results: stmt.all() }),
        first: async () => stmt.get() ?? null,
        bind(...params) {
          return {
            all: async () => ({ results: stmt.all(...params) }),
            first: async () => stmt.get(...params) ?? null,
            run: async () => {
              stmt.run(...params);
              return { success: true };
            },
          };
        },
      };
      return noBind;
    },
  };
}

function seedDb() {
  const db = createDatabase();
  const insert = db.prepare(
    `INSERT INTO companies (no, perusahaan, kategori, link_karir, status,
     tanggal_cek, catatan, lokasi, posisi, email_hrd, wa_hrd, kontak_lain,
     batas_lamar, gagal_cek, rev, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const rows = [
    [1, "PT Satu", "FMCG", "https://satu.test", "Ada lowongan", "2026-11-18", "", "Jakarta", "", "", "", "", "", 0, 1, "2026-11-18T00:00:00.000Z"],
    [2, "PT Dua", "Teknologi", "https://dua.test", "Tidak ada lowongan", "2026-11-18", "", "Bandung", "", "", "", "", "", 0, 1, "2026-11-18T00:00:00.000Z"],
    [3, "PT Tiga", "FMCG", "https://tiga.test", "Ada lowongan", "2026-11-19", "", "Jakarta", "", "", "", "", "", 0, 2, "2026-11-19T00:00:00.000Z"],
    [4, "PT Empat", "Ritel", "https://empat.test", "Portal tidak bisa dibuka", "2026-11-19", "", "Surabaya", "", "", "", "", "", 2, 3, "2026-11-19T01:00:00.000Z"],
  ];
  for (const r of rows) insert.run(...r);
  db.prepare("UPDATE meta SET value = '3' WHERE key = 'rev'").run();
  db.prepare("UPDATE meta SET value = '2026-11-19T01:00:00.000Z' WHERE key = 'updatedAt'").run();
  db.prepare(
    `INSERT INTO changes (id, company_no, perusahaan, from_status, to_status, checked_at, created_at, source)
     VALUES ('c1', 3, 'PT Tiga', 'Tidak ada lowongan', 'Ada lowongan', '2026-11-19', '2026-11-19T00:30:00.000Z', 'cron'),
            ('c2', 4, 'PT Empat', 'Tidak dapat diverifikasi', 'Portal tidak bisa dibuka', '2026-11-19', '2026-11-19T01:00:00.000Z', 'cron')`,
  ).run();
  return d1FromSqlite(db);
}

async function call(env, path, method = "GET") {
  const res = await worker.fetch(new Request(`https://karir-data.test${path}`, { method }), env);
  return { status: res.status, body: await res.json() };
}

test("GET /v1/meta mengembalikan rev + updatedAt dari D1", async () => {
  const env = { DB: seedDb() };
  const { status, body } = await call(env, "/v1/meta");
  assert.equal(status, 200);
  assert.equal(body.rev, 3);
  assert.equal(body.updatedAt, "2026-11-19T01:00:00.000Z");
  assert.equal(body.source, "d1");
});

test("GET /v1/delta tanpa rev = snapshot awal (semua baris rev > 0)", async () => {
  const env = { DB: seedDb() };
  const { status, body } = await call(env, "/v1/delta");
  assert.equal(status, 200);
  assert.equal(body.rev, 3);
  assert.equal(body.total, 4);
  assert.deepEqual(body.changed.map((c) => c.no), [1, 2, 3, 4]);
  assert.deepEqual(body.removed, []);
});

test("GET /v1/delta?rev=lama hanya mengembalikan baris yang berubah", async () => {
  const env = { DB: seedDb() };
  const { body } = await call(env, "/v1/delta?rev=1");
  assert.deepEqual(body.changed.map((c) => c.no), [3, 4]);
  const { body: body2 } = await call(env, "/v1/delta?rev=2");
  assert.deepEqual(body2.changed.map((c) => c.no), [4]);
});

test("GET /v1/delta?rev=saat-ini mengembalikan delta kosong", async () => {
  const env = { DB: seedDb() };
  const { status, body } = await call(env, "/v1/delta?rev=3");
  assert.equal(status, 200);
  assert.deepEqual(body.changed, []);
  assert.equal(body.rev, 3);
  assert.equal(body.total, 4);
});

test("GET /v1/delta?rev=bukan-angka -> 400", async () => {
  const env = { DB: seedDb() };
  const { status, body } = await call(env, "/v1/delta?rev=abc");
  assert.equal(status, 400);
  assert.equal(body.error.code, "BAD_REV");
});

test("delta tidak mengekspos rev per baris; gagal_cek hanya bila > 0", async () => {
  const env = { DB: seedDb() };
  const { body } = await call(env, "/v1/delta?rev=2");
  assert.equal(body.changed.length, 1);
  assert.ok(!("rev" in body.changed[0]));
  assert.equal(body.changed[0].gagal_cek, 2);
  const { body: all } = await call(env, "/v1/delta");
  assert.ok(!("gagal_cek" in all.changed[0]));
});

test("GET /v1/companies: filter status + kota + paginasi", async () => {
  const env = { DB: seedDb() };
  const { body } = await call(env, "/v1/companies?status=Ada%20lowongan");
  assert.deepEqual(body.companies.map((c) => c.no), [1, 3]);
  assert.equal(body.total, 2);
  const { body: kota } = await call(env, "/v1/companies?kota=Jakarta");
  assert.deepEqual(kota.companies.map((c) => c.no), [1, 3]);
  const { body: page } = await call(env, "/v1/companies?limit=2&offset=2");
  assert.deepEqual(page.companies.map((c) => c.no), [3, 4]);
  assert.equal(page.total, 4);
  assert.equal(page.limit, 2);
  const { body: kat } = await call(env, "/v1/companies?kategori=FMCG");
  assert.deepEqual(kat.companies.map((c) => c.no), [1, 3]);
});

test("GET /v1/companies/:no: ketemu, 404, dan nomor tidak valid", async () => {
  const env = { DB: seedDb() };
  const { status, body } = await call(env, "/v1/companies/2");
  assert.equal(status, 200);
  assert.equal(body.company.perusahaan, "PT Dua");
  const missing = await call(env, "/v1/companies/999");
  assert.equal(missing.status, 404);
  const bad = await call(env, "/v1/companies/abc");
  assert.equal(bad.status, 400);
});

test("GET /v1/changes mengembalikan umpan terbaru dulu", async () => {
  const env = { DB: seedDb() };
  const { status, body } = await call(env, "/v1/changes");
  assert.equal(status, 200);
  assert.deepEqual(body.changes.map((c) => c.id), ["c2", "c1"]);
  assert.equal(body.changes[0].companyNo, 4);
  assert.equal(body.changes[0].from, "Tidak dapat diverifikasi");
  const { body: one } = await call(env, "/v1/changes?limit=1");
  assert.equal(one.changes.length, 1);
});

test("GET /v1/stats menghitung total + per status", async () => {
  const env = { DB: seedDb() };
  const { status, body } = await call(env, "/v1/stats");
  assert.equal(status, 200);
  assert.equal(body.total, 4);
  assert.equal(body.byStatus["Ada lowongan"], 2);
  assert.equal(body.byStatus["Tidak ada lowongan"], 1);
  assert.equal(body.byStatus["Portal tidak bisa dibuka"], 1);
});

test("POST /v1/internal/* -> 501 (stub H2, belum aktif)", async () => {
  const env = { DB: seedDb() };
  const { status, body } = await call(env, "/v1/internal/write", "POST");
  assert.equal(status, 501);
  assert.equal(body.error.code, "NOT_IMPLEMENTED");
});

test("endpoint tidak dikenal -> 404; metode bukan GET -> 405", async () => {
  const env = { DB: seedDb() };
  const { status } = await call(env, "/v1/tidak-ada");
  assert.equal(status, 404);
  const post = await call(env, "/v1/meta", "POST");
  assert.equal(post.status, 405);
});

test("D1 gagal -> 502 + source unavailable (pemicu fallback klien)", async () => {
  const brokenDb = {
    prepare() {
      throw new Error("D1 meledak (simulasi)");
    },
  };
  const env = { DB: brokenDb };
  const { status, body } = await call(env, "/v1/delta?rev=0");
  assert.equal(status, 502);
  assert.equal(body.source, "unavailable");
  assert.equal(body.error.code, "D1_UNAVAILABLE");
  // Pesan error internal tidak dibocorkan.
  assert.ok(!JSON.stringify(body).includes("meledak"));
});
