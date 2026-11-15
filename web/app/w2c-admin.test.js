/* Tes unit batch W2c-ADMIN (Gelombang 2 Fase 5), memakai test runner
 * bawaan Node. Dijalankan dengan: node --test app/w2c-admin.test.js
 * dari web/. Mencakup:
 * - KONTEN-07 (bagian admin): TRACKER_ACTIONS selaras dengan
 *   TRACKER_STATUSES (lima status, "Diterima" sesudah "Dipanggil").
 * - ADM-09: fetchWithTimeout (batas waktu cek tautan).
 * - ADM-11: cancellableDelay + ringkasan cek massal (simpan/baca/
 *   hapus) + summarizeBulkResults.
 * - ADM-12: konstanta halaman muat perusahaan.
 * - ANALITIK-12: agregasi event onboarding di aggregateVisitors.
 * - AKUN-10: penanda keluar sengaja / sesi berakhir.
 * - AKUN-12: passwordStrength + gerbang pendaftaran terlalu cepat.
 * - Wiring statis: tombol Batal, lupa kata sandi admin, baris tabel
 *   keyboard, token UX-13, placeholder netral AKUN-13, .set-row.
 *
 * Pola tes mengikuti lib/analytics.test.js: berkas JSX / beralias
 * @/ tidak bisa diimpor langsung node:test, jadi fungsi murninya
 * diekstrak dari sumbernya lalu dievaluasi — kode yang dites adalah
 * kode yang dikirim, bukan salinan. admin-helpers.js dievaluasi
 * utuh dengan STATUS_ORDER di-stub (satu-satunya impornya);
 * tracker.js dan auth-panel.js memakai blok __PURE_START__ /
 * __PURE_END__ seperti analytics-track.js. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TRACKER_STATUSES } from "../lib/tracker-sync.js";

function readSource(relativeUrl) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

/* Ekstrak blok murni di antara penanda dari satu berkas sumber. */
function loadPureBlock(relativeUrl, names) {
  const src = readSource(relativeUrl);
  const startMarker = "/* __PURE_START__ */";
  const endMarker = "/* __PURE_END__ */";
  const start = src.indexOf(startMarker);
  assert.notEqual(start, -1, `penanda awal blok murni hilang: ${relativeUrl}`);
  const end = src.indexOf(endMarker, start);
  assert.notEqual(end, -1, `penanda akhir blok murni hilang: ${relativeUrl}`);
  const block = src
    .slice(start + startMarker.length, end)
    .replace(/^export /gm, "");
  const factory = new Function(`${block}\nreturn { ${names.join(", ")} };`);
  return factory();
}

/* Evaluasi admin-helpers.js utuh dengan STATUS_ORDER di-stub:
 * satu-satunya impor berkas itu adalah alias @/ yang tidak bisa
 * diselesaikan node. Bila berkas menambah impor baru, test ini
 * gagal dengan pesan yang jelas (sisa "@/..." di sumber). */
function loadAdminHelpers(names) {
  const src = readSource("./admin/admin-helpers.js");
  const importLine = 'import { STATUS_ORDER } from "@/lib/companies";';
  assert.ok(
    src.includes(importLine),
    "baris impor STATUS_ORDER di admin-helpers.js berubah — perbarui stub test",
  );
  const body = src
    .replace(
      importLine,
      'const STATUS_ORDER = ["Ada lowongan", "Tidak ada lowongan", "Tidak dapat diverifikasi", "Portal tidak bisa dibuka"];',
    )
    .replace(/^export /gm, "");
  assert.ok(
    !body.includes("@/"),
    "admin-helpers.js punya impor @/ lain yang belum di-stub",
  );
  const factory = new Function(`${body}\nreturn { ${names.join(", ")} };`);
  return factory();
}

const helpers = loadAdminHelpers([
  "CSV_HEADER",
  "TRACKER_ACTIONS",
  "COMPANIES_PAGE_SIZE",
  "CHECK_LINK_TIMEOUT_MS",
  "BULK_SUMMARY_KEY",
  "aggregateVisitors",
  "fetchWithTimeout",
  "cancellableDelay",
  "summarizeBulkResults",
  "saveBulkSummary",
  "loadBulkSummary",
  "clearBulkSummary",
  "validateCsvRows",
]);
const {
  CSV_HEADER,
  TRACKER_ACTIONS,
  COMPANIES_PAGE_SIZE,
  CHECK_LINK_TIMEOUT_MS,
  BULK_SUMMARY_KEY,
  aggregateVisitors,
  fetchWithTimeout,
  cancellableDelay,
  summarizeBulkResults,
  saveBulkSummary,
  loadBulkSummary,
  clearBulkSummary,
  validateCsvRows,
} = helpers;

const trackerPure = loadPureBlock("./tracker.js", [
  "SIGNOUT_INTENDED_KEY",
  "SESSION_ENDED_KEY",
  "SIGNOUT_INTENDED_MAX_AGE_MS",
  "SESSION_ENDED_MAX_AGE_MS",
  "markSignOutIntended",
  "consumeSignOutIntended",
  "markSessionEnded",
  "consumeSessionEnded",
]);
const {
  SIGNOUT_INTENDED_KEY,
  SESSION_ENDED_KEY,
  SIGNOUT_INTENDED_MAX_AGE_MS,
  SESSION_ENDED_MAX_AGE_MS,
  markSignOutIntended,
  consumeSignOutIntended,
  markSessionEnded,
  consumeSessionEnded,
} = trackerPure;

const authPure = loadPureBlock("./auth-panel.js", [
  "MIN_PASSWORD_LENGTH_DAFTAR",
  "MIN_STRENGTH_DAFTAR",
  "REGISTER_MIN_FILL_MS",
  "COMMON_PASSWORDS",
  "isCommonPassword",
  "passwordStrength",
  "isRegistrationTooFast",
]);
const {
  MIN_PASSWORD_LENGTH_DAFTAR,
  MIN_STRENGTH_DAFTAR,
  REGISTER_MIN_FILL_MS,
  COMMON_PASSWORDS,
  isCommonPassword,
  passwordStrength,
  isRegistrationTooFast,
} = authPure;

function makeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _dump: () => Object.fromEntries(store),
  };
}

function throwingStorage() {
  return {
    getItem: () => {
      throw new Error("ditolak");
    },
    setItem: () => {
      throw new Error("ditolak");
    },
    removeItem: () => {
      throw new Error("ditolak");
    },
  };
}

describe("TRACKER_ACTIONS selaras dengan TRACKER_STATUSES (KONTEN-07)", () => {
  it("lima status dengan urutan yang sama, Diterima sesudah Dipanggil", () => {
    assert.deepEqual(TRACKER_ACTIONS, [
      "Ditandai",
      "Sudah dilamar",
      "Dipanggil",
      "Diterima",
      "Ditolak",
    ]);
    assert.deepEqual(TRACKER_ACTIONS, TRACKER_STATUSES);
  });
});

describe("aggregateVisitors (ANALITIK-12 + KONTEN-07)", () => {
  const companies = [{ no: 1, perusahaan: "A" }];
  const today = new Date(2026, 10, 15);
  const events = [
    { type: "tracker_mark", action: "Diterima", visitor: "v1", day: "2026-11-15" },
    { type: "tracker_mark", action: "Ditandai", visitor: "v1", day: "2026-11-15" },
    { type: "tracker_mark", action: "Tidak dikenal", visitor: "v1", day: "2026-11-15" },
    { type: "onboarding", action: "selesai", visitor: "v1", day: "2026-11-15" },
    { type: "onboarding", action: "selesai", visitor: "v2", day: "2026-11-14" },
    { type: "onboarding", action: "dilewati", visitor: "v3", day: "2026-11-14" },
    { type: "onboarding", action: "aneh", visitor: "v4", day: "2026-11-14" },
    { type: "onboarding", visitor: "v5", day: "2026-11-14" },
    { type: "pageview", path: "/", visitor: "v1", day: "2026-11-15" },
  ];

  it("menghitung Diterima dan mengabaikan status tidak dikenal", () => {
    const summary = aggregateVisitors(events, companies, today);
    assert.equal(summary.tracker.length, 5);
    assert.deepEqual(
      summary.tracker.map((r) => r.action),
      ["Ditandai", "Sudah dilamar", "Dipanggil", "Diterima", "Ditolak"],
    );
    assert.equal(
      summary.tracker.find((r) => r.action === "Diterima").count,
      1,
    );
    assert.equal(
      summary.tracker.find((r) => r.action === "Ditandai").count,
      1,
    );
    assert.equal(
      summary.tracker.find((r) => r.action === "Ditolak").count,
      0,
    );
  });

  it("menghitung onboarding selesai dan dilewati terpisah", () => {
    const summary = aggregateVisitors(events, companies, today);
    assert.deepEqual(summary.onboarding, { selesai: 2, dilewati: 1 });
  });

  it("tanpa event onboarding, hitungannya nol", () => {
    const summary = aggregateVisitors([], companies, today);
    assert.deepEqual(summary.onboarding, { selesai: 0, dilewati: 0 });
    assert.equal(summary.tracker.length, 5);
  });
});

describe("fetchWithTimeout (ADM-09)", () => {
  it("meneruskan hasil dan opsi, menyertakan sinyal, membersihkan ref", async () => {
    const ref = { current: null };
    let seenOptions;
    let seenSignal;
    const fakeFetch = async (url, options) => {
      seenOptions = options;
      seenSignal = options.signal;
      assert.notEqual(ref.current, null);
      return { ok: true, url };
    };
    const res = await fetchWithTimeout(
      fakeFetch,
      "/api/admin/check-link",
      { method: "POST", body: "{}" },
      1000,
      ref,
    );
    assert.equal(res.ok, true);
    assert.equal(seenOptions.method, "POST");
    assert.equal(seenOptions.body, "{}");
    assert.equal(seenSignal.aborted, false);
    assert.equal(ref.current, null);
  });

  it("membatalkan permintaan yang melewati batas waktu", async () => {
    const ref = { current: null };
    const fakeFetch = (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const err = new Error("dibatalkan");
          err.name = "AbortError";
          reject(err);
        });
      });
    await assert.rejects(
      fetchWithTimeout(fakeFetch, "/x", {}, 10, ref),
      (err) => err.name === "AbortError",
    );
    assert.equal(ref.current, null);
  });

  it("kontroler di ref bisa membatalkan dari luar (tombol Batal)", async () => {
    const ref = { current: null };
    const fakeFetch = (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const err = new Error("dibatalkan");
          err.name = "AbortError";
          reject(err);
        });
      });
    const pending = fetchWithTimeout(fakeFetch, "/x", {}, 5000, ref);
    /* Beri kesempatan fetch mulai, lalu batalkan lewat ref. */
    await new Promise((r) => setTimeout(r, 5));
    assert.notEqual(ref.current, null);
    ref.current.abort();
    await assert.rejects(pending, (err) => err.name === "AbortError");
    assert.equal(ref.current, null);
  });

  it("batas waktu cek tautan 20 detik (dua kali batas server)", () => {
    assert.equal(CHECK_LINK_TIMEOUT_MS, 20000);
  });
});

describe("cancellableDelay (ADM-11)", () => {
  it("selesai sendiri setelah waktunya", async () => {
    const wakeRef = {};
    await cancellableDelay(5, wakeRef);
    assert.equal(wakeRef.current, null);
  });

  it("bangun lebih awal saat dibatalkan", async () => {
    const wakeRef = {};
    const start = Date.now();
    const pending = cancellableDelay(5000, wakeRef);
    assert.equal(typeof wakeRef.current, "function");
    wakeRef.current();
    await pending;
    assert.ok(Date.now() - start < 1000);
    assert.equal(wakeRef.current, null);
  });
});

describe("ringkasan cek massal (ADM-11)", () => {
  it("summarizeBulkResults menghitung bisa dibuka dan gagal", () => {
    assert.deepEqual(summarizeBulkResults([]), { total: 0, ok: 0, failed: 0 });
    assert.deepEqual(summarizeBulkResults(null), { total: 0, ok: 0, failed: 0 });
    assert.deepEqual(
      summarizeBulkResults([
        { no: 1, ok: true },
        { no: 2, ok: false },
        { no: 3 },
        null,
        "aneh",
      ]),
      { total: 5, ok: 1, failed: 4 },
    );
  });

  it("simpan lalu baca mengembalikan ringkasan yang sama", () => {
    const storage = makeStorage();
    const summary = {
      finishedAt: "2026-11-15T07:00:00.000Z",
      changes: 2,
      results: [{ no: 1, perusahaan: "A", ok: true, checkedAt: "2026-11-15T07:00:00.000Z" }],
    };
    assert.equal(saveBulkSummary(storage, summary), true);
    assert.deepEqual(loadBulkSummary(storage), summary);
    assert.ok(storage._dump()[BULK_SUMMARY_KEY].includes("2026-11-15"));
  });

  it("baca mengembalikan null bila tidak ada, rusak, atau bentuknya salah", () => {
    assert.equal(loadBulkSummary(makeStorage()), null);
    assert.equal(
      loadBulkSummary(makeStorage({ [BULK_SUMMARY_KEY]: "{rusak" })),
      null,
    );
    assert.equal(
      loadBulkSummary(
        makeStorage({ [BULK_SUMMARY_KEY]: JSON.stringify({ hasil: [] }) }),
      ),
      null,
    );
    assert.equal(
      loadBulkSummary(
        makeStorage({
          [BULK_SUMMARY_KEY]: JSON.stringify({
            finishedAt: "2026-11-15T07:00:00.000Z",
            results: "bukan array",
          }),
        }),
      ),
      null,
    );
    /* changes yang hilang default 0, bukan gagal baca. */
    assert.deepEqual(
      loadBulkSummary(
        makeStorage({
          [BULK_SUMMARY_KEY]: JSON.stringify({
            finishedAt: "2026-11-15T07:00:00.000Z",
            results: [],
          }),
        }),
      ),
      { finishedAt: "2026-11-15T07:00:00.000Z", changes: 0, results: [] },
    );
  });

  it("hapus menghilangkan ringkasan; penyimpanan yang menolak tidak melempar", () => {
    const storage = makeStorage();
    saveBulkSummary(storage, { finishedAt: "x", changes: 0, results: [] });
    assert.equal(clearBulkSummary(storage), true);
    assert.equal(loadBulkSummary(storage), null);
    assert.equal(saveBulkSummary(throwingStorage(), {}), false);
    assert.equal(loadBulkSummary(throwingStorage()), null);
    assert.equal(clearBulkSummary(throwingStorage()), false);
    assert.equal(saveBulkSummary(null, {}), false);
    assert.equal(loadBulkSummary(null), null);
  });
});

describe("validateCsvRows memakai stub STATUS_ORDER", () => {
  it("menolak status yang tidak dikenal", () => {
    const { valid, rejected } = validateCsvRows([
      CSV_HEADER,
      [
        "1",
        "A",
        "",
        "",
        "Nyeleneh",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    assert.equal(valid.length, 0);
    assert.equal(rejected.length, 1);
    assert.match(rejected[0].reason, /tidak dikenal/);
  });
});

describe("muat perusahaan bertahap (ADM-12)", () => {
  it("ukuran halaman 200 dokumen", () => {
    assert.equal(COMPANIES_PAGE_SIZE, 200);
  });
});

describe("penanda keluar sengaja dan sesi berakhir (AKUN-10)", () => {
  it("kunci dan masa berlaku sesuai rancangan", () => {
    assert.equal(SIGNOUT_INTENDED_KEY, "karir-keluar-sengaja");
    assert.equal(SESSION_ENDED_KEY, "karir-sesi-berakhir");
    assert.equal(SIGNOUT_INTENDED_MAX_AGE_MS, 60 * 1000);
    assert.equal(SESSION_ENDED_MAX_AGE_MS, 60 * 60 * 1000);
  });

  it("tanda keluar segar terbaca sekali, lalu hilang", () => {
    const storage = makeStorage();
    assert.equal(markSignOutIntended(storage, 1000000), true);
    assert.equal(consumeSignOutIntended(storage, 1000000 + 10000), true);
    assert.equal(consumeSignOutIntended(storage, 1000000 + 11000), false);
  });

  it("tanda keluar yang kedaluwarsa atau dari masa depan tidak berlaku", () => {
    const storage = makeStorage();
    markSignOutIntended(storage, 1000000);
    assert.equal(
      consumeSignOutIntended(storage, 1000000 + 61 * 1000),
      false,
    );
    markSignOutIntended(storage, 2000000);
    assert.equal(consumeSignOutIntended(storage, 1999999), false);
  });

  it("tanpa tanda, tidak ada yang terbaca; nilai rusak ditolak", () => {
    const storage = makeStorage();
    assert.equal(consumeSignOutIntended(storage, 1000000), false);
    storage.setItem(SIGNOUT_INTENDED_KEY, "bukan-angka");
    assert.equal(consumeSignOutIntended(storage, 1000000), false);
    assert.equal(markSignOutIntended(null, 1000000), false);
    assert.equal(consumeSignOutIntended(null, 1000000), false);
    assert.equal(markSignOutIntended(throwingStorage(), 1000000), false);
    assert.equal(consumeSignOutIntended(throwingStorage(), 1000000), false);
  });

  it("penanda sesi berakhir berlaku satu jam", () => {
    const storage = makeStorage();
    assert.equal(markSessionEnded(storage, 1000000), true);
    assert.equal(consumeSessionEnded(storage, 1000000 + 30 * 60 * 1000), true);
    markSessionEnded(storage, 1000000);
    assert.equal(
      consumeSessionEnded(storage, 1000000 + 61 * 60 * 1000),
      false,
    );
    assert.equal(consumeSessionEnded(makeStorage(), 1000000), false);
  });
});

describe("passwordStrength (AKUN-12)", () => {
  it("konstanta syarat pendaftaran", () => {
    assert.equal(MIN_PASSWORD_LENGTH_DAFTAR, 8);
    assert.equal(MIN_STRENGTH_DAFTAR, 2);
    assert.equal(REGISTER_MIN_FILL_MS, 3000);
    assert.ok(COMMON_PASSWORDS.includes("12345678"));
    assert.ok(COMMON_PASSWORDS.includes("password123"));
  });

  it("kata sandi kosong dan satu jenis karakter dinilai Lemah", () => {
    assert.deepEqual(passwordStrength(""), {
      score: 0,
      label: "Lemah",
      common: false,
    });
    assert.deepEqual(passwordStrength("abcdefgh"), {
      score: 1,
      label: "Lemah",
      common: false,
    });
    assert.deepEqual(passwordStrength("abc"), {
      score: 0,
      label: "Lemah",
      common: false,
    });
  });

  it("kata sandi umum selalu 0 dan ditandai, tanpa peduli huruf besar", () => {
    assert.deepEqual(passwordStrength("12345678"), {
      score: 0,
      label: "Lemah",
      common: true,
    });
    assert.deepEqual(passwordStrength("Password123"), {
      score: 0,
      label: "Lemah",
      common: true,
    });
    assert.equal(isCommonPassword("  QWERTY123 "), true);
    assert.equal(isCommonPassword("bukan-umum-123"), false);
    assert.equal(isCommonPassword(null), false);
  });

  it("campuran menaikkan skor sampai Kuat", () => {
    assert.deepEqual(passwordStrength("Abcdef12"), {
      score: 3,
      label: "Bagus",
      common: false,
    });
    assert.deepEqual(passwordStrength("Abcdefgh12!@"), {
      score: 5,
      label: "Kuat",
      common: false,
    });
    assert.deepEqual(passwordStrength("Abcdefgh"), {
      score: 2,
      label: "Cukup",
      common: false,
    });
  });

  it("pendaftaran terlalu cepat hanya di bawah 3 detik", () => {
    assert.equal(isRegistrationTooFast(1000000, 1000000 + 2999), true);
    assert.equal(isRegistrationTooFast(1000000, 1000000 + 3000), false);
    assert.equal(isRegistrationTooFast(1000000, 1000000 + 90000), false);
    assert.equal(isRegistrationTooFast(NaN, 1000000), false);
    assert.equal(isRegistrationTooFast(0, NaN), false);
  });
});

describe("wiring statis W2c", () => {
  it("admin/page.js: cek tautan memakai timeout, profil terurut, perusahaan bertahap", () => {
    const src = readSource("./admin/page.js");
    assert.ok(src.includes("fetchWithTimeout("));
    assert.ok(!src.includes('await fetch("/api/admin/check-link"'));
    assert.ok(src.includes('orderBy("updatedAt", "desc")'));
    assert.ok(src.includes("startAfter(lastDoc)"));
    assert.ok(src.includes("COMPANIES_PAGE_SIZE"));
    assert.ok(src.includes("Pemeriksaan melewati batas waktu"));
  });

  it("admin/page.js: lupa kata sandi, batal massal, pulih ringkasan, tanda keluar", () => {
    const src = readSource("./admin/page.js");
    assert.ok(src.includes("sendPasswordReset"));
    assert.ok(src.includes("handleForgotPassword"));
    assert.ok(src.includes("cancelBulkCheck"));
    assert.ok(src.includes("bulkCancelRef"));
    assert.ok(src.includes("saveBulkSummary"));
    assert.ok(src.includes("loadBulkSummary"));
    assert.ok(src.includes("markSignOutIntended"));
    assert.ok(src.includes("handleSignOut"));
  });

  it("admin-gates.js: tombol lupa kata sandi + tampilkan kata sandi + info reset", () => {
    const src = readSource("./admin/admin-gates.js");
    assert.ok(src.includes("Lupa kata sandi?"));
    assert.ok(src.includes("Tampilkan kata sandi"));
    assert.ok(src.includes("resetInfo"));
    assert.ok(src.includes("onForgotPassword"));
  });

  it("admin-bulk-check.js: tombol Batal + hapus riwayat + catatan pulihan", () => {
    const src = readSource("./admin/admin-bulk-check.js");
    assert.ok(src.includes("Batalkan"));
    assert.ok(src.includes("onCancel"));
    assert.ok(src.includes("Hapus riwayat"));
    assert.ok(src.includes("bulkRestoredAt"));
    assert.ok(src.includes("Dibatalkan:"));
  });

  it("admin-companies.js: baris bisa dipakai keyboard, tanpa hex mentah", () => {
    const src = readSource("./admin/admin-companies.js");
    assert.ok(src.includes("tabIndex={0}"));
    assert.ok(src.includes("onKeyDown"));
    assert.ok(src.includes('e.key === "Enter"'));
    assert.ok(src.includes('e.key === " "'));
    assert.ok(src.includes("var(--sunken)"));
    assert.ok(!src.includes("#f4f4f5"));
    assert.ok(src.includes("loadedCount"));
  });

  it("admin-quality.js: tombol aktif memakai token, tanpa hex mentah", () => {
    const src = readSource("./admin/admin-quality.js");
    assert.ok(src.includes("var(--ink)"));
    assert.ok(src.includes("var(--paper)"));
    assert.ok(!src.includes("#0a0a0a"));
    assert.ok(!src.includes("#fff"));
  });

  it("admin-visitors.js: menampilkan agregasi panduan awal", () => {
    const src = readSource("./admin/admin-visitors.js");
    assert.ok(src.includes("Panduan awal"));
    assert.ok(src.includes("visitorSummary.onboarding.selesai"));
    assert.ok(src.includes("visitorSummary.onboarding.dilewati"));
  });

  it("tracker.js: sesi yang mati sendiri diberitahukan lewat toast", () => {
    const src = readSource("./tracker.js");
    assert.ok(src.includes("consumeSignOutIntended()"));
    assert.ok(src.includes("markSessionEnded()"));
    assert.ok(src.includes("Sesi akun berakhir."));
  });

  it("auth-panel.js: status muat, pengukur kekuatan, honeypot, pesan sesi", () => {
    const src = readSource("./auth-panel.js");
    assert.ok(src.includes("useAuthStatus"));
    assert.ok(src.includes("Memuat status akun"));
    assert.ok(src.includes("Kekuatan kata sandi:"));
    assert.ok(src.includes('name="website"'));
    assert.ok(src.includes("consumeSessionEnded()"));
    assert.ok(src.includes("Sesi akun berakhir."));
    assert.ok(src.includes("MIN_PASSWORD_LENGTH_DAFTAR"));
  });

  it("site-nav.js: placeholder netral selama status masuk dimuat", () => {
    const src = readSource("./site-nav.js");
    assert.ok(src.includes("useAuthStatus"));
    assert.ok(src.includes("authLoading"));
    assert.ok(src.includes('? "Akun"'));
  });

  it("globals.css: .set-row membungkus dan kolom teks boleh menyusut", () => {
    const src = readSource("./globals.css");
    const start = src.indexOf(".set-row {");
    assert.notEqual(start, -1);
    const block = src.slice(start, src.indexOf(".set-row .label", start));
    assert.ok(block.includes("flex-wrap: wrap"));
    assert.ok(block.includes("min-width: 0"));
    assert.ok(block.includes("overflow-wrap: anywhere"));
  });

  it("pengiriman event onboarding tetap hanya dari /mulai (tanpa ganda)", () => {
    const mulai = readSource("./mulai/page.js");
    assert.ok(mulai.includes('type: "onboarding"'));
    assert.ok(mulai.includes('action: "selesai"'));
    const onboarding = readSource("./onboarding.js");
    assert.ok(!onboarding.includes("trackEvent"));
  });
});
