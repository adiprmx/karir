/* Tes unit untuk helper di web/app/components.js yang belum teruji
 * (DET-06): formatDate, daysSince, daysUntil, safeLink,
 * isShortenerUrl, dan STATUS_EXPLAIN.
 * Dijalankan dengan: node --test lib/components-helpers.test.js
 * (koordinator menambahkan file ini ke skrip "test" di package.json).
 * components.js adalah modul ESM biasa (tanpa JSX) sehingga bisa
 * diimpor langsung. waLink/splitContacts/linkifySegments sudah
 * diuji di web/app/components.test.js dan tidak diulang di sini. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  safeLink,
  isShortenerUrl,
  STATUS_EXPLAIN,
  formatDate,
  daysSince,
  daysUntil,
} from "../app/components.js";

function isoHariLalu(n) {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function hariIniWib() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function geserIso(iso, hari) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

describe("safeLink (DET-06)", () => {
  it("URL http/https lolos", () => {
    assert.equal(safeLink("https://contoh.test/karir"), true);
    assert.equal(safeLink("http://contoh.test/karir"), true);
  });

  it("bukan URL http(s) ditolak", () => {
    assert.equal(safeLink("/cari"), false);
    assert.equal(safeLink("contoh.test/karir"), false);
    assert.equal(safeLink("javascript:alert(1)"), false);
    assert.equal(safeLink("mailto:hrd@contoh.com"), false);
    assert.equal(safeLink("ftp://contoh.test/x"), false);
    assert.equal(safeLink(""), false);
    assert.equal(safeLink(null), false);
    assert.equal(safeLink(undefined), false);
    assert.equal(safeLink(42), false);
  });
});

describe("isShortenerUrl (DET-06)", () => {
  it("domain pemendek yang dikenal terdeteksi", () => {
    assert.equal(isShortenerUrl("https://bit.ly/abc123"), true);
    assert.equal(isShortenerUrl("https://t.ly/karir-guardianjabodetabek85"), true);
    assert.equal(isShortenerUrl("https://linktr.ee/perusahaan"), true);
    assert.equal(isShortenerUrl("https://s.id/lamar"), true);
    assert.equal(isShortenerUrl("https://tinyurl.com/xyz"), true);
  });

  it("subdomain pemendek ikut terdeteksi", () => {
    assert.equal(isShortenerUrl("https://sub.bit.ly/abc"), true);
  });

  it("domain biasa dan URL rusak bukan pemendek", () => {
    assert.equal(isShortenerUrl("https://karir.pertamina.com/x"), false);
    assert.equal(isShortenerUrl("https://contoh.test/karir"), false);
    assert.equal(isShortenerUrl("https://bitly.com/abc"), false);
    assert.equal(isShortenerUrl("bukan-url"), false);
    assert.equal(isShortenerUrl(""), false);
    assert.equal(isShortenerUrl(null), false);
  });
});

describe("STATUS_EXPLAIN (DET-06)", () => {
  it("keempat status taksonomi punya penjelasan satu kalimat", () => {
    for (const status of [
      "Ada lowongan",
      "Tidak ada lowongan",
      "Tidak dapat diverifikasi",
      "Portal tidak bisa dibuka",
    ]) {
      const teks = STATUS_EXPLAIN[status];
      assert.equal(typeof teks, "string", `penjelasan hilang: ${status}`);
      assert.ok(teks.length > 10, `penjelasan terlalu pendek: ${status}`);
      assert.equal(teks.includes("lowongan"), true);
    }
  });

  it("status yang tidak dikenal tidak punya penjelasan", () => {
    assert.equal(STATUS_EXPLAIN["Ada lowongan target"], undefined);
    assert.equal(STATUS_EXPLAIN["tidak dikenal"], undefined);
  });
});

describe("formatDate (DET-06)", () => {
  it("ISO menjadi tanggal Indonesia singkat", () => {
    assert.equal(formatDate("2026-11-05"), "5 Nov 2026");
    assert.equal(formatDate("2026-12-31"), "31 Des 2026");
    assert.equal(formatDate("2026-01-01"), "1 Jan 2026");
  });

  it("locale en memakai format Inggris", () => {
    assert.equal(formatDate("2026-11-05", "en"), "5 Nov 2026");
  });

  it("bukan ISO menjadi null", () => {
    assert.equal(formatDate("5 Nov 2026"), null);
    assert.equal(formatDate("2026/11/05"), null);
    assert.equal(formatDate(""), null);
    assert.equal(formatDate(null), null);
    assert.equal(formatDate(undefined), null);
  });
});

describe("daysSince (DET-06)", () => {
  it("hari ini 0, 5 hari lalu 5", () => {
    assert.equal(daysSince(isoHariLalu(0)), 0);
    assert.equal(daysSince(isoHariLalu(5)), 5);
    assert.equal(daysSince(isoHariLalu(30)), 30);
  });

  it("tanggal di masa depan dibatasi 0, bukan negatif", () => {
    assert.equal(daysSince(isoHariLalu(-1)), 0);
    assert.equal(daysSince(isoHariLalu(-30)), 0);
  });

  it("bukan tanggal menjadi null", () => {
    assert.equal(daysSince("bukan tanggal"), null);
    assert.equal(daysSince(""), null);
    assert.equal(daysSince(null), null);
  });
});

describe("daysUntil halaman detail — WIB, bukan UTC (DET-06)", () => {
  it("hari ini WIB 0, besok 1, kemarin -1", () => {
    const hariIni = hariIniWib();
    assert.equal(daysUntil(hariIni), 0);
    assert.equal(daysUntil(geserIso(hariIni, 1)), 1);
    assert.equal(daysUntil(geserIso(hariIni, 3)), 3);
    assert.equal(daysUntil(geserIso(hariIni, -1)), -1);
    assert.equal(daysUntil(geserIso(hariIni, -10)), -10);
  });

  it("bukan tanggal ISO menjadi null", () => {
    assert.equal(daysUntil("bukan tanggal"), null);
    assert.equal(daysUntil(""), null);
    assert.equal(daysUntil(null), null);
    assert.equal(daysUntil(undefined), null);
  });
});
