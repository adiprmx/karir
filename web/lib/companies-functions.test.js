/* Tes unit untuk fungsi lanjutan lib/companies.js (QA-07):
 * getRelated, getTargets, getCategories, getStats (computeStats),
 * getStaleCount, getCompanyById untuk no tidak valid, dan varian
 * OrSeed saat Firestore gagal — memakai test runner bawaan Node.
 * Dijalankan dengan: node --test lib/companies-functions.test.js
 * (koordinator menambahkan file ini ke skrip "test" di package.json).
 * Semua fetch di sini mock: tidak ada jaringan, tidak ada token
 * atau secret asli yang dipakai maupun dicatat.
 *
 * Yang SUDAH teruji di file lain dan tidak diulang di sini:
 * getCompanies/getCompaniesWithSource/getCompanyById (cache +
 * dedup inflight + fallback seed) di companies-dedup.test.js dan
 * companies-seed.test.js; getRelatedOrSeed di companies-seed.test.js. */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";

/* companies.js membaca env saat modul dimuat, jadi env dipasang
 * SEBELUM impor dinamis. Nilai di sini tiruan, bukan kredensial. */
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "kunci-uji";

const {
  getCompanies,
  getRelated,
  getTargets,
  getTargetsOrSeed,
  getCategories,
  getCategoriesOrSeed,
  getStats,
  getStatsOrSeed,
  getStaleCount,
  getCompanyById,
  revalidateCompanies,
} = await import("./companies.js");

const fetchAsli = globalThis.fetch;

function isoHariLalu(n) {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
const HARI_INI = isoHariLalu(0);

/* Dokumen Firestore tiruan, bentuk yang dibaca docToCompany. */
function doc(no, perusahaan, status, tanggal_cek, kategori) {
  return {
    name: `projects/proyek-uji/databases/(default)/documents/companies/${no}`,
    fields: {
      no: { integerValue: String(no) },
      perusahaan: { stringValue: perusahaan },
      kategori: { stringValue: kategori },
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

const DAFTAR = [
  doc(1, "PT Alfa", "Ada lowongan", HARI_INI, "Retail"),
  doc(2, "PT Beta", "Tidak ada lowongan", isoHariLalu(40), "Retail"),
  doc(3, "PT Gamma", "Ada lowongan", isoHariLalu(10), "Teknologi"),
  doc(4, "PT Delta", "Tidak dapat diverifikasi", "", "Retail"),
  doc(5, "PT Epsilon", "Portal tidak bisa dibuka", isoHariLalu(31), "Logistik"),
  doc(6, "PT Zeta", "Ada lowongan", isoHariLalu(5), "Retail"),
];

after(() => {
  globalThis.fetch = fetchAsli;
});

function rekamanBaru() {
  return { list: [], marker: [], patch: [], byId: [] };
}

/* Mock fetch: marker ok (rev 1) + satu halaman daftar, kecuali
 * mode.markerStatus bukan 200 (marker gagal -> seed). PATCH
 * pencacah selalu ok. */
function pasangMock(rec, mode = {}) {
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    await new Promise((r) => setTimeout(r, 2));
    if (options.method === "PATCH" && u.includes("meta/lastChange")) {
      rec.patch.push(u);
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (u.includes("meta/lastChange")) {
      rec.marker.push(u);
      if (mode.markerStatus && mode.markerStatus !== 200) {
        return { ok: false, status: mode.markerStatus, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          fields: {
            rev: { integerValue: "1" },
            updatedAt: { stringValue: "2026-11-15T00:00:00.000Z" },
            counterDay: { stringValue: HARI_INI },
            refillsToday: { integerValue: "0" },
            readsEstimate: { integerValue: "0" },
          },
        }),
      };
    }
    if (/\/companies\/\d+\?/.test(u)) {
      rec.byId.push(u);
      return { ok: false, status: 404, json: async () => ({}) };
    }
    rec.list.push(u);
    return {
      ok: true,
      status: 200,
      json: async () => ({ documents: mode.documents ?? DAFTAR }),
    };
  };
}

describe("getTargets (QA-07)", () => {
  it("field gagal_cek (K-10, P-04) dipetakan bila ada, absen bila tidak ada", async () => {
    const denganGagalCek = doc(
      1,
      "PT Alfa",
      "Ada lowongan",
      HARI_INI,
      "Retail",
    );
    denganGagalCek.fields.gagal_cek = { integerValue: "3" };
    const rec = rekamanBaru();
    pasangMock(rec, {
      documents: [denganGagalCek, DAFTAR[1]],
    });
    revalidateCompanies();
    const semua = await getCompanies();
    assert.equal(semua.length, 2);
    assert.equal(semua[0].gagal_cek, 3);
    /* Dokumen tanpa field gagal_cek: kunci tidak ada. */
    assert.equal("gagal_cek" in semua[1], false);
  });

  it("hanya yang ada lowongan, terurut nama A-Z", async () => {
    const rec = rekamanBaru();
    pasangMock(rec);
    revalidateCompanies();
    const targets = await getTargets();
    assert.deepEqual(
      targets.map((c) => c.perusahaan),
      ["PT Alfa", "PT Gamma", "PT Zeta"],
    );
    for (const c of targets) assert.equal(c.status, "Ada lowongan");
  });

  it("konsisten dengan filter getCompanies yang sama", async () => {
    const rec = rekamanBaru();
    pasangMock(rec);
    revalidateCompanies();
    const semua = await getCompanies();
    const targets = await getTargets();
    assert.deepEqual(
      targets.map((c) => c.no),
      semua
        .filter((c) => c.status === "Ada lowongan")
        .sort((a, b) => a.perusahaan.localeCompare(b.perusahaan, "id"))
        .map((c) => c.no),
    );
  });
});

describe("getCategories (QA-07)", () => {
  it("kategori unik terurut A-Z", async () => {
    const rec = rekamanBaru();
    pasangMock(rec);
    revalidateCompanies();
    assert.deepEqual(await getCategories(), [
      "Logistik",
      "Retail",
      "Teknologi",
    ]);
  });
});

describe("getRelated (QA-07)", () => {
  it("kategori sama, bukan dirinya, yang ada lowongan dulu lalu nama A-Z", async () => {
    const rec = rekamanBaru();
    pasangMock(rec);
    revalidateCompanies();
    const alfa = { no: 1, perusahaan: "PT Alfa", kategori: "Retail" };
    const related = await getRelated(alfa, 6);
    /* Retail selain Alfa: Zeta (ada lowongan) dulu, lalu Beta dan
     * Delta menurut nama. Gamma (Teknologi) dan Epsilon (Logistik)
     * tidak masuk. */
    assert.deepEqual(
      related.map((c) => c.perusahaan),
      ["PT Zeta", "PT Beta", "PT Delta"],
    );
  });

  it("batas n dihormati", async () => {
    const rec = rekamanBaru();
    pasangMock(rec);
    revalidateCompanies();
    const alfa = { no: 1, perusahaan: "PT Alfa", kategori: "Retail" };
    assert.deepEqual(
      (await getRelated(alfa, 2)).map((c) => c.perusahaan),
      ["PT Zeta", "PT Beta"],
    );
    assert.deepEqual(await getRelated(alfa, 0), []);
  });

  it("kategori tanpa teman sejenis menghasilkan daftar kosong", async () => {
    const rec = rekamanBaru();
    pasangMock(rec);
    revalidateCompanies();
    const sendiri = { no: 5, perusahaan: "PT Epsilon", kategori: "Logistik" };
    assert.deepEqual(await getRelated(sendiri, 6), []);
  });
});

describe("getStats / computeStats (QA-07)", () => {
  it("total, sebaran status keempat nilai, dan sebaran tanggal", async () => {
    const rec = rekamanBaru();
    pasangMock(rec);
    revalidateCompanies();
    const stats = await getStats();
    assert.equal(stats.total, 6);
    assert.deepEqual(stats.byStatus, {
      "Ada lowongan": 3,
      "Tidak ada lowongan": 1,
      "Tidak dapat diverifikasi": 1,
      "Portal tidak bisa dibuka": 1,
    });
    /* byDate hanya menghitung tanggal cek yang terisi; Delta ("")
     * tidak masuk. */
    assert.equal(stats.byDate[HARI_INI], 1);
    assert.equal(stats.byDate[isoHariLalu(40)], 1);
    assert.equal(stats.byDate[isoHariLalu(10)], 1);
    assert.equal(stats.byDate[isoHariLalu(31)], 1);
    assert.equal(stats.byDate[isoHariLalu(5)], 1);
    assert.equal(Object.keys(stats.byDate).length, 5);
  });
});

describe("getStaleCount (QA-07)", () => {
  it("lebih dari 30 hari, tanggal kosong, dan tanggal tidak valid dihitung basi", async () => {
    const rec = rekamanBaru();
    pasangMock(rec);
    revalidateCompanies();
    /* Basi: Beta (40 hari), Delta (kosong), Epsilon (31 hari).
     * Tidak basi: Alfa (hari ini), Gamma (10 hari), Zeta (5 hari). */
    assert.equal(await getStaleCount(), 3);
  });
});

describe("TTL cache dipakai bersama (QA-07)", () => {
  it("getCompanies + getTargets + getCategories + getStats + getStaleCount hanya satu rangkaian fetch", async () => {
    const rec = rekamanBaru();
    pasangMock(rec);
    revalidateCompanies();
    const [companies, targets, categories, stats, stale] = await Promise.all([
      getCompanies(),
      getTargets(),
      getCategories(),
      getStats(),
      getStaleCount(),
    ]);
    assert.equal(rec.marker.length, 1);
    assert.equal(rec.list.length, 1);
    assert.equal(companies.length, 6);
    assert.equal(targets.length, 3);
    assert.equal(categories.length, 3);
    assert.equal(stats.total, 6);
    assert.equal(stale, 3);
    /* Panggilan kedua setelah cache terisi: tanpa fetch baru. */
    await getTargets();
    await getCategories();
    assert.equal(rec.marker.length, 1);
    assert.equal(rec.list.length, 1);
  });
});

describe("getCompanyById: nomor tidak valid (QA-07)", () => {
  it("no 0, kosong, atau bukan angka menjadi null tanpa fetch", async () => {
    const rec = rekamanBaru();
    pasangMock(rec);
    revalidateCompanies();
    assert.equal(await getCompanyById(0), null);
    assert.equal(await getCompanyById(""), null);
    assert.equal(await getCompanyById("bukan-nomor"), null);
    assert.equal(await getCompanyById(null), null);
    assert.equal(await getCompanyById(undefined), null);
    assert.equal(rec.byId.length, 0);
  });
});

describe("varian OrSeed saat Firestore gagal (QA-07)", () => {
  it("getTargetsOrSeed/getCategoriesOrSeed/getStatsOrSeed memakai seed tanpa refill", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, { markerStatus: 429 });
    revalidateCompanies();
    const targets = await getTargetsOrSeed();
    const categories = await getCategoriesOrSeed();
    const stats = await getStatsOrSeed();
    /* Seed asli repo: 685 baris. */
    assert.equal(stats.total, 685);
    assert.ok(targets.length > 0);
    assert.ok(targets.length < 685);
    for (const c of targets) assert.equal(c.status, "Ada lowongan");
    assert.ok(categories.length > 0);
    assert.ok(categories.includes("Retail"));
    /* Marker dibaca sekali lalu gagal; daftar tidak pernah dibaca. */
    assert.equal(rec.marker.length, 1);
    assert.equal(rec.list.length, 0);
  });
});
