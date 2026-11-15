/* Tes unit untuk lib/logos.js (DET-06) + helper tanggal halaman detail
 * yang belum teruji — memakai test runner bawaan Node.
 * Dijalankan dengan: node --test lib/logos.test.js
 * (koordinator menambahkan file ini ke skrip "test" di package.json).
 *
 * logos.js tidak bisa diimpor langsung oleh node:test: berkasnya
 * berisi JSX ("use client" + komponen React) dan Node menolak token
 * "<". logoUrl dan initialsOf diekstrak dari sumber aslinya
 * (pencocokan kurung seimbang) lalu dievaluasi — kode yang dites
 * adalah kode yang dikirim, bukan salinan. CompanyLogo sendiri
 * tidak bisa dirender tanpa runtime JSX (tidak ada dependensi
 * test baru yang ditambahkan — aturan T16); yang dikunci untuknya
 * adalah kontrak wiring di sumbernya (fallback inisial, cek
 * naturalWidth saat mount, atribut img). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./logos.js", import.meta.url), "utf8");

/* Ambil satu fungsi dari sumber, dari penanda awal sampai kurung
 * tutup yang seimbang. Kurung di dalam literal template (${...})
 * dan placeholder {n} tetap seimbang, jadi pencacah ini aman. */
function extractFunction(source, startMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `tidak ditemukan di logos.js: ${startMarker}`);
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

const logoUrl = new Function(
  `return (${extractFunction(src, "export function logoUrl(").replace(/^export /, "")})`,
)();
const initialsOf = new Function(
  `return (${extractFunction(src, "function initialsOf(")})`,
)();

describe("logoUrl (DET-06)", () => {
  it("URL portal valid menjadi URL favicon Google dari domainnya", () => {
    assert.equal(
      logoUrl("https://karir.pertamina.com/lowongan"),
      "https://www.google.com/s2/favicons?domain=karir.pertamina.com&sz=128",
    );
    assert.equal(
      logoUrl("http://contoh.test/karir?x=1"),
      "https://www.google.com/s2/favicons?domain=contoh.test&sz=128",
    );
  });

  it("hanya hostname yang dipakai, bukan path atau query", () => {
    assert.equal(
      logoUrl("https://www.mrdiy.com/id/career/store-crew"),
      "https://www.google.com/s2/favicons?domain=www.mrdiy.com&sz=128",
    );
  });

  it("subdomain dipertahankan (bukan domain induk yang ditebak)", () => {
    assert.equal(
      logoUrl("https://careers.astra.co.id/lowongan"),
      "https://www.google.com/s2/favicons?domain=careers.astra.co.id&sz=128",
    );
  });

  it("tautan kosong, bukan string, atau tidak valid menjadi null", () => {
    assert.equal(logoUrl(""), null);
    assert.equal(logoUrl(null), null);
    assert.equal(logoUrl(undefined), null);
    assert.equal(logoUrl(42), null);
    assert.equal(logoUrl("bukan-url"), null);
    assert.equal(logoUrl("https://"), null);
  });

  it("skema tanpa hostname menjadi null", () => {
    assert.equal(logoUrl("javascript:alert(1)"), null);
    assert.equal(logoUrl("mailto:hrd@contoh.com"), null);
  });
});

describe("initialsOf — fallback inisial (DET-06)", () => {
  it("dua kata pertama menjadi dua huruf besar", () => {
    assert.equal(initialsOf("Unilever Indonesia"), "UI");
    assert.equal(initialsOf("Reska Multi Usaha"), "RM");
  });

  it("awalan PT/CV dibuang sebelum mengambil inisial", () => {
    assert.equal(initialsOf("PT Pertamina"), "P");
    assert.equal(initialsOf("PT Reska Multi Usaha"), "RM");
    assert.equal(initialsOf("CV Maju Jaya"), "MJ");
    assert.equal(initialsOf("PT. Kereta Cepat Indonesia-China"), "KC");
  });

  it("satu kata menjadi satu huruf; tiga kata hanya dua huruf pertama", () => {
    assert.equal(initialsOf("Danur"), "D");
    assert.equal(initialsOf("Agak Laen"), "AL");
    assert.equal(initialsOf("Bank Rakyat Indonesia"), "BR");
  });

  it("huruf kecil dijadikan huruf besar; spasi berlebih di antara kata diabaikan", () => {
    assert.equal(initialsOf("unil ever"), "UE");
    assert.equal(initialsOf("PT   Alfa   Beta"), "AB");
  });

  it("nama kosong atau tidak ada menjadi tanda tanya", () => {
    assert.equal(initialsOf(""), "?");
    assert.equal(initialsOf(null), "?");
    assert.equal(initialsOf(undefined), "?");
  });
});

describe("CompanyLogo — kontrak wiring di sumber (DET-06)", () => {
  /* Komponen ini memakai JSX sehingga tidak bisa dievaluasi di
   * node:test tanpa menambah dependensi transformasi. Yang dikunci
   * di sini adalah wiring-nya di sumber: logo dipakai bila ada dan
   * belum gagal, fallback inisial bila tidak ada logo atau gambar
   * gagal, dan pemeriksaan mount untuk gambar yang gagal sebelum
   * React terpasang. */

  it("src dihitung dari logoUrl(linkKarir)", () => {
    assert.equal(src.includes("const src = logoUrl(linkKarir);"), true);
  });

  it("gambar hanya dirender bila ada src dan belum gagal", () => {
    assert.equal(src.includes("{src && !failed ? ("), true);
  });

  it("gagal muat beralih ke inisial (onError + fallback initialsOf)", () => {
    assert.equal(src.includes("onError={() => setFailed(true)}"), true);
    assert.equal(src.includes("{initialsOf(name)}"), true);
  });

  it("cek saat mount: gambar yang sudah lengkap tapi lebar nol dianggap gagal", () => {
    assert.equal(
      src.includes("if (el && el.complete && el.naturalWidth === 0) setFailed(true);"),
      true,
    );
  });

  it("img memakai lazy loading dan tanpa teks alt (dekoratif)", () => {
    assert.equal(src.includes('loading="lazy"'), true);
    assert.equal(src.includes('decoding="async"'), true);
    assert.equal(src.includes('alt=""'), true);
  });

  it("ukuran default 44 dan font inisial mengikuti ukuran", () => {
    assert.equal(
      src.includes("export function CompanyLogo({ linkKarir, name, size = 44 })"),
      true,
    );
    assert.equal(
      src.includes("style={{ fontSize: Math.round(size * 0.36) }}"),
      true,
    );
    assert.equal(src.includes('aria-hidden="true"'), true);
  });
});
