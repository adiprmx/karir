/* Tes unit untuk lib/search.js, memakai test runner bawaan Node.
 * Dijalankan dengan: npm test
 * Setiap tes meniru perilaku nyata kode yang dibaca, bukan asumsi:
 * skor +50/+30/+20/+10/-20/-10, sinonim, token mentah untuk nama
 * perusahaan, jendela penyangkalan 60 karakter, dan mode nama. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeText,
  expandToken,
  tokenize,
  tokenizeRaw,
  fieldMatches,
  fieldMatchesAffirmative,
  scoreCompany,
  compareByScore,
  countBy,
  topEntries,
  runSearch,
} from "./search.js";

function company(overrides = {}) {
  return {
    perusahaan: "PT Contoh",
    posisi: "",
    lokasi: "",
    kategori: "Manufaktur",
    status: "Tidak ada lowongan target",
    link_karir: "",
    catatan: "",
    ...overrides,
  };
}

function query(overrides = {}) {
  return {
    domisiliTokens: tokenize(overrides.domisili || ""),
    posisiTokens: tokenize(overrides.posisi || ""),
    rawPosisiTokens: tokenizeRaw(overrides.posisi || ""),
  };
}

describe("normalizeText", () => {
  it("huruf kecil, aksen hilang, spasi dirapikan", () => {
    assert.equal(normalizeText("  GÚDANG   Besar "), "gudang besar");
    assert.equal(normalizeText(""), "");
    assert.equal(normalizeText(null), "");
  });
});

describe("sinonim", () => {
  it("cleaner diperluas ke cleaning dan kebersihan", () => {
    assert.deepEqual(tokenize("cleaner"), [
      ["cleaner", "cleaning", "kebersihan"],
    ]);
  });

  it("warehouse diperluas ke gudang", () => {
    assert.deepEqual(tokenize("warehouse"), [["warehouse", "gudang"]]);
  });

  it("cleaner menemukan Cleaning Service", () => {
    assert.equal(fieldMatches("Cleaning Service", tokenize("cleaner")), true);
  });

  it("warehouse menemukan Staff Gudang", () => {
    assert.equal(fieldMatches("Staff Gudang", tokenize("warehouse")), true);
  });

  it("kata tanpa sinonim kembali apa adanya", () => {
    assert.deepEqual(expandToken("tukang"), ["tukang"]);
    assert.deepEqual(tokenize("tukang"), [["tukang"]]);
  });

  it("office boy cocok sebagai dua kata", () => {
    assert.equal(fieldMatches("Office Boy", tokenize("office boy")), true);
  });
});

describe("kata peran tidak memicu mode nama", () => {
  it("mengetik gudang menampilkan lowongan gudang, bukan hanya GudangAda", () => {
    const companies = [
      company({ perusahaan: "GudangAda", posisi: "Admin" }),
      company({ perusahaan: "PT Contoh", posisi: "Staff Gudang" }),
    ];
    const { results, mode } = runSearch(companies, { posisi: "gudang" });
    assert.equal(mode, "semua");
    assert.equal(results[0].company.perusahaan, "PT Contoh");
    assert.ok(results.some((e) => e.company.perusahaan === "GudangAda"));
  });
  it("nama yang berisi kata peran tetap ketemu lewat kata lain di namanya", () => {
    const companies = [
      company({ perusahaan: "GudangAda", posisi: "Admin" }),
      company({ perusahaan: "PT Contoh", posisi: "Staff Gudang" }),
    ];
    const { mode, results } = runSearch(companies, { posisi: "gudangada" });
    assert.equal(mode, "perusahaan");
    assert.equal(results.length, 1);
  });
});

describe("token mentah untuk nama perusahaan", () => {
  it("tokenizeRaw tidak memperluas sinonim", () => {
    assert.deepEqual(tokenizeRaw("warehouse"), ["warehouse"]);
    assert.deepEqual(tokenizeRaw("cleaner"), ["cleaner"]);
  });

  it("warehouse tidak memicu mode nama pada perusahaan bernama GudangAda", () => {
    const companies = [
      company({ perusahaan: "GudangAda", posisi: "Admin" }),
      company({ perusahaan: "PT Contoh", posisi: "Staff Gudang" }),
    ];
    const { results, mode } = runSearch(companies, { posisi: "warehouse" });
    assert.equal(mode, "semua");
    assert.equal(results[0].company.perusahaan, "PT Contoh");
    assert.equal(results[0].score, 50);
    assert.equal(results[0].positionMatched, true);
    const gudangAda = results.find(
      (e) => e.company.perusahaan === "GudangAda",
    );
    assert.equal(gudangAda.nameMatched, false);
    assert.equal(gudangAda.score, 0);
  });
});

describe("kalimat penyangkalan", () => {
  it("kata penyangkal sebelum token dalam 60 karakter membatalkan kecocokan", () => {
    assert.equal(
      fieldMatchesAffirmative(
        "tidak ada penyebutan Bogor",
        tokenize("Bogor"),
      ),
      false,
    );
  });

  it("kata penyangkal sesudah token dalam 60 karakter membatalkan kecocokan", () => {
    assert.equal(
      fieldMatchesAffirmative("gudang tidak tersedia", tokenize("gudang")),
      false,
    );
  });

  it("tanpa kata penyangkal, kecocokan dihitung", () => {
    assert.equal(
      fieldMatchesAffirmative("Gudang di Bekasi", tokenize("gudang")),
      true,
    );
  });

  it("penyangkalan tidak membatalkan skor domisili bila lokasi bersih", () => {
    const c = company({ lokasi: "Bogor", posisi: "Helper Gudang" });
    const result = scoreCompany(c, query({ domisili: "Bogor" }));
    assert.equal(result.score, 30);
    assert.deepEqual(result.reasons, ["Lokasi cocok"]);
  });
});

describe("skor", () => {
  it("posisi cocok +50 dan domisili cocok +30", () => {
    const c = company({ posisi: "Helper Gudang", lokasi: "Bogor" });
    const result = scoreCompany(c, query({ posisi: "helper", domisili: "Bogor" }));
    assert.equal(result.score, 80);
    assert.equal(result.positionMatched, true);
    assert.deepEqual(result.reasons, ["Posisi cocok", "Lokasi cocok"]);
  });

  it("lowongan target menambah +20 di atas skor kecocokan", () => {
    const c = company({
      posisi: "Helper Gudang",
      lokasi: "Bogor",
      status: "Ada lowongan target",
      link_karir: "https://contoh.id/karir",
    });
    const result = scoreCompany(c, query({ posisi: "helper", domisili: "Bogor" }));
    assert.equal(result.score, 100);
    assert.ok(result.reasons.includes("Lowongan terverifikasi"));
    assert.ok(result.reasons.includes("Portal terbuka"));
  });

  it("target yang syaratnya tidak cocok menambah +10", () => {
    const c = company({ status: "Ada lowongan target (tidak cocok)" });
    const result = scoreCompany(c, query({}));
    assert.equal(result.score, 10);
  });

  it("portal mati mengurangi 20 dan tanpa alasan portal terbuka", () => {
    const c = company({
      status: "Portal tidak bisa dibuka",
      link_karir: "https://contoh.id/karir",
    });
    const result = scoreCompany(c, query({}));
    assert.equal(result.score, -20);
    assert.ok(!result.reasons.includes("Portal terbuka"));
  });

  it("tidak dapat diverifikasi mengurangi 10", () => {
    const c = company({ status: "Tidak dapat diverifikasi" });
    assert.equal(scoreCompany(c, query({})).score, -10);
  });

  it("posisi cocok dicari juga di catatan", () => {
    const c = company({ catatan: "Judul persis HELPER, penempatan Gunung Putri" });
    const result = scoreCompany(c, query({ posisi: "helper" }));
    assert.equal(result.score, 50);
    assert.equal(result.positionMatched, true);
  });

  it("cocok nama perusahaan tidak menambah +50", () => {
    const c = company({
      perusahaan: "PT Novell Pharmaceutical Laboratories",
      posisi: "HELPER",
      status: "Ada lowongan target",
    });
    const result = scoreCompany(c, query({ posisi: "Novell" }));
    assert.equal(result.nameMatched, true);
    assert.equal(result.positionMatched, false);
    assert.equal(result.score, 20);
  });
});

describe("runSearch", () => {
  it("mode perusahaan bila ada nama yang cocok, dan hanya nama itu yang tampil", () => {
    const companies = [
      company({
        perusahaan: "PT Novell Pharmaceutical Laboratories",
        posisi: "HELPER",
        lokasi: "Gunung Putri Bogor",
        status: "Ada lowongan target",
        link_karir: "https://novellpharm.com",
      }),
      company({
        perusahaan: "PT Lain",
        posisi: "Helper Gudang",
        lokasi: "Bogor",
        status: "Ada lowongan target",
        link_karir: "https://lain.id",
      }),
    ];
    const { results, mode } = runSearch(companies, { posisi: "Novell" });
    assert.equal(mode, "perusahaan");
    assert.equal(results.length, 1);
    assert.equal(
      results[0].company.perusahaan,
      "PT Novell Pharmaceutical Laboratories",
    );
  });

  it("tanpa kata kunci, semua tampil dengan mode semua dan skor dari status", () => {
    const companies = [
      company({ perusahaan: "PT A", status: "Ada lowongan target" }),
      company({ perusahaan: "PT B", status: "Tidak ada lowongan target" }),
    ];
    const { results, mode } = runSearch(companies, {});
    assert.equal(mode, "semua");
    assert.equal(results.length, 2);
    assert.equal(results[0].score, 20);
    assert.equal(results[1].score, 0);
  });

  it("filter kategori dan status benar-benar menyaring", () => {
    const companies = [
      company({ perusahaan: "PT A", kategori: "Manufaktur", status: "Ada lowongan target" }),
      company({ perusahaan: "PT B", kategori: "Retail", status: "Ada lowongan target" }),
      company({ perusahaan: "PT C", kategori: "Manufaktur", status: "Tidak ada lowongan target" }),
    ];
    const byKategori = runSearch(companies, { kategori: "Manufaktur" });
    assert.deepEqual(
      byKategori.results.map((e) => e.company.perusahaan),
      ["PT A", "PT C"],
    );
    const byStatus = runSearch(companies, { status: "Ada lowongan target" });
    assert.deepEqual(
      byStatus.results.map((e) => e.company.perusahaan),
      ["PT A", "PT B"],
    );
  });

  it("urutan nama mengurutkan abjad tanpa peduli skor", () => {
    const companies = [
      company({ perusahaan: "PT Zulu", status: "Ada lowongan target" }),
      company({ perusahaan: "PT Alpha", status: "Tidak ada lowongan target" }),
    ];
    const { results } = runSearch(companies, { urutan: "nama" });
    assert.deepEqual(
      results.map((e) => e.company.perusahaan),
      ["PT Alpha", "PT Zulu"],
    );
  });
});

describe("filter pencarian bebas seperti di API", () => {
  it("perusahaan tanpa kecocokan tidak lolos filter", () => {
    const tokens = tokenize("gudang");
    const keep = (c) =>
      fieldMatchesAffirmative(
        `${c.perusahaan} ${c.posisi} ${c.lokasi} ${c.catatan}`,
        tokens,
      );
    const companies = [
      company({ perusahaan: "PT A", posisi: "Staff Gudang" }),
      company({ perusahaan: "PT B", posisi: "Office Boy" }),
    ];
    assert.deepEqual(
      companies.filter(keep).map((c) => c.perusahaan),
      ["PT A"],
    );
  });
});

describe("urutan dan hitungan", () => {
  it("compareByScore menaruh skor tinggi dulu, seri diurutkan nama", () => {
    const a = { company: company({ perusahaan: "PT B" }), score: 50 };
    const b = { company: company({ perusahaan: "PT A" }), score: 50 };
    const c = { company: company({ perusahaan: "PT C" }), score: 100 };
    assert.deepEqual(
      [a, b, c].sort(compareByScore).map((e) => e.company.perusahaan),
      ["PT C", "PT A", "PT B"],
    );
  });

  it("countBy dan topEntries menghitung status", () => {
    const counts = countBy(
      [
        { status: "Ada lowongan target" },
        { status: "Ada lowongan target" },
        { status: "Tidak ada lowongan target" },
        {},
      ],
      "status",
    );
    assert.equal(counts["Ada lowongan target"], 2);
    assert.equal(counts["Tidak tercatat"], 1);
    assert.deepEqual(topEntries(counts, 1), [
      { label: "Ada lowongan target", count: 2 },
    ]);
  });
});
