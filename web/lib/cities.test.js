/* Tes unit untuk lib/cities.js, memakai test runner bawaan Node.
 * Dijalankan dengan: node --test lib/cities.test.js
 * Mencakup regresi PETA-01 (W-P0-06): pencocokan kata utuh + daftar
 * negasi, supaya kalimat peniadaan seperti "tidak ada di Depok" tidak
 * lagi memetakan perusahaan ke Depok. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchCity } from "./cities.js";

function nameOf(lokasi) {
  const city = matchCity(lokasi);
  return city ? city.name : null;
}

describe("kata utuh, bukan substring", () => {
  it("Depok cocok di teks 'Depok'", () => {
    assert.equal(nameOf("Depok"), "Depok");
  });

  it("depok cocok di 'Depok City' sebagai kata tersendiri", () => {
    assert.equal(nameOf("Depok City"), "Depok");
  });

  it("'Depokbaru' sebagai satu kata TIDAK cocok ke Depok", () => {
    assert.equal(nameOf("Depokbaru"), null);
  });

  it("'Bojonggede' cocok ke Bojonggede, bukan Bogor", () => {
    assert.equal(nameOf("Bojonggede"), "Bojonggede");
  });

  it("pencocokan tidak peka huruf besar/kecil: 'DEPOK' cocok", () => {
    assert.equal(nameOf("DEPOK"), "Depok");
  });

  it("tanda baca memisahkan kata: 'Bogor/Depok' cocok ke Depok (lebih awal di daftar)", () => {
    assert.equal(nameOf("Bogor/Depok"), "Depok");
  });
});

describe("kalimat peniadaan", () => {
  it("'tidak ada di Depok' tidak memetakan ke kota mana pun (kasus Fore Coffee)", () => {
    assert.equal(nameOf("tidak ada di Depok"), null);
  });

  it("lokasi persis Fore Coffee #330 tidak memetakan ke Depok", () => {
    assert.equal(
      nameOf("Indonesia (penempatan di seluruh Indonesia) — tidak ada penyebutan Bogor/Depok"),
      null,
    );
  });

  it("'tidak di Jakarta, ada di Bandung' cocok ke Bandung (koma memisahkan klausa)", () => {
    assert.equal(nameOf("tidak di Jakarta, ada di Bandung"), "Bandung");
  });

  it("'tanpa penempatan di Bekasi' tidak memetakan", () => {
    assert.equal(nameOf("tanpa penempatan di Bekasi"), null);
  });

  it("'belum ada di Tangerang' tidak memetakan", () => {
    assert.equal(nameOf("belum ada di Tangerang"), null);
  });

  it("'bukan di Semarang' tidak memetakan", () => {
    assert.equal(nameOf("bukan di Semarang"), null);
  });

  it("kota yang sama muncul di luar negasi tetap cocok", () => {
    assert.equal(
      nameOf("tidak ada di Depok, ada cabang di Depok"),
      "Depok",
    );
  });
});

describe("urutan spesifisitas", () => {
  it("'Cikarang, Bekasi' cocok ke Cikarang", () => {
    assert.equal(nameOf("Cikarang, Bekasi"), "Cikarang");
  });

  it("'Gunung Putri Bogor' cocok ke Gunung Putri", () => {
    assert.equal(nameOf("Gunung Putri Bogor"), "Gunung Putri");
  });

  it("'Cibinong dan Depok' cocok ke Cibinong (lebih awal di daftar)", () => {
    assert.equal(nameOf("Cibinong dan Depok"), "Cibinong");
  });

  it("urutan daftar menang atas urutan teks: 'Jakarta, Bogor, Depok' cocok ke Depok", () => {
    assert.equal(nameOf("Jakarta, Bogor, Depok"), "Depok");
  });

  it("frasa multi-kata 'gunung putri' dicocokkan utuh", () => {
    assert.equal(nameOf("Penempatan Gunung Putri, Kab. Bogor"), "Gunung Putri");
  });

  it("alias 'Yogya' cocok ke Yogyakarta", () => {
    assert.equal(nameOf("Yogya"), "Yogyakarta");
  });
});

describe("masukan kosong dan tidak dikenal", () => {
  it("teks kosong mengembalikan null", () => {
    assert.equal(matchCity(""), null);
  });

  it("null mengembalikan null", () => {
    assert.equal(matchCity(null), null);
  });

  it("undefined mengembalikan null", () => {
    assert.equal(matchCity(undefined), null);
  });

  it("kota yang tidak ada di daftar mengembalikan null", () => {
    assert.equal(nameOf("Cilegon"), null);
  });
});
