#!/usr/bin/env node
/* Pemantau heartbeat watcher (P-05, C5): memeriksa kesegaran
 * dokumen `meta/watcher` di Firestore — heartbeat yang ditulis
 * notify_watch.py (VM) di akhir setiap run harian.
 *
 * Jalur alarm INDEPENDEN dari watcher: workflow watcher-monitor.yml
 * menjalankan skrip ini setiap hari; bila heartbeat basi/hilang,
 * skrip keluar 1 dan workflow membuka GitHub issue berlabel
 * `watcher-down`. Bila watcher masih jalan tetapi melaporkan
 * kegagalan (lastRunOk false), skrip tetap keluar 0 — watcher yang
 * berjalan sudah mengabarkan masalahnya sendiri lewat Telegram;
 * tugas skrip ini hanya mendeteksi KEBISUAN watcher.
 *
 * Dipakai: node scripts/check-watcher-heartbeat.mjs [--max-age-hours N]
 *   --max-age-hours N  umur maksimum heartbeat yang dianggap segar
 *                      (jam, default 26 — watcher jalan harian
 *                      01:30 WIB, monitor jalan 08:00 WIB, jadi
 *                      heartbeat normal berumur ~6,5 jam; batas 26
 *                      jam memberi toleransi satu run yang gagal
 *                      ditulis + satu hari penuh)
 *   --help             tampilkan bantuan
 *
 * Kredensial: FIREBASE_SERVICE_ACCOUNT (JSON service account,
 * ditukar menjadi access token) atau, khusus pengujian,
 * FIRESTORE_ACCESS_TOKEN (token langsung) + FIRESTORE_BASE
 * (alamat dasar REST). Tidak ada panggilan Firestore bila
 * kredensial tidak ada — keluar 1 dengan pesan jelas.
 *
 * Kode keluar: 0 = heartbeat segar; 1 = basi/hilang/gagal baca;
 * 2 = argumen tidak valid. */
import { fileURLToPath } from "node:url";
import { getServiceAccountAccessToken } from "../lib/analytics-server.js";

/* Umur maksimum heartbeat yang dianggap segar (jam). */
export const DEFAULT_MAX_AGE_HOURS = 26;

/* Dokumen heartbeat watcher di Firestore. */
export const WATCHER_DOC_PATH = "meta/watcher";

const USAGE = `Pemakaian: node scripts/check-watcher-heartbeat.mjs [--max-age-hours N]
Memeriksa kesegaran heartbeat watcher di dokumen meta/watcher (Firestore).
  --max-age-hours N  umur maksimum dalam jam (default ${DEFAULT_MAX_AGE_HOURS})
  --help             tampilkan bantuan ini
Kredensial: FIREBASE_SERVICE_ACCOUNT, atau FIRESTORE_ACCESS_TOKEN +
FIRESTORE_BASE (pengujian).`;

export function parseArgs(argv) {
  const parsed = { maxAgeHours: DEFAULT_MAX_AGE_HOURS, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--max-age-hours") {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(
          "--max-age-hours membutuhkan angka positif (jam).",
        );
      }
      parsed.maxAgeHours = value;
      i += 1;
    } else {
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }
  }
  return parsed;
}

/* Menilai kesegaran heartbeat dari isi dokumen Firestore.
 * Mengembalikan { fresh, ageMs, lastRunAt, lastRunOk, reason }.
 * `now` bisa diinjeksi untuk pengujian. */
export function assessHeartbeat(doc, { maxAgeHours, now = new Date() }) {
  if (!doc || typeof doc !== "object") {
    return {
      fresh: false,
      ageMs: null,
      lastRunAt: null,
      lastRunOk: null,
      reason: "dokumen heartbeat tidak ditemukan",
    };
  }
  const fields = doc.fields || {};
  const lastRunAt = fields.lastRunAt?.stringValue || null;
  const lastRunOk =
    typeof fields.lastRunOk?.booleanValue === "boolean"
      ? fields.lastRunOk.booleanValue
      : null;
  if (!lastRunAt) {
    return {
      fresh: false,
      ageMs: null,
      lastRunAt: null,
      lastRunOk,
      reason: "dokumen heartbeat tidak berisi lastRunAt",
    };
  }
  const stamp = new Date(lastRunAt);
  if (Number.isNaN(stamp.getTime())) {
    return {
      fresh: false,
      ageMs: null,
      lastRunAt,
      lastRunOk,
      reason: `lastRunAt tidak valid: ${lastRunAt}`,
    };
  }
  const ageMs = now.getTime() - stamp.getTime();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  if (ageMs > maxAgeMs) {
    return {
      fresh: false,
      ageMs,
      lastRunAt,
      lastRunOk,
      reason: `heartbeat basi: berumur ${(ageMs / 3_600_000).toFixed(1)} jam (batas ${maxAgeHours} jam)`,
    };
  }
  return {
    fresh: true,
    ageMs,
    lastRunAt,
    lastRunOk,
    reason: null,
  };
}

function resolveBase(env) {
  if (env.FIRESTORE_BASE) return env.FIRESTORE_BASE;
  let projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null;
  if (!projectId && env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      projectId = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id;
    } catch {
      projectId = null;
    }
  }
  if (!projectId) return null;
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

export async function run(
  argv,
  { env = process.env, fetchImpl = fetch, now = new Date() } = {},
) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`Argumen tidak valid: ${err.message}`);
    console.error(USAGE);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  const base = resolveBase(env);
  if (!base) {
    console.error(
      "Tidak bisa menentukan alamat Firestore: pasang FIREBASE_SERVICE_ACCOUNT atau FIRESTORE_BASE.",
    );
    return 1;
  }

  let token = env.FIRESTORE_ACCESS_TOKEN || null;
  if (!token) {
    if (!env.FIREBASE_SERVICE_ACCOUNT) {
      console.error(
        "Kredensial tidak ditemukan: pasang FIREBASE_SERVICE_ACCOUNT (atau FIRESTORE_ACCESS_TOKEN untuk pengujian).",
      );
      return 1;
    }
    try {
      const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
      token = await getServiceAccountAccessToken(account);
    } catch (err) {
      console.error(`Gagal menukar service account: ${err.message}`);
      return 1;
    }
  }

  let res;
  try {
    res = await fetchImpl(`${base}/${WATCHER_DOC_PATH}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error(`Gagal membaca heartbeat watcher: ${err.message}`);
    return 1;
  }
  if (res.status === 404) {
    console.error(
      "Heartbeat watcher HILANG: dokumen meta/watcher belum pernah ditulis. Watcher mungkin belum pernah jalan sesudah P-05, atau tulis heartbeat gagal.",
    );
    return 1;
  }
  if (!res.ok) {
    console.error(
      `Gagal membaca heartbeat watcher: HTTP ${res.status}.`,
    );
    return 1;
  }
  const doc = await res.json();
  const result = assessHeartbeat(doc, {
    maxAgeHours: args.maxAgeHours,
    now,
  });
  if (!result.fresh) {
    console.error(`Heartbeat watcher TIDAK SEGAR: ${result.reason}.`);
    return 1;
  }
  const ageHours = (result.ageMs / 3_600_000).toFixed(1);
  console.log(
    `Heartbeat watcher segar: run terakhir ${result.lastRunAt} (${ageHours} jam lalu), lastRunOk=${result.lastRunOk}.`,
  );
  if (result.lastRunOk === false) {
    console.log(
      "PERHATIAN: run watcher terakhir melaporkan kegagalan (lastRunOk=false) — watcher berjalan, tetapi pemeriksaannya gagal; periksa alarm Telegram watcher.",
    );
  }
  return 0;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await run(process.argv.slice(2));
}
