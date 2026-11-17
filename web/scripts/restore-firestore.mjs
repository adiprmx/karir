/* Pemulihan drill cadangan Firestore Karir (P-03, D3): membaca
 * direktori cadangan yang dibuat backup-firestore.mjs, menulis
 * ulang dokumennya ke KOLEKSI UJI berawalan restore_drill_YYYYMMDD
 * di proyek yang sama, lalu memverifikasi hitungan dokumen hasil
 * pemulihan terhadap manifest cadangan. Jalankan dari web/:
 *   node scripts/restore-firestore.mjs --backup backups/<tanggal>
 *       [--collection a,b] [--prefix restore_drill_20261118]
 *       [--dry-run] [--verify] [--cleanup]
 *
 * PENGAMAN UTAMA: skrip ini TIDAK PERNAH menulis ke koleksi
 * produksi. Semua tulis memakai nama koleksi uji berawalan
 * `restore_drill_`, dan awalan itu divalidasi polanya sebelum
 * satu pun request dikirim. Pemulihan ke produksi (bila suatu hari
 * benar-benar diperlukan) TIDAK dilakukan skrip ini — ikuti
 * runbook di docs/PEMULIHAN.md yang menulis per koleksi dengan
 * persetujuan eksplisit per langkah.
 *
 * Mode:
 *   (bawaan)   pulihkan + verifikasi hitungan vs manifest.
 *   --verify   hanya verifikasi (tanpa menulis): hitung dokumen di
 *              koleksi uji dan bandingkan dengan manifest.
 *   --cleanup  hapus seluruh dokumen di koleksi uji (sesudah drill
 *              selesai — data uji adalah salinan data pengguna dan
 *              tidak boleh mengendap). Tanpa --force, cleanup
 *              meminta konfirmasi lewat --yes.
 *   --dry-run  cetak rencana saja, tanpa memanggil jaringan.
 *
 * Pemetaan koleksi uji:
 *   koleksi tingkat atas  -> {prefix}_{koleksi}
 *   user_trackers/{uid}/items -> {prefix}_user_trackers/{uid}/items
 *   (induk user_trackers tidak perlu dibuat: Firestore mengizinkan
 *   subkoleksi di bawah dokumen induk yang tidak ada.)
 *
 * Tulis memakai batchWrite (maks 400 tulis per panggilan) dengan
 * update dokumen penuh (name + fields; stempel createTime/
 * updateTime cadangan dibuang karena hanya-baca di sisi server).
 * Verifikasi menghitung dokumen lewat list per koleksi (items lewat
 * list per UID, supaya tidak tercampur item produksi), ditambah
 * pemeriksaan bentuk dokumen push_subscriptions (endpoint https +
 * kunci p256dh/auth ada; ID dokumen 64 heksadesimal SHA-256).
 *
 * Autentikasi: pola yang sama dengan backup-firestore.mjs —
 * FIREBASE_SERVICE_ACCOUNT (string JSON) ditukar menjadi token
 * lewat getServiceAccountAccessToken; khusus pengujian,
 * FIRESTORE_ACCESS_TOKEN + FIRESTORE_BASE.
 * Kode keluar: 0 sukses, 1 kegagalan operasional, 2 argumen salah.
 * Tanpa kredensial, skrip berhenti dengan pesan yang jelas. */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getServiceAccountAccessToken } from "../lib/analytics-server.js";

export const PROJECT_ID = "karir-9d53a";
export const ITEMS_KEY = "user_trackers/items";

/* Awalan koleksi uji: restore_drill_ + tanggal (YYYYMMDD), boleh
 * ditambah satu sufiks alfanumerik (mis. _2 untuk drill kedua di
 * hari yang sama). Pola ketat supaya salah ketik tidak pernah
 * menulis ke koleksi yang tidak dimaksud. */
export const PREFIX_PATTERN = /^restore_drill_\d{8}(_[a-z0-9]+)?$/;
const BATCH_SIZE = 400;
const PAGE_SIZE = 300;
const REQUEST_TIMEOUT_MS = 30_000;

function firestoreBase(env) {
  return (
    env.FIRESTORE_BASE ||
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
  );
}

export function defaultPrefix(now = new Date()) {
  return `restore_drill_${now.toISOString().slice(0, 10).replaceAll("-", "")}`;
}

const USAGE = `Pakai: node scripts/restore-firestore.mjs --backup DIR [opsi]

  --backup DIR         Direktori cadangan (berisi manifest.json).
  --collection a,b     Hanya pulihkan koleksi ini (nama seperti di
                       manifest; "user_trackers/items" = subkoleksi
                       pelacak). Bawaan: semua koleksi di manifest.
  --prefix P           Awalan koleksi uji (bawaan: restore_drill_
                       + tanggal hari ini). Pola: restore_drill_
                       YYYYMMDD[_sufiks].
  --verify             Hanya verifikasi hitungan, tanpa menulis.
  --cleanup            Hapus dokumen di koleksi uji (butuh --yes).
  --yes                Konfirmasi cleanup tanpa bertanya.
  --dry-run            Cetak rencana saja, tanpa jaringan.
  --help               Tampilkan bantuan ini.

Skrip ini HANYA menulis ke koleksi uji berawalan restore_drill_.
Pemulihan ke produksi mengikuti runbook docs/PEMULIHAN.md.`;

/* Nama koleksi uji untuk satu koleksi tingkat atas. */
export function testCollectionName(collection, prefix) {
  return `${prefix}_${collection}`;
}

/* Nama lengkap dokumen uji dari nama dokumen cadangan. Dokumen
 * items (user_trackers/{uid}/items/{id}) dipetakan ke
 * {prefix}_user_trackers/{uid}/items/{id}; dokumen tingkat atas ke
 * {prefix}_{koleksi}/{id}. Kembalikan null bila bentuk nama tidak
 * dikenali (dokumen dilewati dengan peringatan, bukan ditulis ke
 * tempat yang salah). */
export function testDocumentName(name, prefix) {
  if (typeof name !== "string") return null;
  const marker = "/documents/";
  const idx = name.indexOf(marker);
  if (idx < 0) return null;
  const path = name.slice(idx + marker.length);
  const parts = path.split("/");
  if (
    parts.length === 4 &&
    parts[0] === "user_trackers" &&
    parts[2] === "items"
  ) {
    return `${name.slice(0, idx + marker.length)}${prefix}_user_trackers/${parts[1]}/items/${parts[3]}`;
  }
  if (parts.length === 2) {
    return `${name.slice(0, idx + marker.length)}${prefix}_${parts[0]}/${parts[1]}`;
  }
  return null;
}

/* ID dokumen dari nama lengkap (.../documents/{koleksi}/{id}). */
export function docIdFromName(name) {
  if (typeof name !== "string") return "";
  const parts = name.split("/");
  return parts.length >= 2 ? parts[parts.length - 1] : "";
}

/* UID pelacak dari nama dokumen items. */
export function trackerUidFromName(name) {
  if (typeof name !== "string") return null;
  const parts = name.split("/");
  const idx = parts.indexOf("user_trackers");
  if (idx < 0 || parts.length < idx + 4) return null;
  return parts[idx + 1];
}

export function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/* Periksa bentuk satu dokumen push_subscriptions yang dipulihkan:
 * ID 64 heksadesimal + field endpoint (https), p256dh, auth.
 * Kembalikan larik masalah (kosong bila bentuk benar). */
export function checkPushSubscriptionDoc(doc) {
  const problems = [];
  const id = docIdFromName(doc?.name);
  if (!/^[0-9a-f]{64}$/.test(id)) {
    problems.push(`id dokumen bukan SHA-256 heksadesimal: ${id}`);
  }
  const fields = doc?.fields || {};
  const endpoint = fields.endpoint?.stringValue;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
    problems.push(`endpoint bukan https: ${String(endpoint).slice(0, 60)}`);
  }
  for (const key of ["p256dh", "auth"]) {
    if (typeof fields[key]?.stringValue !== "string" || !fields[key].stringValue) {
      problems.push(`field ${key} hilang atau kosong`);
    }
  }
  return problems;
}

export function parseArgs(argv) {
  const options = {
    backup: null,
    collections: null,
    prefix: null,
    verify: false,
    cleanup: false,
    yes: false,
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--verify") {
      options.verify = true;
    } else if (arg === "--cleanup") {
      options.cleanup = true;
    } else if (arg === "--yes") {
      options.yes = true;
    } else if (arg === "--backup" || arg === "--prefix") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} butuh nilai`);
      }
      options[arg.slice(2)] = value;
      i += 1;
    } else if (arg.startsWith("--backup=")) {
      options.backup = arg.slice("--backup=".length) || null;
      if (!options.backup) throw new Error("--backup butuh nilai");
    } else if (arg.startsWith("--prefix=")) {
      options.prefix = arg.slice("--prefix=".length) || null;
      if (!options.prefix) throw new Error("--prefix butuh nilai");
    } else if (arg === "--collection" || arg === "--collections") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} butuh nilai daftar koleksi`);
      }
      options.collections = value
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      i += 1;
    } else if (
      arg.startsWith("--collection=") ||
      arg.startsWith("--collections=")
    ) {
      const value = arg.slice(arg.indexOf("=") + 1);
      if (!value) throw new Error("--collection butuh nilai daftar koleksi");
      options.collections = value
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
    } else {
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }
  }
  if (options.verify && options.cleanup) {
    throw new Error("--verify dan --cleanup tidak dapat dipakai bersamaan");
  }
  if (options.cleanup && !options.yes && !options.dryRun) {
    throw new Error("--cleanup butuh --yes (pengaman hapus)");
  }
  if (options.prefix && !PREFIX_PATTERN.test(options.prefix)) {
    throw new Error(
      `Awalan tidak valid: ${options.prefix} (pola: restore_drill_YYYYMMDD[_sufiks])`,
    );
  }
  return options;
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

async function readBackupManifest(backupDir) {
  let raw;
  try {
    raw = await readFile(`${backupDir}/manifest.json`, "utf8");
  } catch {
    throw new Error(
      `manifest.json tidak ditemukan di ${backupDir} — bukan direktori cadangan`,
    );
  }
  const manifest = JSON.parse(raw);
  if (!manifest || typeof manifest !== "object" || !manifest.collections) {
    throw new Error(`manifest.json di ${backupDir} tidak berbentuk benar`);
  }
  return manifest;
}

/* Validasi nama berkas cadangan dari manifest (Red Team P-03):
 * nama berkas harus nama sederhana tanpa pemisah jalur — manifest
 * yang direkayasa tidak boleh membuat skrip membaca berkas di luar
 * direktori cadangan (path traversal). */
export function validateBackupFileName(file) {
  if (
    typeof file !== "string" ||
    !file ||
    file.includes("/") ||
    file.includes("\\") ||
    file.includes("..")
  ) {
    throw new Error(`Nama berkas cadangan tidak valid: ${String(file)}`);
  }
}

/* Validasi nama koleksi dari manifest: hanya huruf/angka/dash/
 * underscore (kecuali kunci items yang memang memakai "/"). Nama
 * koleksi yang lolos dipakai menyusun jalur Firestore — karakter
 * lain tidak pernah diizinkan masuk ke jalur tulis/baca. */
export function validateCollectionName(name) {
  if (name === ITEMS_KEY) return;
  if (typeof name !== "string" || !/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(`Nama koleksi cadangan tidak valid: ${String(name)}`);
  }
}

async function readBackupDocuments(backupDir, file) {
  validateBackupFileName(file);
  const raw = await readFile(`${backupDir}/${file}`, "utf8");
  const docs = JSON.parse(raw);
  if (!Array.isArray(docs)) {
    throw new Error(`Berkas cadangan ${file} bukan larik dokumen`);
  }
  return docs;
}

/* Tulis dokumen ke koleksi uji lewat batchWrite. Mengembalikan
 * jumlah dokumen yang tertulis. Dokumen yang namanya tidak dapat
 * dipetakan dilewati dengan peringatan dan dihitung sebagai gagal
 * pemetaan (bukan ditulis ke tempat yang salah). */
export async function restoreDocuments({
  fetchImpl,
  base,
  token,
  documents,
  prefix,
}) {
  const writes = [];
  let unmapped = 0;
  for (const doc of documents) {
    const testName = testDocumentName(doc?.name, prefix);
    if (!testName) {
      unmapped += 1;
      continue;
    }
    /* Hanya name + fields yang ditulis; stempel createTime /
     * updateTime dari cadangan adalah field hanya-baca server dan
     * ditolak bila ikut dikirim. */
    writes.push({ update: { name: testName, fields: doc.fields || {} } });
  }
  for (const chunk of chunkArray(writes, BATCH_SIZE)) {
    const res = await fetchWithTimeout(
      fetchImpl,
      `${base}:batchWrite`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ writes: chunk }),
      },
      REQUEST_TIMEOUT_MS,
    );
    if (!res.ok) {
      throw new Error(
        `batchWrite gagal: HTTP ${res.status} ${await readErrorDetail(res)}`,
      );
    }
  }
  return { written: writes.length, unmapped };
}

/* Hitung dokumen di satu jalur koleksi lewat list (mengikuti
 * pageToken). Mengembalikan { count, documents } — documents
 * dipakai pemeriksaan bentuk (hanya untuk push_subscriptions). */
export async function listCollectionDocuments({
  fetchImpl,
  base,
  token,
  path,
  collect = false,
}) {
  const documents = [];
  let count = 0;
  let pageToken = null;
  for (;;) {
    const url = new URL(`${base}/${path}`);
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetchWithTimeout(
      fetchImpl,
      url.toString(),
      { headers: { Authorization: `Bearer ${token}` } },
      REQUEST_TIMEOUT_MS,
    );
    if (!res.ok) {
      throw new Error(
        `Gagal membaca ${path}: HTTP ${res.status} ${await readErrorDetail(res)}`,
      );
    }
    const body = await res.json().catch(() => null);
    const page = Array.isArray(body?.documents) ? body.documents : [];
    count += page.length;
    if (collect) documents.push(...page);
    pageToken =
      typeof body?.nextPageToken === "string" && body.nextPageToken
        ? body.nextPageToken
        : null;
    if (!pageToken) return { count, documents };
  }
}

/* Hapus seluruh dokumen di satu jalur koleksi (list + batchWrite
 * delete, 400 per panggilan). Mengembalikan jumlah yang dihapus. */
export async function deleteCollectionDocuments({
  fetchImpl,
  base,
  token,
  path,
}) {
  const { documents } = await listCollectionDocuments({
    fetchImpl,
    base,
    token,
    path,
    collect: true,
  });
  const names = documents.map((d) => d.name).filter(Boolean);
  for (const chunk of chunkArray(names, BATCH_SIZE)) {
    const res = await fetchWithTimeout(
      fetchImpl,
      `${base}:batchWrite`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ writes: chunk.map((name) => ({ delete: name })) }),
      },
      REQUEST_TIMEOUT_MS,
    );
    if (!res.ok) {
      throw new Error(
        `Hapus ${path} gagal: HTTP ${res.status} ${await readErrorDetail(res)}`,
      );
    }
  }
  return names.length;
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
  if (!options.backup) {
    console.error("Argumen tidak valid: --backup DIR wajib diisi");
    console.error(USAGE);
    return 2;
  }
  const prefix = options.prefix || defaultPrefix();
  if (!PREFIX_PATTERN.test(prefix)) {
    console.error(`Awalan tidak valid: ${prefix}`);
    return 2;
  }

  let manifest;
  try {
    manifest = await readBackupManifest(options.backup);
  } catch (err) {
    console.error(`Gagal membaca cadangan: ${err.message}`);
    return 1;
  }
  const available = Object.keys(manifest.collections);
  try {
    for (const name of available) {
      validateCollectionName(name);
      validateBackupFileName(manifest.collections[name]?.file);
    }
  } catch (err) {
    console.error(`Manifest cadangan tidak valid: ${err.message}`);
    return 1;
  }
  let selected = options.collections || available;
  const unknown = selected.filter((name) => !available.includes(name));
  if (unknown.length > 0) {
    console.error(
      `Koleksi tidak ada di manifest cadangan: ${unknown.join(", ")} ` +
        `(yang tersedia: ${available.join(", ")})`,
    );
    return 2;
  }
  selected = [...new Set(selected)];

  const mode = options.cleanup
    ? "cleanup"
    : options.verify
      ? "verifikasi"
      : "pemulihan + verifikasi";
  if (options.dryRun) {
    console.log(`Rencana drill restore (${mode}, dry-run, tanpa jaringan):`);
    console.log(`  Cadangan: ${options.backup} (proyek ${manifest.project}, ${manifest.createdAt})`);
    console.log(`  Awalan koleksi uji: ${prefix}`);
    for (const name of selected) {
      const info = manifest.collections[name];
      const target =
        name === ITEMS_KEY
          ? `${prefix}_user_trackers/{uid}/items`
          : testCollectionName(name, prefix);
      console.log(`  ${name}: ${info.documents} dokumen -> ${target}`);
    }
    return 0;
  }

  const hasDirectToken = Boolean(
    env.FIRESTORE_ACCESS_TOKEN && env.FIRESTORE_ACCESS_TOKEN.trim(),
  );
  const token = hasDirectToken
    ? env.FIRESTORE_ACCESS_TOKEN
    : await getServiceAccountAccessToken({ fetchImpl });
  if (!token) {
    console.error(
      "Restore gagal: tidak ada kredensial Firestore. Pasang env " +
        "FIREBASE_SERVICE_ACCOUNT atau, khusus pengujian, " +
        "FIRESTORE_ACCESS_TOKEN.",
    );
    return 1;
  }
  const base = firestoreBase(env);

  try {
    /* --- CLEANUP: hapus dokumen koleksi uji, lalu selesai. --- */
    if (options.cleanup) {
      let totalDeleted = 0;
      for (const name of selected) {
        if (name === ITEMS_KEY) {
          const docs = await readBackupDocuments(
            options.backup,
            manifest.collections[name].file,
          );
          const uids = [
            ...new Set(
              docs.map((d) => trackerUidFromName(d?.name)).filter(Boolean),
            ),
          ];
          for (const uid of uids) {
            const path = `${prefix}_user_trackers/${uid}/items`;
            const deleted = await deleteCollectionDocuments({
              fetchImpl,
              base,
              token,
              path,
            });
            console.log(`${path}: ${deleted} dokumen dihapus`);
            totalDeleted += deleted;
          }
        } else {
          const path = testCollectionName(name, prefix);
          const deleted = await deleteCollectionDocuments({
            fetchImpl,
            base,
            token,
            path,
          });
          console.log(`${path}: ${deleted} dokumen dihapus`);
          totalDeleted += deleted;
        }
      }
      console.log(`Cleanup selesai: ${totalDeleted} dokumen dihapus dari koleksi uji.`);
      return 0;
    }

    /* --- RESTORE (dilewati pada --verify). --- */
    if (!options.verify) {
      for (const name of selected) {
        const docs = await readBackupDocuments(
          options.backup,
          manifest.collections[name].file,
        );
        const { written, unmapped } = await restoreDocuments({
          fetchImpl,
          base,
          token,
          documents: docs,
          prefix,
        });
        console.log(
          `${name}: ${written} dokumen ditulis ke koleksi uji` +
            (unmapped > 0 ? ` (${unmapped} dokumen nama tidak dapat dipetakan)` : ""),
        );
        if (unmapped > 0) {
          console.error(
            `Gagal: ${unmapped} dokumen ${name} tidak dapat dipetakan ke koleksi uji`,
          );
          return 1;
        }
      }
    }

    /* --- VERIFIKASI: hitungan koleksi uji vs manifest. --- */
    let failed = false;
    for (const name of selected) {
      const expected = manifest.collections[name].documents;
      let count;
      let problems = [];
      if (name === ITEMS_KEY) {
        const docs = await readBackupDocuments(
          options.backup,
          manifest.collections[name].file,
        );
        const uids = [
          ...new Set(docs.map((d) => trackerUidFromName(d?.name)).filter(Boolean)),
        ];
        count = 0;
        for (const uid of uids) {
          const part = await listCollectionDocuments({
            fetchImpl,
            base,
            token,
            path: `${prefix}_user_trackers/${uid}/items`,
          });
          count += part.count;
        }
      } else {
        const collect = name === "push_subscriptions";
        const listed = await listCollectionDocuments({
          fetchImpl,
          base,
          token,
          path: testCollectionName(name, prefix),
          collect,
        });
        count = listed.count;
        if (collect) {
          for (const doc of listed.documents) {
            problems.push(...checkPushSubscriptionDoc(doc));
          }
        }
      }
      const ok = count === expected && problems.length === 0;
      console.log(
        `${name}: koleksi uji ${count} dokumen, manifest ${expected} — ${ok ? "COCOK" : "TIDAK COCOK"}`,
      );
      for (const p of problems.slice(0, 5)) {
        console.log(`  masalah bentuk push_subscriptions: ${p}`);
      }
      if (!ok) failed = true;
    }
    if (failed) {
      console.error("Verifikasi drill GAGAL: ada koleksi yang tidak cocok dengan manifest.");
      return 1;
    }
    console.log("Drill restore LOLOS: seluruh hitungan cocok dengan manifest.");
    return 0;
  } catch (err) {
    console.error(`Restore gagal: ${err.message}`);
    return 1;
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await run(process.argv.slice(2));
}
