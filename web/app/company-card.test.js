/* Tes wiring CompanyCard / TrackerControl / SearchApp (FE-15)
 * dan state error/empty pencarian (CARI-10), memakai test runner
 * bawaan Node. Dijalankan dengan: node --test app/company-card.test.js
 * (koordinator menambahkan berkas ini ke skrip `npm test`.)
 *
 * Tes wiring statis — MEMBACA berkas sumber langsung, pola yang sama
 * dengan app/components.test.js dan app/peta-state.test.js: komponen
 * memakai JSX sehingga tidak bisa diimpor node:test, tetapi keputusan
 * tampilan yang dilaporkan di audit (FE-15, CARI-10, LAND-02, LAM-07)
 * tetap dijaga agar tidak hilang diam-diam. Logika murni yang
 * dipakai komponen (waLink/splitContacts/linkifySegments) SUDAH
 * teruji di app/components.test.js dan tidak diulang di sini.
 *
 * Bagian terakhir mengecek kelengkapan label: setiap kunci
 * `labels.X` yang dipakai komponen harus didefinisikan di halaman
 * pemanggilnya — label yang hilang membuat komponen menampilkan
 * `undefined` di layar. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");

function baca(relatif) {
  return readFileSync(join(WEB, relatif), "utf-8");
}

function kunciLabelsDipakai(src) {
  return [...new Set([...src.matchAll(/labels\.([A-Za-z]+)/g)].map((m) => m[1]))];
}

/* Halaman pemanggil mendefinisikan label sebagai `kunci: t(locale, ...)`
 * — baik di `const labels = {}` (cari/page.js) maupun inline
 * `labels={{...}}` (page.js, dasbor/page.js) — jadi kelengkapan
 * dicek di seluruh sumber halaman. */
function assertLabelsLengkap(halamanRelatif, komponenRelatif, namaHalaman) {
  const halaman = baca(halamanRelatif);
  for (const k of kunciLabelsDipakai(baca(komponenRelatif))) {
    assert.ok(
      new RegExp(`\\b${k}\\s*:`).test(halaman),
      `${namaHalaman} tidak mendefinisikan labels.${k} (dipakai ${komponenRelatif})`,
    );
  }
}

describe("CompanyCard (FE-15)", () => {
  const card = baca("app/company-card.js");

  it("artikel memakai data-no + tautan detail + logo + stempel status", () => {
    assert.ok(card.includes("data-no={c.no}"));
    assert.ok(card.includes("className={`co${compact ? \" compact\" : \"\"}`}"));
    assert.ok(card.includes("<Link href={`/perusahaan/${c.no}`}>"));
    assert.ok(card.includes("<CompanyLogo"));
    assert.ok(card.includes("<StatusStamp"));
  });

  it("chip cocok hanya untuk posisi dan lokasi", () => {
    assert.ok(
      card.includes(
        'reasons.filter(\n    (r) => r === "Posisi cocok" || r === "Lokasi cocok",\n  )',
      ),
    );
    assert.ok(card.includes('labels.matchPosition || r'));
    assert.ok(card.includes('labels.matchLocation || r'));
  });

  it("chip Baru tampil bila prop isNew benar", () => {
    /* Keputusan "baru"-nya ada di pemanggil (TargetFilter, pakai
     * isNewChange — lihat test di bawah); kartu hanya menampilkan
     * prop isNew apa adanya. */
    assert.ok(card.includes('{isNew && <span className="chip match">'));
    assert.ok(card.includes('labels.new || "Baru"'));
  });

  it("mode ringkas menyembunyikan posisi", () => {
    assert.ok(card.includes("{!compact && c.posisi && ("));
    assert.ok(card.includes('<p className="co-pos">'));
  });

  it("tanpa tombol portal bila status Portal tidak bisa dibuka", () => {
    assert.ok(
      card.includes(
        'const hasPortal = safeLink(c.link_karir) && c.status !== "Portal tidak bisa dibuka";',
      ),
    );
    assert.ok(card.includes("{hasPortal && ("));
  });

  it("tombol tandai memakai aria-pressed + label tandai/lepas", () => {
    assert.ok(card.includes("aria-pressed={Boolean(tracked)}"));
    assert.ok(card.includes('labels.unmark || "Lepas tanda"'));
    assert.ok(card.includes('labels.mark || "Tandai"'));
    assert.ok(card.includes("onClick={() => onToggle(c)}"));
  });

  it("lamaran yang dilacak (bukan Ditandai) menautkan ke #lamaran", () => {
    assert.ok(card.includes('tracked && tracked.status !== "Ditandai"'));
    assert.ok(card.includes("href={`/perusahaan/${c.no}#lamaran`}"));
  });

  it("blok notice ditampilkan bila ada", () => {
    assert.ok(card.includes("{notice && ("));
    assert.ok(card.includes('<p className="co-note">'));
  });

  it("kerangka muat default 5 kartu", () => {
    assert.ok(card.includes("function CardSkeletons({ n = 5 })"));
    assert.ok(card.includes('aria-hidden="true"'));
  });
});

describe("keputusan chip Baru di TargetFilter (LAND-02)", () => {
  const filter = baca("app/target-filter.js");

  it("nomor baru dihitung dari /api/changes lewat pemuat bersama", () => {
    assert.ok(filter.includes("loadChanges()"));
    assert.ok(filter.includes(".filter((c) => isNewChange(c.createdAt))"));
    assert.ok(filter.includes("new Set("));
  });

  it("chip Baru hanya bila nomornya ada di daftar baru", () => {
    assert.ok(
      filter.includes("isNew={newNos ? newNos.has(Number(c.no)) : false}"),
    );
  });

  it("umpan gagal: tidak ada chip Baru, daftar tetap tampil", () => {
    assert.ok(filter.includes(".catch(() => {"));
    assert.ok(filter.includes("setNewNos(new Set())"));
  });

  it("kehilangan status target TIDAK masuk daftar baru", () => {
    /* Regresi LAND-02: perusahaan yang BERHENTI jadi target sempat
     * tampil dengan chip hijau "Baru". Filter hanya memakai
     * createdAt perubahan (isNewChange), bukan status tujuannya —
     * perubahan dari target ke status lain tidak lolos
     * isNewChange bila sudah lewat 48 jam, dan chip di kartu
     * hanya membaca keanggotaan daftar ini. */
    assert.doesNotMatch(filter, /c\.to === "Ada lowongan"/);
    assert.doesNotMatch(filter, /c\.from === "Ada lowongan"/);
  });
});

describe("TrackerControl (FE-15 / LAM-07)", () => {
  const tracker = baca("app/tracker.js");

  it("seksi #lamaran memakai radiogroup TRACKER_STATUSES", () => {
    assert.ok(tracker.includes('id="lamaran"'));
    assert.ok(tracker.includes('role="radiogroup"'));
    assert.ok(tracker.includes("TRACKER_STATUSES.map("));
  });

  it("simpan tanggal + catatan dipotong 200 huruf (LAM-03/04)", () => {
    assert.ok(tracker.includes('type="date"'));
    assert.ok(tracker.includes("maxLength={200}"));
    assert.ok(tracker.includes(".slice(0, 200)"));
    assert.ok(tracker.includes("labels.notePlaceholder"));
  });

  it("hapus butuh dialog konfirmasi, lalu remove() (LAM-07)", () => {
    assert.ok(tracker.includes("<ConfirmDialog"));
    assert.ok(tracker.includes("title={labels.deleteTitle}"));
    assert.ok(tracker.includes("confirmLabel={labels.deleteConfirm}"));
    assert.ok(tracker.includes("onClick={() => setConfirmDelete(true)}"));
    assert.ok(tracker.includes("remove(company.no)"));
  });

  it("event detail dikirim sekali (penjaga ref, StrictMode aman)", () => {
    assert.ok(tracker.includes("const detailSent = useRef(false);"));
    assert.ok(tracker.includes("if (detailSent.current) return;"));
    assert.ok(tracker.includes('type: "detail"'));
  });

  it("skeleton saat data belum muat, diumumkan ke pembaca layar", () => {
    assert.ok(tracker.includes("{!loaded ? ("));
    assert.ok(tracker.includes('role="status"'));
    assert.ok(tracker.includes("aria-label={labels.loading}"));
  });
});

describe("SearchApp — state error/empty (CARI-10)", () => {
  const app = baca("app/cari/search-app.js");

  it("gagal: pesan error + tombol coba lagi memanggil start", () => {
    assert.ok(app.includes('{loadState === "error" && !r ? ('));
    assert.ok(app.includes("<strong>{labels.error}</strong>"));
    assert.ok(app.includes("onClick={start}"));
    assert.ok(app.includes("{labels.retry}"));
  });

  it("kosong: pesan + petunjuk + tautan /metode + tombol reset", () => {
    assert.ok(app.includes("{total === 0 ? ("));
    assert.ok(app.includes("<strong>{labels.empty}</strong>"));
    assert.ok(app.includes("<p>{labels.emptyHint}</p>"));
    assert.ok(app.includes('<Link href="/metode">{labels.emptyHelp}</Link>'));
    assert.ok(app.includes("onClick={reset}"));
    assert.ok(app.includes("{labels.reset}"));
  });

  it("memuat: label loading + kerangka 6 kartu", () => {
    assert.ok(app.includes(") : !r ? ("));
    assert.ok(app.includes('<p className="result-count" role="status">{labels.loading}</p>'));
    assert.ok(app.includes("<CardSkeletons n={6} />"));
  });

  it("judul kelompok hanya di mode nama, dengan hitungan seluruh hasil", () => {
    assert.ok(app.includes('const grouped = r ? r.mode === "perusahaan" : false;'));
    assert.ok(app.includes("labels.groupCompanies"));
    assert.ok(app.includes("labels.groupRoles"));
    assert.ok(app.includes("groupCounts?.companies"));
    assert.ok(app.includes("groupCounts?.roles"));
  });

  it("tombol bagikan memakai Web Share bila ada, salin bila tidak", () => {
    assert.ok(app.includes("navigator.share"));
    assert.ok(app.includes("navigator.clipboard.writeText"));
    assert.ok(app.includes("labels.shareCopied"));
    assert.ok(app.includes("labels.shareFailed"));
  });

  it("catatan seed tampil bila data dari seed", () => {
    assert.ok(app.includes('meta?.source === "seed"'));
    assert.ok(app.includes("{labels.seedNote}"));
  });

  it("catatan tanpa kecocokan posisi tampil bila tidak ada yang cocok", () => {
    assert.ok(
      app.includes(
        "{queryHasPosisi && r.mode !== \"perusahaan\" && !anyPositionMatch && (",
      ),
    );
    assert.ok(app.includes("{labels.noPositionMatch}"));
  });

  it("kota dari alamat hanya diterima bila dikenal (cari/page.js)", () => {
    const page = baca("app/cari/page.js");
    assert.ok(page.includes("CITIES.some((c) => c.name === kota) ? kota : \"\""));
    /* Di dalam SearchApp, daftar kota dropdown dibangun dari
     * indeks lewat matchCity — hanya kota yang benar-benar punya
     * perusahaan yang ditawarkan. */
    assert.ok(app.includes("matchCity(c.lokasi)"));
  });

  it("form GET /cari + tombol kirim untuk tanpa-JS (noscript)", () => {
    assert.ok(app.includes('method="get"'));
    assert.ok(app.includes('action="/cari"'));
    assert.ok(app.includes("<noscript>"));
    assert.ok(app.includes('type="submit"'));
    assert.ok(app.includes("{labels.submit}"));
  });

  it("chip filter aktif bisa dihapus satu per satu", () => {
    assert.ok(app.includes("aria-label={`${labels.reset}: ${f.text}`}"));
    assert.ok(app.includes("onClick={() => set({ [f.key]: \"\" })}"));
  });
});

describe("kelengkapan label di halaman pemanggil", () => {
  it("SearchApp: semua labels.X dipakai didefinisikan di cari/page.js", () => {
    assertLabelsLengkap("app/cari/page.js", "app/cari/search-app.js", "cari/page.js");
  });

  it("CompanyCard di /cari: semua labels.X dipakai didefinisikan di cari/page.js", () => {
    assertLabelsLengkap("app/cari/page.js", "app/company-card.js", "cari/page.js");
  });

  it("ChangesFeed + TargetFilter + HeroSearch: labels.X didefinisikan di page.js", () => {
    assertLabelsLengkap("app/page.js", "app/changes-feed.js", "page.js");
    assertLabelsLengkap("app/page.js", "app/target-filter.js", "page.js");
    assertLabelsLengkap("app/page.js", "app/hero-search.js", "page.js");
    assertLabelsLengkap("app/page.js", "app/company-card.js", "page.js");
  });

  it("DashboardPersonal: semua labels.X dipakai didefinisikan di dasbor/page.js", () => {
    assertLabelsLengkap(
      "app/dasbor/page.js",
      "app/dashboard-personal.js",
      "dasbor/page.js",
    );
  });
});
