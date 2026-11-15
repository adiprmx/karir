/* Tes state peta (PETA-05, koordinator Gelombang 3 Fase 5), memakai
 * test runner bawaan Node. Dijalankan dengan: npm test
 *
 * Tes wiring statis — MEMBACA berkas sumber langsung, pola yang sama
 * dengan app/w1-b1.test.js: komponen memakai JSX sehingga tidak bisa
 * diimpor node:test, tetapi state loading dan state kosong dijaga agar
 * tidak hilang diam-diam. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");

function baca(relatif) {
  return readFileSync(join(WEB, relatif), "utf-8");
}

describe("state peta (PETA-05)", () => {
  it("teks loading tampil selama Leaflet dimuat, hilang sesudah peta siap", () => {
    const src = baca("app/map-client.js");
    assert.ok(src.includes("mapReady"), "tidak ada state mapReady");
    assert.ok(src.includes("setMapReady(true)"), "mapReady tidak pernah true");
    assert.ok(
      src.includes("!mapReady && !failed"),
      "teks loading tidak digerbangi mapReady/failed",
    );
    assert.ok(src.includes("labels.loading"), "teks loading tidak memakai label");
    assert.ok(
      src.includes('role="status"'),
      "teks loading tidak diumumkan ke pembaca layar",
    );
  });

  it("pesan kosong tampil bila tidak ada grup, tanpa menunggu panel kota", () => {
    const src = baca("app/map-client.js");
    assert.ok(
      src.includes("groups.length === 0"),
      "tidak ada cabang groups kosong",
    );
    assert.ok(src.includes("labels.empty"), "pesan kosong tidak memakai label");
  });

  it("label loading + kosong ada di i18n (ID + EN) dan diteruskan peta/page.js", () => {
    const i18n = baca("lib/i18n.js");
    for (const kunci of ['"map.loading"', '"map.empty"']) {
      const jumlah = i18n.split(kunci).length - 1;
      assert.equal(jumlah, 2, `${kunci} muncul ${jumlah}x, harus 2x (ID + EN)`);
    }
    const peta = baca("app/peta/page.js");
    assert.ok(peta.includes('"map.loading"'), "peta/page.js tidak meneruskan loading");
    assert.ok(peta.includes('"map.empty"'), "peta/page.js tidak meneruskan empty");
  });

  it("cadangan Indonesia untuk kedua label ada di map-client.js", () => {
    const src = baca("app/map-client.js");
    assert.ok(src.includes('loading: "Memuat peta…"'));
    assert.ok(src.includes('empty: "Belum ada lowongan target di peta."'));
  });
});

/* --- PETA-06: smoke GET /peta + wiring peta yang belum tercakup.
 * Pencocokan kota sendiri SUDAH teruji penuh di lib/cities.test.js
 * (44 test: kata utuh, kalimat peniadaan, urutan spesifisitas,
 * multi-kota, kota tambahan) — di sini tidak diulang. Yang dites:
 * smoke check /peta, pengelompokan halaman (multi-kota, "Lokasi
 * lain", angka lede yang jujur), wiring map-client.js (penanda,
 * chip, fallback), dan label i18n lengkap. --- */
describe("smoke GET /peta (PETA-06)", () => {
  it("smoke-check.mjs punya cek GET /peta 200 + judul halaman", () => {
    const smoke = baca("scripts/smoke-check.mjs");
    assert.ok(smoke.includes("async function checkPeta()"));
    assert.ok(smoke.includes('fetchText("/peta")'));
    assert.ok(smoke.includes('"Peta lowongan"'));
    assert.ok(smoke.includes("await checkPeta();"));
  });
});

describe("pengelompokan peta/page.js (PETA-02/03/08)", () => {
  const page = baca("app/peta/page.js");

  it("memakai matchCities (multi-kota), bukan matchCity satu kota", () => {
    assert.ok(page.includes("matchCities(c.lokasi)"));
    assert.doesNotMatch(page, /matchCity\(c\.lokasi\)/);
  });

  it("perusahaan tanpa kota masuk daftar other (lipatan Lokasi lain)", () => {
    assert.ok(page.includes("other.push(c)"));
    assert.ok(page.includes("other={other.map"));
    assert.ok(page.includes('otherLocations: t(locale, "map.otherLocations")'));
  });

  it("angka lede adalah yang benar-benar terpetakan, bukan semua target", () => {
    assert.ok(page.includes("mappedCount = targets.length - other.length"));
    assert.ok(page.includes('t(locale, "landing.featureMapDesc", { n: mappedCount })'));
    assert.doesNotMatch(
      page,
      /featureMapDesc", \{ n: targets\.length \}/,
    );
  });

  it("grup diurutkan dari kota dengan perusahaan terbanyak", () => {
    assert.ok(page.includes(".sort((a, b) => b.companies.length - a.companies.length)"));
  });

  it("metadata kanonis /peta + render per request", () => {
    assert.ok(page.includes('export const dynamic = "force-dynamic"'));
    assert.ok(page.includes('title: "Peta lowongan"'));
    assert.ok(page.includes('alternates: { canonical: "/peta" }'));
  });

  it("data diambil lewat getTargetsOrSeed (seed bila Firestore mati)", () => {
    assert.ok(page.includes("getTargetsOrSeed()"));
  });
});

describe("wiring map-client.js (PETA-06/07)", () => {
  const src = baca("app/map-client.js");

  it("ubin OSM + atribusi terpasang", () => {
    assert.ok(src.includes("tile.openstreetmap.org/{z}/{x}/{y}.png"));
    assert.ok(src.includes("OpenStreetMap"));
  });

  it("tiap penanda punya nama aksesibel dari label marker", () => {
    assert.match(src, /node\.setAttribute\(\s*"aria-label"/);
    assert.ok(src.includes("labels.marker"));
    assert.ok(src.includes('.replace("{city}", g.city.name)'));
    assert.ok(src.includes('.replace("{n}", String(g.companies.length))'));
    assert.ok(src.includes('node.setAttribute("role", "button")'));
  });

  it("wadah peta memakai role region berlabel, bukan application", () => {
    assert.ok(src.includes('role="region"'));
    /* Kata application masih disebut di komentar penjelas (alasan
     * role itu tidak dipakai) — yang dicek di sini adalah kode JSX,
     * bukan komentar. */
    const tanpaKomentar = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    assert.doesNotMatch(tanpaKomentar, /role="application"/);
  });

  it("chip kota menandai pilihan aktif dan memilih kota saat diklik", () => {
    assert.ok(src.includes('aria-pressed={g.city.name === selected}'));
    assert.ok(src.includes("onClick={() => choose(g)}"));
    assert.ok(src.includes("chip-count"));
  });

  it("memilih kota menggeser peta (flyTo, atau setView bila reduced-motion)", () => {
    assert.ok(src.includes("map.flyTo([g.city.lat, g.city.lng]"));
    assert.ok(src.includes("map.setView([g.city.lat, g.city.lng]"));
    assert.ok(src.includes("mapFlyDurationMs(reducedMotion())"));
  });

  it("daftar kota memakai tautan ke halaman perusahaan", () => {
    assert.ok(src.includes("href={`/perusahaan/${c.no}`}"));
  });

  it("gagal muat Leaflet menampilkan pesan gagal, bukan halaman kosong", () => {
    assert.ok(src.includes("setFailed(true)"));
    assert.ok(src.includes("labels.failed"));
  });

  it("semua label peta diteruskan halaman lewat props", () => {
    const page = baca("app/peta/page.js");
    for (const kunci of [
      "chooseCity",
      "label",
      "marker",
      "failed",
      "loading",
      "empty",
      "otherLocations",
    ]) {
      assert.ok(
        page.includes(`${kunci}: t(locale, "map.${kunci}")`),
        `peta/page.js tidak meneruskan map.${kunci}`,
      );
    }
  });

  it("ketujuh label peta ada di i18n (ID + EN)", () => {
    const i18n = baca("lib/i18n.js");
    for (const kunci of [
      "map.chooseCity",
      "map.label",
      "map.marker",
      "map.failed",
      "map.loading",
      "map.empty",
      "map.otherLocations",
    ]) {
      const jumlah = i18n.split(`"${kunci}"`).length - 1;
      assert.equal(jumlah, 2, `${kunci} muncul ${jumlah}x, harus 2x (ID + EN)`);
    }
  });

  it("/peta tercantum di sitemap dengan lastModified dinamis dari data", () => {
    const sitemap = baca("app/sitemap.js");
    assert.ok(sitemap.includes('"/peta"'));
    assert.doesNotMatch(sitemap, /lastModified: "2026-11-06"/);
    assert.ok(sitemap.includes("latestCheck"));
  });
});
