/* Tes deduplikasi getCompanies() di lib/companies.js (seed-first S3).
 * Dijalankan dengan: npm test
 * Semua fetch di sini mock: tidak ada jaringan, tidak ada token
 * atau secret asli yang dipakai maupun dicatat.
 * Latar: /api/stats memanggil getCompanies(), getStats(), dan
 * getStaleCount() bersamaan, dan ketiganya memanggil getCompanies()
 * secara internal. Tanpa deduplikasi, satu request /api/stats yang
 * dingin menjalankan tiga rangkaian cek marker + refill penuh (3x
 * baca dokumen) untuk data yang sama.
 * Perilaku seed-first: panggilan pertama membaca marker (1 baca)
 * lalu refill bila rev berubah; panggilan bersamaan memakai satu
 * rangkaian yang sama; bila refill gagal, seed disajikan (tidak ada
 * penolakan) dan panggilan berikutnya mencoba lagi. */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";

/* companies.js membaca env saat modul dimuat, jadi env dipasang
 * SEBELUM impor dinamis. Nilai di sini tiruan, bukan kredensial. */
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "kunci-uji";

const {
  getCompanies,
  getCompaniesWithSource,
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

/* Dokumen marker tiruan, bentuk yang dibaca parseMarker. */
function markerDoc(rev) {
  return {
    name: "projects/proyek-uji/databases/(default)/documents/meta/lastChange",
    fields: {
      rev: { integerValue: String(rev) },
      updatedAt: { stringValue: "2026-11-15T00:00:00.000Z" },
      counterDay: { stringValue: "2026-11-15" },
      refillsToday: { integerValue: "0" },
      readsEstimate: { integerValue: "0" },
    },
  };
}

const HARI_INI = new Date().toISOString().slice(0, 10);
const HALAMAN_1 = [
  doc(2, "PT Beta", "Ada lowongan", HARI_INI),
  doc(1, "PT Alfa", "Tidak ada lowongan", "2020-01-01"),
];
const HALAMAN_2 = [doc(3, "PT Gamma", "Ada lowongan", "")];

after(() => {
  globalThis.fetch = fetchAsli;
});

/* Fetch mock: mencatat panggilan per jenis, menjawab marker + dua
 * halaman dengan jeda kecil supaya panggilan bersamaan benar-benar
 * tumpang tindih. mode "gagal" membuat LIST menjawab HTTP 500
 * (marker tetap ok); PATCH pencacah selalu ok. */
function pasangMock(rec, mode) {
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    await new Promise((r) => setTimeout(r, 5));
    if (options.method === "PATCH" && u.includes("meta/lastChange")) {
      rec.patch.push(u);
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (u.includes("meta/lastChange")) {
      rec.marker.push(u);
      return { ok: true, status: 200, json: async () => markerDoc(mode.rev) };
    }
    rec.list.push(u);
    if (mode.gagal) return { ok: false, status: 500 };
    if (u.includes("pageToken=")) {
      return { ok: true, status: 200, json: async () => ({ documents: HALAMAN_2 }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        documents: HALAMAN_1,
        nextPageToken: "hal2",
      }),
    };
  };
}

function rekamanBaru() {
  return { list: [], marker: [], patch: [] };
}

describe("deduplikasi getCompanies() (seed-first)", () => {
  it("tiga panggilan bersamaan hanya memakai satu rangkaian fetch", async () => {
    const rec = rekamanBaru();
    const mode = { gagal: false, rev: 1 };
    pasangMock(rec, mode);
    revalidateCompanies();
    const [a, b, c] = await Promise.all([
      getCompanies(),
      getCompanies(),
      getCompanies(),
    ]);
    /* Satu rangkaian = 1 baca marker + 2 halaman daftar + 1 tulis
     * pencacah, bukan 3 rangkaian. */
    assert.equal(rec.marker.length, 1);
    assert.equal(rec.list.length, 2);
    assert.equal(rec.patch.length, 1);
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
    const rec = rekamanBaru();
    const mode = { gagal: false, rev: 1 };
    pasangMock(rec, mode);
    revalidateCompanies();
    await getCompanies();
    assert.equal(rec.marker.length, 1);
    assert.equal(rec.list.length, 2);
    const lagi = await getCompanies();
    assert.equal(rec.marker.length, 1);
    assert.equal(rec.list.length, 2);
    assert.equal(rec.patch.length, 1);
    assert.equal(lagi.length, 3);
  });

  it("pola /api/stats: getCompanies + getStats + getStaleCount bersamaan hanya satu rangkaian fetch", async () => {
    const rec = rekamanBaru();
    const mode = { gagal: false, rev: 1 };
    pasangMock(rec, mode);
    revalidateCompanies();
    const [companies, stats, stale] = await Promise.all([
      getCompanies(),
      getStats(),
      getStaleCount(),
    ]);
    assert.equal(rec.marker.length, 1);
    assert.equal(rec.list.length, 2);
    assert.equal(companies.length, 3);
    assert.equal(stats.total, 3);
    /* 2 basi: tanggal cek 2020-01-01 dan tanggal cek kosong. */
    assert.equal(stale, 2);
  });

  it("refill gagal menyajikan seed tanpa melempar, panggilan berikutnya mencoba lagi", async () => {
    const rec = rekamanBaru();
    const mode = { gagal: true, rev: 1 };
    pasangMock(rec, mode);
    revalidateCompanies();
    const [a, b, c] = await Promise.all([
      getCompaniesWithSource(),
      getCompaniesWithSource(),
      getCompaniesWithSource(),
    ]);
    /* Ketiga pemanggil bersamaan mendapat seed (bukan penolakan),
     * dan list hanya dicoba sekali (halaman pertama gagal). */
    assert.equal(rec.marker.length, 1);
    assert.equal(rec.list.length, 1);
    assert.equal(rec.patch.length, 0);
    for (const h of [a, b, c]) {
      assert.equal(h.source, "seed");
      /* Seed asli repo: 610 baris, baris pertama Unilever. */
      assert.equal(h.companies.length, 610);
      assert.equal(h.companies[0].perusahaan, "Unilever Indonesia");
      assert.equal(h.seedDate, "2026-11-14");
    }
    /* Panggilan berikutnya mencoba lagi, bukan mendapat seed lama
     * yang tersimpan. */
    mode.gagal = false;
    revalidateCompanies();
    const list = await getCompaniesWithSource();
    assert.equal(list.source, "live");
    assert.equal(list.companies.length, 3);
    assert.equal(rec.list.length, 3);
  });

  it("revalidateCompanies saat fetch berjalan membuat panggilan berikutnya memulai fetch baru", async () => {
    const rec = rekamanBaru();
    const mode = { gagal: false, rev: 1 };
    pasangMock(rec, mode);
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
    /* Dua rangkaian penuh = 2 baca marker + 4 halaman daftar. */
    assert.equal(rec.marker.length, 2);
    assert.equal(rec.list.length, 4);
    /* Setelah keduanya selesai, cache terisi: tanpa fetch baru. */
    await getCompanies();
    assert.equal(rec.marker.length, 2);
    assert.equal(rec.list.length, 4);
  });
});
