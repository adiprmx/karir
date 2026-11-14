/* Tes lib/changes.js — umpan perubahan + timeout body (BE-09).
 * Dijalankan dengan: node --test lib/changes.test.js
 * (koordinator menambahkan file ini ke skrip "test" di package.json).
 * Semua fetch di sini mock: tidak ada jaringan, tidak ada token
 * atau secret asli yang dipakai maupun dicatat.
 *
 * Yang diuji:
 * (a) Bentuk pemetaan dokumen + urutan terbaru dulu + batas limit.
 * (b) Cache memori 1 jam: panggilan kedua tanpa fetch ulang.
 * (c) Fail-open: Firestore gagal + cache basi -> cache basi dipakai;
 *     dingin + gagal -> lempar (kontrak: pemanggil /api/changes yang
 *     mengubahnya menjadi daftar kosong).
 * (d) BE-09: res.json() yang stall ditolak setelah timeout 5 detik,
 *     bukan menggantung selamanya; dengan cache basi, cache dipakai. */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";

/* changes.js membaca env saat modul dimuat, jadi env dipasang
 * SEBELUM impor dinamis. Nilai di sini tiruan, bukan kredensial. */
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "kunci-uji";

const { getChanges, revalidateChanges } = await import("./changes.js");

const fetchAsli = globalThis.fetch;
const nowAsli = Date.now;

after(() => {
  globalThis.fetch = fetchAsli;
  Date.now = nowAsli;
});

/* Geser jam maju N milidetik (untuk mengedepankan TTL cache tanpa
 * menunggu). Kembalikan fungsi pemulih. */
function geserJam(ms) {
  const base = nowAsli();
  Date.now = () => base + ms;
  return () => {
    Date.now = nowAsli;
  };
}

function changeDoc(id, perusahaan, from, to, createdAt) {
  return {
    name: `projects/proyek-uji/databases/(default)/documents/changes/${id}`,
    fields: {
      companyNo: { integerValue: "1" },
      perusahaan: { stringValue: perusahaan },
      from: { stringValue: from },
      to: { stringValue: to },
      checkedAt: { stringValue: "2026-11-14" },
      createdAt: { stringValue: createdAt },
    },
  };
}

const DOKUMEN = [
  changeDoc(
    "a1",
    "PT Lama",
    "Ada lowongan",
    "Tidak ada lowongan",
    "2026-11-13T10:00:00.000Z",
  ),
  changeDoc(
    "a2",
    "PT Baru",
    "Tidak dapat diverifikasi",
    "Ada lowongan",
    "2026-11-14T01:00:00.000Z",
  ),
];

/* Mock fetch yang bisa diatur per skenario lewat `mode`:
 * - status: 200 | 429 | 500 (baca koleksi changes)
 * - jsonStall: true = header 200 tiba tetapi body tidak pernah
 *   selesai (res.json() stall)
 * - jsonThrows: true = res.json() menolak (body bukan JSON)
 * - documents: dokumen yang dikembalikan bila status 200. */
function pasangMock(rec, mode) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    rec.panggilan.push(u);
    await new Promise((r) => setTimeout(r, 2));
    if (mode.status !== 200) {
      return { ok: false, status: mode.status, json: async () => ({}) };
    }
    if (mode.jsonStall) {
      return { ok: true, status: 200, json: () => new Promise(() => {}) };
    }
    if (mode.jsonThrows) {
      return {
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("JSON rusak");
        },
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ documents: mode.documents ?? DOKUMEN }),
    };
  };
}

function modeOk(overrides = {}) {
  return { status: 200, jsonStall: false, jsonThrows: false, ...overrides };
}

describe("getChanges: pemetaan, urutan, dan batas", () => {
  it("(a) dokumen dipetakan dan diurutkan terbaru dulu", async () => {
    const rec = { panggilan: [] };
    pasangMock(rec, modeOk());
    revalidateChanges();
    const list = await getChanges(10);
    assert.equal(list.length, 2);
    assert.equal(list[0].id, "a2");
    assert.equal(list[0].perusahaan, "PT Baru");
    assert.equal(list[0].from, "Tidak dapat diverifikasi");
    assert.equal(list[0].to, "Ada lowongan");
    assert.equal(list[0].companyNo, 1);
    assert.equal(list[0].checkedAt, "2026-11-14");
    assert.equal(list[1].id, "a1");
    assert.equal(rec.panggilan.length, 1);
    assert.match(rec.panggilan[0], /pageSize=10/);
  });

  it("(a) limit dijepit ke 1..50", async () => {
    const rec = { panggilan: [] };
    pasangMock(rec, modeOk());
    revalidateChanges();
    await getChanges(100);
    assert.match(rec.panggilan[0], /pageSize=50/);
    await getChanges(0);
    assert.match(rec.panggilan[1], /pageSize=10/);
  });

  it("(b) panggilan kedua dalam TTL memakai cache tanpa fetch ulang", async () => {
    const rec = { panggilan: [] };
    pasangMock(rec, modeOk());
    revalidateChanges();
    const pertama = await getChanges(10);
    const kedua = await getChanges(10);
    assert.equal(rec.panggilan.length, 1);
    assert.equal(pertama, kedua);
  });
});

describe("getChanges: fail-open saat Firestore bermasalah", () => {
  it("(c) dingin + Firestore 500 -> lempar (pemanggil yang memutuskan)", async () => {
    const rec = { panggilan: [] };
    pasangMock(rec, modeOk({ status: 500 }));
    revalidateChanges();
    await assert.rejects(getChanges(10), /HTTP 500/);
  });

  it("(c) cache basi dipakai bila Firestore gagal setelah sukses", async () => {
    const rec = { panggilan: [] };
    const mode = modeOk();
    pasangMock(rec, mode);
    revalidateChanges();
    const pertama = await getChanges(10);
    assert.equal(pertama.length, 2);
    /* Jam maju 61 menit (TTL 1 jam habis), lalu Firestore 429. */
    const pulihkan = geserJam(61 * 60 * 1000);
    try {
      mode.status = 429;
      const kedua = await getChanges(10);
      assert.equal(kedua, pertama);
      assert.equal(rec.panggilan.length, 2);
    } finally {
      pulihkan();
    }
  });

  it("(c) body bukan JSON diperlakukan sebagai kegagalan baca", async () => {
    const rec = { panggilan: [] };
    pasangMock(rec, modeOk({ jsonThrows: true }));
    revalidateChanges();
    await assert.rejects(getChanges(10), /JSON rusak/);
  });
});

describe("getChanges: BE-09 timeout res.json()", () => {
  it("(d) body stall dingin -> ditolak dalam waktu terbatas (bukan hang)", async () => {
    const rec = { panggilan: [] };
    pasangMock(rec, modeOk({ jsonStall: true }));
    revalidateChanges();
    /* nowAsli (bukan Date.now): jam bisa digeser di test lain. */
    const t0 = nowAsli();
    await assert.rejects(getChanges(10), /Timeout membaca body respons/);
    const elapsed = nowAsli() - t0;
    /* Timeout body 5 detik: tanpa perbaikan ini panggilan tidak
     * pernah kembali. Batas bawah membuktikan penantian itu memang
     * timeout body; batas atas longgar untuk CI yang lambat. */
    assert.ok(elapsed >= 4000, `elapsed ${elapsed} ms`);
    assert.ok(elapsed < 15_000, `elapsed ${elapsed} ms`);
  });

  it("(d) body stall + cache basi -> cache basi dipakai", async () => {
    const rec = { panggilan: [] };
    const mode = modeOk();
    pasangMock(rec, mode);
    revalidateChanges();
    const pertama = await getChanges(10);
    assert.equal(pertama.length, 2);
    /* Jam maju 61 menit (TTL habis), lalu body stall. */
    const pulihkan = geserJam(61 * 60 * 1000);
    try {
      mode.jsonStall = true;
      /* nowAsli: Date.now sedang digeser (beku) di test ini. */
      const t0 = nowAsli();
      const kedua = await getChanges(10);
      const elapsed = nowAsli() - t0;
      assert.equal(kedua, pertama);
      assert.ok(elapsed >= 4000, `elapsed ${elapsed} ms`);
      assert.ok(elapsed < 15_000, `elapsed ${elapsed} ms`);
    } finally {
      pulihkan();
    }
  });
});
