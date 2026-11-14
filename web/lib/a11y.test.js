/* Tes unit untuk lib/a11y.js (T13, aksesibilitas), memakai test
 * runner bawaan Node.
 * Dijalankan dengan: node --test lib/a11y.test.js
 * Mencakup: durasi toast bertautan (AKSES-08), navigasi roving
 * tabindex tab/radio (UX-15), durasi animasi peta saat
 * reduced-motion (AKSES-14), kesamaan state pencarian untuk hasil
 * awal server (AKSES-02), dan penguncian rasio kontras token dari
 * globals.css (UX-06 border >= 3:1, AKSES-07 placeholder >= 4,5:1).
 * Test kontras MEMBACA globals.css langsung, jadi bila token
 * berubah jadi gagal, test ikut gagal — bukan angka yang disalin. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  MAP_FLY_MS,
  TOAST_LINK_MS,
  TOAST_MS,
  contrastRatio,
  mapFlyDurationMs,
  relativeLuminance,
  rovingIndex,
  sameSearchQuery,
  toastDurationMs,
} from "./a11y.js";

describe("toastDurationMs (AKSES-08)", () => {
  it("toast tanpa tautan hilang setelah 3,6 detik", () => {
    assert.equal(toastDurationMs(false), 3600);
    assert.equal(toastDurationMs(undefined), 3600);
    assert.equal(TOAST_MS, 3600);
  });

  it("toast bertautan diberi 9 detik supaya tautannya sempat dijangkau keyboard", () => {
    assert.equal(toastDurationMs(true), 9000);
    assert.equal(TOAST_LINK_MS, 9000);
  });
});

describe("rovingIndex (UX-15)", () => {
  it("panah kanan/bawah maju satu dan membungkus di ujung", () => {
    assert.equal(rovingIndex(0, 5, "ArrowRight"), 1);
    assert.equal(rovingIndex(4, 5, "ArrowRight"), 0);
    assert.equal(rovingIndex(2, 5, "ArrowDown"), 3);
    assert.equal(rovingIndex(4, 5, "ArrowDown"), 0);
  });

  it("panah kiri/atas mundur satu dan membungkus di awal", () => {
    assert.equal(rovingIndex(1, 5, "ArrowLeft"), 0);
    assert.equal(rovingIndex(0, 5, "ArrowLeft"), 4);
    assert.equal(rovingIndex(3, 5, "ArrowUp"), 2);
    assert.equal(rovingIndex(0, 5, "ArrowUp"), 4);
  });

  it("Home ke awal, End ke akhir", () => {
    assert.equal(rovingIndex(3, 5, "Home"), 0);
    assert.equal(rovingIndex(1, 5, "End"), 4);
  });

  it("tombol lain mengembalikan null (pemanggil mengabaikannya)", () => {
    assert.equal(rovingIndex(1, 5, "Tab"), null);
    assert.equal(rovingIndex(1, 5, "Enter"), null);
    assert.equal(rovingIndex(1, 5, " "), null);
  });

  it("indeks -1 (belum ada pilihan) dijepit ke 0 sebelum bergerak", () => {
    assert.equal(rovingIndex(-1, 5, "ArrowRight"), 1);
    assert.equal(rovingIndex(-1, 5, "Home"), 0);
  });

  it("jumlah nol mengembalikan null", () => {
    assert.equal(rovingIndex(0, 0, "ArrowRight"), null);
  });
});

describe("mapFlyDurationMs (AKSES-14)", () => {
  it("reduced-motion berarti durasi 0 (pemanggil memakai setView)", () => {
    assert.equal(mapFlyDurationMs(true), 0);
  });

  it("tanpa reduced-motion, animasi terbang 800 mdtk", () => {
    assert.equal(mapFlyDurationMs(false), 800);
    assert.equal(MAP_FLY_MS, 800);
  });
});

describe("sameSearchQuery (AKSES-02)", () => {
  const q = {
    domisili: "Depok",
    posisi: "gudang",
    kategori: "",
    kota: "",
    status: "",
    urutan: "relevansi",
  };

  it("dua state yang sama dikenali sama", () => {
    assert.equal(sameSearchQuery(q, { ...q }), true);
  });

  it("satu field berbeda berarti tidak sama", () => {
    assert.equal(sameSearchQuery(q, { ...q, posisi: "kasir" }), false);
    assert.equal(sameSearchQuery(q, { ...q, kota: "Depok" }), false);
    assert.equal(sameSearchQuery(q, { ...q, urutan: "nama" }), false);
  });

  it("nilai kosong dan tidak ada dianggap sama", () => {
    assert.equal(
      sameSearchQuery({ ...q, kategori: "" }, { ...q, kategori: undefined }),
      true,
    );
  });

  it("null mengembalikan false", () => {
    assert.equal(sameSearchQuery(null, q), false);
    assert.equal(sameSearchQuery(q, null), false);
  });
});

describe("contrastRatio", () => {
  it("hitam di putih adalah 21:1, warna yang sama adalah 1:1", () => {
    assert.ok(Math.abs(contrastRatio("#000000", "#ffffff") - 21) < 0.01);
    assert.equal(contrastRatio("#5f5c51", "#5f5c51"), 1);
  });

  it("luminans putih 1 dan hitam 0", () => {
    assert.equal(relativeLuminance("#ffffff"), 1);
    assert.equal(relativeLuminance("#000000"), 0);
  });

  it("cocok dengan angka audit untuk token lama (verifikasi rumus)", () => {
    // Audit 14 Nov: --line-strong terang 1,97:1 di --paper, 2,18:1 di
    // --surface; placeholder terang 3,68:1 di --surface.
    assert.ok(Math.abs(contrastRatio("#b4ae9b", "#f4f1ea") - 1.97) < 0.02);
    assert.ok(Math.abs(contrastRatio("#b4ae9b", "#fffdf9") - 2.18) < 0.02);
    assert.ok(Math.abs(contrastRatio("#87847b", "#fffdf9") - 3.68) < 0.02);
  });
});

describe("token kontras dari globals.css (UX-06, AKSES-07)", () => {
  // Baca token langsung dari globals.css: :root (terang),
  // :root[data-theme="dark"] (gelap), .force-light (terang, dipakai
  // halaman cetak). Urutan kemunculan di berkas: terang, gelap,
  // force-light.
  const here = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(here, "..", "app", "globals.css"), "utf8");
  function tokens(name) {
    const re = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "g");
    return [...css.matchAll(re)].map((m) => m[1]);
  }
  const lineStrong = tokens("line-strong");
  const muted = tokens("muted");
  const paper = tokens("paper");
  const surface = tokens("surface");

  it("ketiga blok token ada dan force-light sama dengan terang", () => {
    assert.equal(lineStrong.length, 3);
    assert.equal(muted.length, 3);
    assert.equal(paper.length, 3);
    assert.equal(surface.length, 3);
    assert.equal(lineStrong[2], lineStrong[0]);
    assert.equal(muted[2], muted[0]);
    assert.equal(paper[2], paper[0]);
    assert.equal(surface[2], surface[0]);
  });

  it("UX-06: border --line-strong >= 3:1 di kedua tema dan kedua latar", () => {
    // Terang: latar terketat adalah --paper (lebih gelap dari
    // --surface); gelap: latar terketat adalah --surface.
    assert.ok(contrastRatio(lineStrong[0], paper[0]) >= 3);
    assert.ok(contrastRatio(lineStrong[0], surface[0]) >= 3);
    assert.ok(contrastRatio(lineStrong[1], paper[1]) >= 3);
    assert.ok(contrastRatio(lineStrong[1], surface[1]) >= 3);
  });

  it("AKSES-07: placeholder (--muted penuh) >= 4,5:1 di kedua tema", () => {
    assert.ok(contrastRatio(muted[0], surface[0]) >= 4.5);
    assert.ok(contrastRatio(muted[1], surface[1]) >= 4.5);
  });

  it("placeholder memakai --muted penuh, bukan campuran 75%", () => {
    assert.match(
      css,
      /input::placeholder\s*\{\s*color:\s*var\(--muted\);\s*\}/,
    );
  });
});
