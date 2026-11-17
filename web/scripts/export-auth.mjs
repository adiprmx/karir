/* Ekspor berkala akun Firebase Auth Karir (P-03, D6): mengambil
 * daftar pengguna proyek karir-9d53a lewat Identity Toolkit REST
 * dan menyimpannya sebagai JSON. Jalankan dari web/:
 *   node scripts/export-auth.mjs [--out DIR] [--dry-run]
 *
 * Tanpa ekspor ini, kehilangan proyek berarti seluruh data akun
 * kehilangan pemiliknya meskipun dokumen Firestore berhasil
 * dipulihkan (user_profiles dan user_trackers terikat UID).
 *
 * Field yang diekspor (MINIMAL, sesuai kebutuhan pemulihan):
 * localId, email, emailVerified, disabled, createdAt, lastLoginAt,
 * isAdmin (dari customAttributes), providers (daftar providerId).
 * Yang TIDAK PERNAH diekspor: passwordHash dan salt (hash kata
 * sandi tidak dibutuhkan untuk pemulihan akun dan tidak boleh
 * keluar dari Firebase), serta foto/nama tampilan.
 *
 * ENKRIPSI: skrip ini menulis JSON teks-biasa ke direktori keluaran
 * (bawaan auth-exports/, ada di .gitignore — TIDAK PERNAH di-commit
 * dan TIDAK PERNAH diunggah sebagai artifact). Enkripsi dilakukan
 * oleh workflow export-auth.yml dengan gpg simetris (AES-256,
 * passphrase dari GitHub secret AUTH_EXPORT_PASSPHRASE); hanya
 * berkas .gpg yang diunggah sebagai artifact. Pemisahan ini
 * disengaja: skrip tidak mengelola kunci apa pun.
 *
 * Token: service account ditukar menjadi access token dengan scope
 * cloud-platform (scope datastore yang dipakai jalur Firestore
 * TIDAK memberi izin Identity Toolkit). Penukaran JWT ditulis di
 * sini mengikuti pola getServiceAccountAccessToken di
 * lib/analytics-server.js; konsolidasi helper token (BE2-24)
 * adalah tugas P-04. Khusus pengujian: FIRESTORE_ACCESS_TOKEN
 * (token langsung) + IDENTITY_TOOLKIT_BASE (alamat dasar REST).
 * --dry-run hanya mencetak rencana tanpa memanggil jaringan.
 * Kode keluar: 0 sukses, 1 kegagalan operasional, 2 argumen salah.
 *
 * CATATAN IZIN: service account butuh peran yang mengizinkan baca
 * daftar pengguna Auth (mis. Firebase Authentication Viewer).
 * Izin ini TIDAK dapat diperiksa dari VM (IAM API proyek
 * dinonaktifkan; pemberian peran hanya lewat Console UI) — ekspor
 * pertama (Fase B) adalah pembuktiannya. Bila ekspor pertama
 * dijawab 403, catat sebagai celah dan minta pemilik menambahkan
 * peran lewat Firebase Console. */

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createSign } from "node:crypto";

export const PROJECT_ID = "karir-9d53a";
const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 30_000;
/* Scope untuk Identity Toolkit list users. */
export const IDENTITY_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function identityBase(env) {
  return (
    env.IDENTITY_TOOLKIT_BASE ||
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}`
  );
}

function defaultOutDir(now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `auth-exports/${stamp}`;
}

const USAGE = `Pakai: node scripts/export-auth.mjs [--out DIR] [--dry-run]

  --out DIR    Direktori keluaran (bawaan: auth-exports/<stempel-waktu>/).
  --dry-run    Cetak rencana saja, tanpa memanggil jaringan.
  --help       Tampilkan bantuan ini.

Autentikasi lewat env FIREBASE_SERVICE_ACCOUNT (string JSON service
account). Khusus pengujian: FIRESTORE_ACCESS_TOKEN (token langsung)
dan IDENTITY_TOOLKIT_BASE (alamat dasar REST).

HASIL TIDAK TERENKRIPSI: enkripsi dilakukan workflow export-auth.yml
(gpg simetris, passphrase dari secret AUTH_EXPORT_PASSPHRASE).
Jangan mengunggah atau membagikan berkas JSON hasil skrip ini.`;

/* Tukar service account menjadi access token scope cloud-platform.
 * Mengembalikan token, atau null bila SA tidak dipasang/tidak valid
 * atau penukaran gagal. nowMs dapat disuntik untuk pengujian.
 * (Pola yang sama dengan getServiceAccountAccessToken; scope
 * berbeda — lihat catatan di kepala berkas.) */
export async function getIdentityToolkitToken({
  env = process.env,
  fetchImpl = fetch,
  nowMs = Date.now(),
} = {}) {
  let sa;
  try {
    sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || "");
  } catch {
    return null;
  }
  if (!sa?.client_email || !sa?.private_key) return null;
  const now = Math.floor(nowMs / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: IDENTITY_SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  let signature;
  try {
    signature = signer.sign(sa.private_key, "base64url");
  } catch {
    return null;
  }
  const jwt = `${header}.${payload}.${signature}`;
  let res;
  try {
    res = await fetchWithTimeout(
      fetchImpl,
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: jwt,
        }).toString(),
      },
      REQUEST_TIMEOUT_MS,
    );
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.access_token || null;
}

export function parseArgs(argv) {
  const options = { out: null, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--out") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--out butuh nilai direktori");
      }
      options.out = value;
      i += 1;
    } else if (arg.startsWith("--out=")) {
      const value = arg.slice("--out=".length);
      if (!value) throw new Error("--out butuh nilai direktori");
      options.out = value;
    } else {
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }
  }
  return options;
}

function msToIso(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString();
}

/* Petakan satu entri pengguna Identity Toolkit ke bentuk ekspor
 * minimal. passwordHash/salt TIDAK PERNAH ikut. customAttributes
 * adalah string JSON — isAdmin dibaca dari claim `admin: true`.
 * Kembalikan null bila entri tidak punya localId (tidak dapat
 * dipakai untuk pemulihan). */
export function mapUser(user) {
  if (!user || typeof user.localId !== "string" || !user.localId) {
    return null;
  }
  let isAdmin = false;
  if (typeof user.customAttributes === "string" && user.customAttributes) {
    try {
      const claims = JSON.parse(user.customAttributes);
      isAdmin = claims?.admin === true;
    } catch {
      /* customAttributes bukan JSON: anggap bukan admin. */
    }
  }
  const providers = Array.isArray(user.providerUserInfo)
    ? [...new Set(user.providerUserInfo.map((p) => p?.providerId).filter(Boolean))]
    : [];
  return {
    localId: user.localId,
    email: typeof user.email === "string" ? user.email : "",
    emailVerified: user.emailVerified === true,
    disabled: user.disabled === true,
    createdAt: msToIso(user.createdAt),
    lastLoginAt: msToIso(user.lastLoginAt),
    isAdmin,
    providers,
  };
}

async function fetchWithTimeout(fetchImpl, url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorDetail(res) {
  try {
    const text = await res.text();
    return text.slice(0, 300);
  } catch {
    return "";
  }
}

/* Daftar seluruh pengguna lewat accounts:list, mengikuti
 * nextPageToken sampai habis. Mengembalikan larik entri mentah. */
export async function listUsers({ fetchImpl, base, token }) {
  const users = [];
  let pageToken = null;
  for (;;) {
    const url = new URL(`${base}/accounts`);
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    let res;
    try {
      res = await fetchWithTimeout(
        fetchImpl,
        url.toString(),
        { headers: { Authorization: `Bearer ${token}` } },
        REQUEST_TIMEOUT_MS,
      );
    } catch (err) {
      throw new Error(
        `Gagal membaca daftar pengguna: ${err.name === "AbortError" ? "timeout" : String(err)}`,
      );
    }
    if (!res.ok) {
      const detail = await readErrorDetail(res);
      if (res.status === 403) {
        throw new Error(
          `Gagal membaca daftar pengguna: HTTP 403 ${detail} — service account ` +
            `kemungkinan belum punya peran baca Firebase Auth; tambahkan peran ` +
            `lewat Firebase Console (lihat catatan di kepala berkas ini).`,
        );
      }
      throw new Error(
        `Gagal membaca daftar pengguna: HTTP ${res.status} ${detail}`,
      );
    }
    const body = await res.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new Error("Gagal membaca daftar pengguna: respons bukan JSON");
    }
    const page = Array.isArray(body.users) ? body.users : [];
    users.push(...page);
    pageToken =
      typeof body.nextPageToken === "string" && body.nextPageToken
        ? body.nextPageToken
        : null;
    if (!pageToken) return users;
  }
}

export async function run(argv, { env = process.env, fetchImpl = fetch } = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(`Argumen tidak valid: ${err.message}`);
    console.error(USAGE);
    return 2;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const outDir = options.out || defaultOutDir();
  const hasServiceAccount = Boolean(
    env.FIREBASE_SERVICE_ACCOUNT && env.FIREBASE_SERVICE_ACCOUNT.trim(),
  );
  const hasDirectToken = Boolean(
    env.FIRESTORE_ACCESS_TOKEN && env.FIRESTORE_ACCESS_TOKEN.trim(),
  );
  if (options.dryRun) {
    console.log("Rencana ekspor Firebase Auth (dry-run, tanpa jaringan):");
    console.log(`  Proyek: ${PROJECT_ID}`);
    console.log(`  Direktori keluaran: ${outDir}`);
    console.log(
      `  Kredensial: ${hasDirectToken ? "FIRESTORE_ACCESS_TOKEN terpasang (pengujian)" : hasServiceAccount ? "FIREBASE_SERVICE_ACCOUNT terpasang" : "BELUM TERPASANG — ekspor nyata akan gagal"}`,
    );
    console.log("  Hasil TIDAK TERENKRIPSI — enkripsi oleh workflow (gpg).");
    return 0;
  }

  let token = null;
  if (hasDirectToken) {
    token = env.FIRESTORE_ACCESS_TOKEN;
  } else {
    token = await getIdentityToolkitToken({ env, fetchImpl });
  }
  if (!token) {
    console.error(
      "Ekspor gagal: tidak ada kredensial Auth. Pasang env " +
        "FIREBASE_SERVICE_ACCOUNT (string JSON service account) atau, " +
        "khusus pengujian, FIRESTORE_ACCESS_TOKEN.",
    );
    return 1;
  }

  let rawUsers;
  try {
    rawUsers = await listUsers({
      fetchImpl,
      base: identityBase(env),
      token,
    });
  } catch (err) {
    console.error(`Ekspor gagal: ${err.message}`);
    return 1;
  }
  const users = [];
  let skipped = 0;
  for (const user of rawUsers) {
    const mapped = mapUser(user);
    if (mapped) users.push(mapped);
    else skipped += 1;
  }
  users.sort((a, b) => (a.localId < b.localId ? -1 : 1));
  const adminCount = users.filter((u) => u.isAdmin).length;
  const file = `auth-export-${new Date().toISOString().slice(0, 10)}.json`;
  const payload = {
    project: PROJECT_ID,
    exportedAt: new Date().toISOString(),
    tool: "export-auth.mjs",
    totalUsers: users.length,
    adminUsers: adminCount,
    users,
  };
  try {
    await mkdir(outDir, { recursive: true });
    await writeFile(`${outDir}/${file}`, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch (err) {
    console.error(`Ekspor gagal menulis ke ${outDir}: ${err.message}`);
    return 1;
  }
  console.log(
    `Ekspor selesai: ${users.length} pengguna (${adminCount} admin)` +
      (skipped > 0 ? `, ${skipped} entri tanpa localId dilewati` : "") +
      ` -> ${outDir}/${file} (BELUM TERENKRIPSI — enkripsi oleh workflow)`,
  );
  return 0;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await run(process.argv.slice(2));
}
