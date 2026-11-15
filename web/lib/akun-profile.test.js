/* Test saveUserProfile + penanda hapus localStorage (AKUN-14),
 * memakai test runner bawaan Node. Dijalankan dengan:
 *   node --test lib/akun-profile.test.js
 * (koordinator menambahkan berkas ini ke skrip `npm test`.)
 *
 * syncTrackers/pushTracker/deleteTracker SUDAH teruji penuh di
 * lib/tracker-sync.test.js (mock Firestore: gabung, tombstone,
 * batch 500, gagal offline/kuota) dan tidak diulang di sini.
 * Yang dites di sini adalah celahnya: saveUserProfile (belum ada
 * test sama sekali) dan pembantu penanda hapus localStorage
 * (tombstoneKeyFor/readTombstones/writeTombstones/recordTombstone —
 * dipakai wipeAll di /pengaturan), plus wiring smoke /pengaturan.
 *
 * saveUserProfile mengimpor Firebase dinamis, jadi kedua impor itu
 * dialihkan ke stub lewat firebase-stub-loader.mjs (pola yang sama
 * dengan route-test-loader.mjs): tidak ada jaringan, tidak ada
 * kuota baca live, tidak ada kredensial asli. */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* Loader stub Firebase harus terdaftar SEBELUM tracker-sync.js
 * diimpor, karena itu tracker-sync.js diimpor dinamis di bawah. */
register("./firebase-stub-loader.mjs", import.meta.url);

const {
  saveUserProfile,
  tombstoneKeyFor,
  readTombstones,
  writeTombstones,
  recordTombstone,
} = await import("./tracker-sync.js");

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");

function baca(relatif) {
  return readFileSync(join(WEB, relatif), "utf-8");
}

/* --- Stub localStorage (pola app/onboarding.test.js) --- */
function makeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

let windowAsli;

function installWindow(storage) {
  windowAsli = globalThis.window;
  globalThis.window = { localStorage: storage };
}

beforeEach(() => {
  globalThis.__t16bFirestoreStub = { calls: [], fail: false };
  installWindow(makeStorage());
});

afterEach(() => {
  if (windowAsli === undefined) delete globalThis.window;
  else globalThis.window = windowAsli;
  delete globalThis.__t16bFirestoreStub;
});

describe("saveUserProfile (mock Firestore)", () => {
  it("pengguna tidak ada: gagal tanpa menyentuh Firestore", async () => {
    for (const pengguna of [null, undefined, {}, { uid: "" }, { uid: 12 }]) {
      const hasil = await saveUserProfile(pengguna);
      assert.deepEqual(hasil, { ok: false, error: "Pengguna tidak ada." });
    }
    assert.equal(globalThis.__t16bFirestoreStub.calls.length, 0);
  });

  it("pengguna sah: tulis user_profiles/{uid} dengan merge", async () => {
    const hasil = await saveUserProfile({
      uid: "u1",
      email: "pengguna@contoh.id",
      displayName: "Pengguna Uji",
    });
    assert.deepEqual(hasil, { ok: true });
    const calls = globalThis.__t16bFirestoreStub.calls;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].ref.path, "user_profiles/u1");
    assert.equal(calls[0].data.email, "pengguna@contoh.id");
    assert.equal(calls[0].data.displayName, "Pengguna Uji");
    assert.ok(!Number.isNaN(Date.parse(calls[0].data.updatedAt)));
    assert.deepEqual(calls[0].options, { merge: true });
  });

  it("email/displayName bukan string ditulis sebagai string kosong", async () => {
    const hasil = await saveUserProfile({
      uid: "u1",
      email: 123,
      displayName: null,
    });
    assert.deepEqual(hasil, { ok: true });
    const data = globalThis.__t16bFirestoreStub.calls[0].data;
    assert.equal(data.email, "");
    assert.equal(data.displayName, "");
  });

  it("email/displayName tidak ada ditulis sebagai string kosong", async () => {
    const hasil = await saveUserProfile({ uid: "u1" });
    assert.deepEqual(hasil, { ok: true });
    const data = globalThis.__t16bFirestoreStub.calls[0].data;
    assert.equal(data.email, "");
    assert.equal(data.displayName, "");
  });

  it("tulis gagal: { ok: false }, tidak pernah melempar", async () => {
    globalThis.__t16bFirestoreStub.fail = true;
    const hasil = await saveUserProfile({
      uid: "u1",
      email: "pengguna@contoh.id",
      displayName: "",
    });
    assert.deepEqual(hasil, { ok: false, error: "Profil gagal disimpan." });
  });
});

describe("penanda hapus localStorage (dipakai wipeAll /pengaturan)", () => {
  it("tombstoneKeyFor: per akun, tanpa uid kembali ke kunci global", () => {
    assert.equal(tombstoneKeyFor("u1"), "karir-lamaran-dihapus:u1");
    assert.equal(tombstoneKeyFor(), "karir-lamaran-dihapus");
    assert.equal(tombstoneKeyFor(""), "karir-lamaran-dihapus");
    assert.equal(tombstoneKeyFor(null), "karir-lamaran-dihapus");
  });

  it("tulis lalu baca mengembalikan peta yang sama", () => {
    const peta = { 12: "2026-11-12T10:00:00.000Z" };
    assert.equal(writeTombstones(peta, "u1"), true);
    assert.deepEqual(readTombstones("u1"), peta);
  });

  it("penanda per akun terisolasi (AKUN-06)", () => {
    writeTombstones({ 12: "2026-11-12T10:00:00.000Z" }, "u1");
    writeTombstones({ 34: "2026-11-12T11:00:00.000Z" }, "u2");
    assert.deepEqual(readTombstones("u1"), {
      12: "2026-11-12T10:00:00.000Z",
    });
    assert.deepEqual(readTombstones("u2"), {
      34: "2026-11-12T11:00:00.000Z",
    });
    assert.deepEqual(readTombstones(), {});
  });

  it("JSON rusak atau bentuk salah: baca kosong, bukan throw", () => {
    installWindow(
      makeStorage({ "karir-lamaran-dihapus:u1": "{bukan json" }),
    );
    assert.deepEqual(readTombstones("u1"), {});
    installWindow(
      makeStorage({ "karir-lamaran-dihapus:u1": JSON.stringify([1, 2]) }),
    );
    assert.deepEqual(readTombstones("u1"), {});
    installWindow(
      makeStorage({
        "karir-lamaran-dihapus:u1": JSON.stringify({
          12: "2026-11-12T10:00:00.000Z",
          34: 42,
        }),
      }),
    );
    assert.deepEqual(readTombstones("u1"), {
      12: "2026-11-12T10:00:00.000Z",
    });
  });

  it("recordTombstone mencatat waktu sekarang untuk nomor sah", () => {
    const hasil = recordTombstone(12, "u1");
    assert.equal(Object.keys(hasil).length, 1);
    assert.ok(!Number.isNaN(Date.parse(hasil[12])));
    assert.deepEqual(readTombstones("u1"), hasil);
  });

  it("recordTombstone nomor tidak sah: peta tidak berubah", () => {
    writeTombstones({ 12: "2026-11-12T10:00:00.000Z" }, "u1");
    for (const no of [0, 10001, "bukan-angka", null]) {
      assert.deepEqual(recordTombstone(no, "u1"), {
        12: "2026-11-12T10:00:00.000Z",
      });
    }
    assert.deepEqual(readTombstones("u1"), {
      12: "2026-11-12T10:00:00.000Z",
    });
  });

  it("tanpa window (server): baca kosong, tulis false, tidak ada yang tersimpan", () => {
    const saved = globalThis.window;
    try {
      delete globalThis.window;
      assert.deepEqual(readTombstones("u1"), {});
      assert.equal(writeTombstones({ 12: "x" }, "u1"), false);
      /* recordTombstone mengembalikan peta yang hendak dicatat
       * (kontraknya: peta terbaru), tetapi tanpa window tidak ada
       * yang tersimpan — baca berikut tetap kosong. Tidak ada
       * pemanggil yang memakai nilai kembaliannya (ketiga pemanggil
       * mengabaikannya), jadi perilaku ini tidak berdampak. */
      const hasil = recordTombstone(12, "u1");
      assert.equal(Object.keys(hasil).length, 1);
      assert.deepEqual(readTombstones("u1"), {});
    } finally {
      globalThis.window = saved;
    }
  });

  it("storage menolak tulis: false, tanpa throw", () => {
    installWindow({
      getItem: () => null,
      setItem: () => {
        throw new Error("storage penuh");
      },
      removeItem: () => {},
    });
    assert.equal(writeTombstones({ 12: "x" }, "u1"), false);
    assert.deepEqual(readTombstones("u1"), {});
  });
});

describe("wiring panel akun + /pengaturan (AKUN-14)", () => {
  it("auth-panel.js memanggil saveUserProfile saat masuk/daftar", () => {
    const panel = baca("app/auth-panel.js");
    assert.ok(panel.includes("saveUserProfile"));
    assert.ok(panel.includes("tracker-sync"));
    /* Dipanggil sekali sesudah masuk/daftar berhasil (bukan tiap
     * render): hasil sign-in diteruskan ke saveUserProfile. */
    assert.match(panel, /saveUserProfile\(u\)/);
  });

  it("pengaturan/page.js menampilkan seksi akun (AKUN-11)", () => {
    const page = baca("app/pengaturan/page.js");
    assert.ok(page.includes("labels.account"));
    assert.ok(page.includes("labels.signedInAs"));
    assert.ok(page.includes("labels.emailVerified"));
    assert.ok(page.includes("labels.emailNotVerified"));
    assert.ok(page.includes("labels.verifyEmail"));
    assert.ok(page.includes("labels.closeAccount"));
    assert.ok(page.includes("labels.notSignedIn"));
    assert.ok(page.includes("useAuthUser"));
  });

  it("wipeAll menghapus data lokal + tanda lamaran di akun", () => {
    const page = baca("app/pengaturan/page.js");
    assert.ok(page.includes("clearLocalData(window.localStorage)"));
    assert.ok(page.includes("deleteTrackedFromAccount(nos)"));
    assert.ok(page.includes("recordTombstone(no, uid)"));
    assert.ok(page.includes("clearAllTrackerStorage()"));
  });

  it("unduh data memakai buildAccountExport dari lib/account-data", () => {
    const page = baca("app/pengaturan/page.js");
    assert.ok(page.includes("buildAccountExport("));
    assert.ok(page.includes("labels.downloadJson"));
  });

  it("smoke-check.mjs punya cek GET /pengaturan 200 + judul halaman", () => {
    const smoke = baca("scripts/smoke-check.mjs");
    assert.ok(smoke.includes("async function checkPengaturan()"));
    assert.ok(smoke.includes('fetchText("/pengaturan")'));
    assert.ok(smoke.includes('"Pengaturan"'));
    assert.ok(smoke.includes("await checkPengaturan();"));
  });
});
