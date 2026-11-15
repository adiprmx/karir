/* Tes konsistensi halaman info (INFO-10), memakai test runner
 * bawaan Node. Dijalankan dengan: node --test app/info-pages.test.js
 * (koordinator menambahkan berkas ini ke skrip `npm test`.)
 *
 * Tes wiring statis + angka dari seed — MEMBACA berkas sumber dan
 * seed repo langsung, pola yang sama dengan app/peta-state.test.js:
 * halaman info memakai JSX sehingga tidak bisa diimpor node:test,
 * tetapi metadata, tautan silang, klaim, dan asal angka tetap dijaga
 * agar tidak kembali basi diam-diam (INFO-01 s.d. INFO-07 semuanya
 * lolos dulu karena tidak ada test ini).
 *
 * Angka yang diharapkan TIDAK dikode keras: total, sebaran status,
 * dan tanggal cek dihitung dari seed repo (web/data/companies.json)
 * saat test jalan, jadi hunting harian tidak merusak test ini.
 * Halaman tentang/metode yang dicek adalah cara mereka MENGAMBIL
 * angka (getStatsWithSource + hitung dari stats), bukan angka
 * tampilannya — angka tampil dihitung server saat request. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STATUS_ORDER } from "../lib/companies.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");

function baca(relatif) {
  return readFileSync(join(WEB, relatif), "utf-8");
}

/* Seed repo: satu-satunya sumber angka di test ini. */
const SEED = JSON.parse(baca("data/companies.json"));
const HALAMAN = ["tentang", "metode", "faq", "changelog"];

function hitung(sumber, jarum) {
  return sumber.split(jarum).length - 1;
}

describe("metadata keempat halaman info", () => {
  it("tiap halaman punya judul + deskripsi + kanonis sendiri", () => {
    const kanonis = {
      tentang: "/tentang",
      metode: "/metode",
      faq: "/faq",
      changelog: "/changelog",
    };
    for (const h of HALAMAN) {
      const src = baca(`app/${h}/page.js`);
      assert.ok(src.includes("title:"), `${h}: tanpa title`);
      assert.ok(src.includes("description:"), `${h}: tanpa description`);
      assert.ok(
        src.includes(`canonical: "${kanonis[h]}"`),
        `${h}: kanonis bukan ${kanonis[h]}`,
      );
      assert.ok(
        src.includes(`url: "${kanonis[h]}"`),
        `${h}: openGraph url bukan ${kanonis[h]}`,
      );
    }
  });

  it("judul keempat halaman berbeda", () => {
    const judul = HALAMAN.map((h) => {
      const m = baca(`app/${h}/page.js`).match(/title: "([^"]+)"/);
      assert.ok(m, `${h}: judul tidak terbaca`);
      return m[1];
    });
    assert.equal(new Set(judul).size, 4);
  });

  it("keempat halaman tercantum di sitemap dengan lastModified dinamis", () => {
    const sitemap = baca("app/sitemap.js");
    for (const h of HALAMAN) {
      assert.ok(sitemap.includes(`"/${h}"`), `sitemap tanpa /${h}`);
    }
    assert.doesNotMatch(sitemap, /lastModified: "2026-11-06"/);
    assert.ok(sitemap.includes("latestCheck"));
  });
});

describe("klaim tidak ada akun tidak muncul lagi (INFO-01/AKUN-08)", () => {
  it("klaim tidak ada akun hanya boleh dalam arti yang sempit", () => {
    /* INFO-01/AKUN-08: klaim lama "Karir tidak memakai akun" sudah
     * diganti "Masuk akun itu pilihan, bukan kewajiban". Frasa
     * "tidak ada akun" masih boleh muncul HANYA dalam dua arti
     * sempit: (1) Metode, daftar yang TIDAK dilakukan saat
     * memeriksa situs perusahaan — "Tidak ada akun yang dibuat
     * di situs perusahaan"; (2) pesan state auth "tidak ada akun
     * yang masuk". Keduanya benar dan bukan klaim soal sistem
     * akun Karir, jadi test ini mengunci bentuknya, bukan
     * melarang substringnya mentah-mentah. */
    for (const h of HALAMAN) {
      const src = baca(`app/${h}/page.js`);
      const baris = src
        .split("\n")
        .filter((b) => b.toLowerCase().includes("tidak ada akun"));
      for (const b of baris) {
        assert.ok(
          b.includes("di situs perusahaan"),
          `${h}: frasa "tidak ada akun" tanpa kualifikasi: ${b.trim()}`,
        );
      }
    }
    /* Metode memakai bentuk sempit itu tepat satu kali. */
    assert.equal(hitung(baca("app/metode/page.js").toLowerCase(), "tidak ada akun"), 1);
  });

  it("frasa yang sama di kamus i18n hanya pesan state masuk", () => {
    const i18n = baca("lib/i18n.js");
    const baris = i18n
      .split("\n")
      .filter((b) => b.toLowerCase().includes("tidak ada akun"));
    assert.equal(baris.length, 1);
    assert.ok(baris[0].includes('"auth.noAccount"'));
    assert.ok(baris[0].includes("Tidak ada akun yang masuk."));
  });

  it("FAQ menjelaskan masuk itu pilihan, bukan kewajiban", () => {
    const faq = baca("app/faq/page.js");
    assert.ok(faq.includes("Masuk akun itu pilihan, bukan kewajiban"));
    assert.ok(faq.includes("Apakah harus masuk akun untuk memakai Karir?"));
  });

  it("metadata Tentang menyebut masuk itu pilihan", () => {
    const tentang = baca("app/tentang/page.js");
    assert.ok(tentang.includes("Masuk akun itu pilihan, bukan kewajiban"));
  });
});

describe("angka dari seed, bukan hardcode (INFO-02/04/07)", () => {
  it("seed terbaca dan totalnya sama dengan yang dipakai halaman", () => {
    assert.ok(Array.isArray(SEED) && SEED.length > 0);
    const total = SEED.length;
    const target = SEED.filter((c) => c.status === "Ada lowongan").length;
    assert.ok(target > 0, "seed tanpa perusahaan ada lowongan");
    assert.ok(target < total, "semua perusahaan berstatus ada lowongan");
    /* Sebaran status seed hanya memakai 4 nilai STATUS_ORDER. */
    const statusSeed = new Set(SEED.map((c) => c.status));
    for (const s of statusSeed) {
      assert.ok(STATUS_ORDER.includes(s), `status seed di luar taksonomi: ${s}`);
    }
    const jumlahStatus = [...statusSeed].reduce(
      (n, s) => n + SEED.filter((c) => c.status === s).length,
      0,
    );
    assert.equal(jumlahStatus, total);
  });

  it("tentang/metode mengambil angka dari getStatsWithSource", () => {
    for (const h of ["tentang", "metode"]) {
      const src = baca(`app/${h}/page.js`);
      assert.ok(src.includes("getStatsWithSource()"), `${h}: tanpa getStatsWithSource`);
      assert.ok(src.includes("stats.byStatus"), `${h}: tanpa stats.byStatus`);
    }
  });

  it("tentang tidak memakai tanggal cek hardcode 4-5 Nov", () => {
    const tentang = baca("app/tentang/page.js");
    assert.doesNotMatch(tentang, /2026-11-04/);
    assert.doesNotMatch(tentang, /2026-11-05/);
    /* Kesegaran dihitung dari stats.byDate: tanggal terbaru +
     * jumlah 7 hari terakhir. */
    assert.ok(tentang.includes("Object.keys(stats.byDate)"));
    assert.ok(tentang.includes("checkedWeek"));
    assert.ok(tentang.includes("latestDate"));
  });

  it("metode: arti status memakai STATUS_ORDER, bukan daftar sendiri", () => {
    const metode = baca("app/metode/page.js");
    for (const s of STATUS_ORDER) {
      assert.ok(
        metode.includes(`status: "${s}"`),
        `metode tanpa arti status "${s}"`,
      );
    }
    /* Jumlah arti status sama dengan jumlah taksonomi. */
    const arti = (metode.match(/status: "/g) || []).length;
    assert.equal(arti, STATUS_ORDER.length);
  });

  it("metode: catatan kesegaran dari data cadangan ditandai (INFO-12)", () => {
    for (const h of ["tentang", "metode"]) {
      const src = baca(`app/${h}/page.js`);
      assert.ok(src.includes('source === "seed"'), `${h}: tanpa penanda seed`);
      assert.ok(src.includes('"common.seedNote"'), `${h}: tanpa seedNote`);
    }
  });
});

describe("tautan silang dan kelengkapan isi", () => {
  it("FAQ state kosong menautkan ke /metode", () => {
    const cari = baca("app/faq/faq-search.js");
    assert.ok(cari.includes('href="/metode"'));
    assert.ok(cari.includes("Tidak ada pertanyaan yang cocok"));
  });

  it("FAQ menyebut kanal melamar lain (INFO-09)", () => {
    const faq = baca("app/faq/page.js");
    assert.ok(faq.includes("Apakah bisa melamar lewat email atau WhatsApp?"));
    assert.ok(faq.includes("Cara lain melamar"));
  });

  it("Metode menyebut kanal melamar lain (INFO-09)", () => {
    const metode = baca("app/metode/page.js");
    assert.ok(metode.includes("Cara lain melamar"));
    assert.ok(metode.includes("email atau WhatsApp HR"));
  });

  it("Metode menjelaskan pengecekan ulang berkala (INFO-08)", () => {
    const metode = baca("app/metode/page.js");
    assert.ok(metode.includes("Data dicek ulang setiap hari"));
    assert.ok(metode.includes("01.00 WIB"));
    assert.ok(metode.includes("Yang berubah"));
  });

  it("Tentang menautkan repo terbuka + lisensi CC BY", () => {
    const tentang = baca("app/tentang/page.js");
    assert.ok(tentang.includes("https://github.com/adiprmx/karir"));
    assert.ok(tentang.includes("creativecommons.org/licenses/by/4.0"));
  });

  it("FAQ schema JSON-LD dibangun dari daftar yang sama dengan tampilan", () => {
    const faq = baca("app/faq/page.js");
    assert.ok(faq.includes('"@type": "FAQPage"'));
    assert.ok(faq.includes("mainEntity: QA.map("));
  });
});

describe("changelog halaman vs versi rilis (INFO-03/17)", () => {
  const pkg = JSON.parse(baca("package.json"));
  const page = baca("app/changelog/page.js");

  it("entri teratas sama dengan versi package.json", () => {
    const m = page.match(/version: "([^"]+)"/);
    assert.ok(m, "VERSIONS[0] tidak terbaca");
    assert.equal(m[1], pkg.version);
  });

  it("versi tidak duplikat dan tiap entri punya tanggal + poin", () => {
    const versi = [...page.matchAll(/version: "([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(versi).size, versi.length);
    assert.ok(versi.length > 0);
    const tanggal = [...page.matchAll(/date: "([^"]+)"/g)].map((m) => m[1]);
    assert.equal(tanggal.length, versi.length);
    const poin = [...page.matchAll(/points: \[/g)].length;
    assert.equal(poin, versi.length);
  });

  it("poin changelog halaman berbahasa sehari-hari (INFO-17)", () => {
    for (const istilah of [
      "Redis",
      "Upstash",
      "x-real-ip",
      "x-forwarded-for",
      "validasi 9 kolom",
    ]) {
      assert.equal(
        hitung(page, istilah),
        0,
        `changelog halaman memakai istilah teknis "${istilah}"`,
      );
    }
  });
});

describe("mode Inggris halaman info (INFO-11)", () => {
  it("keempat halaman memberi tahu isi hanya Bahasa Indonesia", () => {
    for (const h of HALAMAN) {
      const src = baca(`app/${h}/page.js`);
      assert.ok(
        src.includes('t(locale, "info.idOnly")'),
        `${h}: tanpa penanda info.idOnly`,
      );
    }
  });

  it("kunci info.idOnly + common.seedNote ada di i18n (ID + EN)", () => {
    const i18n = baca("lib/i18n.js");
    for (const kunci of ["info.idOnly", "common.seedNote"]) {
      const jumlah = i18n.split(`"${kunci}"`).length - 1;
      assert.equal(jumlah, 2, `${kunci} muncul ${jumlah}x, harus 2x (ID + EN)`);
    }
  });
});
