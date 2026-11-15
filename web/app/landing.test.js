/* Tes beranda (LAND-10) + perilaku groupOf TargetFilter (CARI-06),
 * memakai test runner bawaan Node. Dijalankan dengan:
 *   node --test app/landing.test.js
 * (koordinator menambahkan berkas ini ke skrip `npm test`.)
 *
 * Sebagian tes wiring statis — MEMBACA berkas sumber langsung, pola
 * yang sama dengan app/w1-b1.test.js: Beranda memakai JSX sehingga
 * tidak bisa diimpor node:test. Sebagian tes perilaku nyata: hitungan
 * peran dihitung dari seed repo lewat runSearch yang sama dengan
 * yang dipakai Beranda, dan groupOf + isFreshData diekstrak dari
 * sumber lalu dijalankan (pola ekstraksi sumber di
 * app/w2c-admin.test.js) — jadi perilakunya dites, bukan hanya
 * keberadaan kodenya.
 *
 * Angka yang diharapkan TIDAK dikode keras: hitungan peran dihitung
 * ulang dari seed saat test jalan; yang dikunci adalah rumus
 * (positionMatched DAN status "Ada lowongan") dan daftar peran
 * (dari brief produk). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runSearch } from "../lib/search.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");

function baca(relatif) {
  return readFileSync(join(WEB, relatif), "utf-8");
}

const SEED = JSON.parse(baca("data/companies.json"));
const PAGE = baca("app/page.js");

/* Ambil daftar peran dari page.js (const ROLE_NAMES = [...]). */
function peranDariSumber() {
  const m = PAGE.match(/const ROLE_NAMES = \[([\s\S]*?)\];/);
  assert.ok(m, "ROLE_NAMES tidak ditemukan di app/page.js");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/* Ekstrak fungsi murni dari sumber dan jalankan (pola w2c-admin). */
function ekstrakFungsi(src, polaAwal, polaAkhir) {
  const awal = src.search(polaAwal);
  assert.ok(awal !== -1, `tidak ditemukan: ${polaAwal}`);
  const akhir = src.indexOf(polaAkhir, awal);
  assert.ok(akhir !== -1, `tidak ditemukan akhir: ${polaAkhir}`);
  return src.slice(awal, akhir + polaAkhir.length);
}

describe("hitungan peran dari seed (LAND-10)", () => {
  it("daftar peran sama dengan brief produk (7 peran SMK)", () => {
    assert.deepEqual(peranDariSumber(), [
      "Helper Gudang",
      "Staff Gudang",
      "Cleaning Service",
      "Office Boy",
      "Packing",
      "Operator Produksi",
      "Crew Store",
    ]);
  });

  it("hitungan peran memakai rumus Beranda: cocok posisi DAN Ada lowongan", () => {
    /* Rumus yang sama dengan app/page.js: runSearch lalu saring
     * positionMatched + status "Ada lowongan". */
    const hitungan = peranDariSumber().map((name) => {
      const { results } = runSearch(SEED, { posisi: name });
      return {
        name,
        count: results.filter(
          (e) => e.positionMatched && e.company.status === "Ada lowongan",
        ).length,
      };
    });
    for (const { name, count } of hitungan) {
      assert.ok(Number.isInteger(count) && count >= 0, `${name}: ${count}`);
    }
    /* Seed punya data peran: paling tidak satu peran berisi
     * lowongan, dan peran paling umum (Helper Gudang) tidak kosong. */
    const total = hitungan.reduce((n, r) => n + r.count, 0);
    assert.ok(total > 0, "semua peran kosong — seed atau rumus rusak");
    assert.ok(
      hitungan.find((r) => r.name === "Helper Gudang").count > 0,
      "Helper Gudang kosong padahal peran paling umum",
    );
    /* Hitungan tidak boleh melebihi jumlah perusahaan. */
    assert.ok(total <= SEED.length);
  });

  it("wiring: Beranda meneruskan roles + nos + targetMask ke HeroSearch", () => {
    assert.ok(PAGE.includes("roles={roles}"));
    assert.ok(PAGE.includes("nos={companies.map((c) => c.no)}"));
    assert.ok(
      PAGE.includes(
        'targetMask={companies\n            .map((c) => (c.status === "Ada lowongan" ? "1" : "0"))\n            .join("")}',
      ),
    );
  });
});

describe("groupOf TargetFilter (CARI-06)", () => {
  const src = baca("app/target-filter.js");
  const groupOf = new Function(
    `${ekstrakFungsi(src, /const GROUP_KEYWORDS = \[/, "];")}\n` +
      `${ekstrakFungsi(src, /function groupOf\(c\) \{/, "\n}")}\n` +
      "return groupOf;",
  )();

  it("kata kunci paling awal menentukan kelompok", () => {
    assert.equal(groupOf({ posisi: "Helper Gudang", kategori: "" }), "Gudang");
    assert.equal(groupOf({ posisi: "Staff Gudang", kategori: "" }), "Gudang");
    assert.equal(groupOf({ posisi: "Cleaning Service", kategori: "" }), "Cleaning");
    assert.equal(groupOf({ posisi: "Operator Produksi", kategori: "" }), "Produksi");
    assert.equal(groupOf({ posisi: "Crew Store", kategori: "" }), "Toko");
  });

  it("Helper Produksi masuk Gudang: helper mendahului produksi (perilaku tercatat)", () => {
    /* CARI-06: keputusan yang dicatat — kata kunci paling awal
     * menang, jadi "Helper Produksi" jadi Gudang, bukan Produksi.
     * Test ini mengunci perilaku saat ini; bila diubah, ubah test
     * ini bersamaan dengan sengaja. */
    assert.equal(groupOf({ posisi: "Helper Produksi", kategori: "" }), "Gudang");
  });

  it("kategori dipakai bila posisi tidak mengandung kata kunci", () => {
    assert.equal(groupOf({ posisi: "", kategori: "Gudang" }), "Gudang");
    assert.equal(groupOf({ posisi: "Packing", kategori: "" }), "Lainnya");
    assert.equal(groupOf({ posisi: "", kategori: "" }), "Lainnya");
  });

  it("sebaran kelompok target seed berjumlah sama dengan jumlah target", () => {
    const targets = SEED.filter((c) => c.status === "Ada lowongan");
    const hitungan = {};
    for (const c of targets) {
      const g = groupOf(c);
      hitungan[g] = (hitungan[g] || 0) + 1;
    }
    const total = Object.values(hitungan).reduce((a, b) => a + b, 0);
    assert.equal(total, targets.length);
    for (const g of Object.keys(hitungan)) {
      assert.ok(
        ["Gudang", "Cleaning", "Produksi", "Toko", "Lainnya"].includes(g),
        `kelompok di luar daftar: ${g}`,
      );
    }
    /* Kelompok Gudang adalah yang terbesar di data seed. */
    assert.ok(hitungan.Gudang > 0);
  });
});

describe("wiring Beranda (LAND-10)", () => {
  it("kanonis beranda adalah /", () => {
    assert.ok(PAGE.includes('alternates: { canonical: "/" }'));
  });

  it("label segar memakai jendela 7 hari dari tanggal terbaru", () => {
    const isFreshData = new Function(
      `${ekstrakFungsi(PAGE, /function isFreshData\(latestMs\) \{/, "\n}")}\n` +
        "return isFreshData;",
    )();
    const sekarang = Date.now();
    assert.equal(isFreshData(sekarang), true);
    assert.equal(isFreshData(sekarang - 6 * 86400000), true);
    assert.equal(isFreshData(sekarang - 8 * 86400000), false);
    assert.equal(isFreshData(0), false);
    assert.ok(PAGE.includes("landing.freshOk"));
    assert.ok(PAGE.includes("landing.freshStale"));
    assert.ok(PAGE.includes("landing.freshLabel"));
  });

  it("bagi daftar memakai tautan live /cari?status=Ada lowongan", () => {
    assert.ok(PAGE.includes('`${SITE_URL}/cari?status=${encodeURIComponent("Ada lowongan")}`'));
    assert.ok(PAGE.includes("home.shareTargetsMsg"));
    assert.ok(PAGE.includes("wa.me/?text="));
  });

  it("ChangesFeed + TargetFilter dirender di beranda", () => {
    assert.ok(PAGE.includes("<ChangesFeed"));
    assert.ok(PAGE.includes("<TargetFilter"));
    assert.ok(PAGE.includes('id="berubah"'));
  });

  it("JSON-LD Organization + WebSite + SearchAction ke /cari", () => {
    assert.ok(PAGE.includes('"@type": "Organization"'));
    assert.ok(PAGE.includes('"@type": "WebSite"'));
    assert.ok(PAGE.includes('"@type": "SearchAction"'));
    assert.ok(
      PAGE.includes("`${SITE_URL}/cari?posisi={search_term_string}`"),
    );
  });

  it("foto strip lokal (bukan hotlink), alt + caption dari i18n", () => {
    assert.ok(PAGE.includes('src: "/foto-gudang.jpg"'));
    assert.ok(PAGE.includes('src: "/foto-produksi.jpg"'));
    assert.ok(PAGE.includes('src: "/foto-cleaning.jpg"'));
    assert.doesNotMatch(PAGE, /unsplash\.com|images\.unsplash/);
    assert.ok(PAGE.includes("landing.photoAltWarehouse"));
    assert.ok(PAGE.includes("landing.photoWarehouse"));
  });

  it("angka bukti memakai CountUp dari stats + targets", () => {
    assert.ok(PAGE.includes("<CountUp value={stats.total} />"));
    assert.ok(PAGE.includes("<CountUp value={targets.length} />"));
    assert.ok(
      PAGE.includes('<CountUp value={stats.byStatus["Portal tidak bisa dibuka"] || 0} />'),
    );
  });

  it("kata terverifikasi menaut ke definisinya di /metode", () => {
    assert.ok(PAGE.includes('<Link href="/metode">{t(locale, "home.targetsLead")}</Link>'));
  });
});
