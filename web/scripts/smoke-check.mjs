/* Tes asap Karir: memeriksa aplikasi yang sudah di-build dan sedang berjalan.
 * Node murni, tanpa dependensi baru. Jalankan dari web/:
 *   BASE_URL=http://localhost:3000 node scripts/smoke-check.mjs
 * BASE_URL bawaan: http://localhost:3000.
 *
 * Lima cek: Beranda 200 + judul utama, /api/stats 200 + total sesuai
 * seed, /api/companies?q=Novell 200 + Novell di hasil, /api/index 200
 * dengan token dari /api/token, /changelog 200 + versi kini.
 * Jumlah perusahaan yang diharapkan dibaca dari seed repo
 * (web/data/companies.json), bukan angka yang dikode keras — data
 * bertambah lewat hunting harian, dan smoke test harus ikut.
 * Versi yang diharapkan dibaca dari web/package.json, bukan jangkar
 * yang dikode keras — jangkar kode-keras membusuk (pernah tertinggal
 * di 2.8.0 padahal versi sudah 2.15.0). Bila versi naik, entri
 * changelog untuk versi itu wajib ditambahkan di perubahan yang sama,
 * kalau tidak cek ini gagal — itu sengaja, supaya halaman changelog
 * tidak pernah tertinggal dari versi yang dirilis.
 * /api/index ber-token: smoke test mengambil token dulu dari
 * /api/token, lalu memanggil /api/index dengan header Authorization
 * Bearer. Semua fetch memakai User-Agent browser biasa dan Referer
 * asal situs sendiri, supaya lolos gerbang token + UA.
 * Kelima cek WAJIB berjalan di semua lingkungan, termasuk CI.
 * Arsitektur seed-first membuat rute data tidak lagi menjawab 503
 * saat Firestore tak terjangkau (mis. CI memakai kunci dummy):
 * rute-rute itu jatuh ke seed dan menjawab 200 dengan data seed,
 * jadi cek data benar-benar menguji jalur data di CI, bukan dilewati.
 * 503 kini hanya terjadi bila seed ikut tidak bisa dimuat — itu
 * kerusakan repo, jadi 503 adalah GAGAL, bukan dilewati. Tidak ada
 * lagi logika SKIP di skrip ini.
 * Keluar 1 bila ada yang gagal, 0 bila semua lolos. Keluar 2 bila
 * seed atau package.json tidak bisa dibaca (kerusakan repo, bukan
 * kegagalan cek). */

import { readFileSync } from "node:fs";

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);

const TIMEOUT_MS = 10_000;
const results = [];

/* Jumlah perusahaan yang diharapkan: panjang seed repo, dibaca sekali
 * di awal. Kalau seed tidak bisa dibaca, skrip berhenti dengan kode 2 —
 * itu kerusakan repo, bukan kegagalan cek. */
const SEED_PATH = new URL("../data/companies.json", import.meta.url);
let EXPECTED_TOTAL;
try {
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  if (!Array.isArray(seed) || seed.length === 0) {
    throw new Error("seed bukan larik berisi data");
  }
  EXPECTED_TOTAL = seed.length;
} catch (err) {
  console.error(`Seed tidak bisa dibaca: ${err.message}`);
  process.exit(2);
}

/* Versi yang diharapkan: field version di package.json, dibaca sekali
 * di awal. Sama seperti seed, kegagalan baca adalah kerusakan repo
 * (kode 2), bukan kegagalan cek. */
const PACKAGE_PATH = new URL("../package.json", import.meta.url);
let EXPECTED_VERSION;
try {
  const pkg = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
  if (
    typeof pkg.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(pkg.version)
  ) {
    throw new Error("package.json tidak membawa version semver");
  }
  EXPECTED_VERSION = pkg.version;
} catch (err) {
  console.error(`package.json tidak bisa dibaca: ${err.message}`);
  process.exit(2);
}

/* UA browser biasa: fetch Node bawaan mengirim UA "node", yang gerbang
 * API tidak kenali sebagai browser, jadi smoke test memakai UA ini. */
const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

async function fetchText(path, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: `${BASE_URL}/`,
        ...extraHeaders,
      },
      signal: controller.signal,
    });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchToken() {
  try {
    const res = await fetchText("/api/token");
    if (res.status !== 200) return null;
    const data = JSON.parse(res.text);
    return typeof data.token === "string" ? data.token : null;
  } catch {
    return null;
  }
}

function record(name, outcome, detail) {
  results.push({ name, outcome, detail });
  console.log(`${outcome} ${name} (${detail})`);
}

function fail(name, detail) {
  record(name, "FAIL", detail);
}

function pass(name, detail) {
  record(name, "PASS", detail);
}

/* Detail kegagalan status: 503 mendapat penjelasan karena artinya
 * khusus — seed-first berarti 503 hanya terjadi bila seed ikut tidak
 * bisa dimuat, bukan karena Firestore mati. */
function statusDetail(status) {
  return status === 503
    ? "503, data tidak bisa dimuat (seed ikut gagal)"
    : `status ${status}`;
}

async function checkHome() {
  const name = "GET /";
  let res;
  try {
    res = await fetchText("/");
  } catch (err) {
    fail(name, err.name === "AbortError" ? "timeout 10 dtk" : String(err));
    return;
  }
  if (res.status !== 200) {
    fail(name, statusDetail(res.status));
    return;
  }
  if (!res.text.includes("Lowongan yang dicek, bukan yang dicopas")) {
    fail(name, "judul utama tidak ditemukan");
    return;
  }
  pass(name, "200, judul utama ada");
}

async function checkStats() {
  const name = "GET /api/stats";
  let res;
  try {
    res = await fetchText("/api/stats");
  } catch (err) {
    fail(name, err.name === "AbortError" ? "timeout 10 dtk" : String(err));
    return;
  }
  if (res.status !== 200) {
    fail(name, statusDetail(res.status));
    return;
  }
  let data;
  try {
    data = JSON.parse(res.text);
  } catch {
    fail(name, "bukan JSON");
    return;
  }
  if (data.total !== EXPECTED_TOTAL) {
    fail(name, `total ${data.total}, bukan ${EXPECTED_TOTAL}`);
    return;
  }
  pass(name, `200, total ${EXPECTED_TOTAL}`);
}

async function checkCompanies() {
  const name = "GET /api/companies?q=Novell";
  let res;
  try {
    res = await fetchText("/api/companies?q=Novell");
  } catch (err) {
    fail(name, err.name === "AbortError" ? "timeout 10 dtk" : String(err));
    return;
  }
  if (res.status !== 200) {
    fail(name, statusDetail(res.status));
    return;
  }
  let data;
  try {
    data = JSON.parse(res.text);
  } catch {
    fail(name, "bukan JSON");
    return;
  }
  const found =
    Array.isArray(data.results) &&
    data.results.some((r) =>
      String(r.company?.perusahaan || "").includes("Novell"),
    );
  if (!found) {
    fail(name, "Novell tidak ada di hasil");
    return;
  }
  pass(name, "200, Novell ada di hasil");
}

async function checkIndex() {
  const name = "GET /api/index (dengan token)";
  let token;
  try {
    token = await fetchToken();
  } catch (err) {
    fail(name, err.name === "AbortError" ? "timeout 10 dtk" : String(err));
    return;
  }
  if (!token) {
    fail(name, "token dari /api/token tidak didapat");
    return;
  }
  let res;
  try {
    res = await fetchText("/api/index", {
      Authorization: `Bearer ${token}`,
    });
  } catch (err) {
    fail(name, err.name === "AbortError" ? "timeout 10 dtk" : String(err));
    return;
  }
  if (res.status !== 200) {
    fail(name, statusDetail(res.status));
    return;
  }
  let data;
  try {
    data = JSON.parse(res.text);
  } catch {
    fail(name, "bukan JSON");
    return;
  }
  if (
    !Array.isArray(data.companies) ||
    data.companies.length !== EXPECTED_TOTAL
  ) {
    fail(
      name,
      `jumlah perusahaan ${data.companies?.length}, bukan ${EXPECTED_TOTAL}`,
    );
    return;
  }
  pass(name, `200, ${EXPECTED_TOTAL} perusahaan`);
}

async function checkChangelog() {
  const name = "GET /changelog";
  let res;
  try {
    res = await fetchText("/changelog");
  } catch (err) {
    fail(name, err.name === "AbortError" ? "timeout 10 dtk" : String(err));
    return;
  }
  if (res.status !== 200) {
    fail(name, statusDetail(res.status));
    return;
  }
  if (!res.text.includes(EXPECTED_VERSION)) {
    fail(name, `${EXPECTED_VERSION} tidak ditemukan`);
    return;
  }
  pass(name, `200, ${EXPECTED_VERSION} ada`);
}

await checkHome();
await checkStats();
await checkCompanies();
await checkIndex();
await checkChangelog();

const passed = results.filter((r) => r.outcome === "PASS").length;
const failed = results.filter((r) => r.outcome === "FAIL").length;
console.log(
  `Ringkasan: ${results.length} diperiksa, ${passed} lolos, ${failed} gagal.`,
);
process.exitCode = failed > 0 ? 1 : 0;
