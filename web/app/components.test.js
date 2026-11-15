/* Tes unit untuk web/app/components.js, memakai test runner bawaan Node.
 * Dijalankan dengan: node --test app/components.test.js
 * Mencakup helper halaman detail (T18, DET-02/03/04/06): pemecah kanal
 * ganda, tautan WhatsApp per nomor, dan pengubah tautan teks bebas.
 * Catatan: file ini belum masuk skrip "test" di package.json (milik
 * koordinator). Tambahkan app/components.test.js ke daftar di sana. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  contactCopyTargets,
  linkDomain,
  linkifySegments,
  splitContacts,
  waLink,
} from "./components.js";

/* Href dari potongan tautan saja, untuk membandingkan dengan ringkas. */
function hrefs(text) {
  return linkifySegments(text)
    .filter((seg) => seg.href)
    .map((seg) => seg.href);
}

/* Teks utuh hasil gabung potongan harus sama persis dengan masukan. */
function rejoined(text) {
  return linkifySegments(text)
    .map((seg) => seg.text)
    .join("");
}

describe("waLink", () => {
  it("awalan 0 diganti 62", () => {
    assert.equal(waLink("081211559991"), "https://wa.me/6281211559991");
  });

  it("awalan +62 dipertahankan", () => {
    assert.equal(
      waLink("+62 851-2101-3261"),
      "https://wa.me/6285121013261",
    );
  });

  it("spasi dan strip dibuang", () => {
    assert.equal(waLink("0821 1244 3720"), "https://wa.me/6282112443720");
    assert.equal(waLink("0811-355-565"), "https://wa.me/62811355565");
  });

  it("tanpa digit sama sekali mengembalikan null", () => {
    assert.equal(waLink("tidak ada nomor"), null);
    assert.equal(waLink(""), null);
    assert.equal(waLink(null), null);
  });
});

describe("splitContacts", () => {
  it("nilai tunggal tidak berubah", () => {
    assert.deepEqual(splitContacts("081211559991"), ["081211559991"]);
  });

  it("pemisah titik koma, koma, dan garis miring", () => {
    assert.deepEqual(splitContacts("a; b, c/d"), ["a", "b", "c", "d"]);
  });

  it("bagian kosong dibuang", () => {
    assert.deepEqual(splitContacts("a;; , b"), ["a", "b"]);
  });

  it("masukan kosong menjadi daftar kosong", () => {
    assert.deepEqual(splitContacts(""), []);
    assert.deepEqual(splitContacts(null), []);
  });
});

describe("kanal ganda (DET-03/04, regresi data nyata)", () => {
  it("WA ganda KCIC #557: dua nomor, dua tautan valid (bukan gabungan 25 digit)", () => {
    const numbers = splitContacts("081211559991; 081384788643");
    assert.deepEqual(numbers, ["081211559991", "081384788643"]);
    assert.deepEqual(numbers.map(waLink), [
      "https://wa.me/6281211559991",
      "https://wa.me/6281384788643",
    ]);
  });

  it("email ganda Reska #552: empat alamat terpisah", () => {
    assert.deepEqual(
      splitContacts(
        "rekrut@reska.id; rekrutregion1@reska.id; rekrutregion2@reska.id; rekrut.regional4@reska.id",
      ),
      [
        "rekrut@reska.id",
        "rekrutregion1@reska.id",
        "rekrutregion2@reska.id",
        "rekrut.regional4@reska.id",
      ],
    );
  });
});

describe("linkifySegments: URL dan email (DET-02)", () => {
  it("teks tanpa tautan menjadi satu potongan teks", () => {
    assert.deepEqual(linkifySegments("Kantor pusat di Bandung."), [
      { text: "Kantor pusat di Bandung." },
    ]);
  });

  it("URL http di tengah kalimat menjadi tautan", () => {
    assert.deepEqual(
      hrefs("detail di https://www.mrdiy.com/id/career/store-crew, lokasi Indonesia"),
      ["https://www.mrdiy.com/id/career/store-crew"],
    );
  });

  it("koma dan titik di ujung URL bukan bagian tautan", () => {
    assert.deepEqual(hrefs("lihat https://contoh.id/karir, lalu daftar."), [
      "https://contoh.id/karir",
    ]);
    assert.equal(
      rejoined("lihat https://contoh.id/karir, lalu daftar."),
      "lihat https://contoh.id/karir, lalu daftar.",
    );
  });

  it("kurung tutup di ujung tautan bukan bagian tautan", () => {
    assert.deepEqual(hrefs("(formulir di archiindonesia.com/career-list/)"), [
      "https://archiindonesia.com/career-list/",
    ]);
  });

  it("email menjadi tautan mailto", () => {
    assert.deepEqual(hrefs("email grup: recruitment@pertamina.com"), [
      "mailto:recruitment@pertamina.com",
    ]);
  });

  it("email tidak terpotong menjadi tautan domain", () => {
    const segments = linkifySegments(
      "Email proyek: recruitment.project@pp-presisi.co.id",
    );
    assert.deepEqual(
      segments.filter((seg) => seg.href),
      [
        {
          text: "recruitment.project@pp-presisi.co.id",
          href: "mailto:recruitment.project@pp-presisi.co.id",
        },
      ],
    );
  });

  it("beberapa tautan dalam satu teks semuanya tertangkap", () => {
    assert.deepEqual(
      hrefs(
        "Form: bit.ly/BethsaidaRecruitment | Email: hrd@rsbrawijayasawangan.com | Web: https://contoh.id/x",
      ),
      [
        "https://bit.ly/BethsaidaRecruitment",
        "mailto:hrd@rsbrawijayasawangan.com",
        "https://contoh.id/x",
      ],
    );
  });

  it("teks gabungan potongan selalu sama dengan masukan", () => {
    const samples = [
      "Form: bit.ly/btuportal2025 (Okt 2026)",
      "Email A.Yani: hrd.ayani@awalbros.com | Call center: 1500088",
      "Kantor: Jl. Tebet Raya No. 14 A, Jakarta Selatan 12810",
      "Portal https://jakpro.co.id/karir terverifikasi, tetapi isinya kosong.",
      "",
    ];
    for (const sample of samples) {
      assert.equal(rejoined(sample), sample);
    }
  });
});

describe("linkifySegments: domain tanpa skema", () => {
  it("domain pendek bit.ly dan msha.ke menjadi tautan https", () => {
    assert.deepEqual(hrefs("Form: bit.ly/btuportal2025"), [
      "https://bit.ly/btuportal2025",
    ]);
    assert.deepEqual(hrefs("Link: msha.ke/primayahospital"), [
      "https://msha.ke/primayahospital",
    ]);
  });

  it("domain perusahaan tanpa skema menjadi tautan https", () => {
    assert.deepEqual(hrefs("Web: pp-presisi.co.id"), [
      "https://pp-presisi.co.id",
    ]);
    assert.deepEqual(hrefs("Info: sdm.ugm.ac.id"), [
      "https://sdm.ugm.ac.id",
    ]);
    assert.deepEqual(hrefs("Situs: www.paxelhero.com"), [
      "https://www.paxelhero.com",
    ]);
  });

  it("singkatan alamat tidak dikira domain", () => {
    assert.deepEqual(hrefs("Kantor: Jl. Tebet Raya No. 14 A"), []);
    assert.deepEqual(
      hrefs("Kantor pusat: Jl. Soekarno Hatta No. 442, Bandung"),
      [],
    );
    assert.deepEqual(hrefs("Jl. D.I. Panjaitan Kav. 2, Jakarta"), []);
    assert.deepEqual(hrefs("Jl. K.L. Yos Sudarso No. 106, Medan"), []);
  });

  it("akun media sosial (@nama) bukan tautan", () => {
    assert.deepEqual(hrefs("IG: @pp_presisi, @presisi_wedabay"), []);
  });

  it("nomor telepon dan versi bukan tautan", () => {
    assert.deepEqual(hrefs("Call center: 1500088"), []);
    assert.deepEqual(hrefs("versi 5.0.5"), []);
  });

  it("skema javascript tidak pernah menjadi tautan", () => {
    assert.deepEqual(hrefs("javascript:alert(1)"), []);
  });
});

/* Target tombol salin kanal kontak_lain (BUG-1): satu target per URL,
 * atau satu target penyalin seluruh teks bila tanpa URL. */
describe("contactCopyTargets (BUG-1)", () => {
  it("satu URL menghasilkan satu target tautan", () => {
    assert.deepEqual(
      contactCopyTargets(
        "Isi formulir https://t.ly/karir-guardianjabodetabek85",
      ),
      [
        {
          value: "https://t.ly/karir-guardianjabodetabek85",
          isUrl: true,
        },
      ],
    );
  });

  it("beberapa URL menghasilkan satu target per URL, sesuai urutan", () => {
    assert.deepEqual(
      contactCopyTargets(
        "Formulir https://t.ly/aaa atau https://bit.ly/bbb",
      ),
      [
        { value: "https://t.ly/aaa", isUrl: true },
        { value: "https://bit.ly/bbb", isUrl: true },
      ],
    );
  });

  it("URL yang sama berulang hanya dihitung sekali", () => {
    assert.deepEqual(
      contactCopyTargets("https://t.ly/aaa dan lagi https://t.ly/aaa"),
      [{ value: "https://t.ly/aaa", isUrl: true }],
    );
  });

  it("domain tanpa skema menjadi target tautan https", () => {
    assert.deepEqual(contactCopyTargets("Daftar di karir.contoh.id"), [
      { value: "https://karir.contoh.id", isUrl: true },
    ]);
  });

  it("teks polos tanpa URL menyalin seluruh teks", () => {
    assert.deepEqual(
      contactCopyTargets("Jl. Raya Bogor No. 12, Cibinong"),
      [{ value: "Jl. Raya Bogor No. 12, Cibinong", isUrl: false }],
    );
  });

  it("email saja bukan URL: seluruh teks disalin", () => {
    assert.deepEqual(contactCopyTargets("Hubungi hrd@contoh.id"), [
      { value: "Hubungi hrd@contoh.id", isUrl: false },
    ]);
  });

  it("teks kosong atau null menghasilkan daftar kosong", () => {
    assert.deepEqual(contactCopyTargets(""), []);
    assert.deepEqual(contactCopyTargets("   "), []);
    assert.deepEqual(contactCopyTargets(null), []);
    assert.deepEqual(contactCopyTargets(undefined), []);
  });
});

describe("linkDomain (BUG-1)", () => {
  it("mengambil hostname dari href", () => {
    assert.equal(
      linkDomain("https://t.ly/karir-guardianjabodetabek85"),
      "t.ly",
    );
    assert.equal(linkDomain("https://bit.ly/bbb"), "bit.ly");
    assert.equal(linkDomain("https://www.contoh.id/karir/x"), "www.contoh.id");
  });

  it("href yang tidak bisa diurai menghasilkan string kosong", () => {
    assert.equal(linkDomain("bukan-url"), "");
    assert.equal(linkDomain(""), "");
    assert.equal(linkDomain(null), "");
  });
});

/* Render tombol salin kontak_lain (BUG-1) dan spasi penghitung /cari
 * (BUG-2) tidak bisa diuji lewat impor — berkasnya mengandung JSX.
 * Seperti pola ekstraksi sumber di lib/analytics.test.js, yang
 * dikunci di sini adalah sumber yang dikirim: page.js merender
 * CopyChannelButton kanal "link" dari contactCopyTargets, actions.js
 * membedakan aria-label kanal "link", dan search-app.js memakai
 * spasi eksplisit {" "} sebelum hitungan cocok. */
describe("tombol salin kontak_lain di halaman detail (BUG-1, sumber)", () => {
  const pageSrc = readFileSync(
    new URL("./perusahaan/[no]/page.js", import.meta.url),
    "utf8",
  );
  const actionsSrc = readFileSync(
    new URL("./perusahaan/[no]/actions.js", import.meta.url),
    "utf8",
  );

  it("page.js memakai contactCopyTargets untuk kontak_lain", () => {
    assert.match(pageSrc, /contactCopyTargets\(company\.kontak_lain\)/);
  });

  it("page.js merender satu CopyChannelButton kanal link per target", () => {
    assert.match(pageSrc, /otherCopyTargets\.map\(/);
    assert.match(pageSrc, /channel="link"/);
    assert.match(pageSrc, /value=\{target\.value\}/);
  });

  it("page.js meneruskan label copyLink dan membedakan aria-label per domain", () => {
    assert.match(pageSrc, /copyLink: t\(locale, "detail\.copyLink"\)/);
    assert.match(pageSrc, /linkDomain\(target\.value\)/);
  });

  it("actions.js membedakan aria-label kanal link", () => {
    assert.match(actionsSrc, /channel === "link"/);
    assert.match(actionsSrc, /labels\.copyLink/);
  });

  it("tombol salin kontak_lain dirender di dalam blok dd yang sama dengan teks", () => {
    const blockStart = pageSrc.indexOf("company.kontak_lain && (");
    const blockEnd = pageSrc.indexOf("</dd>", blockStart);
    const block = pageSrc.slice(blockStart, blockEnd);
    assert.match(block, /<LinkedText/);
    assert.match(block, /<CopyChannelButton/);
  });
});

describe("spasi penghitung /cari (BUG-2, sumber)", () => {
  const searchSrc = readFileSync(
    new URL("./cari/search-app.js", import.meta.url),
    "utf8",
  );

  it("hitungan cocok dipisah spasi eksplisit dari hitungan tampil", () => {
    /* Paragraf penghitung adalah yang ber-aria-live (paragraf
     * result-count pertama adalah status muat). */
    const pStart = searchSrc.indexOf('aria-live="polite"');
    const pEnd = searchSrc.indexOf("</p>", pStart);
    const paragraph = searchSrc.slice(pStart, pEnd);
    assert.match(paragraph, /fill\(labels\.showing/);
    assert.match(paragraph, /\{" "\}/);
    assert.match(paragraph, /fill\(labels\.matchCount/);
    assert.ok(
      paragraph.indexOf('{" "}') < paragraph.indexOf("labels.matchCount"),
      'spasi eksplisit harus sebelum hitungan cocok',
    );
  });

  it("pola fragmen lama dengan spasi JSX polos sudah tidak ada", () => {
    assert.doesNotMatch(searchSrc, /<> \{fill\(labels\.matchCount/);
  });
});
