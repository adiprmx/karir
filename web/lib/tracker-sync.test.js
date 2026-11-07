/* Tes unit untuk lib/tracker-sync.js, memakai test runner bawaan Node.
 * Dijalankan dengan: node --test lib/tracker-sync.test.js
 * Yang dites: mergeTrackers, fungsi murni penggabung pelacak lokal
 * dan pelacak akun. Tidak ada jaringan, tidak ada Firebase. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeTrackers, TRACKER_STATUSES } from "./tracker-sync.js";

function entry(overrides = {}) {
  return {
    companyNo: 12,
    status: "Ditandai",
    tanggal: "2026-11-01",
    catatan: "",
    ...overrides,
  };
}

describe("mergeTrackers", () => {
  it("daftar lokal saja kembali apa adanya", () => {
    const merged = mergeTrackers({ 12: entry() }, {});
    assert.deepEqual(merged, { 12: entry() });
  });

  it("daftar akun saja kembali apa adanya", () => {
    const merged = mergeTrackers({}, { 12: entry() });
    assert.deepEqual(merged, { 12: entry() });
  });

  it("nomor yang sama: tanggal yang lebih baru menang", () => {
    const local = { 12: entry({ tanggal: "2026-11-01", status: "Ditandai" }) };
    const remote = {
      12: entry({ tanggal: "2026-11-05", status: "Sudah dilamar" }),
    };
    assert.equal(mergeTrackers(local, remote)[12].status, "Sudah dilamar");
    assert.equal(mergeTrackers(remote, local)[12].status, "Sudah dilamar");
  });

  it("nomor yang sama dengan tanggal yang sama: entri lokal dipertahankan", () => {
    const local = { 12: entry({ status: "Ditandai" }) };
    const remote = { 12: entry({ status: "Dipanggil" }) };
    assert.equal(mergeTrackers(local, remote)[12].status, "Ditandai");
  });

  it("nomor yang beda: keduanya disimpan", () => {
    const merged = mergeTrackers(
      { 12: entry({ companyNo: 12 }) },
      { 34: entry({ companyNo: 34, status: "Ditolak" }) },
    );
    assert.equal(Object.keys(merged).length, 2);
    assert.equal(merged[12].status, "Ditandai");
    assert.equal(merged[34].status, "Ditolak");
  });

  it("daftar kosong di kedua sisi tidak error", () => {
    assert.deepEqual(mergeTrackers({}, {}), {});
    assert.deepEqual(mergeTrackers(null, undefined), {});
    assert.deepEqual(mergeTrackers([], []), {});
  });

  it("menerima larik dan bentuk localStorage dengan field no", () => {
    const merged = mergeTrackers(
      [{ no: 12, status: "Ditandai", tanggal: "2026-11-01", catatan: "" }],
      { 34: { no: 34, status: "Ditolak", tanggal: "", catatan: "x" } },
    );
    assert.equal(merged[12].companyNo, 12);
    assert.equal(merged[34].companyNo, 34);
  });

  it("entri dengan nomor atau status tidak sah dibuang", () => {
    const merged = mergeTrackers(
      {
        0: entry({ companyNo: 0 }),
        12: entry(),
        99: entry({ companyNo: 99, status: "Tidak dikenal" }),
      },
      {},
    );
    assert.deepEqual(Object.keys(merged), ["12"]);
  });

  it("catatan dipotong di 200 huruf dan tanggal yang bukan tanggal dikosongkan", () => {
    const merged = mergeTrackers(
      {
        12: entry({ tanggal: "kemarin", catatan: "a".repeat(250) }),
      },
      {},
    );
    assert.equal(merged[12].tanggal, "");
    assert.equal(merged[12].catatan.length, 200);
  });

  it("daftar status pelacak berisi empat nilai yang dipakai tracker", () => {
    assert.deepEqual(TRACKER_STATUSES, [
      "Ditandai",
      "Sudah dilamar",
      "Dipanggil",
      "Ditolak",
    ]);
  });
});
