/* Tes unit untuk lib/tracker-sync.js, memakai test runner bawaan Node.
 * Dijalankan dengan: node --test lib/tracker-sync.test.js
 * Yang dites: mergeTrackers, fungsi murni penggabung pelacak lokal
 * dan pelacak akun; applyTombstones dan pruneTombstones, fungsi
 * murni penanda hapus; serta alur hapus-lalu-sinkron (QA-01).
 * Tidak ada jaringan, tidak ada Firebase. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyTombstones,
  mergeTrackers,
  pruneTombstones,
  TRACKER_STATUSES,
} from "./tracker-sync.js";

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

describe("applyTombstones", () => {
  const REMOTE_LAMA = "2026-11-10T10:00:00.000Z";
  const WAKTU_HAPUS = "2026-11-12T10:00:00.000Z";
  const REMOTE_BARU = "2026-11-13T10:00:00.000Z";

  it("entri yang ditandai hapus tidak muncul di hasil gabung", () => {
    const merged = { 12: entry(), 34: entry({ companyNo: 34 }) };
    const remote = { 12: { ...entry(), updatedAt: REMOTE_LAMA } };
    const res = applyTombstones(merged, remote, { 12: WAKTU_HAPUS });
    assert.deepEqual(Object.keys(res.merged), ["34"]);
    assert.deepEqual(res.toDelete, ["12"]);
    assert.deepEqual(res.remainingTombstones, { 12: WAKTU_HAPUS });
  });

  it("tombstone kedaluwarsa oleh updatedAt akun yang lebih baru: entri dipertahankan", () => {
    const merged = { 12: entry() };
    const remote = { 12: { ...entry(), updatedAt: REMOTE_BARU } };
    const res = applyTombstones(merged, remote, { 12: WAKTU_HAPUS });
    assert.deepEqual(Object.keys(res.merged), ["12"]);
    assert.deepEqual(res.toDelete, []);
    assert.deepEqual(res.remainingTombstones, {});
  });

  it("tombstone tanpa dokumen akun: entri hilang dari gabung, tidak ada hapus di akun", () => {
    const merged = { 12: entry() };
    const res = applyTombstones(merged, {}, { 12: WAKTU_HAPUS });
    assert.deepEqual(res.merged, {});
    assert.deepEqual(res.toDelete, []);
    assert.deepEqual(res.remainingTombstones, {});
  });

  it("dokumen akun tanpa updatedAt dianggap lebih lama: niat hapus menang", () => {
    const merged = { 12: entry() };
    const remote = { 12: entry() };
    const res = applyTombstones(merged, remote, { 12: WAKTU_HAPUS });
    assert.deepEqual(res.merged, {});
    assert.deepEqual(res.toDelete, ["12"]);
  });

  it("tanpa tombstone, hasil gabung tidak berubah", () => {
    const merged = { 12: entry() };
    const res = applyTombstones(merged, { 12: entry() }, {});
    assert.deepEqual(res.merged, merged);
    assert.deepEqual(res.toDelete, []);
    assert.deepEqual(res.remainingTombstones, {});
  });

  it("masukan tidak diubah", () => {
    const merged = { 12: entry() };
    const remote = { 12: { ...entry(), updatedAt: REMOTE_LAMA } };
    const tombstones = { 12: WAKTU_HAPUS };
    applyTombstones(merged, remote, tombstones);
    assert.deepEqual(Object.keys(merged), ["12"]);
    assert.deepEqual(tombstones, { 12: WAKTU_HAPUS });
  });
});

describe("pruneTombstones", () => {
  it("menghapus tombstone yang sudah terkonfirmasi terhapus", () => {
    const pruned = pruneTombstones(
      { 12: "2026-11-12T10:00:00.000Z", 34: "2026-11-12T11:00:00.000Z" },
      ["12"],
    );
    assert.deepEqual(pruned, { 34: "2026-11-12T11:00:00.000Z" });
  });

  it("daftar hapus kosong atau tidak cocok tidak mengubah apa pun", () => {
    const tombstones = { 12: "2026-11-12T10:00:00.000Z" };
    assert.deepEqual(pruneTombstones(tombstones, []), tombstones);
    assert.deepEqual(pruneTombstones(tombstones, ["99"]), tombstones);
    assert.deepEqual(tombstones, { 12: "2026-11-12T10:00:00.000Z" });
  });
});

/* QA-01 — regresi LAM-01: lamaran yang dihapus tidak boleh hidup
 * lagi setelah sinkron. Yang diuji di sini adalah logika murninya
 * (merge + tombstone + prune); repo ini belum punya mock Firestore,
 * jadi uji integrasi deleteDoc/syncTrackers ke Firebase dilakukan
 * manual setelah merge (hapus -> keluar -> masuk -> tetap terhapus). */
describe("hapus lalu sinkron (QA-01)", () => {
  it("hapus lalu sinkron: entri tetap terhapus", () => {
    const remote = {
      12: { ...entry(), updatedAt: "2026-11-10T10:00:00.000Z" },
    };
    const tombstones = { 12: "2026-11-12T10:00:00.000Z" };
    const merged = mergeTrackers({}, remote);
    assert.equal(merged[12].status, "Ditandai"); // tanpa tombstone, hidup lagi
    const res = applyTombstones(merged, remote, tombstones);
    assert.deepEqual(res.merged, {});
    assert.deepEqual(res.toDelete, ["12"]);
    assert.deepEqual(
      pruneTombstones(res.remainingTombstones, res.toDelete),
      {},
    );
  });

  it("tambah lagi dari perangkat lain setelah hapus: entri kembali", () => {
    const remote = {
      12: {
        ...entry({ status: "Sudah dilamar" }),
        updatedAt: "2026-11-13T10:00:00.000Z",
      },
    };
    const tombstones = { 12: "2026-11-12T10:00:00.000Z" };
    const merged = mergeTrackers({}, remote);
    const res = applyTombstones(merged, remote, tombstones);
    assert.equal(res.merged[12].status, "Sudah dilamar");
    assert.deepEqual(res.remainingTombstones, {});
  });
});
