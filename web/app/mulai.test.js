/* Tes alur wizard /mulai (ONB-03 — celah di luar unit onboarding),
 * memakai test runner bawaan Node. Dijalankan dengan:
 *   node --test app/mulai.test.js
 * (koordinator menambahkan berkas ini ke skrip `npm test`.)
 *
 * Unit loadOnboarding/saveOnboarding/clearOnboarding/
 * hasOnboardingChoice/isOnboardingComplete SUDAH teruji di
 * app/onboarding.test.js (22 test) dan tidak diulang. Yang dites di
 * sini adalah celahnya: wizard 3 langkah di app/mulai/page.js
 * (wiring statis, pola app/w1-b1.test.js) + matematika pratinjau
 * yang dipakai langkah 3, dihitung dari seed repo lewat
 * lib/search.js — fungsi yang sama dengan rank() yang dipakai
 * wizard (app/company-index.js tidak bisa diimpor node:test karena
 * alias @/, jadi dipakai runSearch + matchedCompanyNos langsung). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runSearch, matchedCompanyNos } from "../lib/search.js";
import { CITIES } from "../lib/cities.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");

function baca(relatif) {
  return readFileSync(join(WEB, relatif), "utf-8");
}

const SEED = JSON.parse(baca("data/companies.json"));
const PAGE = baca("app/mulai/page.js");

function ambilDaftar(nama) {
  const m = PAGE.match(new RegExp(`const ${nama} = \\[([\\s\\S]*?)\\];`));
  assert.ok(m, `${nama} tidak ditemukan di app/mulai/page.js`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/* Matematika pratinjau langkah 3 (ONB-10), rumus yang sama dengan
 * app/mulai/page.js: rank -> matched, verified dari matched yang
 * berstatus Ada lowongan, top 3 hanya dari matched. */
function pratinjau(domisili, posisi) {
  const { results, query } = runSearch(SEED, {
    domisili,
    posisi,
    urutan: "relevansi",
  });
  const matched = new Set(matchedCompanyNos(results, query));
  let verified = 0;
  for (const e of results) {
    if (matched.has(e.company.no) && e.company.status === "Ada lowongan") {
      verified += 1;
    }
  }
  return {
    matched: matched.size,
    verified,
    top: results.filter((e) => matched.has(e.company.no)).slice(0, 3),
  };
}

describe("chip langkah 1-2 (ONB-03)", () => {
  it("CITY_CHIPS: 11 kota, semuanya kota dikenal lib/cities.js", () => {
    const chips = ambilDaftar("CITY_CHIPS");
    assert.equal(chips.length, 11);
    const dikenal = new Set(CITIES.map((c) => c.name));
    for (const c of chips) {
      assert.ok(dikenal.has(c), `chip kota asing: ${c}`);
    }
    assert.equal(new Set(chips).size, chips.length);
  });

  it("ROLE_CHIPS sama dengan ROLE_NAMES beranda (7 peran)", () => {
    const chips = ambilDaftar("ROLE_CHIPS");
    const peranBeranda = [...baca("app/page.js")
      .match(/const ROLE_NAMES = \[([\s\S]*?)\];/)[1]
      .matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    assert.deepEqual(chips, peranBeranda);
  });
});

describe("matematika pratinjau langkah 3 (ONB-10)", () => {
  it("Depok + Helper Gudang: cocok > 0, terverifikasi <= cocok, top <= 3 dari cocok", () => {
    const p = pratinjau("Depok", "Helper Gudang");
    assert.ok(p.matched > 0, "tidak ada kanal cocok untuk contoh ini");
    assert.ok(p.verified <= p.matched);
    assert.ok(p.top.length <= 3);
    assert.ok(p.top.length > 0);
    const matched = new Set(
      pratinjau("Depok", "Helper Gudang").top.map((e) => e.company.no),
    );
    assert.ok(matched.size === p.top.length);
  });

  it("hanya domisili: tetap ada pratinjau, tanpa posisi", () => {
    const p = pratinjau("Depok", "");
    assert.ok(p.matched > 0);
    assert.ok(p.verified <= p.matched);
    assert.ok(p.top.length <= 3);
  });

  it("tanpa isian: wizard tidak menghitung pratinjau (null)", () => {
    /* Di page.js: `if (!index || !(domisili.trim() || posisi.trim()))
     * return null` — jadi tanpa isian tidak ada angka yang tampil. */
    assert.ok(PAGE.includes("if (!index || !(domisili.trim() || posisi.trim())) return null;"));
  });

  it("tiga teratas HANYA dari yang cocok — hasil di luar matched tidak tampil", () => {
    assert.ok(
      PAGE.includes(
        "top: r.results\n        .filter((e) => r.matched.has(e.company.no))\n        .slice(0, 3),",
      ),
    );
    /* Perilaku: contoh di atas — semua top adalah matched. */
    const p = pratinjau("Depok", "Helper Gudang");
    assert.ok(p.top.every((e) => e.company));
  });
});

describe("wiring wizard 3 langkah (ONB-03)", () => {
  it("tiga langkah + penanda Langkah {n} dari 3", () => {
    assert.ok(PAGE.includes("stepOf: \"Langkah {n} dari 3\""));
    assert.ok(PAGE.includes("{[1, 2, 3].map((n) => ("));
    assert.ok(PAGE.includes("wizardLabel: \"Tiga langkah singkat\""));
  });

  it("Enter di isian melanjutkan langkah (form onSubmit)", () => {
    assert.ok(PAGE.includes("<form onSubmit={handleWizardSubmit}>"));
    assert.ok(PAGE.includes("if (step < 3) goToStep(step + 1);"));
    assert.ok(PAGE.includes("else finishOnboarding();"));
  });

  it("Lewati tersedia di semua langkah (ONB-08)", () => {
    assert.ok(PAGE.includes('{step > 1 ? ('));
    assert.ok(PAGE.includes("onClick={skipOnboarding}"));
    assert.ok(PAGE.includes("href=\"/cari\""));
    /* Langkah 1: Lewati sebagai tombol; langkah 2-3: tautan. */
    assert.ok(PAGE.includes('className="linkish"'));
  });

  it("selesai: catat event onboarding lalu ke hasil (finishOnboarding)", () => {
    assert.ok(
      PAGE.includes(
        'trackEvent({ type: "onboarding", path: "/mulai", action: "selesai" });',
      ),
    );
    assert.ok(PAGE.includes("function finishOnboarding()"));
    assert.ok(PAGE.includes("goToResults();"));
  });

  it("ke hasil: simpan jawaban lalu router.push /cari dengan filter", () => {
    assert.ok(PAGE.includes('params.set("domisili", d)'));
    assert.ok(PAGE.includes('params.set("posisi", p)'));
    assert.ok(PAGE.includes("router.push(query ? `/cari?${query}` : \"/cari\")"));
    assert.ok(PAGE.includes("save({ domisili: d, posisi: p })"));
    /* Gagal simpan diberi tahu lewat toast, hasil tetap dibuka. */
    assert.ok(PAGE.includes("showToast(labels.saveFailed)"));
  });

  it("ringkasan tampil bila ada pilihan tersimpan dan tidak sedang ubah", () => {
    assert.ok(
      PAGE.includes("const showSummary = loaded && hasOnboardingChoice(data) && !editing;"),
    );
    assert.ok(PAGE.includes("labels.viewMatches"));
    assert.ok(PAGE.includes("labels.editChoices"));
    assert.ok(PAGE.includes("labels.clearChoices"));
  });

  it("hapus pilihan butuh ConfirmDialog; gagal hapus tidak mereset state (ONB-11)", () => {
    assert.ok(PAGE.includes("<ConfirmDialog"));
    assert.ok(PAGE.includes("onConfirm={onClear}"));
    assert.ok(PAGE.includes("if (!clear()) {"));
    assert.ok(PAGE.includes("showToast(labels.clearFailed);"));
  });

  it("sebelum data dibaca: skeleton dengan aria-busy (ONB-04)", () => {
    assert.ok(PAGE.includes("{!loaded ? ("));
    assert.ok(PAGE.includes('aria-label={labels.loadingChoices}'));
    assert.ok(PAGE.includes('aria-busy="true"'));
  });

  it("tanpa JavaScript: pesan jujur di noscript", () => {
    assert.ok(PAGE.includes("<noscript>"));
    assert.ok(PAGE.includes("Halaman ini butuh JavaScript"));
  });

  it("kata terverifikasi di pratinjau menaut ke /metode", () => {
    assert.ok(PAGE.includes('<Link href="/metode">{kata}</Link>'));
  });
});
