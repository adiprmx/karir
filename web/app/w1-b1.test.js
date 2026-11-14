/* Tes unit Gelombang 1 batch B1 (Beranda, Fase 5), memakai test
 * runner bawaan Node. Dijalankan dengan: npm test
 *
 * Dua jenis tes:
 * (a) Perilaku murni yang bisa diimpor langsung: formatDate
 *     (LAND-04) dan semantik runSearch/matchedCompanyNos yang
 *     menjadi dasar perbaikan LAND-09 (tanpa kecocokan ketat,
 *     results.length tetap seluruh indeks sementara matched kosong).
 * (b) Tes wiring statis — MEMBACA berkas sumber langsung, pola yang
 *     sama dengan tes kontras di lib/a11y.test.js: komponen Beranda
 *     memakai JSX sehingga tidak bisa diimpor oleh node --test,
 *     tetapi wiring-nya (satu fetch bersama, hitungan tautan,
 *     prefill onboarding, foto lokal, tombol coba lagi) tetap
 *     dijaga agar tidak kembali rusak diam-diam. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { formatDate } from "./components.js";
import { runSearch, matchedCompanyNos } from "../lib/search.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");

function baca(relatif) {
  return readFileSync(join(WEB, relatif), "utf8");
}

function hitung(sumber, jarum) {
  return sumber.split(jarum).length - 1;
}

function company(overrides = {}) {
  return {
    no: 1,
    perusahaan: "PT Contoh",
    posisi: "",
    lokasi: "",
    kategori: "Manufaktur",
    status: "Tidak ada lowongan",
    link_karir: "",
    catatan: "",
    ...overrides,
  };
}

describe("formatDate (LAND-04 / UX-11)", () => {
  it("tanggal ISO menjadi format Indonesia", () => {
    assert.equal(formatDate("2026-11-14", "id"), "14 Nov 2026");
  });

  it("locale Inggris memakai format Inggris", () => {
    assert.equal(formatDate("2026-11-14", "en"), "14 Nov 2026");
  });

  it("nilai bukan tanggal ISO mengembalikan null (pemanggil memakai nilai mentah)", () => {
    assert.equal(formatDate("bukan-tanggal", "id"), null);
    assert.equal(formatDate("", "id"), null);
    assert.equal(formatDate(null, "id"), null);
  });
});

describe("semantik hitungan hasil (LAND-09)", () => {
  const indeks = [
    company({ no: 1, perusahaan: "PT Gudang Raya", posisi: "Helper Gudang" }),
    company({ no: 2, perusahaan: "PT Bersih Jaya", posisi: "Cleaning Service" }),
    company({ no: 3, perusahaan: "PT Rakit Mesin", posisi: "Operator Produksi" }),
  ];

  it("tanpa kecocokan ketat: matched kosong tetapi results tetap seluruh indeks", () => {
    const { results, query } = runSearch(indeks, { posisi: "astronot" });
    assert.equal(results.length, 3);
    assert.deepEqual(matchedCompanyNos(results, query), []);
  });

  it("dengan kecocokan: matched hanya berisi perusahaan yang cocok", () => {
    const { results, query } = runSearch(indeks, { posisi: "gudang" });
    assert.deepEqual(matchedCompanyNos(results, query), [1]);
  });
});

describe("wiring changes-feed.js + target-filter.js (LAND-05 / FE-05)", () => {
  const feed = baca("app/changes-feed.js");
  const filter = baca("app/target-filter.js");

  it("hanya ada satu fetch /api/changes di kedua berkas (di pemuat bersama)", () => {
    assert.equal(hitung(feed, 'fetch("/api/changes"'), 1);
    assert.equal(hitung(filter, 'fetch("/api/changes"'), 0);
  });

  it("changes-feed.js mengekspor loadChanges dan target-filter.js memakainya", () => {
    assert.match(feed, /export function loadChanges\(\)/);
    assert.match(
      filter,
      /import \{ loadChanges \} from "@\/app\/changes-feed"/,
    );
    assert.match(filter, /loadChanges\(\)/);
  });

  it("pemuat bersama memakai ulang janji yang sama (cache modul)", () => {
    assert.match(feed, /let changesPromise = null/);
    assert.match(feed, /if \(!changesPromise\)/);
  });
});

describe("wiring tanggal umpan (LAND-04 / UX-11)", () => {
  it("changes-feed.js memformat checkedAt dengan formatDate, bukan mentah", () => {
    const feed = baca("app/changes-feed.js");
    assert.match(feed, /formatDate\(c\.checkedAt, locale\)/);
    assert.doesNotMatch(feed, /\{c\.checkedAt\}/);
  });

  it("page.js meneruskan locale ke ChangesFeed", () => {
    assert.match(baca("app/page.js"), /<ChangesFeed\s+locale=\{locale\}/);
  });
});

describe("wiring hero-search.js (LAND-06 / LAND-09 / ONB-12)", () => {
  const hero = baca("app/hero-search.js");

  it("LAND-06: saat error tampil pesan + tombol coba lagi, bukan null", () => {
    assert.match(hero, /\{labels\.error\}/);
    assert.match(hero, /\{labels\.retry\}/);
    assert.match(hero, /onClick=\{start\}/);
    assert.doesNotMatch(hero, /state === "error" \? null/);
  });

  it("LAND-09: tautan memakai matched.size dan hilang bila tidak ada kecocokan", () => {
    assert.match(hero, /fill\(labels\.seeAll, \{ n: ranked\.matched\.size \}\)/);
    assert.doesNotMatch(
      hero,
      /anyStrict \? ranked\.matched\.size : ranked\.results\.length/,
    );
    assert.match(hero, /\{anyStrict && \(/);
  });

  it("ONB-12: prefill dari pilihan tersimpan onboarding", () => {
    assert.match(
      hero,
      /import \{ loadOnboarding, hasOnboardingChoice \} from "@\/app\/onboarding"/,
    );
    assert.match(hero, /hasOnboardingChoice\(saved\)/);
    assert.match(hero, /setDomisili\(saved\.domisili\)/);
    assert.match(hero, /setPosisi\(saved\.posisi\)/);
  });

  it("LAND-11: strip foto punya fallback onError", () => {
    assert.match(hero, /onError=\{\(\) => setFailed\(true\)\}/);
    assert.match(hero, /export function PhotoStrip/);
  });
});

describe("wiring page.js + foto lokal (LAND-08 / LAND-11)", () => {
  const page = baca("app/page.js");

  it("tidak ada lagi hotlink Unsplash; ketiga foto memakai berkas lokal", () => {
    assert.doesNotMatch(page, /images\.unsplash\.com/);
    assert.match(page, /"\/foto-gudang\.jpg"/);
    assert.match(page, /"\/foto-produksi\.jpg"/);
    assert.match(page, /"\/foto-cleaning\.jpg"/);
  });

  it("caption dan alt memakai kunci i18n", () => {
    assert.match(page, /"landing\.photoWarehouse"/);
    assert.match(page, /"landing\.photoProduction"/);
    assert.match(page, /"landing\.photoCleaning"/);
    assert.match(page, /"landing\.photoAltWarehouse"/);
    assert.match(page, /"landing\.photoAltProduction"/);
    assert.match(page, /"landing\.photoAltCleaning"/);
  });

  it("ketiga foto lokal ada di web/public/ dan berformat JPEG", () => {
    for (const nama of [
      "foto-gudang.jpg",
      "foto-produksi.jpg",
      "foto-cleaning.jpg",
    ]) {
      const jalur = join(WEB, "public", nama);
      assert.ok(existsSync(jalur), `${nama} tidak ada`);
      const kepala = readFileSync(jalur).subarray(0, 2);
      assert.deepEqual([...kepala], [0xff, 0xd8], `${nama} bukan JPEG`);
    }
  });

  it("kunci alt baru ada di blok W1-B1 i18n (ID + EN)", () => {
    const kamus = baca("lib/i18n.js");
    assert.equal(hitung(kamus, "W1-B1"), 4);
    for (const kunci of [
      "landing.photoAltWarehouse",
      "landing.photoAltProduction",
      "landing.photoAltCleaning",
    ]) {
      assert.equal(hitung(kamus, `"${kunci}"`), 2, kunci);
    }
  });
});
