/* Cadangan Firestore Karir: ekspor semua koleksi ke berkas JSON.
 * Node murni, tanpa dependensi baru. Jalankan dari web/:
 *   node scripts/backup-firestore.mjs [--out DIR] [--collections a,b] [--dry-run]
 *
 * Koleksi yang dicadangkan (semua koleksi tingkat atas di
 * firestore.rules, ditambah grup subkoleksi items): companies,
 * alerts, meta, rate_limits, audit_logs, reports, changes,
 * user_profiles, analytics_events, cron-runs, push_subscriptions,
 * dan items pelacak pengguna
 * (user_trackers/{uid}/items — dokumen induk user_trackers hanya
 * wadah, datanya ada di subkoleksi items, jadi yang diekspor adalah
 * grup koleksi items lewat runQuery, bukan induknya).
 * `cron-runs` dan `push_subscriptions` ditambahkan pada P-03
 * (menutup celah D2): langganan push tidak dapat dibangun ulang
 * dari sumber lain bila hilang, dan heartbeat cron adalah jejak
 * diagnosis masalah berulang.
 *
 * Autentikasi: service account dari env FIREBASE_SERVICE_ACCOUNT
 * (string JSON yang sama dengan yang dipakai route server), ditukar
 * menjadi access token lewat getServiceAccountAccessToken di
 * lib/analytics-server.js — tidak ada kredensial di berkas ini.
 * Tanpa service account, skrip berhenti dengan pesan yang jelas
 * (bukan cadangan kosong). Dua env khusus pengujian:
 * FIRESTORE_ACCESS_TOKEN (pakai token ini, lewati penukaran SA) dan
 * FIRESTORE_BASE (timpa alamat dasar REST, mis. ke server mock
 * lokal) — pola yang sama dengan scripts/import-firestore.mjs.
 *
 * Keluaran: satu berkas JSON per koleksi di direktori keluaran
 * (bawaan: backups/<stempel-waktu>/ di bawah direktori kerja) plus
 * manifest.json (proyek, waktu, jumlah dokumen per koleksi).
 * Dokumen disimpan dalam format mentah REST Firestore (name +
 * fields + stempel waktu), bukan hasil decode — format mentah bisa
 * ditulis kembali apa adanya lewat REST saat pemulihan, dan tidak
 * ada informasi yang hilang dalam konversi. Pemulihan drill
 * otomatis: scripts/restore-firestore.mjs (ke koleksi uji
 * restore_drill_*, dengan verifikasi terhadap manifest); pemulihan
 * ke produksi mengikuti runbook docs/PEMULIHAN.md Skenario 6.
 *
 * Cadangan berisi data yang terhubung ke pengguna (audit_logs,
 * reports, user_profiles, pelacak) — JANGAN di-commit ke repo.
 * Direktori backups/ ada di .gitignore; di CI, hasilnya diunggah
 * sebagai artifact workflow (lihat .github/workflows/backup.yml),
 * bukan di-commit.
 *
 * --dry-run hanya mencetak rencana (koleksi, direktori keluaran,
 * ada/tidaknya kredensial — nilainya tidak pernah dicetak) tanpa
 * memanggil jaringan sama sekali.
 * Kode keluar: 0 sukses, 1 kegagalan operasional (auth, HTTP,
 * batas dokumen, tulis berkas), 2 argumen tidak valid. */

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getServiceAccountAccessToken } from "../lib/analytics-server.js";

export const PROJECT_ID = "karir-9d53a";

/* Koleksi tingkat atas, sesuai firestore.rules. Urutan alfabetis
 * supaya keluaran stabil. */
export const COLLECTIONS = [
  "alerts",
  "analytics_events",
  "audit_logs",
  "changes",
  "companies",
  "cron-runs",
  "meta",
  "push_subscriptions",
  "rate_limits",
  "reports",
  "user_profiles",
];

/* Nama grup subkoleksi pelacak + nama berkas cadangannya. */
export const ITEMS_GROUP = "items";
export const ITEMS_FILE = "user_trackers-items.json";
export const ITEMS_KEY = "user_trackers/items";

const PAGE_SIZE = 300;
/* Batas pengaman per koleksi: bila terlampaui, skrip gagal dengan
 * jelas daripada menulis cadangan yang terpotong diam-diam. */
export const MAX_DOCUMENTS_PER_COLLECTION = 50_000;
const REQUEST_TIMEOUT_MS = 30_000;

function firestoreBase(env) {
  return (
    env.FIRESTORE_BASE ||
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
  );
}

function defaultOutDir(now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `backups/${stamp}`;
}

const USAGE = `Pakai: node scripts/backup-firestore.mjs [--out DIR] [--collections a,b] [--dry-run]

  --out DIR            Direktori keluaran (bawaan: backups/<stempel-waktu>/).
  --collections a,b    Hanya cadangkan koleksi ini (nama dipisah koma;
                       "items" = subkoleksi pelacak user_trackers/{uid}/items).
  --dry-run            Cetak rencana saja, tanpa memanggil jaringan.
  --help               Tampilkan bantuan ini.

Autentikasi lewat env FIREBASE_SERVICE_ACCOUNT (string JSON service
account). Khusus pengujian: FIRESTORE_ACCESS_TOKEN (token langsung)
dan FIRESTORE_BASE (alamat dasar REST).`;

/* Urai argumen baris perintah. Melempar Error bila argumen tidak
 * valid (pemanggil CLI mengubahnya menjadi kode keluar 2). */
export function parseArgs(argv) {
  const options = {
    out: null,
    collections: null,
    dryRun: false,
    help: false,
  };
  const known = new Set([...COLLECTIONS, ITEMS_GROUP]);
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
    } else if (arg === "--collections") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--collections butuh nilai daftar koleksi");
      }
      options.collections = parseCollectionList(value, known);
      i += 1;
    } else if (arg.startsWith("--collections=")) {
      const value = arg.slice("--collections=".length);
      if (!value) throw new Error("--collections butuh nilai daftar koleksi");
      options.collections = parseCollectionList(value, known);
    } else {
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }
  }
  return options;
}

function parseCollectionList(value, known) {
  const names = value
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  if (names.length === 0) {
    throw new Error("--collections butuh nilai daftar koleksi");
  }
  for (const name of names) {
    if (!known.has(name)) {
      throw new Error(
        `Koleksi tidak dikenal: ${name} (pilihan: ${[...known].join(", ")})`,
      );
    }
  }
  return [...new Set(names)];
}

/* Susun isi manifest.json dari hitungan per koleksi. counts memetakan
 * nama koleksi (atau "user_trackers/items") ke {documents, file}. */
export function buildManifest({ project, createdAt, counts }) {
  const totalDocuments = Object.values(counts).reduce(
    (sum, c) => sum + c.documents,
    0,
  );
  return {
    project,
    createdAt,
    tool: "backup-firestore.mjs",
    collections: counts,
    totalDocuments,
  };
}

/* Fetch dengan timeout, supaya request yang menggantung tidak menahan
 * cadangan tanpa batas. */
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

/* Ekspor satu koleksi tingkat atas lewat REST list, mengikuti
 * pageToken sampai habis. Mengembalikan larik dokumen mentah. */
export async function exportCollection({ fetchImpl, base, token, collection }) {
  const documents = [];
  let pageToken = null;
  for (;;) {
    const url = new URL(`${base}/${collection}`);
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
        `Gagal membaca ${collection}: ${err.name === "AbortError" ? "timeout" : String(err)}`,
      );
    }
    if (!res.ok) {
      throw new Error(
        `Gagal membaca ${collection}: HTTP ${res.status} ${await readErrorDetail(res)}`,
      );
    }
    const body = await res.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new Error(`Gagal membaca ${collection}: respons bukan JSON`);
    }
    const page = Array.isArray(body.documents) ? body.documents : [];
    documents.push(...page);
    if (documents.length > MAX_DOCUMENTS_PER_COLLECTION) {
      throw new Error(
        `Koleksi ${collection} melebihi batas ${MAX_DOCUMENTS_PER_COLLECTION} dokumen — cadangan dibatalkan`,
      );
    }
    pageToken =
      typeof body.nextPageToken === "string" && body.nextPageToken
        ? body.nextPageToken
        : null;
    if (!pageToken) return documents;
  }
}

/* Ekspor grup koleksi items (subkoleksi user_trackers/{uid}/items)
 * lewat :runQuery dengan structuredQuery collectionId. Respons
 * REST berupa larik RunQueryResponse; entri tanpa field document
 * (mis. hanya readTime) dilewati. */
export async function exportItemsGroup({ fetchImpl, base, token }) {
  let res;
  try {
    res = await fetchWithTimeout(
      fetchImpl,
      `${base}:runQuery`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          structuredQuery: { from: [{ collectionId: ITEMS_GROUP }] },
        }),
      },
      REQUEST_TIMEOUT_MS,
    );
  } catch (err) {
    throw new Error(
      `Gagal membaca ${ITEMS_KEY}: ${err.name === "AbortError" ? "timeout" : String(err)}`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `Gagal membaca ${ITEMS_KEY}: HTTP ${res.status} ${await readErrorDetail(res)}`,
    );
  }
  const text = await res.text();
  let entries;
  try {
    entries = JSON.parse(text);
  } catch {
    /* Sebagian transport mengembalikan aliran JSON per baris. */
    entries = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
  if (!Array.isArray(entries)) {
    throw new Error(`Gagal membaca ${ITEMS_KEY}: respons bukan larik`);
  }
  const documents = entries
    .map((entry) => entry?.document)
    .filter((doc) => doc && typeof doc === "object");
  if (documents.length > MAX_DOCUMENTS_PER_COLLECTION) {
    throw new Error(
      `Grup ${ITEMS_KEY} melebihi batas ${MAX_DOCUMENTS_PER_COLLECTION} dokumen — cadangan dibatalkan`,
    );
  }
  return documents;
}

/* Jalankan cadangan. Mengembalikan kode keluar (0/1/2). env dan
 * fetchImpl bisa disuntik untuk pengujian; bawaan process.env dan
 * fetch global. */
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

  const selected = options.collections || [...COLLECTIONS, ITEMS_GROUP];
  const outDir = options.out || defaultOutDir();
  const hasServiceAccount = Boolean(
    env.FIREBASE_SERVICE_ACCOUNT && env.FIREBASE_SERVICE_ACCOUNT.trim(),
  );
  const hasDirectToken = Boolean(
    env.FIRESTORE_ACCESS_TOKEN && env.FIRESTORE_ACCESS_TOKEN.trim(),
  );

  if (options.dryRun) {
    console.log("Rencana cadangan Firestore (dry-run, tanpa jaringan):");
    console.log(`  Proyek: ${PROJECT_ID}`);
    console.log(`  Koleksi: ${selected.join(", ")}`);
    console.log(`  Direktori keluaran: ${outDir}`);
    console.log(
      `  Kredensial: ${hasDirectToken ? "FIRESTORE_ACCESS_TOKEN terpasang (pengujian)" : hasServiceAccount ? "FIREBASE_SERVICE_ACCOUNT terpasang" : "BELUM TERPASANG — cadangan nyata akan gagal"}`,
    );
    return 0;
  }

  /* Ambil token dulu, sebelum menulis apa pun: kegagalan auth tidak
   * boleh meninggalkan direktori cadangan setengah jadi. */
  let token = null;
  if (hasDirectToken) {
    token = env.FIRESTORE_ACCESS_TOKEN;
  } else {
    token = await getServiceAccountAccessToken({ fetchImpl });
  }
  if (!token) {
    console.error(
      "Cadangan gagal: tidak ada kredensial Firestore. Pasang env " +
        "FIREBASE_SERVICE_ACCOUNT (string JSON service account) atau, " +
        "khusus pengujian, FIRESTORE_ACCESS_TOKEN.",
    );
    return 1;
  }

  const base = firestoreBase(env);
  const exported = {};
  try {
    for (const name of selected) {
      let key;
      let file;
      let documents;
      if (name === ITEMS_GROUP) {
        key = ITEMS_KEY;
        file = ITEMS_FILE;
        documents = await exportItemsGroup({ fetchImpl, base, token });
      } else {
        key = name;
        file = `${name}.json`;
        documents = await exportCollection({
          fetchImpl,
          base,
          token,
          collection: name,
        });
      }
      exported[key] = { documents, file };
      console.log(`${name}: ${documents.length} dokumen`);
    }
  } catch (err) {
    console.error(`Cadangan gagal: ${err.message}`);
    return 1;
  }

  /* Semua koleksi berhasil diekspor dulu, baru berkas ditulis —
   * cadangan yang gagal di tengah tidak meninggalkan direktori
   * setengah jadi. */
  const counts = {};
  for (const [key, { documents, file }] of Object.entries(exported)) {
    counts[key] = { documents: documents.length, file };
  }
  const manifest = buildManifest({
    project: PROJECT_ID,
    createdAt: new Date().toISOString(),
    counts,
  });
  try {
    await mkdir(outDir, { recursive: true });
    for (const { documents, file } of Object.values(exported)) {
      await writeFile(
        `${outDir}/${file}`,
        `${JSON.stringify(documents, null, 2)}\n`,
        "utf8",
      );
    }
    await writeFile(
      `${outDir}/manifest.json`,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  } catch (err) {
    console.error(
      `Cadangan gagal menulis ke ${outDir}: ${err.message}`,
    );
    return 1;
  }
  console.log(
    `Cadangan selesai: ${manifest.totalDocuments} dokumen, ${Object.keys(counts).length} koleksi -> ${outDir}`,
  );
  return 0;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await run(process.argv.slice(2));
}
