/* Tes rantai fallback berlapis D1 -> Firestore -> seed (P-08, H1/H3).
 * Dijalankan: node --test d1/ (dari akar repo).
 * Ketiga lapisan dimock — tidak ada jaringan, tidak ada akun. */

import test from "node:test";
import assert from "node:assert/strict";
import { applyDelta, resolveCatalog } from "./src/client.mjs";

const SEED = [
  { no: 1, perusahaan: "PT Satu", status: "Ada lowongan" },
  { no: 2, perusahaan: "PT Dua", status: "Tidak ada lowongan" },
];
const LIVE = [
  { no: 1, perusahaan: "PT Satu", status: "Tidak ada lowongan" },
  { no: 2, perusahaan: "PT Dua", status: "Tidak ada lowongan" },
];

test("applyDelta: ubah baris, tambah baris, hapus baris, hasil terurut", () => {
  const out = applyDelta(SEED, [
    { no: 2, perusahaan: "PT Dua", status: "Ada lowongan" },
    { no: 3, perusahaan: "PT Tiga", status: "Ada lowongan" },
  ], [1]);
  assert.deepEqual(out.map((c) => c.no), [2, 3]);
  assert.equal(out[0].status, "Ada lowongan");
});

test("applyDelta dengan delta kosong mengembalikan salinan apa adanya", () => {
  assert.deepEqual(applyDelta(SEED, [], []), SEED);
  assert.deepEqual(applyDelta(null, [], []), []);
});

test("D1 sehat: delta diterapkan ke cache, source d1, rev baru", async () => {
  const result = await resolveCatalog({
    cached: { list: SEED, rev: 1 },
    fetchDelta: async (rev) => {
      assert.equal(rev, 1);
      return {
        rev: 2,
        changed: [{ no: 1, perusahaan: "PT Satu", status: "Tidak ada lowongan" }],
        removed: [],
        total: 2,
      };
    },
    refillFirestore: async () => { throw new Error("tidak boleh dipanggil"); },
    loadSeed: async () => { throw new Error("tidak boleh dipanggil"); },
  });
  assert.equal(result.source, "d1");
  assert.equal(result.rev, 2);
  assert.equal(result.list[0].status, "Tidak ada lowongan");
  assert.equal(result.list.length, 2);
});

test("D1 sehat + delta kosong: cache dipakai, tanpa baca lapisan lain", async () => {
  const result = await resolveCatalog({
    cached: { list: SEED, rev: 5 },
    fetchDelta: async () => ({ rev: 5, changed: [], removed: [], total: 2 }),
    refillFirestore: async () => { throw new Error("tidak boleh dipanggil"); },
    loadSeed: async () => { throw new Error("tidak boleh dipanggil"); },
  });
  assert.equal(result.source, "d1");
  assert.deepEqual(result.list, SEED);
});

test("D1 mati -> jatuh ke Firestore (source live)", async () => {
  const result = await resolveCatalog({
    cached: { list: SEED, rev: 1 },
    fetchDelta: async () => { throw new Error("D1 502 (simulasi)"); },
    refillFirestore: async () => ({ list: LIVE, rev: 9 }),
    loadSeed: async () => { throw new Error("tidak boleh dipanggil"); },
  });
  assert.equal(result.source, "live");
  assert.equal(result.rev, 9);
  assert.deepEqual(result.list, LIVE);
});

test("D1 + Firestore mati -> jatuh ke seed (source seed), tanpa lempar", async () => {
  const result = await resolveCatalog({
    cached: null,
    fetchDelta: async () => { throw new Error("D1 502"); },
    refillFirestore: async () => { throw new Error("Firestore 429"); },
    loadSeed: async () => SEED,
  });
  assert.equal(result.source, "seed");
  assert.equal(result.rev, null);
  assert.deepEqual(result.list, SEED);
});

test("tanpa cache + D1 sehat: snapshot awal dari delta rev=0", async () => {
  const result = await resolveCatalog({
    cached: null,
    fetchDelta: async (rev) => {
      assert.equal(rev, 0);
      return { rev: 1, changed: SEED, removed: [], total: 2 };
    },
    refillFirestore: async () => { throw new Error("tidak boleh dipanggil"); },
    loadSeed: async () => { throw new Error("tidak boleh dipanggil"); },
  });
  assert.equal(result.source, "d1");
  assert.deepEqual(result.list, SEED);
});
