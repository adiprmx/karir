/* Tes dasbor (DASH-02), memakai test runner bawaan Node.
 * Dijalankan dengan: node --test app/dasbor.test.js
 * (koordinator menambahkan berkas ini ke skrip `npm test`.)
 *
 * computeStats/computeTargets internal (tidak diekspor) — dites
 * lewat getStatsWithSource/getTargetsOrSeed dengan fetch mock
 * (pola lib/companies-seed.test.js): marker 429 berarti Firestore
 * tidak bisa dibaca, jadi sumbernya seed repo. Semua fetch di sini
 * mock: tidak ada jaringan, tidak ada kredensial asli.
 *
 * Angka yang diharapkan TIDAK dikode keras: total, sebaran status,
 * tanggal terbaru, dan jendela 7 hari dihitung dari seed repo saat
 * test jalan, jadi hunting harian tidak merusak test ini. */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { largestRemainderPercents } from "../lib/percentages.js";
import { countBy, topEntries } from "../lib/search.js";
import { STATUS_ORDER } from "../lib/companies.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");

function baca(relatif) {
  return readFileSync(join(WEB, relatif), "utf-8");
}

const SEED = JSON.parse(baca("data/companies.json"));

/* companies.js membaca env saat modul dimuat, jadi env dipasang
 * SEBELUM impor dinamis. Nilai di sini tiruan, bukan kredensial. */
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "kunci-uji";

const { getStatsWithSource, getTargetsOrSeed } = await import(
  "../lib/companies.js"
);

const fetchAsli = globalThis.fetch;

before(() => {
  /* Semua baca Firestore gagal 429: sumber data jadi seed repo. */
  globalThis.fetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({}),
  });
});

after(() => {
  globalThis.fetch = fetchAsli;
});

/* Hitungan langsung dari seed — pembanding independen untuk hasil
 * getStatsWithSource/getTargetsOrSeed. */
function hitungSeed() {
  const byStatus = {};
  for (const s of STATUS_ORDER) {
    byStatus[s] = SEED.filter((c) => c.status === s).length;
  }
  const byDate = {};
  for (const c of SEED) {
    if (c.tanggal_cek) byDate[c.tanggal_cek] = (byDate[c.tanggal_cek] || 0) + 1;
  }
  const dateKeys = Object.keys(byDate).sort();
  const latestDate = dateKeys[dateKeys.length - 1];
  const latestMs = Date.parse(`${latestDate}T00:00:00Z`);
  const weekStartMs = latestMs - 6 * 24 * 60 * 60 * 1000;
  const checkedWeek = dateKeys.reduce(
    (sum, d) =>
      Date.parse(`${d}T00:00:00Z`) >= weekStartMs
        ? sum + (byDate[d] || 0)
        : sum,
    0,
  );
  return { byStatus, byDate, latestDate, checkedWeek };
}

describe("getStatsWithSource saat Firestore 429 (DASH-02)", () => {
  it("sumber seed; total + sebaran status sama dengan hitungan seed", async () => {
    const { stats, source } = await getStatsWithSource();
    assert.equal(source, "seed");
    const banding = hitungSeed();
    assert.equal(stats.total, SEED.length);
    assert.deepEqual(stats.byStatus, banding.byStatus);
    assert.deepEqual(stats.byDate, banding.byDate);
    const jumlahStatus = Object.values(stats.byStatus).reduce((a, b) => a + b, 0);
    assert.equal(jumlahStatus, stats.total);
  });

  it("tanggal terbaru + jumlah dicek 7 hari terakhir dari byDate", async () => {
    const { stats } = await getStatsWithSource();
    const banding = hitungSeed();
    const dateKeys = Object.keys(stats.byDate).sort();
    assert.equal(dateKeys[dateKeys.length - 1], banding.latestDate);
    /* Rumus yang sama dengan dasbor/page.js: jendela 7 hari yang
     * berakhir di tanggal cek terbaru. */
    const latestMs = Date.parse(`${banding.latestDate}T00:00:00Z`);
    const weekStartMs = latestMs - 6 * 24 * 60 * 60 * 1000;
    const checkedWeek = dateKeys.reduce(
      (sum, d) =>
        Date.parse(`${d}T00:00:00Z`) >= weekStartMs
          ? sum + (stats.byDate[d] || 0)
          : sum,
      0,
    );
    assert.equal(checkedWeek, banding.checkedWeek);
    assert.ok(checkedWeek > 0, "tidak ada yang dicek 7 hari terakhir");
    assert.ok(checkedWeek <= stats.total);
  });

  it("target = perusahaan Ada lowongan, urut nama (DASH-02)", async () => {
    const targets = await getTargetsOrSeed();
    const { stats } = await getStatsWithSource();
    assert.equal(targets.length, stats.byStatus["Ada lowongan"]);
    assert.ok(targets.every((c) => c.status === "Ada lowongan"));
    const nama = targets.map((c) => c.perusahaan);
    assert.deepEqual(nama, [...nama].sort((a, b) => a.localeCompare(b, "id")));
  });
});

describe("persentase status memakai sisa terbesar (DASH-07)", () => {
  it("persentase sebaran seed nyata berjumlah tepat 100", () => {
    const banding = hitungSeed();
    const counts = STATUS_ORDER.map((s) => banding.byStatus[s]);
    const persen = largestRemainderPercents(counts, SEED.length);
    assert.equal(persen.length, STATUS_ORDER.length);
    assert.equal(persen.reduce((a, b) => a + b, 0), 100);
    for (const p of persen) {
      assert.ok(Number.isInteger(p) && p >= 0 && p <= 100);
    }
    /* Status terbanyak mendapat persentase terbesar. */
    const maks = Math.max(...counts);
    assert.equal(persen[counts.indexOf(maks)], Math.max(...persen));
  });

  it("total 0 memberi 0% di semua baris, bukan NaN", () => {
    assert.deepEqual(largestRemainderPercents([0, 0, 0, 0], 0), [0, 0, 0, 0]);
    assert.deepEqual(largestRemainderPercents([], 0), []);
  });
});

describe("kategori teratas (DASH-02)", () => {
  it("topEntries(countBy(kategori), 8): paling banyak 8, urut turun", () => {
    const top = topEntries(countBy(SEED, "kategori"), 8);
    assert.ok(top.length > 0 && top.length <= 8);
    for (let i = 1; i < top.length; i += 1) {
      assert.ok(top[i - 1].count >= top[i].count);
    }
    const jumlahTop = top.reduce((n, e) => n + e.count, 0);
    assert.ok(jumlahTop > 0 && jumlahTop <= SEED.length);
    /* Kategori teratas benar-benar yang terbanyak di seed. */
    const semua = countBy(SEED, "kategori");
    const maks = Math.max(...Object.values(semua));
    assert.equal(top[0].count, maks);
  });
});

describe("wiring dasbor/page.js + dashboard-personal.js", () => {
  const page = baca("app/dasbor/page.js");
  const personal = baca("app/dashboard-personal.js");

  it("SEG_CLASS mencakup semua STATUS_ORDER", () => {
    for (const s of STATUS_ORDER) {
      assert.ok(page.includes(`"${s}":`), `SEG_CLASS tanpa "${s}"`);
    }
  });

  it("stackbar memakai role img + tautan Lihat di peta", () => {
    assert.ok(page.includes('<div className="stackbar" role="img"'));
    assert.ok(page.includes('href="/peta"'));
    assert.ok(page.includes("dash.viewOnMap"));
  });

  it("RecheckList memotong 10 + tautan dan lainnya", () => {
    assert.ok(page.includes("list.slice(0, 10)"));
    assert.ok(page.includes("list.length > 10"));
    assert.ok(page.includes("dash.andMore"));
    assert.ok(page.includes('`/cari?status=${encodeURIComponent(status)}`'));
  });

  it("kanonis /dasbor dan penanda data cadangan", () => {
    assert.ok(page.includes('canonical: "/dasbor"'));
    assert.ok(page.includes('source === "seed"'));
    assert.ok(page.includes('"common.seedNote"'));
  });

  it("DASH_DEFAULTS berisi 17 kunci label", () => {
    const m = personal.match(/const DASH_DEFAULTS = \{([\s\S]*?)\n\};/);
    assert.ok(m, "DASH_DEFAULTS tidak ditemukan");
    const kunci = [
      "title", "choiceBoth", "choiceDomisili", "choicePosisi", "noChoice",
      "viewMatches", "editChoices", "start", "lastSearch", "nextSteps",
      "stepChoice", "stepFirstMark", "stepReadMethod", "done",
      "trackerTitle", "emptyTitle", "sync",
    ];
    assert.equal(kunci.length, 17);
    for (const k of kunci) {
      assert.ok(new RegExp(`^\\s*${k}:`, "m").test(m[1]), `DASH_DEFAULTS tanpa ${k}`);
    }
    /* Halaman dasbor meneruskan semua 17 lewat props. `sync`
     * adalah objek bersarang, jadi dicek terpisah. */
    for (const k of kunci.filter((x) => x !== "sync")) {
      assert.ok(
        new RegExp(`\\b${k}: t\\(locale,`).test(page),
        `dasbor/page.js tidak meneruskan labels.${k}`,
      );
    }
    assert.ok(page.includes("sync: {"), "dasbor/page.js tanpa labels.sync");
    assert.ok(page.includes('saved: t(locale, "sync.saved")'));
    assert.ok(page.includes('guest: t(locale, "sync.guest")'));
  });

  it("DashboardPersonal memakai hasOnboardingChoice + loadRecentSearch + useTracker", () => {
    assert.ok(personal.includes("hasOnboardingChoice"));
    assert.ok(personal.includes("loadRecentSearch()"));
    assert.ok(personal.includes("useTracker()"));
  });
});
