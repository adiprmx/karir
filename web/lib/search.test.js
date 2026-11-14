/* Tes unit untuk lib/search.js, memakai test runner bawaan Node.
 * Dijalankan dengan: npm test
 * Setiap tes meniru perilaku nyata kode yang dibaca, bukan asumsi:
 * skor +50/+30/+20/-20/-10, sinonim, token mentah untuk nama
 * perusahaan, jendela penyangkalan 60 karakter, dan mode nama. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeText,
  expandToken,
  tokenize,
  tokenizeRaw,
  isRoleKeyword,
  fieldMatches,
  fieldMatchesAffirmative,
  matchesFreeText,
  scoreCompany,
  compareByScore,
  countBy,
  topEntries,
  runSearch,
} from "./search.js";
import { matchCity } from "./cities.js";

function company(overrides = {}) {
  return {
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

  it("lowongan menambah +20 di atas skor kecocokan", () => {
    const c = company({
      posisi: "Helper Gudang",
      lokasi: "Bogor",
      status: "Ada lowongan",
      link_karir: "https://contoh.id/karir",
    });
    const result = scoreCompany(c, query({ posisi: "helper", domisili: "Bogor" }));
    assert.equal(result.score, 100);
    assert.ok(result.reasons.includes("Lowongan terverifikasi"));
    assert.ok(result.reasons.includes("Portal terbuka"));
  });

  it("tidak ada lowongan tidak menambah skor status", () => {
    const c = company({ status: "Tidak ada lowongan" });
    const result = scoreCompany(c, query({}));
    assert.equal(result.score, 0);
    assert.ok(!result.reasons.includes("Lowongan terverifikasi"));
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
      status: "Ada lowongan",
    });
    const result = scoreCompany(c, query({ posisi: "Novell" }));
    assert.equal(result.nameMatched, true);
    assert.equal(result.positionMatched, false);
    assert.equal(result.score, 20);
  });
});

describe("runSearch", () => {
  /* PERILAKU BARU YANG DISENGAJA (CARI-01, keputusan S5): mode nama
   * tidak lagi membuang hasil lain. Nama asli ("Novell") menampilkan
   * KEDUA kelompok: perusahaan cocok nama dulu, lalu lowongan cocok
   * peran. Tes ini diperbarui dari versi lama yang mengunci perilaku
   * bajak ("hanya nama itu yang tampil"). */
  it("mode perusahaan menampilkan kelompok nama dulu lalu kelompok peran", () => {
    const companies = [
      company({
        perusahaan: "PT Novell Pharmaceutical Laboratories",
        posisi: "HELPER",
        lokasi: "Gunung Putri Bogor",
        status: "Ada lowongan",
        link_karir: "https://novellpharm.com",
      }),
      company({
        perusahaan: "PT Lain",
        posisi: "Novell Support Engineer",
        lokasi: "Bogor",
        status: "Ada lowongan",
        link_karir: "https://lain.id",
      }),
      company({
        perusahaan: "PT Acak",
        posisi: "Helper Gudang",
        lokasi: "Bogor",
        status: "Ada lowongan",
        link_karir: "https://acak.id",
      }),
    ];
    const { results, mode, groups } = runSearch(companies, {
      posisi: "Novell",
    });
    assert.equal(mode, "perusahaan");
    assert.deepEqual(
      results.map((e) => e.company.perusahaan),
      [
        "PT Novell Pharmaceutical Laboratories",
        "PT Lain",
      ],
    );
    assert.deepEqual(
      groups.companies.map((e) => e.company.perusahaan),
      ["PT Novell Pharmaceutical Laboratories"],
    );
    assert.deepEqual(
      groups.roles.map((e) => e.company.perusahaan),
      ["PT Lain"],
    );
    /* Perusahaan yang tidak cocok nama maupun peran tidak tampil,
     * supaya label kelompok jujur. */
    assert.equal(
      results.some((e) => e.company.perusahaan === "PT Acak"),
      false,
    );
  });

  it("nama asli tanpa kecocokan peran hanya menampilkan kelompok nama", () => {
    const companies = [
      company({
        perusahaan: "PT Novell Pharmaceutical Laboratories",
        posisi: "HELPER",
        status: "Ada lowongan",
      }),
      company({
        perusahaan: "PT Lain",
        posisi: "Helper Gudang",
        status: "Ada lowongan",
      }),
    ];
    const { results, mode, groups } = runSearch(companies, {
      posisi: "Novell",
    });
    assert.equal(mode, "perusahaan");
    assert.equal(results.length, 1);
    assert.equal(
      results[0].company.perusahaan,
      "PT Novell Pharmaceutical Laboratories",
    );
    assert.deepEqual(groups.roles, []);
  });

  it("urutan nama mengurutkan di dalam tiap kelompok, nama tetap di atas", () => {
    const companies = [
      company({ perusahaan: "PT Zulu Novell", posisi: "Admin" }),
      company({ perusahaan: "PT Alpha Novell", posisi: "Admin" }),
      company({ perusahaan: "PT Zulu", posisi: "Novell Engineer" }),
      company({ perusahaan: "PT Alpha", posisi: "Novell Engineer" }),
    ];
    const { results, mode } = runSearch(companies, {
      posisi: "Novell",
      urutan: "nama",
    });
    assert.equal(mode, "perusahaan");
    assert.deepEqual(
      results.map((e) => e.company.perusahaan),
      ["PT Alpha Novell", "PT Zulu Novell", "PT Alpha", "PT Zulu"],
    );
  });

  it("tanpa kata kunci, semua tampil dengan mode semua dan skor dari status", () => {
    const companies = [
      company({ perusahaan: "PT A", status: "Ada lowongan" }),
      company({ perusahaan: "PT B", status: "Tidak ada lowongan" }),
    ];
    const { results, mode } = runSearch(companies, {});
    assert.equal(mode, "semua");
    assert.equal(results.length, 2);
    assert.equal(results[0].score, 20);
    assert.equal(results[1].score, 0);
  });

  it("filter kategori dan status benar-benar menyaring", () => {
    const companies = [
      company({ perusahaan: "PT A", kategori: "Manufaktur", status: "Ada lowongan" }),
      company({ perusahaan: "PT B", kategori: "Retail", status: "Ada lowongan" }),
      company({ perusahaan: "PT C", kategori: "Manufaktur", status: "Tidak ada lowongan" }),
    ];
    const byKategori = runSearch(companies, { kategori: "Manufaktur" });
    assert.deepEqual(
      byKategori.results.map((e) => e.company.perusahaan),
      ["PT A", "PT C"],
    );
    const byStatus = runSearch(companies, { status: "Ada lowongan" });
    assert.deepEqual(
      byStatus.results.map((e) => e.company.perusahaan),
      ["PT A", "PT B"],
    );
  });

  it("urutan nama mengurutkan abjad tanpa peduli skor", () => {
    const companies = [
      company({ perusahaan: "PT Zulu", status: "Ada lowongan" }),
      company({ perusahaan: "PT Alpha", status: "Tidak ada lowongan" }),
    ];
    const { results } = runSearch(companies, { urutan: "nama" });
    assert.deepEqual(
      results.map((e) => e.company.perusahaan),
      ["PT Alpha", "PT Zulu"],
    );
  });
});

describe("kata peran umum (CARI-01, keputusan S5)", () => {
  it("isRoleKeyword: kata di daftar sinonim adalah kata peran", () => {
    assert.equal(isRoleKeyword("gudang"), true);
    assert.equal(isRoleKeyword("warehouse"), true);
    assert.equal(isRoleKeyword("office boy"), true);
    assert.equal(isRoleKeyword("staff gudang"), true);
    assert.equal(isRoleKeyword("cleaning service"), true);
    assert.equal(isRoleKeyword("staff"), true);
    assert.equal(isRoleKeyword("sales"), true);
    assert.equal(isRoleKeyword("Novell"), false);
    assert.equal(isRoleKeyword("gudang novell"), false);
    assert.equal(isRoleKeyword(""), false);
  });

  it("kata peran satu kata baru tidak mengubah pencocokan", () => {
    assert.deepEqual(tokenize("staff"), [["staff"]]);
    assert.deepEqual(tokenize("service"), [["service"]]);
    assert.deepEqual(tokenize("sales"), [["sales"]]);
  });

  it("'gudang' tidak dibajak GudangAda: mode semua, peran di atas", () => {
    const companies = [
      company({ perusahaan: "GudangAda", posisi: "Admin", status: "Ada lowongan" }),
      company({ perusahaan: "PT Contoh", posisi: "Staff Gudang", status: "Ada lowongan" }),
      company({ perusahaan: "PT Lain", posisi: "Helper Gudang", status: "Tidak ada lowongan" }),
    ];
    const { results, mode, groups } = runSearch(companies, { posisi: "gudang" });
    assert.equal(mode, "semua");
    assert.equal(groups, null);
    assert.equal(results.length, 3);
    assert.deepEqual(
      results.map((e) => e.company.perusahaan),
      ["PT Contoh", "PT Lain", "GudangAda"],
    );
    const gudangAda = results.find((e) => e.company.perusahaan === "GudangAda");
    assert.equal(gudangAda.nameMatched, true);
    assert.equal(gudangAda.positionMatched, false);
  });

  it("'staff' tidak dibajak perusahaan bernama Staff", () => {
    const companies = [
      company({ perusahaan: "PT Staffindo", posisi: "Admin", status: "Ada lowongan" }),
      company({ perusahaan: "PT Contoh", posisi: "Staff Gudang", status: "Ada lowongan" }),
    ];
    const { results, mode } = runSearch(companies, { posisi: "staff" });
    assert.equal(mode, "semua");
    assert.equal(results[0].company.perusahaan, "PT Contoh");
    assert.equal(results[0].positionMatched, true);
  });

  it("chip beranda tidak bisa dibajak nama: semua kata chip adalah kata peran", () => {
    for (const role of [
      "Helper Gudang",
      "Staff Gudang",
      "Cleaning Service",
      "Office Boy",
      "Packing",
      "Operator Produksi",
      "Crew Store",
    ]) {
      assert.equal(isRoleKeyword(role), true, role);
    }
  });
});

describe("filter kota (CARI-03)", () => {
  const companies = [
    company({ perusahaan: "PT A", lokasi: "Depok", posisi: "Staff Gudang" }),
    company({ perusahaan: "PT B", lokasi: "Bogor", posisi: "Staff Gudang" }),
    company({ perusahaan: "PT C", lokasi: "Gunung Putri Bogor", posisi: "Admin" }),
    company({ perusahaan: "PT D", lokasi: "", posisi: "Admin" }),
  ];

  it("hanya perusahaan di kota itu yang tampil", () => {
    const { results } = runSearch(companies, { kota: "Depok" });
    assert.deepEqual(
      results.map((e) => e.company.perusahaan),
      ["PT A"],
    );
  });

  it("'Gunung Putri Bogor' masuk Gunung Putri, bukan Bogor", () => {
    assert.deepEqual(
      runSearch(companies, { kota: "Bogor" }).results.map(
        (e) => e.company.perusahaan,
      ),
      ["PT B"],
    );
    assert.deepEqual(
      runSearch(companies, { kota: "Gunung Putri" }).results.map(
        (e) => e.company.perusahaan,
      ),
      ["PT C"],
    );
  });

  it("kota tidak dikenal menghasilkan daftar kosong", () => {
    assert.equal(runSearch(companies, { kota: "Atlantis" }).results.length, 0);
  });

  it("filter kota digabung dengan kata kunci dan filter lain", () => {
    const { results } = runSearch(companies, {
      posisi: "gudang",
      kota: "Depok",
    });
    assert.deepEqual(
      results.map((e) => e.company.perusahaan),
      ["PT A"],
    );
    const byStatus = runSearch(
      [
        company({ perusahaan: "PT A", lokasi: "Depok", status: "Ada lowongan" }),
        company({ perusahaan: "PT B", lokasi: "Depok", status: "Tidak ada lowongan" }),
      ],
      { kota: "Depok", status: "Ada lowongan" },
    );
    assert.deepEqual(
      byStatus.results.map((e) => e.company.perusahaan),
      ["PT A"],
    );
  });
});

describe("matchesFreeText per field (CARI-05)", () => {
  it("GudangAda ditemukan walau posisinya mengandung 'tidak'", () => {
    const c = company({ perusahaan: "GudangAda", posisi: "Tidak bisa dicek" });
    assert.equal(matchesFreeText(c, "gudang"), true);
    /* Cara lama (string gabungan) gagal di kasus ini: "tidak" di posisi
     * membatalkan kecocokan nama. */
    assert.equal(
      fieldMatchesAffirmative(
        `${c.perusahaan} ${c.posisi} ${c.lokasi} ${c.catatan}`,
        tokenize("gudang"),
      ),
      false,
    );
  });

  it("'gudang' di catatan tidak dibatalkan penyangkal di field lain", () => {
    const c = company({
      perusahaan: "Bank Danamon",
      posisi: "Tidak ada lowongan terlihat",
      catatan: "Pernah buka Staff Gudang",
    });
    assert.equal(matchesFreeText(c, "gudang"), true);
    assert.equal(
      fieldMatchesAffirmative(
        `${c.perusahaan} ${c.posisi} ${c.lokasi} ${c.catatan}`,
        tokenize("gudang"),
      ),
      false,
    );
  });

  it("sinonim tidak mencocokkan nama perusahaan", () => {
    const c = company({ perusahaan: "GudangAda", posisi: "Admin" });
    assert.equal(matchesFreeText(c, "warehouse"), false);
    assert.equal(matchesFreeText(c, "gudang"), true);
  });

  it("kata kunci kosong tidak cocok; perusahaan tanpa kecocokan tidak lolos", () => {
    assert.equal(matchesFreeText(company({}), ""), false);
    assert.equal(
      matchesFreeText(
        company({ perusahaan: "PT B", posisi: "Office Boy" }),
        "gudang",
      ),
      false,
    );
  });

  it("kata kunci multi-kata harus cocok seluruhnya di satu field", () => {
    const tersebar = company({
      perusahaan: "PT A",
      posisi: "Staff",
      catatan: "Gudang besar",
    });
    assert.equal(matchesFreeText(tersebar, "staff gudang"), false);
    const satuField = company({ perusahaan: "PT B", posisi: "Staff Gudang" });
    assert.equal(matchesFreeText(satuField, "staff gudang"), true);
  });
});

describe("jalur halaman vs API (CARI-02)", () => {
  const companies = [
    company({ perusahaan: "GudangAda", posisi: "Tidak bisa dicek", status: "Ada lowongan" }),
    company({ perusahaan: "PT Contoh", posisi: "Staff Gudang", status: "Ada lowongan" }),
    company({ perusahaan: "PT Lain", posisi: "Helper Gudang", status: "Tidak ada lowongan" }),
    company({
      perusahaan: "Bank Danamon",
      posisi: "Tidak ada lowongan terlihat",
      catatan: "Pernah buka Staff Gudang",
      status: "Tidak ada lowongan",
    }),
    company({ perusahaan: "PT Acak", posisi: "Office Boy", status: "Ada lowongan" }),
  ];

  /* Meniru jalur API: pra-filter matchesFreeText lalu runSearch. */
  function apiPath(list, q) {
    return runSearch(
      list.filter((c) => matchesFreeText(c, q)),
      { posisi: q },
    );
  }

  it("'gudang': halaman dan API sepakat soal mode dan urutan yang cocok", () => {
    const page = runSearch(companies, { posisi: "gudang" });
    const api = apiPath(companies, "gudang");
    assert.equal(page.mode, "semua");
    assert.equal(api.mode, page.mode);
    assert.deepEqual(
      api.results.map((e) => e.company.perusahaan),
      page.results
        .filter((e) => e.positionMatched || e.nameMatched)
        .map((e) => e.company.perusahaan),
    );
    /* GudangAda + Bank Danamon tidak hilang dari jalur API (CARI-05). */
    assert.equal(
      api.results.some((e) => e.company.perusahaan === "GudangAda"),
      true,
    );
    assert.equal(
      api.results.some((e) => e.company.perusahaan === "Bank Danamon"),
      true,
    );
  });

  it("'Novell': halaman dan API sepakat soal kelompok", () => {
    const list = [
      company({ perusahaan: "PT Novell Pharmaceutical Laboratories", posisi: "HELPER", status: "Ada lowongan" }),
      company({ perusahaan: "PT Lain", posisi: "Novell Support Engineer", status: "Ada lowongan" }),
      company({ perusahaan: "PT Acak", posisi: "Helper Gudang", status: "Ada lowongan" }),
    ];
    const page = runSearch(list, { posisi: "Novell" });
    const api = apiPath(list, "Novell");
    assert.equal(page.mode, "perusahaan");
    assert.equal(api.mode, "perusahaan");
    assert.deepEqual(
      api.results.map((e) => e.company.perusahaan),
      page.results.map((e) => e.company.perusahaan),
    );
    assert.deepEqual(
      api.groups.companies.map((e) => e.company.perusahaan),
      ["PT Novell Pharmaceutical Laboratories"],
    );
  });
});

describe("seed lokal (FIN-10 + CARI-01 data nyata)", () => {
  const seed = JSON.parse(
    readFileSync(new URL("../data/companies.json", import.meta.url), "utf8"),
  );

  it("seed bisa dibaca dan dicari tanpa Firestore", () => {
    assert.ok(seed.length >= 610);
    const { results } = runSearch(seed, {});
    assert.equal(results.length, seed.length);
  });

  it("'gudang' di data nyata: mode semua, puluhan peran, GudangAda tidak membajak", () => {
    const { results, mode } = runSearch(seed, { posisi: "gudang" });
    assert.equal(mode, "semua");
    const roleMatches = results.filter((e) => e.positionMatched);
    assert.ok(roleMatches.length >= 50);
    assert.equal(results[0].positionMatched, true);
    const gudangAda = results.find(
      (e) => e.company.perusahaan === "GudangAda",
    );
    assert.ok(gudangAda);
    assert.equal(gudangAda.nameMatched, true);
  });

  it("'staff' di data nyata: mode semua walau ada nama yang cocok", () => {
    const { mode, results } = runSearch(seed, { posisi: "staff" });
    assert.equal(mode, "semua");
    assert.ok(results.some((e) => e.nameMatched));
    assert.ok(results.filter((e) => e.positionMatched).length >= 50);
  });

  it("'Novell' di data nyata: mode perusahaan dengan kelompok nama", () => {
    const { mode, groups } = runSearch(seed, { posisi: "Novell" });
    assert.equal(mode, "perusahaan");
    assert.ok(groups.companies.length >= 1);
    assert.ok(
      groups.companies.every((e) =>
        e.company.perusahaan.toLowerCase().includes("novell"),
      ),
    );
  });

  it("filter kota di data nyata: Depok hanya berisi Depok", () => {
    const { results } = runSearch(seed, { kota: "Depok" });
    assert.ok(results.length > 0);
    /* Aserti memakai aturan yang sama dengan filter (matchCity), bukan
     * substring "depok": Cimanggis adalah alias Depok (kunci
     * "cimanggis" di lib/cities.js), jadi perusahaan berlokasi
     * Cimanggis tanpa kata "Depok" — mis. PT Bayer Indonesia —
     * benar masuk hasil Depok. */
    for (const e of results) {
      assert.equal(
        matchCity(e.company.lokasi)?.name,
        "Depok",
        e.company.perusahaan,
      );
    }
  });

  it("CARI-05 di data nyata: GudangAda + Bank Danamon lolos matchesFreeText", () => {
    const byName = new Map(seed.map((c) => [c.perusahaan, c]));
    for (const name of ["GudangAda", "Bank Danamon"]) {
      const c = byName.get(name);
      assert.ok(c, name);
      assert.equal(matchesFreeText(c, "gudang"), true);
    }
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
        { status: "Ada lowongan" },
        { status: "Ada lowongan" },
        { status: "Tidak ada lowongan" },
        {},
      ],
      "status",
    );
    assert.equal(counts["Ada lowongan"], 2);
    assert.equal(counts["Tidak tercatat"], 1);
    assert.deepEqual(topEntries(counts, 1), [
      { label: "Ada lowongan", count: 2 },
    ]);
  });
});
