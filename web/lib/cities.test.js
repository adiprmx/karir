/* Tes unit untuk lib/cities.js, memakai test runner bawaan Node.
 * Dijalankan dengan: node --test lib/cities.test.js
 * Mencakup regresi PETA-01 (W-P0-06): pencocokan kata utuh + daftar
 * negasi, supaya kalimat peniadaan seperti "tidak ada di Depok" tidak
 * lagi memetakan perusahaan ke Depok; PETA-02 (matchCities: satu
 * perusahaan muncul di tiap kota yang tercantum di lokasinya); dan
 * PETA-03 (18 kota tambahan, termasuk Cilegon, Samarinda, Balikpapan). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchCity, matchCities } from "./cities.js";

function nameOf(lokasi) {
  const city = matchCity(lokasi);
  return city ? city.name : null;
}

function namesOf(lokasi) {
  return matchCities(lokasi).map((c) => c.name);
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
    assert.equal(nameOf("Jayapura"), null);
  });
});

describe("kota tambahan (PETA-03)", () => {
  it("'Cilegon' cocok ke Cilegon", () => {
    assert.equal(nameOf("Cilegon; Samarinda"), "Cilegon");
  });

  it("'Samarinda' cocok ke Samarinda", () => {
    assert.equal(nameOf("tes Samarinda"), "Samarinda");
  });

  it("'Balikpapan' cocok ke Balikpapan (kasus Mandiri Herindo #498)", () => {
    assert.equal(
      nameOf("Site project (termasuk Manggar, Balikpapan, Kalimantan Timur)"),
      "Balikpapan",
    );
  });

  it("'Makassar' cocok ke Makassar", () => {
    assert.equal(nameOf("Makassar"), "Makassar");
  });

  it("'Medan' cocok ke Medan", () => {
    assert.equal(nameOf("Medan, Sumatera Utara"), "Medan");
  });

  it("'Malang' cocok ke Malang", () => {
    assert.equal(nameOf("Kota Malang"), "Malang");
  });

  it("'Surakarta' cocok ke Solo (alias)", () => {
    assert.equal(nameOf("Surakarta"), "Solo");
  });

  it("'Lampung' cocok ke Bandar Lampung", () => {
    assert.equal(nameOf("Lampung"), "Bandar Lampung");
  });

  it("'Bali' cocok ke Denpasar", () => {
    assert.equal(nameOf("Bali"), "Denpasar");
  });

  it("'Cimanggis' cocok ke Depok (kecamatan di Kota Depok, kasus #224)", () => {
    assert.equal(nameOf("Medifarma Cimanggis"), "Depok");
  });

  it("kota baru tidak mengalahkan kota lama: 'Jakarta, Makassar' tetap Jakarta untuk matchCity", () => {
    assert.equal(nameOf("Jakarta, Makassar"), "Jakarta");
  });
});

describe("matchCities: perusahaan multi-kota (PETA-02)", () => {
  it("satu kota mengembalikan satu kota", () => {
    assert.deepEqual(namesOf("Depok"), ["Depok"]);
  });

  it("teks kosong mengembalikan daftar kosong", () => {
    assert.deepEqual(matchCities(""), []);
    assert.deepEqual(matchCities(null), []);
  });

  it("lokasi tanpa kota mengembalikan daftar kosong", () => {
    assert.deepEqual(namesOf("Tidak bisa dicek"), []);
  });

  it("'Jakarta, Bogor, Depok' mengembalikan ketiganya (urutan CITIES)", () => {
    assert.deepEqual(namesOf("Jakarta, Bogor, Depok"), [
      "Depok",
      "Bogor",
      "Jakarta",
    ]);
  });

  it("lokasi Roti O #190 mengembalikan semua kotanya", () => {
    assert.deepEqual(
      namesOf("Jakarta, Bogor, Depok, Tangerang, Bekasi, Cikarang"),
      ["Cikarang", "Depok", "Bekasi", "Tangerang", "Bogor", "Jakarta"],
    );
  });

  it("lokasi CKB #460 mengembalikan Cilegon dan Samarinda", () => {
    assert.deepEqual(namesOf("Cilegon; Samarinda; Buhut (Kalimantan Tengah)"), [
      "Cilegon",
      "Samarinda",
    ]);
  });

  it("kota yang dinegasikan tidak ikut, kota lain tetap ikut", () => {
    assert.deepEqual(namesOf("tidak ada di Depok, ada di Bandung"), [
      "Bandung",
    ]);
  });

  it("lokasi Fore Coffee #330 mengembalikan daftar kosong (negasi)", () => {
    assert.deepEqual(
      namesOf(
        "Indonesia (penempatan di seluruh Indonesia) — tidak ada penyebutan Bogor/Depok",
      ),
      [],
    );
  });

  it("alias tidak menggandakan kota: 'Solo, Surakarta' mengembalikan satu Solo", () => {
    assert.deepEqual(namesOf("Solo, Surakarta"), ["Solo"]);
  });

  it("kota yang sama disebut dua kali hanya muncul sekali", () => {
    assert.deepEqual(namesOf("Jakarta dan Jakarta Selatan"), ["Jakarta"]);
  });
});
