/* Tes arsitektur seed-first lib/companies.js (keputusan S3).
 * Dijalankan dengan: node --test lib/companies-seed.test.js
 * (koordinator menambahkan file ini ke skrip "test" di package.json).
 * Semua fetch di sini mock: tidak ada jaringan, tidak ada token
 * atau secret asli yang dipakai maupun dicatat. Seed yang dipakai
 * adalah seed asli repo (610 baris).
 *
 * Yang diuji:
 * (a) Firestore 429 -> daftar tetap didapat dari seed (source seed).
 * (b) Marker tidak berubah -> tidak ada refill (list tidak dibaca).
 * (c) Marker berubah -> refill terjadi.
 * (d) Baca marker gagal -> seed disajikan.
 * (e) getCompanyById ter-cache (2 panggilan = 1 fetch).
 * Plus: pencacah refill ditulis sekali per refill; alert kuota 70%
 * dibuat sekali per hari; getRelatedOrSeed memakai seed tanpa baca
 * daftar; marker yang belum ada (404) tetap memicu refill pertama.
 * Blok BE-09: res.json() bertimeout — body yang stall (header 200
 * tiba, body tidak pernah selesai) ditolak setelah 5 detik dan
 * pemanggil jatuh ke seed, bukan menggantung selamanya. */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";

/* companies.js membaca env saat modul dimuat, jadi env dipasang
 * SEBELUM impor dinamis. Nilai di sini tiruan, bukan kredensial. */
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "kunci-uji";

const {
  getCompanies,
  getCompaniesWithSource,
  getCompanyById,
  getCompanyByIdWithSource,
  getRelatedOrSeed,
  jsonWithTimeout,
  revalidateCompanies,
} = await import("./companies.js");

const fetchAsli = globalThis.fetch;
const nowAsli = Date.now;

const TODAY_WIB = new Date().toLocaleDateString("en-CA", {
  timeZone: "Asia/Jakarta",
});

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
  doc(2, "PT Beta", "Ada lowongan", HARI_INI),
  doc(1, "PT Alfa", "Tidak ada lowongan", "2020-01-01"),
];
const HALAMAN_2 = [doc(3, "PT Gamma", "Ada lowongan", "")];

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

function rekamanBaru() {
  return { list: [], marker: [], patch: [], alert: [], byId: [] };
}

/* Mock fetch yang bisa diatur per skenario lewat `mode`:
 * - markerStatus: 200 | 404 | 429 | 500 (baca marker)
 * - markerThrows: true = fetch marker melempar (offline)
 * - listStatus: 200 | 429 | 500 (baca daftar)
 * - markerJsonStall / listJsonStall / byIdJsonStall: true = header
 *   200 tiba tetapi body tidak pernah selesai (res.json() stall)
 * - rev, reads, refills, day: isi dokumen marker. */
function pasangMock(rec, mode) {
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    await new Promise((r) => setTimeout(r, 2));
    if (options.method === "PATCH" && u.includes("meta/lastChange")) {
      rec.patch.push({ url: u, body: JSON.parse(options.body || "{}") });
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (options.method === "POST" && u.includes("/alerts?")) {
      rec.alert.push({ url: u, body: JSON.parse(options.body || "{}") });
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (u.includes("meta/lastChange")) {
      rec.marker.push(u);
      if (mode.markerThrows) throw new Error("offline");
      if (mode.markerStatus === 404) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (mode.markerStatus !== 200) {
        return { ok: false, status: mode.markerStatus, json: async () => ({}) };
      }
      if (mode.markerJsonStall) {
        return { ok: true, status: 200, json: () => new Promise(() => {}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          fields: {
            rev: { integerValue: String(mode.rev) },
            updatedAt: { stringValue: "2026-11-15T00:00:00.000Z" },
            counterDay: { stringValue: mode.day || TODAY_WIB },
            refillsToday: { integerValue: String(mode.refills ?? 0) },
            readsEstimate: { integerValue: String(mode.reads ?? 0) },
          },
        }),
      };
    }
    if (/\/companies\/\d+\?/.test(u)) {
      rec.byId.push(u);
      const no = Number(u.match(/\/companies\/(\d+)\?/)[1]);
      if (mode.byIdStatus && mode.byIdStatus !== 200) {
        return { ok: false, status: mode.byIdStatus, json: async () => ({}) };
      }
      if (no === 999) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (mode.byIdJsonStall) {
        return { ok: true, status: 200, json: () => new Promise(() => {}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => doc(no, `PT Nomor ${no}`, "Ada lowongan", HARI_INI),
      };
    }
    rec.list.push(u);
    if (mode.listStatus !== 200) {
      return { ok: false, status: mode.listStatus, json: async () => ({}) };
    }
    if (mode.listJsonStall) {
      return { ok: true, status: 200, json: () => new Promise(() => {}) };
    }
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

function modeOk(overrides = {}) {
  return {
    markerStatus: 200,
    markerThrows: false,
    listStatus: 200,
    rev: 1,
    reads: 0,
    refills: 0,
    day: TODAY_WIB,
    ...overrides,
  };
}

describe("seed-first: degradasi saat Firestore bermasalah", () => {
  it("(a) Firestore 429 pada marker -> daftar dari seed, source seed", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, modeOk({ markerStatus: 429 }));
    revalidateCompanies();
    const hasil = await getCompaniesWithSource();
    assert.equal(hasil.source, "seed");
    assert.equal(hasil.companies.length, 610);
    assert.equal(hasil.companies[0].perusahaan, "Unilever Indonesia");
    assert.equal(hasil.seedDate, "2026-11-14");
    /* Marker 429: refill tidak dicoba sama sekali. */
    assert.equal(rec.list.length, 0);
    assert.equal(rec.marker.length, 1);
  });

  it("(a) Firestore 429 pada refill (marker ok) -> daftar dari seed", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, modeOk({ listStatus: 429 }));
    revalidateCompanies();
    const hasil = await getCompaniesWithSource();
    assert.equal(hasil.source, "seed");
    assert.equal(hasil.companies.length, 610);
    assert.equal(rec.list.length, 1);
    assert.equal(rec.patch.length, 0);
  });

  it("(d) baca marker gagal (offline) -> seed disajikan tanpa melempar", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, modeOk({ markerThrows: true }));
    revalidateCompanies();
    const hasil = await getCompaniesWithSource();
    assert.equal(hasil.source, "seed");
    assert.equal(hasil.companies.length, 610);
    assert.equal(rec.list.length, 0);
  });

  it("(d) cache live lama dipakai bila marker gagal setelah refill sukses", async () => {
    const rec = rekamanBaru();
    const mode = modeOk();
    pasangMock(rec, mode);
    revalidateCompanies();
    const pertama = await getCompaniesWithSource();
    assert.equal(pertama.source, "live");
    assert.equal(pertama.companies.length, 3);
    /* Jam maju 6 menit (TTL marker habis), lalu marker 429. */
    const pulihkan = geserJam(6 * 60 * 1000);
    try {
      mode.markerStatus = 429;
      const kedua = await getCompaniesWithSource();
      assert.equal(kedua.source, "live");
      assert.equal(kedua.companies.length, 3);
      /* Tidak ada refill baru: list tetap 2 panggilan. */
      assert.equal(rec.list.length, 2);
    } finally {
      pulihkan();
    }
  });
});

describe("seed-first: marker mengendalikan refill", () => {
  it("(b) marker tidak berubah -> tidak ada refill", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, modeOk());
    revalidateCompanies();
    const pertama = await getCompaniesWithSource();
    assert.equal(pertama.source, "live");
    assert.equal(rec.list.length, 2);
    /* Jam maju 6 menit (TTL marker habis): marker dibaca lagi,
     * tapi rev sama -> tanpa refill. */
    const pulihkan = geserJam(6 * 60 * 1000);
    try {
      const kedua = await getCompaniesWithSource();
      assert.equal(kedua.source, "live");
      assert.equal(kedua.companies.length, 3);
      assert.equal(rec.marker.length, 2);
      assert.equal(rec.list.length, 2);
      assert.equal(rec.patch.length, 1);
    } finally {
      pulihkan();
    }
  });

  it("(c) marker berubah -> refill terjadi", async () => {
    const rec = rekamanBaru();
    const mode = modeOk();
    pasangMock(rec, mode);
    revalidateCompanies();
    await getCompanies();
    assert.equal(rec.list.length, 2);
    /* Jam maju 6 menit + rev naik 1: refill penuh lagi. */
    const pulihkan = geserJam(6 * 60 * 1000);
    try {
      mode.rev = 2;
      const kedua = await getCompaniesWithSource();
      assert.equal(kedua.source, "live");
      assert.equal(rec.marker.length, 2);
      assert.equal(rec.list.length, 4);
      assert.equal(rec.patch.length, 2);
    } finally {
      pulihkan();
    }
  });

  it("marker belum ada (404) -> refill pertama tetap terjadi", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, modeOk({ markerStatus: 404 }));
    revalidateCompanies();
    const hasil = await getCompaniesWithSource();
    assert.equal(hasil.source, "live");
    assert.equal(hasil.companies.length, 3);
    /* Tanpa marker, pencacah tidak bisa ditulis. */
    assert.equal(rec.patch.length, 0);
    /* Panggilan kedua: tidak ada refill (marker 404 ikut di-cache). */
    await getCompanies();
    assert.equal(rec.marker.length, 1);
    assert.equal(rec.list.length, 2);
  });
});

describe("seed-first: pencacah refill dan alert kuota", () => {
  it("tiap refill menulis pencacah sekali (refillsToday +1, readsEstimate += jumlah dokumen)", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, modeOk({ refills: 4, reads: 1200 }));
    revalidateCompanies();
    await getCompanies();
    assert.equal(rec.patch.length, 1);
    const fields = rec.patch[0].body.fields;
    assert.equal(fields.refillsToday.integerValue, "5");
    /* 1200 + 3 dokumen yang dibaca refill ini. */
    assert.equal(fields.readsEstimate.integerValue, "1203");
    assert.equal(fields.counterDay.stringValue, TODAY_WIB);
  });

  it("ganti hari me-reset pencacah (refillsToday 1, readsEstimate = jumlah dokumen)", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, modeOk({ refills: 9, reads: 5000, day: "2026-11-14" }));
    revalidateCompanies();
    await getCompanies();
    assert.equal(rec.patch.length, 1);
    const fields = rec.patch[0].body.fields;
    assert.equal(fields.refillsToday.integerValue, "1");
    assert.equal(fields.readsEstimate.integerValue, "3");
    assert.equal(fields.counterDay.stringValue, TODAY_WIB);
  });

  it("alert kuota 70% dibuat sekali per hari saat ambang terlewati", async () => {
    const rec = rekamanBaru();
    const mode = modeOk({ refills: 5, reads: 34999 });
    pasangMock(rec, mode);
    revalidateCompanies();
    await getCompanies();
    /* 34999 + 3 = 35002 >= 35000 -> satu alert. */
    assert.equal(rec.alert.length, 1);
    assert.match(rec.alert[0].url, new RegExp(`quota-70-${TODAY_WIB}`));
    const fields = rec.alert[0].body.fields;
    assert.equal(fields.type.stringValue, "quota");
    assert.equal(fields.companyNo.integerValue, "0");
    assert.equal(fields.readsEstimate.integerValue, "35002");
    assert.equal(fields.percent.integerValue, "70");
    /* Refill kedua hari yang sama (rev berubah): tidak ada alert lagi. */
    const pulihkan = geserJam(6 * 60 * 1000);
    try {
      mode.rev = 2;
      await getCompanies();
      assert.equal(rec.alert.length, 1);
    } finally {
      pulihkan();
    }
  });

  it("tidak ada alert bila estimasi di bawah ambang", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, modeOk({ reads: 100 }));
    revalidateCompanies();
    await getCompanies();
    assert.equal(rec.alert.length, 0);
  });
});

describe("seed-first: getCompanyById dan getRelatedOrSeed", () => {
  it("(e) getCompanyById ter-cache: 2 panggilan = 1 fetch", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, modeOk());
    revalidateCompanies();
    const a = await getCompanyById(5);
    const b = await getCompanyById(5);
    assert.equal(rec.byId.length, 1);
    assert.equal(a.perusahaan, "PT Nomor 5");
    assert.equal(a, b);
  });

  it("getCompanyById bersamaan untuk nomor sama hanya 1 fetch", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, modeOk());
    revalidateCompanies();
    const [a, b] = await Promise.all([getCompanyById(7), getCompanyById(7)]);
    assert.equal(rec.byId.length, 1);
    assert.equal(a.perusahaan, "PT Nomor 7");
    assert.equal(a, b);
  });

  it("getCompanyById 404 -> null, tanpa melempar", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, modeOk());
    revalidateCompanies();
    assert.equal(await getCompanyById(999), null);
  });

  it("getCompanyByIdWithSource: live saat ok, seed saat Firestore gagal", async () => {
    const rec = rekamanBaru();
    const mode = modeOk();
    pasangMock(rec, mode);
    revalidateCompanies();
    const live = await getCompanyByIdWithSource(5);
    assert.equal(live.source, "live");
    assert.equal(live.company.perusahaan, "PT Nomor 5");
    /* Nomor lain, fetch gagal -> dari seed (no 1 = Unilever). */
    mode.byIdStatus = 500;
    const seed = await getCompanyByIdWithSource(1);
    assert.equal(seed.source, "seed");
    assert.equal(seed.company.perusahaan, "Unilever Indonesia");
    /* Nomor yang tidak ada di seed -> null dengan source seed. */
    const hilang = await getCompanyByIdWithSource(9999);
    assert.equal(hilang.source, "seed");
    assert.equal(hilang.company, null);
  });

  it("getCompanyById gagal memakai cache basi bila ada", async () => {
    const rec = rekamanBaru();
    const mode = modeOk();
    pasangMock(rec, mode);
    revalidateCompanies();
    const pertama = await getCompanyById(5);
    assert.equal(pertama.perusahaan, "PT Nomor 5");
    /* Jam maju 6 menit (cache basi), lalu fetch gagal. */
    const pulihkan = geserJam(6 * 60 * 1000);
    try {
      mode.byIdStatus = 500;
      const kedua = await getCompanyById(5);
      assert.equal(kedua.perusahaan, "PT Nomor 5");
    } finally {
      pulihkan();
    }
  });

  it("getRelatedOrSeed memakai seed langsung, tanpa baca Firestore", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, modeOk());
    revalidateCompanies();
    /* Target dari seed asli repo: no 1 (Unilever, FMCG). */
    const { default: seed } = await import("../data/companies.json", {
      with: { type: "json" },
    });
    const target = seed.find((c) => c.no === 1);
    const related = await getRelatedOrSeed(target, 6);
    assert.ok(related.length > 0);
    assert.ok(related.length <= 6);
    for (const r of related) {
      assert.equal(r.kategori, target.kategori);
      assert.notEqual(r.no, target.no);
    }
    /* Tidak ada fetch Firestore sama sekali untuk rekomendasi. */
    assert.equal(rec.list.length, 0);
    assert.equal(rec.marker.length, 0);
    assert.equal(rec.byId.length, 0);
  });
});

describe("BE-09: timeout res.json() — body yang stall tidak menggantung", () => {
  it("jsonWithTimeout: json() yang tidak pernah resolve ditolak setelah timeout", async () => {
    const t0 = Date.now();
    await assert.rejects(
      jsonWithTimeout({ json: () => new Promise(() => {}) }, 50),
      /Timeout membaca body respons/,
    );
    /* Timeout 50 ms: penolakan harus datang cepat, bukan menggantung. */
    assert.ok(Date.now() - t0 < 2000);
  });

  it("jsonWithTimeout: json() lambat tapi selesai tetap dipakai", async () => {
    const hasil = await jsonWithTimeout(
      {
        json: async () => {
          await new Promise((r) => setTimeout(r, 30));
          return { a: 1 };
        },
      },
      200,
    );
    assert.deepEqual(hasil, { a: 1 });
  });

  it("jsonWithTimeout: json() yang menolak langsung diteruskan", async () => {
    await assert.rejects(
      jsonWithTimeout(
        {
          json: async () => {
            throw new Error("JSON rusak");
          },
        },
        200,
      ),
      /JSON rusak/,
    );
  });

  it("jsonWithTimeout: stream body dibatalkan saat timeout", async () => {
    let dibatalkan = false;
    await assert.rejects(
      jsonWithTimeout(
        {
          json: () => new Promise(() => {}),
          body: {
            cancel: () => {
              dibatalkan = true;
            },
          },
        },
        50,
      ),
      /Timeout membaca body respons/,
    );
    assert.equal(dibatalkan, true);
  });

  it("body marker stall -> seed disajikan dalam waktu terbatas (bukan hang)", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, modeOk({ markerJsonStall: true }));
    revalidateCompanies();
    const t0 = Date.now();
    const hasil = await getCompaniesWithSource();
    const elapsed = Date.now() - t0;
    assert.equal(hasil.source, "seed");
    assert.equal(hasil.companies.length, 610);
    /* Marker gagal dibaca: refill tidak dicoba sama sekali. */
    assert.equal(rec.list.length, 0);
    /* Timeout body 5 detik: tanpa perbaikan ini panggilan tidak
     * pernah kembali. Batas bawah membuktikan penantian itu memang
     * timeout body (bukan gagal instan karena alasan lain); batas
     * atas longgar untuk CI yang lambat. */
    assert.ok(elapsed >= 4000, `elapsed ${elapsed} ms`);
    assert.ok(elapsed < 15_000, `elapsed ${elapsed} ms`);
  });

  it("body daftar stall saat refill -> seed disajikan dalam waktu terbatas", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, modeOk({ listJsonStall: true }));
    revalidateCompanies();
    const t0 = Date.now();
    const hasil = await getCompaniesWithSource();
    const elapsed = Date.now() - t0;
    assert.equal(hasil.source, "seed");
    assert.equal(hasil.companies.length, 610);
    assert.equal(rec.list.length, 1);
    assert.equal(rec.patch.length, 0);
    assert.ok(elapsed >= 4000, `elapsed ${elapsed} ms`);
    assert.ok(elapsed < 15_000, `elapsed ${elapsed} ms`);
  });

  it("body perusahaan stall -> getCompanyByIdWithSource jatuh ke seed", async () => {
    const rec = rekamanBaru();
    pasangMock(rec, modeOk({ byIdJsonStall: true }));
    revalidateCompanies();
    const t0 = Date.now();
    const hasil = await getCompanyByIdWithSource(1);
    const elapsed = Date.now() - t0;
    assert.equal(hasil.source, "seed");
    assert.equal(hasil.company.perusahaan, "Unilever Indonesia");
    assert.equal(rec.byId.length, 1);
    assert.ok(elapsed >= 4000, `elapsed ${elapsed} ms`);
    assert.ok(elapsed < 15_000, `elapsed ${elapsed} ms`);
  });
});
