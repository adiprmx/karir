/* Tes deduplikasi getCompanies() di lib/companies.js.
 * Dijalankan dengan: npm test
 * Semua fetch di sini mock: tidak ada jaringan, tidak ada token
 * atau secret asli yang dipakai maupun dicatat.
 * Latar: /api/stats memanggil getCompanies(), getStats(), dan
 * getStaleCount() bersamaan, dan ketiganya memanggil getCompanies()
 * secara internal. Tanpa deduplikasi, satu request /api/stats yang
 * dingin menjalankan tiga rangkaian paginasi penuh (3x baca dokumen)
 * untuk data yang sama. */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";

/* companies.js membaca env saat modul dimuat, jadi env dipasang
 * SEBELUM impor dinamis. Nilai di sini tiruan, bukan kredensial. */
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "kunci-uji";

const {
  getCompanies,
  getStats,
  getStaleCount,
  revalidateCompanies,
} = await import("./companies.js");

const fetchAsli = globalThis.fetch;

/* Dokumen Firestore tiruan, bentuk yang dibaca docToCompany. */
function doc(no, perusahaan, status, tanggal_cek) {
  return {
    name: `projects/proyek-uji/databases/(default)/documents/companies/${no}`,
    fields: {
      no: { integerValue: String(no) },
      perusahaan: { stringValue: perusahaan },
      kategori: { stringValue: "Teknologi" },
      link_karir: { stringValue: "https://contoh.test/karir" },
      status: { stringValue: status },
      tanggal_cek: { stringValue: tanggal_cek },
      catatan: { stringValue: "" },
      lokasi: { stringValue: "Bogor" },
      posisi: { stringValue: "Staff" },
      batas_lamar: { stringValue: "" },
    },
  };
}

const HARI_INI = new Date().toISOString().slice(0, 10);
const HALAMAN_1 = [
  doc(2, "PT Beta", "Ada lowongan target", HARI_INI),
  doc(1, "PT Alfa", "Tidak ada lowongan target", "2020-01-01"),
];
const HALAMAN_2 = [doc(3, "PT Gamma", "Ada lowongan target", "")];

after(() => {
  globalThis.fetch = fetchAsli;
});

/* Fetch mock: mencatat panggilan, menjawab dua halaman dengan jeda
 * kecil supaya panggilan bersamaan benar-benar tumpang tindih.
 * mode "ok" menjawab data, mode "gagal" menjawab HTTP 500. */
function pasangMock(calls, mode) {
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    await new Promise((r) => setTimeout(r, 5));
    if (mode.gagal) return { ok: false, status: 500 };
    if (String(url).includes("pageToken=")) {
      return { ok: true, json: async () => ({ documents: HALAMAN_2 }) };
    }
    return {
      ok: true,
      json: async () => ({
        documents: HALAMAN_1,
        nextPageToken: "hal2",
      }),
    };
  };
}

describe("deduplikasi getCompanies()", () => {
  it("tiga panggilan bersamaan hanya memakai satu rangkaian fetch", async () => {
    const calls = [];
    const mode = { gagal: false };
    pasangMock(calls, mode);
    revalidateCompanies();
    const [a, b, c] = await Promise.all([
      getCompanies(),
      getCompanies(),
      getCompanies(),
    ]);
    /* Satu rangkaian paginasi penuh = 2 panggilan (2 halaman),
     * bukan 3 rangkaian = 6 panggilan. */
    assert.equal(calls.length, 2);
    assert.equal(a.length, 3);
    /* Ketiganya mendapat daftar yang sama, terurut menurut no. */
    assert.equal(a, b);
    assert.equal(a, c);
    assert.deepEqual(
      a.map((x) => x.no),
      [1, 2, 3],
    );
    assert.equal(a[0].perusahaan, "PT Alfa");
  });

  it("panggilan setelah cache terisi memakai cache tanpa fetch baru", async () => {
    const calls = [];
    const mode = { gagal: false };
    pasangMock(calls, mode);
    revalidateCompanies();
    await getCompanies();
    assert.equal(calls.length, 2);
    const lagi = await getCompanies();
    assert.equal(calls.length, 2);
    assert.equal(lagi.length, 3);
  });

  it("pola /api/stats: getCompanies + getStats + getStaleCount bersamaan hanya satu rangkaian fetch", async () => {
    const calls = [];
    const mode = { gagal: false };
    pasangMock(calls, mode);
    revalidateCompanies();
    const [companies, stats, stale] = await Promise.all([
      getCompanies(),
      getStats(),
      getStaleCount(),
    ]);
    assert.equal(calls.length, 2);
    assert.equal(companies.length, 3);
    assert.equal(stats.total, 3);
    /* 2 basi: tanggal cek 2020-01-01 dan tanggal cek kosong. */
    assert.equal(stale, 2);
  });

  it("fetch gagal membersihkan janji supaya panggilan berikutnya mencoba lagi", async () => {
    const calls = [];
    const mode = { gagal: true };
    pasangMock(calls, mode);
    revalidateCompanies();
    const hasil = await Promise.allSettled([
      getCompanies(),
      getCompanies(),
      getCompanies(),
    ]);
    /* Ketiga pemanggil bersamaan ditolak, tapi fetch hanya sekali. */
    assert.equal(calls.length, 1);
    for (const h of hasil) {
      assert.equal(h.status, "rejected");
      assert.match(h.reason.message, /Firestore list gagal: HTTP 500/);
    }
    /* Panggilan berikutnya mencoba lagi, bukan mendapat penolakan lama. */
    mode.gagal = false;
    const list = await getCompanies();
    assert.equal(list.length, 3);
    assert.equal(calls.length, 3);
  });

  it("revalidateCompanies saat fetch berjalan membuat panggilan berikutnya memulai fetch baru", async () => {
    const calls = [];
    const mode = { gagal: false };
    pasangMock(calls, mode);
    revalidateCompanies();
    const pertama = getCompanies();
    await new Promise((r) => setTimeout(r, 1));
    revalidateCompanies();
    const kedua = getCompanies();
    const [a, b] = await Promise.all([pertama, kedua]);
    assert.deepEqual(
      a.map((x) => x.no),
      [1, 2, 3],
    );
    assert.deepEqual(
      b.map((x) => x.no),
      [1, 2, 3],
    );
    /* Dua rangkaian paginasi penuh = 4 panggilan fetch. */
    assert.equal(calls.length, 4);
    /* Setelah keduanya selesai, cache terisi: tanpa fetch baru. */
    await getCompanies();
    assert.equal(calls.length, 4);
  });
});
