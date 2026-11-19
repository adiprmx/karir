/* Tes perbandingan divergensi D1 vs Firestore (P-08, H2).
 * Dijalankan: node --test d1/ (dari akar repo). */

import test from "node:test";
import assert from "node:assert/strict";
import { compareCatalogs, countByStatus } from "./compare.mjs";

function makeCompany(no, overrides = {}) {
  return {
    no,
    perusahaan: `PT ${no}`,
    kategori: "Teknologi",
    link_karir: `https://contoh.test/${no}`,
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

test("snapshot identik -> identical, 0 selisih", () => {
  const a = [makeCompany(1), makeCompany(2)];
  const b = [makeCompany(1), makeCompany(2)];
  const r = compareCatalogs(a, b);
  assert.equal(r.identical, true);
  assert.deepEqual(r.onlyA, []);
  assert.deepEqual(r.onlyB, []);
  assert.deepEqual(r.differing, []);
});

test("field berbeda dilaporkan dengan nama field-nya", () => {
  const a = [makeCompany(1)];
  const b = [makeCompany(1, { status: "Tidak ada lowongan", lokasi: "Bandung" })];
  const r = compareCatalogs(a, b);
  assert.equal(r.identical, false);
  assert.equal(r.differing.length, 1);
  assert.equal(r.differing[0].no, 1);
  assert.deepEqual(r.differing[0].fields, ["status", "lokasi"]);
});

test("dokumen hilang di satu sisi dilaporkan per sisi", () => {
  const a = [makeCompany(1), makeCompany(2)];
  const b = [makeCompany(2), makeCompany(3)];
  const r = compareCatalogs(a, b);
  assert.equal(r.identical, false);
  assert.deepEqual(r.onlyA, [1]);
  assert.deepEqual(r.onlyB, [3]);
});

test("countByStatus menghitung per status untuk sinyal cepat harian", () => {
  const list = [
    makeCompany(1, { status: "Ada lowongan" }),
    makeCompany(2, { status: "Ada lowongan" }),
    makeCompany(3, { status: "Portal tidak bisa dibuka" }),
  ];
  assert.deepEqual(countByStatus(list), {
    "Ada lowongan": 2,
    "Portal tidak bisa dibuka": 1,
  });
});

test("divergensi 1 field dari 743 tetap terdeteksi (bukan ambang persen)", () => {
  const a = Array.from({ length: 743 }, (_, i) => makeCompany(i + 1));
  const b = Array.from({ length: 743 }, (_, i) => makeCompany(i + 1));
  b[500] = { ...b[500], tanggal_cek: "2026-11-18" };
  const r = compareCatalogs(a, b);
  assert.equal(r.identical, false);
  assert.equal(r.differing.length, 1);
  assert.equal(r.differing[0].no, 501);
  // Selama H2, selisih sekecil apa pun menghentikan hitungan 3 hari.
});
