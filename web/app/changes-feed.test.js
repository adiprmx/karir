/* Tes wiring ChangesFeed (NOTIF-12), memakai test runner bawaan Node.
 * Dijalankan dengan: node --test app/changes-feed.test.js
 * (koordinator menambahkan berkas ini ke skrip `npm test`.)
 *
 * Tes wiring statis — MEMBACA berkas sumber langsung, pola yang sama
 * dengan app/w1-b1.test.js dan app/peta-state.test.js: komponen memakai
 * JSX sehingga tidak bisa diimpor node:test, tetapi keempat state
 * (muat/kosong/rusak/gagal) dan pemakaian pemuat bersama tetap dijaga
 * agar tidak hilang diam-diam. Logika "baru" (isNewChange) SUDAH
 * teruji di lib/notify.test.js dan tidak diulang; di sini yang dites
 * adalah keputusan chip "Baru" di komponennya (LAND-02).
 *
 * Smoke /api/changes di tingkat handler SUDAH teruji di
 * lib/api-routes.test.js (tolak bot 403, batas laju 60/61, degraded
 * 200 + daftar kosong) dan tidak diulang; di sini yang dites adalah
 * cek smoke live-nya di scripts/smoke-check.mjs. */
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

describe("pemuat bersama loadChanges (LAND-05 / FE-05)", () => {
  const feed = baca("app/changes-feed.js");

  it("satu fetch /api/changes, dipakai ulang selama halaman hidup", () => {
    assert.equal(feed.split('fetch("/api/changes"').length - 1, 1);
    assert.ok(feed.includes("let changesPromise = null"));
    assert.ok(feed.includes("if (!changesPromise)"));
  });

  it("timeout 15 detik dan janji dibersihkan bila gagal", () => {
    assert.ok(feed.includes("setTimeout(() => controller.abort(), 15_000)"));
    assert.ok(feed.includes("changesPromise.catch(() => {"));
    assert.ok(feed.includes("changesPromise = null;"));
  });

  it("mengembalikan changes + penanda degraded dari body", () => {
    assert.ok(feed.includes("Array.isArray(body.changes) ? body.changes : []"));
    assert.ok(feed.includes("degraded: body.degraded === true"));
  });
});

describe("keempat state ChangesFeed", () => {
  const feed = baca("app/changes-feed.js");

  it("gagal muat: pesan error dari label", () => {
    assert.ok(feed.includes("if (failed) return"));
    assert.ok(feed.includes("labels.error"));
    assert.ok(feed.includes(".catch(() => {"));
    assert.ok(feed.includes("setFailed(true)"));
  });

  it("memuat: skeleton dengan role status + label loading", () => {
    assert.ok(feed.includes('if (changes === null)'));
    assert.ok(feed.includes('role="status"'));
    assert.ok(feed.includes("labels.loading"));
  });

  it("rusak (degraded + kosong): pesan degraded, BUKAN pesan kosong (BE-14)", () => {
    assert.ok(feed.includes("if (degraded && changes.length === 0)"));
    assert.ok(feed.includes("labels.degraded || labels.error"));
  });

  it("kosong (tidak degraded): pesan kosong dari label", () => {
    assert.ok(feed.includes("if (changes.length === 0)"));
    assert.ok(feed.includes("labels.empty"));
  });

  it("berisi: daftar berurutan dengan tautan ke halaman perusahaan", () => {
    assert.ok(feed.includes('<ol className="changes">'));
    assert.ok(feed.includes("href={`/perusahaan/${c.companyNo}`}"));
  });
});

describe("chip Baru di umpan (LAND-02)", () => {
  const feed = baca("app/changes-feed.js");

  it("baru bila dibuat < 48 jam ATAU perubahannya menuju Ada lowongan", () => {
    assert.ok(feed.includes("isNewChange(c.createdAt)"));
    assert.ok(feed.includes('c.to === "Ada lowongan"'));
  });

  it("kehilangan status target TIDAK mendapat chip Baru", () => {
    /* Regresi LAND-02: perusahaan yang BERHENTI jadi target sempat
     * tampil dengan chip hijau "Baru". Syarat chip hanya melihat
     * `to` (tujuan perubahan), bukan `from` — perubahan dari target
     * ke status lain tidak memenuhi syarat mana pun. */
    const tanpaKomentar = feed
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    assert.doesNotMatch(
      tanpaKomentar,
      /c\.from === "Ada lowongan"/,
    );
    assert.ok(
      tanpaKomentar.includes(
        "return isNewChange(c.createdAt) || c.to === \"Ada lowongan\";",
      ),
    );
  });

  it("chip memakai label new dengan cadangan Baru", () => {
    assert.ok(feed.includes('labels.new || "Baru"'));
  });
});

describe("tampilan entri perubahan", () => {
  const feed = baca("app/changes-feed.js");

  it("alur dari -> ke memakai StatusStamp di kedua sisi", () => {
    assert.ok(feed.includes("<StatusStamp status={c.from} />"));
    assert.ok(feed.includes("<StatusStamp status={c.to} />"));
  });

  it("tanggal memakai formatDate, mentah hanya bila bukan tanggal sah", () => {
    assert.ok(feed.includes("formatDate(c.checkedAt, locale) || c.checkedAt"));
  });
});

describe("smoke /api/changes (NOTIF-12)", () => {
  it("smoke-check.mjs punya cek GET /api/changes 200 + larik changes", () => {
    const smoke = baca("scripts/smoke-check.mjs");
    assert.ok(smoke.includes("async function checkChanges()"));
    assert.ok(smoke.includes('fetchText("/api/changes")'));
    assert.ok(smoke.includes("Array.isArray(data.changes)"));
    assert.ok(smoke.includes("await checkChanges();"));
  });
});
