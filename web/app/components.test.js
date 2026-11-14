/* Tes unit untuk web/app/components.js, memakai test runner bawaan Node.
 * Dijalankan dengan: node --test app/components.test.js
 * Mencakup helper halaman detail (T18, DET-02/03/04/06): pemecah kanal
 * ganda, tautan WhatsApp per nomor, dan pengubah tautan teks bebas.
 * Catatan: file ini belum masuk skrip "test" di package.json (milik
 * koordinator). Tambahkan app/components.test.js ke daftar di sana. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { linkifySegments, splitContacts, waLink } from "./components.js";

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
