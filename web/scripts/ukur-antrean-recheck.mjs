/* Ukur throughput antrean cron recheck dari dokumen heartbeat
 * cron-runs (P-04, kriteria 4). Membaca dokumen cron-runs N hari
 * terakhir lewat Firestore REST, lalu mencetak per hari: checked,
 * openSkipped, queueTotal, unreachable, blocked, serverError,
 * changed, dan status truncated — plus putusan terhadap target
 * P-04: openSkipped = 0 pada tiga run berturut-turut.
 *
 * Baseline sebelum P-04 (run 18 Nov 2026 01:36 WIB):
 * checked=48, openSkipped=185, queueTotal=317, status truncated.
 * P-04 menaikkan paralelisme batch 8 -> 16 dan menurunkan timeout
 * cek 8 -> 5 detik; skrip ini yang membuktikan apakah perubahan
 * itu menutup antrean, atau P-05 (GitHub Actions) yang harus
 * menyelesaikannya.
 *
 * Pakai:
 *   FIREBASE_SERVICE_ACCOUNT='...' node web/scripts/ukur-antrean-recheck.mjs [--days 7]
 * Khusus pengujian, FIRESTORE_ACCESS_TOKEN bisa dipakai langsung
 * (pola yang sama dengan scripts/backup-firestore.mjs).
 * Skrip ini HANYA MEMBACA (GET per dokumen, 1 baca/hari) — tidak
 * pernah menulis Firestore. Keluar 0 bila ada dokumen yang
 * terbaca (putusan dicetak apa pun hasilnya — ini alat observasi,
 * bukan gerbang CI); keluar 1 bila tidak ada dokumen sama sekali
 * atau autentikasi gagal.
 */
import { fileURLToPath } from "node:url";
import { getServiceAccountAccessToken } from "../lib/service-account-token.js";

/* Target P-04: tiga run berturut-turut tanpa satu pun perusahaan
 * terbuka yang terlewat. */
export const TARGET_RUN_BERTURUT = 3;

export function parseArgs(argv = []) {
  let days = 7;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--days" && argv[i + 1]) {
      days = Number(argv[i + 1]);
      i += 1;
    }
  }
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error("--days harus bilangan bulat 1-90");
  }
  return { days };
}

/* Tanggal WIB "YYYY-MM-DD" sekian hari yang lalu (0 = hari ini). */
export function tanggalWib(daysAgo = 0) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function angka(field) {
  const n = Number(field?.integerValue);
  return Number.isFinite(n) ? n : 0;
}

/* Ubah satu dokumen cron-runs (bentuk REST Firestore) menjadi
 * baris ringkasan. Field yang hilang (dokumen sebelum P-04)
 * dibaca sebagai nol — dokumen lama tetap bisa diukur. */
export function docKeBaris(doc, date) {
  const f = doc?.fields || {};
  return {
    date,
    checked: angka(f.checked),
    changed: angka(f.changed),
    updated: angka(f.updated),
    skipped: angka(f.skipped),
    openSkipped: angka(f.openSkipped),
    unreachable: angka(f.unreachable),
    blocked: angka(f.blocked),
    serverError: angka(f.serverError),
    queueTotal: angka(f.queueTotal),
    truncated: f.status?.stringValue === "truncated",
  };
}

/* Ringkas baris-baris harian (terbaru dulu) menjadi putusan:
 * - targetTercapai: tiga run terakhir yang tercatat semuanya
 *   openSkipped = 0 (bila kurang dari tiga run tercatat, belum
 *   tercapai — belum cukup bukti, bukan gagal).
 * - runTercatat: jumlah hari yang dokumennya ada.
 * - rataChecked: rata-rata checked per run yang tercatat.
 * - hariTerakhir: tanggal run terbaru yang tercatat. */
export function ringkasAntrean(baris) {
  const rows = (baris || []).filter(Boolean);
  const runTercatat = rows.length;
  const tigaTerakhir = rows.slice(0, TARGET_RUN_BERTURUT);
  const targetTercapai =
    tigaTerakhir.length === TARGET_RUN_BERTURUT &&
    tigaTerakhir.every((r) => r.openSkipped === 0);
  const totalChecked = rows.reduce((sum, r) => sum + r.checked, 0);
  return {
    runTercatat,
    targetTercapai,
    rataChecked:
      runTercatat === 0 ? 0 : Math.round(totalChecked / runTercatat),
    hariTerakhir: rows[0]?.date || null,
  };
}

function bacaProjectId(env) {
  const raw = env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!raw) return env.FIREBASE_PROJECT_ID || "";
  try {
    return JSON.parse(raw).project_id || "";
  } catch {
    return "";
  }
}

export async function run(argv = [], env = process.env, fetchImpl = fetch) {
  let days;
  try {
    ({ days } = parseArgs(argv));
  } catch (err) {
    console.error(`Argumen tidak sah: ${err.message}`);
    return 1;
  }
  const projectId = bacaProjectId(env);
  if (!projectId) {
    console.error(
      "Project ID tidak ditemukan: pasang FIREBASE_SERVICE_ACCOUNT " +
        "(string JSON service account) atau FIREBASE_PROJECT_ID.",
    );
    return 1;
  }
  let token = env.FIRESTORE_ACCESS_TOKEN || "";
  if (!token) {
    token = await getServiceAccountAccessToken();
    if (!token) {
      console.error(
        "Token service account gagal didapat: periksa " +
          "FIREBASE_SERVICE_ACCOUNT.",
      );
      return 1;
    }
  }
  const base =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents`;
  const baris = [];
  for (let d = 0; d < days; d += 1) {
    const date = tanggalWib(d);
    let res;
    try {
      res = await fetchImpl(`${base}/cron-runs/${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      console.error(`Baca cron-runs/${date} gagal (jaringan).`);
      continue;
    }
    if (res.status === 404) continue;
    if (!res.ok) {
      console.error(
        `Baca cron-runs/${date} gagal: HTTP ${res.status}.`,
      );
      continue;
    }
    baris.push(docKeBaris(await res.json(), date));
  }
  if (baris.length === 0) {
    console.error(
      `Tidak ada dokumen cron-runs dalam ${days} hari terakhir.`,
    );
    return 1;
  }
  const ringkasan = ringkasAntrean(baris);
  console.log("tanggal     checked openSkip queue unreachable blocked 5xx changed trunc");
  for (const r of baris) {
    console.log(
      [
        r.date,
        String(r.checked).padStart(7),
        String(r.openSkipped).padStart(8),
        String(r.queueTotal).padStart(5),
        String(r.unreachable).padStart(11),
        String(r.blocked).padStart(7),
        String(r.serverError).padStart(3),
        String(r.changed).padStart(7),
        r.truncated ? "ya" : "tidak",
      ].join(" "),
    );
  }
  console.log(
    `Run tercatat: ${ringkasan.runTercatat}, rata-rata checked/run: ${ringkasan.rataChecked}.`,
  );
  console.log(
    ringkasan.targetTercapai
      ? `Target P-04 TERCAPAI: openSkipped = 0 pada ${TARGET_RUN_BERTURUT} run berturut-turut.`
      : `Target P-04 BELUM tercapai: openSkipped = 0 pada ${TARGET_RUN_BERTURUT} run berturut-turut belum terbukti.`,
  );
  return 0;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await run(process.argv.slice(2));
}
