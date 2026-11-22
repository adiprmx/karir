/* Tes unit Gelombang 2 batch W2b-SEO (Fase 5), memakai test runner
 * bawaan Node. Dijalankan dengan: npm test
 * (koordinator menambahkan file ini ke skrip "test" di package.json).
 *
 * Tiga jenis tes:
 * (a) Fungsi murni yang bisa diimpor langsung: buildFeedXml /
 *     escapeXml (MKT-10) dan isShortenerUrl (TS-07).
 * (b) getStatsWithSource (DASH-06 / INFO-12): penanda sumber
 *     "live" | "seed" mengikuti jalur resolveCompanies yang sama
 *     dengan getCompaniesWithSource (mock fetch, tanpa jaringan).
 * (c) Tes wiring statis — MEMBACA berkas sumber langsung, pola yang
 *     sama dengan app/w1-b1.test.js: metadata kanonis per halaman,
 *     JSON-LD, tautan bantuan, tombol berbagi, dan penanda seed di
 *     halaman tidak bisa diimpor oleh node --test (JSX), tetapi
 *     wiring-nya tetap dijaga agar tidak kembali rusak diam-diam. */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* companies.js membaca env saat modul dimuat, jadi env dipasang
 * SEBELUM impor dinamis. Nilai di sini tiruan, bukan kredensial. */
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "kunci-uji";

const { buildFeedXml, escapeXml } = await import("./feed.js");
const { isShortenerUrl } = await import("../app/components.js");
const { getStatsWithSource, revalidateCompanies } =
  await import("./companies.js");

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");

function baca(relatif) {
  return readFileSync(join(WEB, relatif), "utf8");
}

const fetchAsli = globalThis.fetch;
after(() => {
  globalThis.fetch = fetchAsli;
});

/* ---------------- (a) Umpan RSS: buildFeedXml / escapeXml ------- */

function change(overrides = {}) {
  return {
    id: "c1",
    companyNo: 12,
    perusahaan: "PT Contoh",
    from: "Tidak ada lowongan",
    to: "Ada lowongan",
    checkedAt: "2026-11-14",
    createdAt: "2026-11-14T01:00:00.000Z",
    ...overrides,
  };
}

describe("buildFeedXml (MKT-10)", () => {
  it("item memakai judul, tautan, guid, deskripsi, dan pubDate", () => {
    const xml = buildFeedXml([change()], new Date("2026-11-15T00:00:00Z"));
    assert.match(xml, /<title>Karir — Perubahan lowongan<\/title>/);
    assert.match(
      xml,
      /<title>PT Contoh: Tidak ada lowongan → Ada lowongan<\/title>/,
    );
    assert.match(
      xml,
      /<link>https:\/\/karir-adiprmx\.vercel\.app\/perusahaan\/12<\/link>/,
    );
    assert.match(xml, /<guid isPermaLink="false">c1<\/guid>/);
    assert.match(
      xml,
      /<description>Status PT Contoh berubah dari Tidak ada lowongan menjadi Ada lowongan\.<\/description>/,
    );
    assert.match(xml, /<pubDate>Sat, 14 Nov 2026 01:00:00 GMT<\/pubDate>/);
    assert.match(xml, /<lastBuildDate>Sun, 15 Nov 2026 00:00:00 GMT<\/lastBuildDate>/);
    assert.match(xml, /<language>id-ID<\/language>/);
    assert.match(xml, /atom:link href="https:\/\/karir-adiprmx\.vercel\.app\/feed\.xml" rel="self"/);
  });

  it("karakter khusus di-escape supaya XML tidak rusak", () => {
    const xml = buildFeedXml([
      change({ perusahaan: "PT A & B <C> \"D\"", id: "x&y" }),
    ]);
    assert.match(xml, /PT A &amp; B &lt;C&gt; &quot;D&quot;/);
    assert.match(xml, /<guid isPermaLink="false">x&amp;y<\/guid>/);
    assert.doesNotMatch(xml, /PT A & B/);
  });

  it("daftar kosong tetap umpan sah tanpa item", () => {
    const xml = buildFeedXml([]);
    assert.match(xml, /<channel>/);
    assert.doesNotMatch(xml, /<item>/);
    assert.match(xml, /<\/rss>\n$/);
  });

  it("pubDate memakai checkedAt bila createdAt kosong, hilang bila keduanya kosong", () => {
    const denganTanggal = buildFeedXml([
      change({ createdAt: "", checkedAt: "2026-11-14" }),
    ]);
    assert.match(denganTanggal, /<pubDate>Sat, 14 Nov 2026 00:00:00 GMT<\/pubDate>/);
    const tanpaTanggal = buildFeedXml([
      change({ createdAt: "", checkedAt: "" }),
    ]);
    assert.doesNotMatch(tanpaTanggal, /<pubDate>/);
  });

  it("guid cadangan dari nomor + tanggal cek bila id kosong", () => {
    const xml = buildFeedXml([change({ id: "" })]);
    assert.match(xml, /<guid isPermaLink="false">12-2026-11-14<\/guid>/);
  });
});

describe("escapeXml", () => {
  it("meng-escape kelima karakter khusus XML", () => {
    assert.equal(
      escapeXml(`a & b < c > d "e" 'f'`),
      "a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;",
    );
    assert.equal(escapeXml(null), "");
    assert.equal(escapeXml(undefined), "");
  });
});

/* ---------------- (a) Deteksi tautan pemendek (TS-07) ------------ */

describe("isShortenerUrl (TS-07)", () => {
  it("true untuk host pemendek di data dan pemendek umum", () => {
    for (const url of [
      "https://bit.ly/abc123",
      "http://linktr.ee/perusahaan",
      "https://tinyurl.com/xyz",
      "https://s.id/daftar",
      "https://lnkd.in/abc",
      "https://t.ly/abc",
    ]) {
      assert.equal(isShortenerUrl(url), true, url);
    }
  });

  it("true untuk subdomain pemendek dan huruf besar", () => {
    assert.equal(isShortenerUrl("https://go.bit.ly/abc"), true);
    assert.equal(isShortenerUrl("https://BIT.LY/abc"), true);
  });

  it("false untuk domain biasa, domain yang mirip, dan bukan URL", () => {
    for (const url of [
      "https://karir-adiprmx.vercel.app/perusahaan/12",
      "https://bit.ly.evil.com/abc",
      "https://forms.gle/abc",
      "https://www.instagram.com/perusahaan",
      "bukan-url",
      "",
      "mailto:hrd@contoh.id",
      null,
    ]) {
      assert.equal(isShortenerUrl(url), false, String(url));
    }
  });
});

/* ---------------- (b) getStatsWithSource (DASH-06/INFO-12) ------- */

const TODAY_WIB = new Date().toLocaleDateString("en-CA", {
  timeZone: "Asia/Jakarta",
});

function doc(no, perusahaan, status, tanggal_cek) {
  return {
    name: `projects/proyek-uji/databases/(default)/documents/companies/${no}`,
    fields: {
      no: { integerValue: String(no) },
      perusahaan: { stringValue: perusahaan },
      kategori: { stringValue: "Teknologi" },
      link_karir: { stringValue: "https://contoh.test/karir" },
      status: { stringValue: status },
      tanggal_cek: { stringValue: tanggal_cek },
      catatan: { stringValue: "" },
      lokasi: { stringValue: "Bogor" },
      posisi: { stringValue: "Staff" },
      batas_lamar: { stringValue: "" },
    },
  };
}

const LIVE_DOCS = [
  doc(1, "PT Alfa", "Ada lowongan", "2026-11-14"),
  doc(2, "PT Beta", "Ada lowongan", "2026-11-14"),
  doc(3, "PT Gamma", "Tidak ada lowongan", "2026-11-13"),
];

function pasangMock(mode) {
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    await new Promise((r) => setTimeout(r, 2));
    /* PATCH pencacah refill (best-effort) selalu dijawab OK. */
    if (options.method === "PATCH" && u.includes("meta/lastChange")) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (u.includes("meta/lastChange")) {
      if (mode.markerStatus !== 200) {
        return { ok: false, status: mode.markerStatus, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          fields: {
            rev: { integerValue: "1" },
            updatedAt: { stringValue: "2026-11-15T00:00:00.000Z" },
            counterDay: { stringValue: TODAY_WIB },
            refillsToday: { integerValue: "0" },
            readsEstimate: { integerValue: "0" },
          },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ documents: LIVE_DOCS }),
    };
  };
}

describe("getStatsWithSource (DASH-06 / INFO-12)", () => {
  it("marker 429 -> statistik dari seed, source seed", async () => {
    pasangMock({ markerStatus: 429 });
    revalidateCompanies();
    const { stats, source } = await getStatsWithSource();
    assert.equal(source, "seed");
    assert.equal(stats.total, 830);
    assert.ok(stats.byStatus["Ada lowongan"] > 0);
  });

  it("marker + refill sehat -> statistik live, source live", async () => {
    pasangMock({ markerStatus: 200 });
    revalidateCompanies();
    const { stats, source } = await getStatsWithSource();
    assert.equal(source, "live");
    assert.equal(stats.total, 3);
    assert.equal(stats.byStatus["Ada lowongan"], 2);
    assert.equal(stats.byStatus["Tidak ada lowongan"], 1);
    assert.equal(stats.byDate["2026-11-14"], 2);
  });
});

/* ---------------- (c) Wiring statis ------------------------------- */

const KUNCI_W2B = [
  "footer.feed",
  "home.shareKarirTitle",
  "home.shareKarirText",
  "home.shareKarir",
  "home.shareKarirMsg",
  "home.shareTargetsMsg",
  "search.emptyHelp",
  "search.metaDescription",
  "dash.metaDescription",
  "detail.shortenerNote",
];

describe("kunci i18n W2b ada di ID dan EN", () => {
  it("blok W2b ada di kedua kamus dan semua kunci terisi dua kali", () => {
    const src = baca("lib/i18n.js");
    assert.equal(src.split("/* --- W2b").length - 1, 2);
    for (const k of KUNCI_W2B) {
      const hitung = src.split(`"${k}":`).length - 1;
      assert.equal(hitung, 2, `kunci ${k} muncul ${hitung}x, harus 2x (ID+EN)`);
    }
  });
});

describe("pass metadata kanonis (SEO-04 / MKT-03 / DET-09)", () => {
  it("root layout TIDAK mengklaim canonical (supaya tidak diwariskan ke semua halaman)", () => {
    assert.doesNotMatch(baca("app/layout.js"), /canonical/);
  });

  it("setiap halaman dalam cakupan punya canonical-nya sendiri", () => {
    const kasus = [
      ["app/page.js", 'alternates: { canonical: "/" }'],
      ["app/cari/page.js", 'alternates: { canonical: "/cari" }'],
      ["app/dasbor/page.js", 'alternates: { canonical: "/dasbor" }'],
      ["app/peta/page.js", 'alternates: { canonical: "/peta" }'],
      ["app/tentang/page.js", 'alternates: { canonical: "/tentang" }'],
      ["app/metode/page.js", 'alternates: { canonical: "/metode" }'],
      ["app/faq/page.js", 'alternates: { canonical: "/faq" }'],
      ["app/changelog/page.js", 'alternates: { canonical: "/changelog" }'],
      ["app/mulai/layout.js", 'alternates: { canonical: "/mulai" }'],
      ["app/dukungan/page.js", 'alternates: { canonical: "/dukungan" }'],
      ["app/privasi/page.js", 'alternates: { canonical: "/privasi" }'],
      ["app/syarat/page.js", 'alternates: { canonical: "/syarat" }'],
      [
        "app/perusahaan/[no]/page.js",
        "alternates: { canonical: `/perusahaan/${company.no}` }",
      ],
    ];
    for (const [file, jarum] of kasus) {
      assert.ok(baca(file).includes(jarum), `${file} tanpa ${jarum}`);
    }
  });

  it("/cari memakai kanonis polos (URL berparameter adalah duplikat)", () => {
    const src = baca("app/cari/page.js");
    assert.ok(src.includes('canonical: "/cari"'));
    assert.doesNotMatch(src, /canonical: "\/cari\?/);
  });
});

describe("deskripsi + OG unik per halaman (SEO-05)", () => {
  it("/cari dan /dasbor punya description + openGraph dari kunci i18n", () => {
    for (const file of ["app/cari/page.js", "app/dasbor/page.js"]) {
      const src = baca(file);
      assert.ok(src.includes("metaDescription"), file);
      assert.ok(src.includes("openGraph"), file);
    }
  });

  it("/peta, /tentang, /metode, /faq, /changelog punya blok openGraph", () => {
    for (const file of [
      "app/peta/page.js",
      "app/tentang/page.js",
      "app/metode/page.js",
      "app/faq/page.js",
      "app/changelog/page.js",
    ]) {
      assert.ok(baca(file).includes("openGraph"), file);
    }
  });
});

describe("JSON-LD (SEO-07 / MKT-11)", () => {
  it("beranda punya WebSite + SearchAction + Organization", () => {
    const src = baca("app/page.js");
    assert.ok(src.includes('"@type": "WebSite"'));
    assert.ok(src.includes('"@type": "SearchAction"'));
    assert.ok(src.includes('"@type": "Organization"'));
    assert.ok(src.includes("/cari?posisi={search_term_string}"));
    assert.ok(src.includes('type="application/ld+json"'));
  });

  it("/faq punya FAQPage dari daftar tanya jawab yang sama", () => {
    const src = baca("app/faq/page.js");
    assert.ok(src.includes('"@type": "FAQPage"'));
    assert.ok(src.includes("QA.map"));
  });

  it("detail punya BreadcrumbList Beranda → Cari → perusahaan", () => {
    const src = baca("app/perusahaan/[no]/page.js");
    assert.ok(src.includes('"@type": "BreadcrumbList"'));
    assert.ok(src.includes('name: "Beranda"'));
    assert.ok(src.includes('name: "Cari"'));
  });
});

describe("duplikat h1 di /dasbor (SEO-10)", () => {
  it("loading.js dasbor tanpa h1 dan tanpa teks judul", () => {
    const src = baca("app/dasbor/loading.js");
    assert.doesNotMatch(src, /<h1/);
    assert.ok(src.includes("skeleton"));
  });
});

describe("titik bantuan di alur utama (UR-08)", () => {
  it("state kosong /cari menaut ke /metode", () => {
    const src = baca("app/cari/search-app.js");
    assert.ok(src.includes('href="/metode"'));
    assert.ok(src.includes("labels.emptyHelp"));
    assert.ok(baca("app/cari/page.js").includes("emptyHelp"));
  });

  it("langkah 1 /mulai menaut ke /faq", () => {
    assert.ok(baca("app/mulai/page.js").includes('href="/faq"'));
  });
});

describe("berbagi beranda (MKT-05 / MKT-06)", () => {
  it("ada ajakan Bagikan Karir dengan teks situsnya sendiri", () => {
    const src = baca("app/page.js");
    assert.ok(src.includes("home.shareKarirTitle"));
    assert.ok(src.includes("home.shareKarirMsg"));
    assert.ok(src.includes("waShareKarirHref"));
  });

  it("Bagikan daftar lowongan memakai tautan daftar live, bukan cuplikan per perusahaan", () => {
    const src = baca("app/page.js");
    assert.ok(src.includes("home.shareTargetsMsg"));
    assert.ok(src.includes("/cari?status="));
    assert.doesNotMatch(src, /\/perusahaan\/\$\{c\.no\}/);
  });
});

describe("kata terverifikasi menaut ke definisi (TS-04)", () => {
  it("beranda, hero, dan /mulai menautkan kata itu ke /metode", () => {
    assert.ok(baca("app/page.js").includes('<Link href="/metode">'));
    assert.ok(baca("app/hero-search.js").includes('<Link href="/metode">'));
    /* /mulai: kalimatnya lokal (W2a) — kata dicari di kalimatnya
     * sendiri lalu dibungkus tautan yang sama (merge W2a+W2b). */
    const mulai = baca("app/mulai/page.js");
    assert.ok(mulai.includes('<Link href="/metode">{kata}</Link>'));
    assert.ok(mulai.includes('kalimat.includes("terverifikasi")'));
  });
});

describe("metadata detail di X (MKT-02)", () => {
  it("generateMetadata detail punya twitter per perusahaan", () => {
    const src = baca("app/perusahaan/[no]/page.js");
    assert.ok(src.includes("twitter: {"));
    assert.ok(src.includes('card: "summary_large_image"'));
    assert.ok(src.includes("title: company.perusahaan"));
  });
});

describe("umpan RSS (MKT-10)", () => {
  it("route feed.xml ada dan memakai getChanges + buildFeedXml", () => {
    assert.ok(existsSync(join(WEB, "app/feed.xml/route.js")));
    const src = baca("app/feed.xml/route.js");
    assert.ok(src.includes("getChanges"));
    assert.ok(src.includes("buildFeedXml"));
    assert.ok(src.includes("application/rss+xml"));
  });

  it("layout menautkan umpan lewat tag link dan tautan footer", () => {
    const src = baca("app/layout.js");
    assert.ok(src.includes('type="application/rss+xml"'));
    assert.ok(src.includes('href="/feed.xml"'));
    assert.ok(src.includes("footer.feed"));
  });
});

describe("catatan pemendek di detail (TS-07)", () => {
  it("detail memakai isShortenerUrl dan kunci shortenerNote di dua tempat", () => {
    const src = baca("app/perusahaan/[no]/page.js");
    assert.ok(src.includes("isShortenerUrl"));
    assert.ok(src.includes("portalShortened"));
    assert.ok(src.includes("channelsShortened"));
    assert.equal(
      src.split("detail.shortenerNote").length - 1,
      2,
      "catatan harus tampil di portal utama dan di kanal lain",
    );
  });
});

describe("penanda data cadangan (DASH-06 / INFO-12)", () => {
  it("dasbor, tentang, dan metode memakai getStatsWithSource + seedNote", () => {
    for (const file of [
      "app/dasbor/page.js",
      "app/tentang/page.js",
      "app/metode/page.js",
    ]) {
      const src = baca(file);
      assert.ok(src.includes("getStatsWithSource"), file);
      assert.ok(src.includes('source === "seed"'), file);
      assert.ok(src.includes("common.seedNote"), file);
    }
  });

  it("getStatsWithSource diekspor dari lib/companies.js", () => {
    assert.ok(
      baca("lib/companies.js").includes(
        "export async function getStatsWithSource",
      ),
    );
  });
});
