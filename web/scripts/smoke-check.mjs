/* Tes asap Karir: memeriksa aplikasi yang sudah di-build dan sedang berjalan.
 * Node murni, tanpa dependensi baru. Jalankan dari web/:
 *   BASE_URL=http://localhost:3000 node scripts/smoke-check.mjs
 * BASE_URL bawaan: http://localhost:3000.
 *
 * Empat cek: Beranda 200 + judul utama, /api/stats 200 + total 406,
 * /api/companies?q=Novell 200 + Novell di hasil, /changelog 200 + 2.8.0.
 * Dua cek data bersikap jujur soal lingkungan: bila server menjawab 503,
 * artinya Firestore tak terjangkau di lingkungan itu (mis. CI memakai
 * kunci dummy), dan cek itu DILEWATI, bukan gagal, karena 503 adalah
 * jawaban yang dirancang aplikasi untuk data yang tidak bisa dimuat.
 * Status lain yang salah, atau isi yang tidak sesuai, tetap GAGAL.
 * Keluar 1 bila ada yang gagal, 0 bila semua lolos atau dilewati. */

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);

const TIMEOUT_MS = 10_000;
const results = [];

async function fetchText(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal,
    });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
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

function skip(name, detail) {
  record(name, "SKIP", detail);
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
    fail(name, `status ${res.status}`);
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
  if (res.status === 503) {
    skip(name, "503, Firestore tak terjangkau di lingkungan ini");
    return;
  }
  if (res.status !== 200) {
    fail(name, `status ${res.status}`);
    return;
  }
  let data;
  try {
    data = JSON.parse(res.text);
  } catch {
    fail(name, "bukan JSON");
    return;
  }
  if (data.total !== 406) {
    fail(name, `total ${data.total}, bukan 406`);
    return;
  }
  pass(name, "200, total 406");
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
  if (res.status === 503) {
    skip(name, "503, Firestore tak terjangkau di lingkungan ini");
    return;
  }
  if (res.status !== 200) {
    fail(name, `status ${res.status}`);
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
    fail(name, `status ${res.status}`);
    return;
  }
  if (!res.text.includes("2.8.0")) {
    fail(name, "2.8.0 tidak ditemukan");
    return;
  }
  pass(name, "200, 2.8.0 ada");
}

await checkHome();
await checkStats();
await checkCompanies();
await checkChangelog();

const passed = results.filter((r) => r.outcome === "PASS").length;
const skipped = results.filter((r) => r.outcome === "SKIP").length;
const failed = results.filter((r) => r.outcome === "FAIL").length;
console.log(
  `Ringkasan: ${results.length} diperiksa, ${passed} lolos, ${skipped} dilewati, ${failed} gagal.`,
);
process.exitCode = failed > 0 ? 1 : 0;
