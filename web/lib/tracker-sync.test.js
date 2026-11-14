/* Tes unit untuk lib/tracker-sync.js, memakai test runner bawaan Node.
 * Dijalankan dengan: node --test lib/tracker-sync.test.js
 * Yang dites: mergeTrackers, fungsi murni penggabung pelacak lokal
 * dan pelacak akun (termasuk penyelesaian bentrok dengan updatedAt,
 * LAM-05); applyTombstones dan pruneTombstones, fungsi murni
 * penanda hapus; alur hapus-lalu-sinkron (QA-01); classifySyncError;
 * serta syncTrackers, pushTracker, dan deleteTracker dengan mock
 * Firestore (tanpa jaringan, tanpa kuota baca live). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyTombstones,
  classifySyncError,
  deleteTracker,
  mergeTrackers,
  pruneTombstones,
  pushTracker,
  syncTrackers,
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

/* QA-01 (regresi LAM-01): lamaran yang dihapus tidak boleh hidup
 * lagi setelah sinkron. Yang diuji di sini adalah logika murninya
 * (merge + tombstone + prune); uji integrasi dengan mock Firestore
 * ada di describe syncTrackers di bawah. Uji manual ke Firebase
 * live tetap dicatat: hapus -> keluar -> masuk -> tetap terhapus. */
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

/* LAM-05: bentrok diselesaikan dengan updatedAt (waktu ubah),
 * bukan tanggal lamaran yang bisa diubah pengguna. */
describe("mergeTrackers dengan updatedAt (LAM-05)", () => {
  it("updatedAt akun lebih baru menang walau tanggal lamarannya lebih lama", () => {
    const local = {
      12: entry({
        tanggal: "2026-11-10",
        status: "Ditandai",
        updatedAt: "2026-11-10T10:00:00.000Z",
      }),
    };
    const remote = {
      12: entry({
        tanggal: "2026-11-01",
        status: "Dipanggil",
        updatedAt: "2026-11-12T10:00:00.000Z",
      }),
    };
    assert.equal(mergeTrackers(local, remote)[12].status, "Dipanggil");
  });

  it("updatedAt lokal lebih baru menang walau tanggal lamarannya lebih lama", () => {
    const local = {
      12: entry({
        tanggal: "2026-11-01",
        status: "Ditolak",
        updatedAt: "2026-11-12T10:00:00.000Z",
      }),
    };
    const remote = {
      12: entry({
        tanggal: "2026-11-10",
        status: "Ditandai",
        updatedAt: "2026-11-10T10:00:00.000Z",
      }),
    };
    assert.equal(mergeTrackers(local, remote)[12].status, "Ditolak");
  });

  it("updatedAt sama: entri lokal dipertahankan", () => {
    const local = {
      12: entry({ status: "Ditandai", updatedAt: "2026-11-12T10:00:00.000Z" }),
    };
    const remote = {
      12: entry({ status: "Dipanggil", updatedAt: "2026-11-12T10:00:00.000Z" }),
    };
    assert.equal(mergeTrackers(local, remote)[12].status, "Ditandai");
  });

  it("satu sisi tanpa updatedAt: fallback ke tanggal lamaran", () => {
    const local = { 12: entry({ tanggal: "2026-11-01", status: "Ditandai" }) };
    const remote = {
      12: entry({
        tanggal: "2026-11-05",
        status: "Sudah dilamar",
        updatedAt: "2026-11-05T10:00:00.000Z",
      }),
    };
    assert.equal(mergeTrackers(local, remote)[12].status, "Sudah dilamar");
    const localBaru = {
      12: entry({
        tanggal: "2026-11-09",
        status: "Ditolak",
        updatedAt: "2026-11-09T10:00:00.000Z",
      }),
    };
    const remoteLama = {
      12: entry({ tanggal: "2026-11-02", status: "Ditandai" }),
    };
    assert.equal(mergeTrackers(localBaru, remoteLama)[12].status, "Ditolak");
  });

  it("updatedAt yang bukan tanggal sah diperlakukan tidak ada", () => {
    const local = {
      12: entry({
        tanggal: "2026-11-01",
        status: "Ditandai",
        updatedAt: "bukan-tanggal",
      }),
    };
    const remote = {
      12: entry({
        tanggal: "2026-11-05",
        status: "Sudah dilamar",
        updatedAt: "2026-11-05T10:00:00.000Z",
      }),
    };
    assert.equal(mergeTrackers(local, remote)[12].status, "Sudah dilamar");
  });

  it("updatedAt dipertahankan di hasil gabung", () => {
    const merged = mergeTrackers(
      { 12: entry({ updatedAt: "2026-11-12T10:00:00.000Z" }) },
      {},
    );
    assert.equal(merged[12].updatedAt, "2026-11-12T10:00:00.000Z");
  });
});

describe("classifySyncError", () => {
  it("memetakan kode Firestore ke kode status yang bisa dijelaskan", () => {
    assert.equal(classifySyncError({ code: "unavailable" }), "offline");
    assert.equal(classifySyncError({ code: "resource-exhausted" }), "sibuk");
    assert.equal(classifySyncError({ code: "permission-denied" }), "ditolak");
    assert.equal(classifySyncError({ code: "unauthenticated" }), "sesi");
    assert.equal(classifySyncError({ code: "not-found" }), "gagal");
    assert.equal(classifySyncError(new Error("boom")), "gagal");
    assert.equal(classifySyncError(null), "gagal");
    assert.equal(classifySyncError(undefined), "gagal");
  });
});

/* Mock Firestore kecil untuk menguji syncTrackers, pushTracker,
 * dan deleteTracker tanpa jaringan dan tanpa kuota baca live.
 * Bentuknya meniru pemakaian SDK di lib/tracker-sync.js:
 * collection(db, ...path), doc(ref, id), getDocs(ref),
 * writeBatch(db) dengan set/delete/commit, deleteDoc(ref),
 * setDoc(ref, data, { merge }). `failures` berisi error yang
 * dilempar tiap operasi (untuk menguji kondisi terdegradasi). */
function createMockFirestore(initial = {}, failures = {}) {
  const store = new Map(Object.entries(initial));
  const calls = { getDocs: 0, commit: 0, deleteDoc: 0, setDoc: 0 };
  const db = {};
  function collection(_db, ...path) {
    return { path: path.join("/") };
  }
  function doc(...args) {
    const first = args[0];
    if (first && typeof first === "object" && typeof first.path === "string") {
      return { path: `${first.path}/${args[1]}` };
    }
    return { path: args.slice(1).join("/") };
  }
  async function getDocs(ref) {
    calls.getDocs += 1;
    if (failures.getDocs) throw failures.getDocs;
    const prefix = `${ref.path}/`;
    const docs = [];
    store.forEach((data, path) => {
      if (path.startsWith(prefix)) {
        docs.push({
          id: path.slice(prefix.length),
          data: () => ({ ...data }),
        });
      }
    });
    return { docs };
  }
  function writeBatch() {
    const ops = [];
    return {
      set(ref, data, options) {
        ops.push({ type: "set", ref, data, options });
      },
      delete(ref) {
        ops.push({ type: "delete", ref });
      },
      async commit() {
        calls.commit += 1;
        if (failures.commit) throw failures.commit;
        ops.forEach((op) => {
          if (op.type === "delete") {
            store.delete(op.ref.path);
            return;
          }
          if (op.options && op.options.merge) {
            store.set(op.ref.path, {
              ...(store.get(op.ref.path) || {}),
              ...op.data,
            });
          } else {
            store.set(op.ref.path, { ...op.data });
          }
        });
      },
    };
  }
  async function deleteDoc(ref) {
    calls.deleteDoc += 1;
    if (failures.deleteDoc) throw failures.deleteDoc;
    store.delete(ref.path);
  }
  async function setDoc(ref, data, options) {
    calls.setDoc += 1;
    if (failures.setDoc) throw failures.setDoc;
    if (options && options.merge) {
      store.set(ref.path, { ...(store.get(ref.path) || {}), ...data });
    } else {
      store.set(ref.path, { ...data });
    }
  }
  return {
    client: { db, collection, doc, getDocs, writeBatch, deleteDoc, setDoc },
    store,
    calls,
  };
}

function firestoreError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

describe("syncTrackers (mock Firestore)", () => {
  const UID = "u1";

  it("menggabung lokal + akun dan menulis hasilnya ke akun", async () => {
    const mock = createMockFirestore({
      "user_trackers/u1/items/34": {
        companyNo: 34,
        status: "Ditolak",
        tanggal: "",
        catatan: "",
      },
    });
    const res = await syncTrackers(UID, { 12: entry() }, {}, mock.client);
    assert.equal(res.ok, true);
    assert.equal(res.localCount, 1);
    assert.equal(res.remoteCount, 1);
    assert.deepEqual(Object.keys(res.merged).sort(), ["12", "34"]);
    assert.equal(
      mock.store.get("user_trackers/u1/items/12").status,
      "Ditandai",
    );
    assert.ok(mock.store.get("user_trackers/u1/items/12").updatedAt);
    assert.equal(
      mock.store.get("user_trackers/u1/items/34").status,
      "Ditolak",
    );
  });

  it("tombstone menghapus dokumen akun dan entri dari hasil gabung", async () => {
    const mock = createMockFirestore({
      "user_trackers/u1/items/12": {
        ...entry(),
        updatedAt: "2026-11-10T10:00:00.000Z",
      },
    });
    const res = await syncTrackers(
      UID,
      {},
      { 12: "2026-11-12T10:00:00.000Z" },
      mock.client,
    );
    assert.equal(res.ok, true);
    assert.equal(res.deletedCount, 1);
    assert.deepEqual(res.merged, {});
    assert.equal(mock.store.has("user_trackers/u1/items/12"), false);
    assert.deepEqual(res.remainingTombstones, {});
  });

  it("getDocs gagal offline: kode offline, toko tidak berubah, tanpa commit", async () => {
    const mock = createMockFirestore(
      { "user_trackers/u1/items/12": entry() },
      { getDocs: firestoreError("unavailable") },
    );
    const res = await syncTrackers(UID, { 12: entry() }, {}, mock.client);
    assert.equal(res.ok, false);
    assert.equal(res.code, "offline");
    assert.equal(mock.store.size, 1);
    assert.equal(mock.calls.commit, 0);
  });

  it("kuota habis (429): kode sibuk", async () => {
    const mock = createMockFirestore(
      {},
      { getDocs: firestoreError("resource-exhausted") },
    );
    const res = await syncTrackers(UID, { 12: entry() }, {}, mock.client);
    assert.equal(res.ok, false);
    assert.equal(res.code, "sibuk");
  });

  it("commit gagal: tidak ada tulis yang diterapkan", async () => {
    const mock = createMockFirestore(
      { "user_trackers/u1/items/34": entry({ companyNo: 34 }) },
      { commit: firestoreError("unavailable") },
    );
    const res = await syncTrackers(UID, { 12: entry() }, {}, mock.client);
    assert.equal(res.ok, false);
    assert.equal(res.code, "offline");
    assert.equal(mock.store.size, 1);
    assert.equal(mock.store.has("user_trackers/u1/items/12"), false);
  });

  it("uid kosong: tidak menyentuh Firestore sama sekali", async () => {
    const mock = createMockFirestore();
    const res = await syncTrackers("", { 12: entry() }, {}, mock.client);
    assert.equal(res.ok, false);
    assert.equal(mock.calls.getDocs, 0);
    assert.equal(mock.calls.commit, 0);
  });
});

describe("pushTracker (mock Firestore)", () => {
  const UID = "u1";

  it("menulis satu entri dengan updatedAt baru", async () => {
    const mock = createMockFirestore();
    const res = await pushTracker(UID, entry(), mock.client);
    assert.equal(res.ok, true);
    assert.equal(mock.calls.setDoc, 1);
    const saved = mock.store.get("user_trackers/u1/items/12");
    assert.equal(saved.status, "Ditandai");
    assert.ok(saved.updatedAt);
  });

  it("merge: field lain di dokumen tidak hilang", async () => {
    const mock = createMockFirestore({
      "user_trackers/u1/items/12": { ...entry(), sumber: "perangkat-lain" },
    });
    const res = await pushTracker(
      UID,
      entry({ status: "Sudah dilamar" }),
      mock.client,
    );
    assert.equal(res.ok, true);
    const saved = mock.store.get("user_trackers/u1/items/12");
    assert.equal(saved.status, "Sudah dilamar");
    assert.equal(saved.sumber, "perangkat-lain");
  });

  it("entri tidak sah: gagal tanpa tulis", async () => {
    const mock = createMockFirestore();
    const res = await pushTracker(
      UID,
      entry({ status: "Tidak dikenal" }),
      mock.client,
    );
    assert.equal(res.ok, false);
    assert.equal(mock.calls.setDoc, 0);
  });

  it("setDoc gagal offline: kode offline", async () => {
    const mock = createMockFirestore(
      {},
      { setDoc: firestoreError("unavailable") },
    );
    const res = await pushTracker(UID, entry(), mock.client);
    assert.equal(res.ok, false);
    assert.equal(res.code, "offline");
    assert.equal(mock.store.size, 0);
  });
});

describe("deleteTracker (mock Firestore)", () => {
  const UID = "u1";

  it("menghapus dokumen akun", async () => {
    const mock = createMockFirestore({
      "user_trackers/u1/items/12": entry(),
    });
    const res = await deleteTracker(UID, 12, mock.client);
    assert.equal(res.ok, true);
    assert.equal(mock.store.has("user_trackers/u1/items/12"), false);
  });

  it("dokumen yang sudah tidak ada: tetap ok", async () => {
    const mock = createMockFirestore();
    const res = await deleteTracker(UID, 12, mock.client);
    assert.equal(res.ok, true);
    assert.equal(mock.calls.deleteDoc, 1);
  });

  it("nomor tidak sah: gagal tanpa memanggil deleteDoc", async () => {
    const mock = createMockFirestore();
    const res = await deleteTracker(UID, 0, mock.client);
    assert.equal(res.ok, false);
    assert.equal(mock.calls.deleteDoc, 0);
  });

  it("deleteDoc gagal: kode dari error", async () => {
    const mock = createMockFirestore(
      { "user_trackers/u1/items/12": entry() },
      { deleteDoc: firestoreError("resource-exhausted") },
    );
    const res = await deleteTracker(UID, 12, mock.client);
    assert.equal(res.ok, false);
    assert.equal(res.code, "sibuk");
    assert.equal(mock.store.has("user_trackers/u1/items/12"), true);
  });
});
