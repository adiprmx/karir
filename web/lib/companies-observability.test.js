/* Tes observabilitas lib/companies.js (P-06, BE2-02/K1).
 * Dijalankan dengan: node --test lib/companies-observability.test.js
 * Semua fetch di-mock — tidak ada panggilan Firestore sungguhan.
 * Kejadian observabilitas ditangkap lewat sink (sink menerima SEMUA
 * kejadian, tanpa throttle), bukan dari console.warn. */
import { describe, it, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";

/* companies.js membaca env saat modul dimuat, jadi env dipasang
 * SEBELUM impor dinamis. Nilai di sini tiruan, bukan kredensial. */
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
const KUNCI_UJI = "kunci-uji";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = KUNCI_UJI;

const {
  getCompanies,
  getCompaniesWithSource,
  getCompanyByIdWithSource,
  getCompaniesHealthSnapshot,
  getQuotaSnapshot,
  getSeedModeInfo,
  revalidateCompanies,
} = await import("./companies.js");
const { OBS_CODES } = await import("./observability.js");
const {
  registerObservabilitySink,
  resetObservabilityForTests,
} = await import("./observability.js");
const {
  pendingReadsForTests,
  resetReadMetersForTests,
} = await import("./read-meter.js");

const fetchAsli = globalThis.fetch;
const nowAsli = Date.now;
const warnAsli = console.warn;

const TODAY_WIB = new Date().toLocaleDateString("en-CA", {
  timeZone: "Asia/Jakarta",
});

function doc(no, perusahaan, status) {
  return {
    name: `projects/proyek-uji/databases/(default)/documents/companies/${no}`,
    fields: {
      no: { integerValue: String(no) },
      perusahaan: { stringValue: perusahaan },
      kategori: { stringValue: "Teknologi" },
      link_karir: { stringValue: "https://contoh.test/karir" },
      status: { stringValue: status },
      tanggal_cek: { stringValue: "" },
      catatan: { stringValue: "" },
      lokasi: { stringValue: "Bogor" },
      posisi: { stringValue: "Staff" },
      batas_lamar: { stringValue: "" },
    },
  };
}

const HALAMAN = [
  doc(2, "PT Beta", "Ada lowongan"),
  doc(1, "PT Alfa", "Tidak ada lowongan"),
];

after(() => {
  globalThis.fetch = fetchAsli;
  Date.now = nowAsli;
  console.warn = warnAsli;
});

function geserJam(ms) {
  const base = nowAsli();
  Date.now = () => base + ms;
  return () => {
    Date.now = nowAsli;
  };
}

/* Mock fetch per skenario: markerStatus/listStatus/patchStatus/
 * alertStatus/byIdStatus (200 default, kecuali yang diatur),
 * markerThrows (fetch marker melempar), rev/reads/refills. */
function pasangMock(mode = {}) {
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (options.method === "PATCH" && u.includes("meta/lastChange")) {
      return {
        ok: (mode.patchStatus ?? 200) < 400,
        status: mode.patchStatus ?? 200,
        json: async () => ({}),
      };
    }
    if (options.method === "POST" && u.includes("/alerts?")) {
      return {
        ok: (mode.alertStatus ?? 200) < 400,
        status: mode.alertStatus ?? 200,
        json: async () => ({}),
      };
    }
    if (u.includes("meta/lastChange")) {
      if (mode.markerThrows) throw new Error("offline");
      if (mode.markerStatus && mode.markerStatus !== 200) {
        return { ok: false, status: mode.markerStatus, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          fields: {
            rev: { integerValue: String(mode.rev ?? 5) },
            updatedAt: { stringValue: "2026-11-15T00:00:00.000Z" },
            counterDay: { stringValue: TODAY_WIB },
            refillsToday: { integerValue: String(mode.refills ?? 0) },
            readsEstimate: { integerValue: String(mode.reads ?? 0) },
          },
        }),
      };
    }
    if (/\/companies\/\d+\?/.test(u)) {
      if (mode.byIdStatus && mode.byIdStatus !== 200) {
        return { ok: false, status: mode.byIdStatus, json: async () => ({}) };
      }
      const no = Number(u.match(/\/companies\/(\d+)\?/)[1]);
      if (no === 999) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => doc(no, "PT Uji", "Ada lowongan") };
    }
    if (u.includes("/companies?") || u.includes("/companies")) {
      if (mode.listStatus && mode.listStatus !== 200) {
        return { ok: false, status: mode.listStatus, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({ documents: HALAMAN }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
}

let kejadian = [];
beforeEach(() => {
  revalidateCompanies();
  resetObservabilityForTests();
  resetReadMetersForTests();
  kejadian = [];
  registerObservabilitySink((event) => kejadian.push(event));
  console.warn = () => {};
});
afterEach(() => {
  console.warn = warnAsli;
  Date.now = nowAsli;
  resetObservabilityForTests();
  resetReadMetersForTests();
});

function kodeYangDicatat(code) {
  return kejadian.filter((e) => e.code === code);
}

describe("log kegagalan + jatuh ke seed (BE2-02)", () => {
  it("marker 429 -> seed + MARKER_READ_FAILED + mode seed aktif", async () => {
    pasangMock({ markerStatus: 429 });
    const { companies, source } = await getCompaniesWithSource();
    assert.equal(source, "seed");
    assert.ok(companies.length > 0);
    const ev = kodeYangDicatat(OBS_CODES.MARKER_READ_FAILED);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].meta.status, 429);
    const info = getSeedModeInfo();
    assert.equal(info.seedMode, true);
    assert.equal(info.seedModeMinutes, 0);
    assert.equal(info.lastLiveAt, null);
    /* Menit berjalan dari seed bertambah seiring waktu. */
    const info65 = getSeedModeInfo(Date.now() + 65 * 60 * 1000);
    assert.equal(info65.seedModeMinutes, 65);
  });

  it("marker melempar (offline) -> seed + MARKER_READ_FAILED reason network", async () => {
    pasangMock({ markerThrows: true });
    const { source } = await getCompaniesWithSource();
    assert.equal(source, "seed");
    const ev = kodeYangDicatat(OBS_CODES.MARKER_READ_FAILED);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].meta.reason, "network");
  });

  it("refill 429 -> seed + REFILL_FAILED_SEED_FALLBACK", async () => {
    pasangMock({ listStatus: 429 });
    const { source } = await getCompaniesWithSource();
    assert.equal(source, "seed");
    const ev = kodeYangDicatat(OBS_CODES.REFILL_FAILED_SEED_FALLBACK);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].meta.fallback, "seed");
    assert.ok(ev[0].message.includes("429"));
    assert.equal(getSeedModeInfo().seedMode, true);
  });

  it("refill pulih setelah mode seed -> seedMode mati + liveAsOf terisi", async () => {
    pasangMock({ markerStatus: 429 });
    const pertama = await getCompaniesWithSource();
    assert.equal(pertama.source, "seed");
    assert.equal(getSeedModeInfo().seedMode, true);
    /* Marker pulih; lewati fail-TTL 60 detik. */
    pasangMock({});
    const pulihkan = geserJam(61_000);
    const kedua = await getCompaniesWithSource();
    pulihkan();
    assert.equal(kedua.source, "live");
    assert.equal(getSeedModeInfo().seedMode, false);
    assert.ok(kedua.liveAsOf);
  });

  it("PATCH pencacah 403 -> METERING_FAILED, refill tetap disajikan", async () => {
    pasangMock({ patchStatus: 403 });
    const { companies, source } = await getCompaniesWithSource();
    assert.equal(source, "live");
    assert.equal(companies.length, 2);
    const ev = kodeYangDicatat(OBS_CODES.METERING_FAILED);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].meta.status, 403);
  });

  it("alert kuota gagal dibuat -> QUOTA_ALERT_FAILED", async () => {
    /* 34.999 + 2 dokumen refill = 35.001 >= 35.000 -> alert dicoba. */
    pasangMock({ reads: 34999, alertStatus: 500 });
    const { source } = await getCompaniesWithSource();
    assert.equal(source, "live");
    const ev = kodeYangDicatat(OBS_CODES.QUOTA_ALERT_FAILED);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].meta.status, 500);
    assert.equal(ev[0].meta.readsEstimate, 35001);
  });

  it("baca per-perusahaan gagal -> COMPANY_READ_FAILED + perusahaan dari seed", async () => {
    pasangMock({ byIdStatus: 500 });
    const { company, source } = await getCompanyByIdWithSource(1);
    assert.equal(source, "seed");
    assert.ok(company);
    assert.equal(company.no, 1);
    const ev = kodeYangDicatat(OBS_CODES.COMPANY_READ_FAILED);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].meta.companyNo, 1);
  });

  it("muat seed lewat alias gagal di luar Next -> SEED_LOAD_FAILED sekali", async () => {
    /* seedCache modul sudah terisi oleh tes sebelumnya, jadi tes ini
     * memakai instans modul segar (query string berbeda = instans
     * ESM berbeda) agar loadSeed benar-benar jalan lagi — dipaksa
     * jatuh ke seed lewat marker 429. */
    pasangMock({ markerStatus: 429 });
    const segar = await import("./companies.js?segar-seed=1");
    await segar.getCompanies();
    const ev = kodeYangDicatat(OBS_CODES.SEED_LOAD_FAILED);
    /* Di luar Next (tes Node), impor alias @ selalu gagal sekali. */
    assert.equal(ev.length, 1);
    assert.equal(ev[0].meta.reason, "alias-import-failed");
  });
});

describe("pengukur baca + cuplikan kesehatan", () => {
  it("refill mencatat web-refill + web-marker", async () => {
    pasangMock({});
    await getCompanies();
    const pending = pendingReadsForTests();
    assert.equal(pending["web-refill"], 2);
    assert.equal(pending["web-marker"], 1);
  });

  it("getQuotaSnapshot membaca pencacah dari cache marker", async () => {
    pasangMock({ reads: 1234, refills: 3 });
    await getCompanies();
    const snap = getQuotaSnapshot();
    /* 1234 + 2 dokumen refill = 1236; refill hari ini 3 + 1 = 4. */
    assert.equal(snap.readsEstimate, 1236);
    assert.equal(snap.refillsToday, 4);
    assert.equal(snap.counterDay, TODAY_WIB);
  });

  it("cuplikan kesehatan instance dingin: source seed, cacheWarm false", async () => {
    const snap = await getCompaniesHealthSnapshot();
    assert.equal(snap.source, "seed");
    assert.equal(snap.cacheWarm, false);
    assert.equal(snap.liveAsOf, null);
    assert.equal(snap.seedModeMinutes, 0);
    assert.equal(snap.readsEstimate, 0);
    assert.equal(snap.quotaPercent, 0);
    assert.equal(snap.cacheAgeMs, null);
    assert.ok(snap.seedDate);
  });

  it("cuplikan kesehatan setelah refill: live + rev + liveAsOf", async () => {
    pasangMock({ rev: 7 });
    await getCompanies();
    const snap = await getCompaniesHealthSnapshot();
    assert.equal(snap.source, "live");
    assert.equal(snap.rev, 7);
    assert.equal(snap.cacheWarm, true);
    assert.ok(snap.liveAsOf);
    assert.ok(snap.lastMarkerCheck);
    assert.equal(snap.readsEstimate, 2);
    assert.ok(snap.cacheAgeMs >= 0);
  });

  it("getCompaniesWithSource membawa liveAsOf (null sebelum refill)", async () => {
    pasangMock({ markerStatus: 429 });
    const seed = await getCompaniesWithSource();
    assert.equal(seed.liveAsOf, null);
    pasangMock({});
    const pulihkan = geserJam(61_000);
    const live = await getCompaniesWithSource();
    pulihkan();
    assert.ok(live.liveAsOf);
  });
});
