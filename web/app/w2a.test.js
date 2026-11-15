/* Tes unit Gelombang 2 batch W2a-COPY (copy & i18n, Fase 5),
 * memakai test runner bawaan Node. Dijalankan dengan: npm test
 *
 * Tiga jenis tes:
 * (a) Perilaku murni yang bisa diimpor langsung: parameter pesan
 *     di lib/account-data.js dan token OG di lib/og-theme.js.
 * (b) Paritas blok i18n W2a: kunci ID/EN diekstrak dari sumber
 *     lib/i18n.js (modul itu memakai next/headers sehingga tidak
 *     bisa diimpor node:test) — kunci harus sama, tanpa duplikat,
 *     dan placeholder {..} harus konsisten per kunci.
 * (c) Tes wiring statis — MEMBACA berkas sumber langsung, pola yang
 *     sama dengan app/w1-b1.test.js: komponen memakai JSX sehingga
 *     tidak bisa diimpor node:test, tetapi wiring label, aturan
 *     laporan, dan penulisan ulang konten dijaga agar tidak kembali
 *     rusak diam-diam. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  authErrorMessage,
  passwordResetOutcome,
} from "../lib/account-data.js";
import { OG_COLORS, OG_FONT } from "../lib/og-theme.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");

function baca(relatif) {
  return readFileSync(join(WEB, relatif), "utf8");
}

/* Ekstrak blok W2a dari satu sisi i18n.js: kembalikan Map
 * kunci -> teks nilai mentah (termasuk baris lanjutan). Kunci
 * dikenali dari indentasi 4 spasi di awal baris; baris lanjutan
 * nilai memakai indentasi 6 spasi. */
function ekstrakBlokW2a(sumber, akhir) {
  const selesai = sumber.indexOf(akhir);
  assert.notEqual(selesai, -1, `pembatas ${akhir} tidak ditemukan`);
  /* Pembatas awal terdekat SEBELUM penanda akhir — ada dua blok
   * W2a (ID lalu EN) di berkas yang sama. */
  const mulai = sumber.lastIndexOf("/* --- W2a ", selesai);
  assert.notEqual(mulai, -1, "pembatas awal blok W2a tidak ditemukan");
  const blok = sumber.slice(mulai, selesai);
  const polaKunci = /^    "([^"]+)":/gm;
  const posisi = [...blok.matchAll(polaKunci)];
  assert.ok(posisi.length > 0, "blok W2a tidak berisi kunci");
  const entri = new Map();
  const duplikat = [];
  posisi.forEach((m, i) => {
    const kunci = m[1];
    if (entri.has(kunci)) duplikat.push(kunci);
    const awalNilai = m.index + m[0].length;
    const akhirNilai =
      i + 1 < posisi.length ? posisi[i + 1].index : blok.length;
    entri.set(kunci, blok.slice(awalNilai, akhirNilai));
  });
  return { entri, duplikat };
}

function placeholder(teks) {
  return [...teks.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)]
    .map((m) => m[1])
    .sort();
}

describe("blok i18n W2a (ID vs EN)", () => {
  const sumber = baca("lib/i18n.js");
  const id = ekstrakBlokW2a(sumber, "/* --- akhir W2a --- */");
  const en = ekstrakBlokW2a(sumber, "/* --- end W2a --- */");

  it("ada tepat satu blok W2a per sisi", () => {
    assert.equal(sumber.split("/* --- W2a ").length - 1, 2);
  });

  it("kunci ID dan EN sama persis, tanpa duplikat", () => {
    assert.deepEqual(id.duplikat, []);
    assert.deepEqual(en.duplikat, []);
    const kunciId = [...id.entri.keys()].sort();
    const kunciEn = [...en.entri.keys()].sort();
    assert.deepEqual(kunciId, kunciEn);
    assert.ok(kunciId.length > 200, `hanya ${kunciId.length} kunci`);
  });

  it("placeholder {..} konsisten per kunci di kedua sisi", () => {
    for (const [kunci, nilaiId] of id.entri) {
      assert.deepEqual(
        placeholder(nilaiId),
        placeholder(en.entri.get(kunci)),
        `placeholder tidak sama untuk ${kunci}`,
      );
    }
  });

  it("semua nilai tidak kosong", () => {
    for (const [kunci, nilai] of [...id.entri, ...en.entri]) {
      assert.ok(
        nilai.replace(/["',+\s]/g, "").length > 0,
        `nilai kosong untuk ${kunci}`,
      );
    }
  });
});

describe("perubahan nilai kunci lama (dicatat di w2-a.md)", () => {
  const sumber = baca("lib/i18n.js");

  it("UX-10: faq3a dan pesan umpan perubahan memakai 'Daftar perubahan'", () => {
    /* Nilai-nilai ini ditulis multi-baris di i18n.js (kunci di satu
     * baris, nilai di baris berikut), jadi yang dicek adalah nilai. */
    assert.ok(
      sumber.includes(
        '"Kanal karir resmi tiap perusahaan dibuka langsung di browser, dan tanggal cek terakhirnya dicatat, supaya kamu tahu seberapa baru datanya."',
      ),
    );
    assert.ok(
      sumber.includes(
        '"Daftar perubahan sedang tidak bisa dimuat. Coba lagi nanti."',
      ),
    );
    assert.ok(
      sumber.includes(
        '"home.changesError": "Daftar perubahan belum bisa dimuat."',
      ),
    );
    assert.ok(
      sumber.includes(
        '"home.changesError": "The list of changes could not be loaded."',
      ),
    );
    assert.ok(
      sumber.includes(
        '"The list of changes is temporarily unavailable. Please try again later."',
      ),
    );
  });

  it("UX-12: label pencarian disingkat 'Posisi/perusahaan'", () => {
    assert.ok(
      sumber.includes('"home.posisiPerusahaan": "Posisi/perusahaan"'),
    );
    assert.ok(
      sumber.includes('"home.posisiPerusahaan": "Role/company"'),
    );
  });

  it("DUKUNG-06/07: laporan memakai 'Kirim laporan' dan janji tindak lanjut", () => {
    assert.ok(sumber.includes('"detail.report": "Kirim laporan"'));
    assert.ok(
      sumber.includes(
        '"detail.reportHint": "Ada yang salah? Laporkan masalah"',
      ),
    );
    assert.ok(
      sumber.includes(
        "Laporanmu akan diperiksa dan diperbaiki bila benar — tidak ada balasan langsung.",
      ),
    );
    assert.ok(
      sumber.includes(
        "Your report will be reviewed and fixed if correct — there is no direct reply.",
      ),
    );
  });
});

describe("lib/account-data.js: parameter pesan (UX-08)", () => {
  const pesan = {
    invalidEmail: "CUSTOM invalid email",
    wrongCredentials: "CUSTOM wrong credentials",
    cannotRegister: "CUSTOM cannot register",
    weakPassword: "CUSTOM weak password",
    tooManyRequests: "CUSTOM too many",
    noConnection: "CUSTOM no connection",
    cannotSignIn: "CUSTOM cannot sign in",
    resetSent: "CUSTOM reset sent",
    cannotSendReset: "CUSTOM cannot send reset",
    noAccount: "CUSTOM no account",
    verifySent: "CUSTOM verify sent",
  };

  it("tanpa pesan, bawaan Indonesia dipakai (perilaku lama)", () => {
    assert.equal(
      authErrorMessage("auth/invalid-email"),
      "Alamat email tidak dikenal. Periksa lagi tulisannya.",
    );
    assert.equal(
      authErrorMessage("auth/wrong-password"),
      "Email atau kata sandi salah.",
    );
    assert.equal(
      passwordResetOutcome(null).message,
      "Tautan untuk membuat kata sandi baru sudah dikirim ke email itu. " +
        "Periksa kotak masuk, lalu ikuti tautannya.",
    );
  });

  it("dengan pesan, pesan itu yang dipakai", () => {
    assert.equal(
      authErrorMessage("auth/invalid-email", pesan),
      "CUSTOM invalid email",
    );
    assert.equal(
      authErrorMessage("auth/email-already-in-use", pesan),
      "CUSTOM cannot register",
    );
    assert.equal(
      authErrorMessage("auth/unknown-code", pesan),
      "CUSTOM cannot sign in",
    );
    assert.equal(passwordResetOutcome(null, pesan).message, "CUSTOM reset sent");
    assert.equal(
      passwordResetOutcome("auth/invalid-email", pesan).message,
      "CUSTOM invalid email",
    );
    assert.equal(
      passwordResetOutcome("auth/internal-error", pesan).message,
      "CUSTOM cannot send reset",
    );
  });

  it("pesan sebagian: kunci yang hilang memakai bawaan", () => {
    assert.equal(
      authErrorMessage("auth/invalid-email", { wrongCredentials: "X" }),
      "Alamat email tidak dikenal. Periksa lagi tulisannya.",
    );
    assert.equal(
      authErrorMessage("auth/wrong-password", { wrongCredentials: "X" }),
      "X",
    );
  });
});

describe("lib/og-theme.js dan gambar OG (UX-13)", () => {
  it("token OG meniru token tema terang di globals.css", () => {
    const css = baca("app/globals.css");
    const root = css.slice(0, css.indexOf("[data-theme="));
    assert.ok(root.includes(`--surface: ${OG_COLORS.background};`));
    assert.ok(root.includes(`--ink: ${OG_COLORS.ink};`));
    assert.ok(root.includes(`--muted: ${OG_COLORS.muted};`));
    assert.equal(OG_FONT, "system-ui, sans-serif");
  });

  it("kedua berkas OG memakai token, bukan warna kode-keras", () => {
    for (const f of [
      "app/opengraph-image.js",
      "app/perusahaan/[no]/opengraph-image.js",
    ]) {
      const src = baca(f);
      assert.ok(src.includes('from "@/lib/og-theme"'), f);
      assert.ok(src.includes("OG_COLORS.background"), f);
      assert.ok(src.includes("OG_COLORS.ink"), f);
      assert.ok(src.includes("OG_COLORS.muted"), f);
      assert.ok(src.includes("fontFamily: OG_FONT"), f);
      assert.ok(!src.includes("#ffffff"), f);
      assert.ok(!src.includes("#0a0a0a"), f);
      assert.ok(!src.includes("#52525b"), f);
    }
  });
});

describe("firestore.rules: laporan masalah (DUKUNG-06/08)", () => {
  const rules = baca("firestore.rules");
  const blok = rules.slice(
    rules.indexOf("match /reports/{doc}"),
    rules.indexOf("match /changes/{doc}"),
  );

  it("create mensyaratkan kolom jenis dengan tiga nilai sah", () => {
    assert.ok(blok.includes("'no', 'perusahaan', 'jenis', 'alasan', 'dibuat'"));
    assert.ok(blok.includes("request.resource.data.jenis in ["));
    assert.ok(blok.includes("'tautan_mati', 'data_salah', 'lainnya'"));
  });

  it("create memvalidasi perusahaan dan dibuat", () => {
    assert.ok(blok.includes("request.resource.data.perusahaan is string"));
    assert.ok(
      blok.includes("request.resource.data.perusahaan.size() <= 200"),
    );
    assert.ok(blok.includes("request.resource.data.dibuat is string"));
    assert.ok(blok.includes("request.resource.data.dibuat.matches("));
    /* Berkas rules memakai backslash ganda di literal string regex. */
    assert.ok(blok.includes("^\\\\d{4}-\\\\d{2}-\\\\d{2}T"));
  });

  it("komentar blok menyebut 'Laporan masalah', bukan 'tautan mati'", () => {
    assert.ok(rules.includes("// Laporan masalah dari pengunjung"));
  });

  it("aturan update/delete tidak berubah", () => {
    assert.ok(blok.includes("allow update: if isAdmin()"));
    assert.ok(blok.includes(".hasOnly(['status', 'ditanganiPada'])"));
    assert.ok(blok.includes("allow delete: if false;"));
  });
});

describe("wiring label (UX-08/ONB-07/DASH-03)", () => {
  it("labels-provider menyediakan konteks gabung + hook", () => {
    const src = baca("app/labels-provider.js");
    assert.ok(src.includes("export function LabelsProvider"));
    assert.ok(src.includes("export function useLabels"));
    assert.ok(src.includes("export function useLocale"));
    assert.ok(src.includes("labels: { ...parent.labels, ...labels }"));
  });

  it("layout akar membungkus <main> dengan provider label bersama", () => {
    const src = baca("app/layout.js");
    assert.ok(src.includes("<LabelsProvider locale={locale} labels={sharedLabels}>"));
    assert.ok(src.includes('errorTitle: t(locale, "error.title")'));
    assert.ok(src.includes('trackerView: t(locale, "tracker.view")'));
    assert.ok(src.includes("auth: {"));
  });

  it("layout rute lamaran/mulai/pengaturan meneruskan label lewat konteks", () => {
    for (const f of [
      "app/lamaran/layout.js",
      "app/mulai/layout.js",
      "app/pengaturan/layout.js",
    ]) {
      const src = baca(f);
      assert.ok(src.includes("LabelsProvider"), f);
      assert.ok(src.includes("getLocale()"), f);
      assert.ok(src.includes("t(locale,"), f);
    }
  });

  it("halaman klien membaca label dari konteks, tanpa lang=id", () => {
    for (const f of [
      "app/lamaran/page.js",
      "app/mulai/page.js",
      "app/pengaturan/page.js",
    ]) {
      const src = baca(f);
      assert.ok(src.includes("useLabels(DEFAULT_LABELS)"), f);
      assert.ok(!src.includes('lang="id"'), f);
      assert.ok(!src.includes("AKSES-12"), f);
    }
    assert.ok(baca("app/lamaran/page.js").includes("useLocale()"));
  });

  it("tracker.js: pesan sinkron dan toast memakai label", () => {
    const src = baca("app/tracker.js");
    assert.ok(
      src.includes("export function syncStatusMessage(state, error, messages)"),
    );
    assert.ok(src.includes("useLabels(TRACKER_TOAST_DEFAULTS)"));
    assert.ok(
      src.includes("export function TrackerControl({ company, labels: labelsProp })"),
    );
    assert.ok(src.includes("syncStatusMessage(syncState, syncError, labels.sync)"));
    assert.ok(!src.includes('lang="id"'));
  });

  it("visual.js: Sheet dan ConfirmDialog menerima label tutup", () => {
    const src = baca("app/visual.js");
    assert.ok(src.includes('closeLabel = "Tutup"'));
    assert.ok(src.includes("aria-label={closeLabel}"));
    assert.ok(src.includes("closeLabel={closeLabel}"));
  });

  it("auth-panel: label lewat props, tanpa gaya sebaris gelap", () => {
    const src = baca("app/auth-panel.js");
    assert.ok(src.includes("AuthPanel({ labels: labelsProp })"));
    assert.ok(src.includes("authErrorMessage(err && err.code, labels)"));
    assert.ok(src.includes("sendPasswordReset(address, labels)"));
    assert.ok(src.includes("sendVerificationEmail(user, labels)"));
    assert.ok(!src.includes("#0a0a0a"));
    assert.ok(src.includes('className={mode === "masuk" ? "btn small" : "btn ghost small"}'));
    assert.ok(!src.includes('lang="id"'));
  });

  it("site-nav meneruskan label ke AuthPanel dan Sheet", () => {
    const src = baca("app/site-nav.js");
    assert.ok(src.includes("<AuthPanel labels={labels.auth} />"));
    assert.ok(src.includes("closeLabel={labels.close}"));
  });

  it("search-app meneruskan label tutup ke Sheet filter", () => {
    assert.ok(
      baca("app/cari/search-app.js").includes("closeLabel={labels.close}"),
    );
  });

  it("kartu dan filter memakai label chip", () => {
    assert.ok(
      baca("app/company-card.js").includes('{labels.new || "Baru"}'),
    );
    assert.ok(
      baca("app/company-card.js").includes("labels.matchPosition || r"),
    );
    assert.ok(
      baca("app/company-card.js").includes("labels.matchLocation || r"),
    );
    assert.ok(
      baca("app/target-filter.js").includes(
        '{g === "Semua" ? labels.all || "Semua" : g}',
      ),
    );
    assert.ok(
      baca("app/changes-feed.js").includes('{labels.new || "Baru"}'),
    );
  });

  it("halaman server meneruskan label chip ke komponen klien", () => {
    const beranda = baca("app/page.js");
    assert.ok(beranda.includes('new: t(locale, "common.new")'));
    assert.ok(
      beranda.includes('matchPosition: t(locale, "search.matchPosition")'),
    );
    assert.ok(beranda.includes('all: t(locale, "common.all")'));
    const cari = baca("app/cari/page.js");
    assert.ok(cari.includes('new: t(locale, "common.new")'));
    assert.ok(cari.includes('close: t(locale, "common.close")'));
  });

  it("dasbor: label Dasbor saya lewat props; judul lipatan dari status", () => {
    const src = baca("app/dasbor/page.js");
    assert.ok(src.includes("<DashboardPersonal"));
    assert.ok(src.includes('title: t(locale, "dashMine.title")'));
    assert.ok(src.includes('choiceBoth: t(locale, "dashMine.choiceBoth")'));
    assert.ok(src.includes("function RecheckList({ status, list, locale })"));
    assert.ok(!src.includes("title="));
  });

  it("peta meneruskan label ke MapClient", () => {
    const src = baca("app/peta/page.js");
    assert.ok(src.includes('chooseCity: t(locale, "map.chooseCity")'));
    assert.ok(src.includes('marker: t(locale, "map.marker")'));
  });

  it("dashboard-personal dan map-client memakai label props", () => {
    const dash = baca("app/dashboard-personal.js");
    assert.ok(dash.includes("DashboardPersonal({ labels: labelsProp })"));
    assert.ok(dash.includes("labels.choiceBoth"));
    assert.ok(dash.includes("labels.sync.saved"));
    assert.ok(!dash.includes('lang="id"'));
    const map = baca("app/map-client.js");
    assert.ok(map.includes("MapClient({ groups, other, labels: labelsProp })"));
    assert.ok(map.includes("labels.marker"));
    assert.ok(!map.includes('lang="id"'));
  });

  it("install-prompt memakai label props", () => {
    const src = baca("app/install-prompt.js");
    assert.ok(src.includes("InstallPrompt({ labels: labelsProp })"));
    assert.ok(src.includes("labels.installing"));
    assert.ok(
      baca("app/pengaturan/page.js").includes(
        "<InstallPrompt labels={labels.install} />",
      ),
    );
  });
});

describe("halaman detail (DET-10/DUKUNG-06/07)", () => {
  it("kategori berlabel dan penjelasan status berjudul", () => {
    const src = baca("app/perusahaan/[no]/page.js");
    assert.ok(src.includes('{t(locale, "detail.category")}: {company.kategori}'));
    assert.ok(
      src.includes(
        '<h2 className="section-label">{t(locale, "detail.explain")}</h2>',
      ),
    );
    assert.ok(src.includes('t(locale, "detail.noCheckDate")'));
  });

  it("DetailActions menerima label laporan lengkap", () => {
    const src = baca("app/perusahaan/[no]/page.js");
    for (const k of [
      "reportFailed",
      "reportTooSoon",
      "reportSessionLimit",
      "reportTypeLabel",
      "reportReasonLabel",
      "reportTypeDead",
      "reportTypeWrong",
      "reportTypeOther",
      "reportPhDead",
      "reportPhWrong",
      "reportPhOther",
      "shareFailed",
    ]) {
      assert.ok(src.includes(`${k}: t(locale,`), k);
    }
  });

  it("TrackerControl menerima label lewat props", () => {
    const src = baca("app/perusahaan/[no]/page.js");
    assert.ok(src.includes("<TrackerControl"));
    assert.ok(src.includes('title: t(locale, "tracker.title")'));
    assert.ok(src.includes("sync: {"));
  });

  it("actions.js: jenis laporan, placeholder per jenis, nonaktif setelah kirim", () => {
    const src = baca("app/perusahaan/[no]/actions.js");
    assert.ok(src.includes('useState("tautan_mati")'));
    assert.ok(src.includes('["tautan_mati", labels.reportTypeDead]'));
    assert.ok(src.includes('["data_salah", labels.reportTypeWrong]'));
    assert.ok(src.includes('["lainnya", labels.reportTypeOther]'));
    assert.ok(src.includes("jenis,"));
    assert.ok(src.includes("action: jenis,"));
    assert.ok(src.includes("labels.reportPhDead"));
    assert.ok(src.includes("labels.reportPhWrong"));
    assert.ok(src.includes("labels.reportPhOther"));
    assert.ok(src.includes("<fieldset disabled={sent}>"));
    assert.ok(src.includes("disabled={sending || sent}"));
    assert.ok(src.includes("{labels.reportFailed}"));
    assert.ok(src.includes("showToast(labels.shareFailed)"));
    assert.ok(
      src.includes(
        "labels.reportTooSoon.replace(\"{n}\", String(check.waitSeconds))",
      ),
    );
    assert.ok(src.includes("labels.reportSessionLimit"));
  });

  it("blok logika murni throttle tidak berubah isinya", () => {
    const src = baca("app/perusahaan/[no]/actions.js");
    assert.ok(src.includes("export const REPORT_MIN_INTERVAL_MS = 60_000;"));
    assert.ok(src.includes("export const REPORT_MAX_PER_SESSION = 5;"));
    assert.ok(
      src.includes("export function checkReportThrottle(timestamps, now = Date.now())"),
    );
  });
});

describe("halaman galat dan tidak ditemukan (KONTEN-08/UX-17)", () => {
  it("error.js memakai judul umum dan label konteks", () => {
    const src = baca("app/error.js");
    assert.ok(src.includes("useLabels(ERROR_DEFAULTS)"));
    assert.ok(src.includes('className="page-head"'));
    assert.ok(src.includes("{labels.errorTitle}"));
    assert.ok(src.includes("{labels.errorMessage}"));
    assert.ok(src.includes("{labels.retry}"));
    assert.ok(!src.includes("Data tidak bisa dimuat"));
  });

  it("not-found.js memakai kunci notfound.*", () => {
    const src = baca("app/not-found.js");
    assert.ok(src.includes('t(locale, "notfound.title")'));
    assert.ok(src.includes('t(locale, "notfound.lede")'));
  });
});

describe("halaman info (KONTEN-05/06, UX-09/10/17/18, INFO-08/09/11/13/17)", () => {
  it("keempat halaman info menandai ID-only saat locale=en", () => {
    for (const f of [
      "app/metode/page.js",
      "app/faq/page.js",
      "app/tentang/page.js",
      "app/changelog/page.js",
    ]) {
      const src = baca(f);
      assert.ok(src.includes('locale === "en"'), f);
      assert.ok(src.includes('t(locale, "info.idOnly")'), f);
    }
  });

  it("metode: kalimat penyangkalan, skor tanpa angka, pengecekan ulang, kanal lain", () => {
    const src = baca("app/metode/page.js");
    /* Kalimat KONTEN-05 terbungkus baris JSX, jadi dicek per fragmen
     * yang masing-masing satu baris. */
    assert.ok(
      src.includes(
        "bilang tidak ada lowongan tidak dihitung sebagai kecocokan,",
      ),
    );
    assert.ok(src.includes("walaupun menyebut nama posisinya."));
    assert.ok(!src.includes("Kalimat penyangkalan"));
    assert.ok(!src.includes("+50"));
    assert.ok(!src.includes("+30"));
    assert.ok(!src.includes("-20"));
    assert.ok(src.includes("Posisi cocok dengan data — yang paling menentukan."));
    assert.ok(src.includes("Pengecekan ulang"));
    assert.ok(src.includes("setiap hari pukul 01.00 WIB"));
    assert.ok(src.includes("Yang berubah"));
    assert.ok(src.includes("sebagai Cara lain melamar"));
    assert.ok(!src.includes('style={{ textAlign: "left", flex: 1 }}'));
  });

  it("globals.css: stat-stack memakai kolom minimum 280px", () => {
    assert.ok(
      baca("app/globals.css").includes(
        "grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));",
      ),
    );
  });

  it("faq: pertanyaan baru email/WA, laporan diganti nama, kontribusi berlink", () => {
    const src = baca("app/faq/page.js");
    assert.ok(src.includes("Apakah bisa melamar lewat email atau WhatsApp?"));
    assert.ok(src.includes("Bagaimana melaporkan masalah?"));
    assert.ok(!src.includes("Bagaimana melaporkan tautan mati?"));
    assert.ok(
      src.includes(
        "Tiap perusahaan dicatat tanggal cek terakhirnya, supaya kamu tahu seberapa baru datanya.",
      ),
    );
    assert.ok(!src.includes("lewat issue dan pull request"));
    assert.ok(src.includes("lewat formulir Koreksi data"));
    assert.ok(
      src.includes(
        "https://github.com/adiprmx/karir/issues/new?template=koreksi.md",
      ),
    );
    assert.ok(src.includes('text: "Buka formulir Koreksi data"'));
  });

  it("faq-search: field dibungkus .field dan tautan item dirender", () => {
    const src = baca("app/faq/faq-search.js");
    assert.ok(src.includes('<div className="field">'));
    assert.ok(src.includes("{item.link && ("));
    assert.ok(src.includes("{item.link.text}"));
  });

  it("tentang: judul tidak mengulang label, formulir koreksi, lisensi CC BY 4.0", () => {
    const src = baca("app/tentang/page.js");
    assert.ok(src.includes("<h2>Cara memakai Karir</h2>"));
    assert.ok(!src.includes("<h2>Karir itu apa</h2>"));
    assert.ok(src.includes("formulir Koreksi data"));
    assert.ok(
      src.includes(
        "https://github.com/adiprmx/karir/issues/new?template=koreksi.md",
      ),
    );
    assert.ok(src.includes("Lisensi data"));
    assert.ok(src.includes("CC BY 4.0"));
    assert.ok(
      src.includes("https://creativecommons.org/licenses/by/4.0/deed.id"),
    );
  });

  it("changelog: jargon lama hilang, kalimat baru hadir", () => {
    const src = baca("app/changelog/page.js");
    for (const lama of [
      "cron harian",
      "galat 500",
      "trust strip",
      "Tiga foto asli",
      "umpan",
      "Onboarding di /mulai",
      "PRODUCT.md",
      "full stack",
      "Repo dirombak",
      "Kolom baru",
      "Chip Baru",
      "x-real-ip",
      "lede Beranda",
      "Cap Terakhir",
      "lowongan copas",
      "Dasbor bilang",
      "cek massal",
      "Admin panel",
      "Aturan Firestore",
      "supabase",
      "Supabase",
    ]) {
      assert.ok(!src.includes(lama), `masih ada: ${lama}`);
    }
    for (const baru of [
      "Tiga foto di Beranda",
      "Batas akses kini berlaku sama di semua server",
      "Pengecekan ulang otomatis",
      "Bagian Yang berubah kini menjelaskan",
      "Tanda Baru menandai",
      "Aplikasi web dibangun ulang dari nol.",
      "Data 406 perusahaan kini tersimpan di basis data",
      "Panel admin baru untuk menambah, mengubah, dan menghapus perusahaan",
      "Karir dirombak dari daftar gudang Bogor",
      "Setiap perusahaan kini mencatat lokasi dan posisi.",
      "Beranda menambah bagian Masalah dan hasil",
      "Halaman Mulai baru",
    ]) {
      assert.ok(src.includes(baru), `tidak ada: ${baru}`);
    }
  });
});

describe("halaman dukungan (DUKUNG-06)", () => {
  it("bagian laporan memakai 'Laporkan masalah' dan menyebut jenis", () => {
    const src = baca("app/dukungan/page.js");
    assert.ok(src.includes('{ id: "Laporkan masalah", en: "Report a problem" }'));
    assert.ok(src.includes("Pilih jenis masalahnya"));
    assert.ok(src.includes("jenis masalah, alasan yang kamu tulis"));
    assert.ok(src.includes("the type of problem, the reason you wrote"));
    assert.ok(src.includes("Bila masalahnya diperbaiki"));
  });
});
