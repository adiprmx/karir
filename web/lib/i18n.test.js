/* Tes unit untuk lib/i18n.js (QA-07): kelengkapan kunci id↔en, t(),
 * dan getLocale() — memakai test runner bawaan Node.
 * Dijalankan dengan: node --test lib/i18n.test.js
 * (koordinator menambahkan file ini ke skrip "test" di package.json).
 *
 * i18n.js tidak bisa diimpor langsung oleh node:test: berkasnya
 * mengimpor { cookies } dari "next/headers" yang tidak bisa
 * di-resolve di luar Next. Kamus DICT dan fungsi t() diekstrak dari
 * sumber aslinya (pencocokan kurung seimbang) lalu dievaluasi —
 * kode yang dites adalah kode yang dikirim, bukan salinan.
 * getLocale() sendiri tidak bisa diuji di sini (butuh cookies Next);
 * yang dikunci adalah perilaku fallback bahasanya lewat t():
 * locale tidak dikenal memakai kamus id. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./i18n.js", import.meta.url), "utf8");

/* Ambil blok dari penanda awal sampai kurung tutup yang seimbang.
 * Placeholder {n}/{a}/{b} di dalam string tetap seimbang, jadi
 * pencacah kurung ini aman. */
function extractBlock(source, startMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `tidak ditemukan di i18n.js: ${startMarker}`);
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`kurung tidak seimbang: ${startMarker}`);
}

const dictSrc = extractBlock(src, "const DICT = {");
const DICT = new Function(
  `return (${dictSrc.slice("const DICT = ".length)})`,
)();
const tSrc = extractBlock(src, "export function t(").replace(/^export /, "");
const t = new Function("DICT", `${tSrc}\nreturn t;`)(DICT);

describe("kelengkapan kunci id↔en (QA-07)", () => {
  it("jumlah kunci id dan en sama", () => {
    assert.equal(Object.keys(DICT.id).length, Object.keys(DICT.en).length);
    assert.ok(Object.keys(DICT.id).length > 300);
  });

  it("tidak ada kunci yang hanya ada di satu bahasa", () => {
    const hanyaId = Object.keys(DICT.id).filter((k) => !(k in DICT.en));
    const hanyaEn = Object.keys(DICT.en).filter((k) => !(k in DICT.id));
    assert.deepEqual(hanyaId, []);
    assert.deepEqual(hanyaEn, []);
  });

  it("tidak ada nilai kosong di kedua bahasa", () => {
    for (const lang of ["id", "en"]) {
      const kosong = Object.keys(DICT[lang]).filter(
        (k) => typeof DICT[lang][k] !== "string" || DICT[lang][k].trim() === "",
      );
      assert.deepEqual(kosong, [], `nilai kosong di ${lang}`);
    }
  });

  it("placeholder {...} tiap kunci sama di id dan en", () => {
    const placeholders = (s) => (s.match(/\{[^}]+\}/g) || []).sort().join(",");
    const beda = Object.keys(DICT.id).filter(
      (k) => placeholders(DICT.id[k]) !== placeholders(DICT.en[k]),
    );
    assert.deepEqual(beda, []);
  });

  it("semua kunci memakai awalan yang dikenal", () => {
    const awalan = new Set([
      "nav", "header", "footer", "landing", "home", "search", "dash",
      "detail", "common", "hero", "tracker", "sync", "lamaran", "mulai",
      "settings", "auth", "dashMine", "map", "install", "info", "error",
      "notfound",
    ]);
    const asing = Object.keys(DICT.id).filter(
      (k) => !awalan.has(k.split(".")[0]),
    );
    assert.deepEqual(asing, []);
  });
});

describe("t() (QA-07)", () => {
  it("mengembalikan teks sesuai bahasa", () => {
    assert.equal(t("id", "nav.home"), "Beranda");
    assert.equal(t("en", "nav.home"), "Home");
    assert.equal(t("id", "detail.portalBtn"), "Buka portal karir");
    assert.equal(t("en", "detail.portalBtn"), "Open career portal");
  });

  it("mengganti satu placeholder dengan vars", () => {
    assert.equal(t("id", "header.count", { n: 639 }), "639 perusahaan");
    assert.equal(t("en", "header.count", { n: 639 }), "639 companies");
  });

  it("mengganti beberapa placeholder sekaligus", () => {
    assert.equal(
      t("id", "search.showing", { a: 10, b: 639 }),
      "Menampilkan 10 dari 639 perusahaan",
    );
    assert.equal(
      t("en", "search.showing", { a: 10, b: 639 }),
      "Showing 10 of 639 companies",
    );
  });

  it("tanpa vars, placeholder dibiarkan apa adanya", () => {
    assert.equal(t("id", "header.count"), "{n} perusahaan");
  });

  it("kunci yang tidak dikenal dikembalikan apa adanya (bukan undefined)", () => {
    assert.equal(t("id", "tidak.ada"), "tidak.ada");
    assert.equal(t("en", "tidak.ada"), "tidak.ada");
  });

  it("locale yang tidak dikenal memakai kamus id (fallback getLocale)", () => {
    assert.equal(t("xx", "nav.home"), "Beranda");
    assert.equal(t(undefined, "nav.home"), "Beranda");
    assert.equal(t(null, "nav.home"), "Beranda");
  });

  it("kunci detail yang dipakai halaman detail tersedia di kedua bahasa", () => {
    for (const key of [
      "detail.category",
      "detail.explain",
      "detail.deadline",
      "detail.daysLeft",
      "detail.deadlinePassed",
      "detail.applyChannels",
      "detail.emailHrd",
      "detail.waHrd",
      "detail.otherChannels",
      "detail.portalDown",
      "detail.tryPortalAnyway",
      "detail.copyChannel",
      "detail.channelCopied",
    ]) {
      assert.notEqual(t("id", key), key, `kunci id hilang: ${key}`);
      assert.notEqual(t("en", key), key, `kunci en hilang: ${key}`);
    }
  });
});
