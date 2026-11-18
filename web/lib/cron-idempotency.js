/* Pengaman jalan-ganda job terjadwal Karir (P-05, C9).
 *
 * Sesudah migrasi scheduler ke GitHub Actions, satu job bisa
 * dipicu dari TIGA jalur: workflow GitHub Actions (utama), jadwal
 * QStash (cadangan), dan Vercel Cron (masih hidup selama masa
 * transisi). Tanpa pengaman, dua pemicu yang tiba bersamaan akan
 * menjalankan job dua kali: alert ganda, cek portal ganda, dan
 * tulis ganda ke Firestore.
 *
 * Pengaman ini adalah kunci idempotency di Firestore, koleksi
 * `cron-locks`, satu dokumen per (job, tanggal WIB):
 * id dokumen = `{job}-{tanggal-WIB}`, mis. `recheck-2026-11-18`.
 * Kunci diambil di AWAL handler endpoint cron, sesudah auth dan
 * sesudah token service account tersedia, sebelum efek samping
 * apa pun (fase alert recheck, hapus cleanup, kirim digest).
 *
 * Aturan ambil kunci (acquireCronLock):
 * - Dokumen belum ada -> buat (POST ?documentId=...), kunci
 *   didapat. Pembuatan dokumen dengan id yang sama bersifat
 *   atomik di Firestore: dua pemicu bersamaan, satu dapat 200,
 *   satunya 409 — pemenang tunggal dijamin server, bukan oleh
 *   logika balapan di klien.
 * - Dokumen ada, status "running", umur < TTL -> ditolak
 *   (reason "running"): job sedang berjalan di pemicu lain.
 * - Dokumen ada, status "done" -> ditolak (reason "done"), kecuali
 *   job mengizinkan jalan-ulang (allowRerun, hanya cleanup:
 *   penghapusan retensi idempotent dan workflow Actions memanggil
 *   endpoint berulang sampai tidak ada sisa — lihat
 *   .github/workflows/scheduled-cleanup.yml).
 * - Dokumen ada, status "failed", ATAU status "running" yang
 *   sudah basi (umur >= TTL) -> ambil alih (takeover): run
 *   sebelumnya gagal atau mati sebelum melepas kunci. Takeover
 *   memakai PATCH dengan prasyarat updateTime (compare-and-swap):
 *   bila dua pemicu mengambil alih bersamaan, hanya satu yang
 *   lolos, satunya 412 dan ditolak. Bila PATCH prasyarat gagal
 *   karena alasan lain (mis. format parameter ditolak), fallback
 *   ke hapus-lalu-buat — operasi dasar yang selalu tersedia.
 *
 * TTL kunci 3 menit (LOCK_TTL_MS): fungsi Vercel dibunuh paksa
 * pada 60 detik (maxDuration), jadi kunci "running" yang berumur
 * lebih dari 3 menit PASTI dari run yang mati — tenggang 3x lipat
 * menutup skew jam antar instance. Umur dihitung dari updateTime
 * dokumen (stempel server Firestore), bukan startedAt (jam fungsi),
 * supaya skew jam tidak memengaruhi vonis basi.
 *
 * Kunci TIDAK PERNAH diambil dari input pemanggil: id kunci
 * diturunkan server-side dari nama job + tanggal WIB. Penyerang
 * tidak bisa mengunci job dengan key palsu — tidak ada parameter
 * kunci di request (fokus gerbang Red Team P-05). Satu-satunya
 * cara mengambil kunci adalah lolos auth endpoint dulu
 * (CRON_SECRET atau signature QStash yang valid).
 *
 * Koleksi `cron-locks` sengaja TIDAK punya aturan di
 * firestore.rules: tanpa aturan, akses klien ditolak bawaan
 * (sama seperti `cron-runs`). Hanya service account yang
 * menulis/membaca kunci. Dokumen kunci juga sengaja TIDAK masuk
 * daftar cadangan (scripts/backup-firestore.mjs): isinya
 * sementara (satu dokumen per job per hari, kedaluwarsa 3 menit)
 * dan tidak ada nilainya untuk pemulihan.
 *
 * Semua panggilan memakai fetchImpl yang bisa diganti (test) dan
 * bertimeout 10 detik, mengikuti lib/firestore-server.js. */
import { jsonWithTimeout } from "./companies.js";

export const CRON_LOCKS_COLLECTION = "cron-locks";
/* TTL kunci: 3 menit (lihat penjelasan di atas). */
export const LOCK_TTL_MS = 3 * 60 * 1000;
const LOCK_FETCH_TIMEOUT_MS = 10_000;
/* Batas percobaan ambil kunci bila dokumen lenyap di antara 409
 * dan baca ulang (mis. dihapus proses lain): 2x cukup — lebih dari
 * itu menandakan kondisi yang tidak normal. */
const ACQUIRE_MAX_ATTEMPTS = 2;

/* Id dokumen kunci untuk satu job pada satu tanggal WIB. Nama job
 * dibatasi ke huruf kecil, angka, dan strip supaya tidak ada
 * karakter yang perlu di-escape di path dokumen. */
export function buildLockId(job, date) {
  if (!/^[a-z0-9-]+$/.test(job)) {
    throw new Error("Nama job kunci tidak valid.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Tanggal kunci tidak valid (YYYY-MM-DD).");
  }
  return `${job}-${date}`;
}

/* Baca field string/integer dari dokumen REST Firestore. */
function fieldString(doc, key) {
  return doc?.fields?.[key]?.stringValue ?? "";
}

/* Uraikan dokumen kunci REST menjadi objek datar. updateTime
 * adalah stempel server Firestore (selalu ada di balasan asli);
 * bila tidak ada (mock), umur dihitung dari startedAt. */
export function parseLockDoc(doc) {
  if (!doc || typeof doc !== "object") return null;
  return {
    job: fieldString(doc, "job"),
    date: fieldString(doc, "date"),
    runId: fieldString(doc, "runId"),
    trigger: fieldString(doc, "trigger"),
    status: fieldString(doc, "status") || "running",
    startedAt: fieldString(doc, "startedAt"),
    finishedAt: fieldString(doc, "finishedAt"),
    updateTime: typeof doc.updateTime === "string" ? doc.updateTime : "",
  };
}

/* Umur kunci dalam milidetik, dari updateTime server (utama) atau
 * startedAt (cadangan). Kembalikan null bila tidak ada stempel
 * yang bisa dibaca — pemanggil memperlakukannya sebagai basi
 * (aman: takeover memakai CAS, jadi salah vonis hanya menambah
 * satu percobaan, bukan jalan ganda). */
export function lockAgeMs(lock, nowMs) {
  const stamp = Date.parse(lock.updateTime || "") || Date.parse(lock.startedAt || "");
  if (!Number.isFinite(stamp)) return null;
  return Math.max(0, nowMs - stamp);
}

export function lockIsStale(lock, nowMs, ttlMs = LOCK_TTL_MS) {
  const age = lockAgeMs(lock, nowMs);
  if (age === null) return true;
  return age >= ttlMs;
}

function lockFields({ job, date, runId, trigger, status, startedAt, finishedAt }) {
  return {
    job: { stringValue: job },
    date: { stringValue: date },
    runId: { stringValue: runId },
    trigger: { stringValue: trigger },
    status: { stringValue: status },
    startedAt: { stringValue: startedAt },
    finishedAt: { stringValue: finishedAt },
  };
}

/* Satu panggilan REST Firestore tanpa melempar untuk status
 * non-2xx: pemanggil membedakan 200/404/409/412 sendiri.
 * Melempar hanya bila jaringan/timeout gagal total. Body dibaca
 * dengan jsonWithTimeout (BE-09) supaya body yang stall tidak
 * menggantung selamanya. */
async function firestoreCall(fetchImpl, url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOCK_FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
    const body = await jsonWithTimeout(res, LOCK_FETCH_TIMEOUT_MS).catch(
      () => ({}),
    );
    return { status: res.status, ok: res.ok, body: body || {} };
  } finally {
    clearTimeout(timer);
  }
}

function lockUrl(fsBase, lockId) {
  return `${fsBase}/${CRON_LOCKS_COLLECTION}/${lockId}`;
}

/* Ambil kunci untuk satu job pada satu tanggal. Kembalikan:
 * - { acquired: true, lockId, updateTime, tookOver } bila kunci
 *   didapat (tookOver true bila ini pengambilalihan kunci basi
 *   atau gagal, bukan pembuatan baru).
 * - { acquired: false, reason: "running" | "done", lockId } bila
 *   job sudah berjalan atau sudah selesai hari ini.
 * Melempar bila Firestore tidak bisa dihubungi/dibaca — pemanggil
 * (route cron) menjawab 503 fail-closed, sama seperti kegagalan
 * baca Firestore lain di jalur cron. */
export async function acquireCronLock({
  fsBase,
  token,
  job,
  date,
  runId,
  trigger = "cron-secret",
  allowRerun = false,
  fetchImpl = fetch,
  nowMs = Date.now(),
  ttlMs = LOCK_TTL_MS,
}) {
  const lockId = buildLockId(job, date);
  const url = lockUrl(fsBase, lockId);
  const collectionUrl = `${fsBase}/${CRON_LOCKS_COLLECTION}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const startedAt = new Date(nowMs).toISOString();
  /* True bila kunci didapat sesudah menghapus kunci basi lewat
   * fallback (bukan pembuatan baru murni) — untuk ketepatan
   * laporan tookOver di bawah. */
  let tookOverFallback = false;

  for (let attempt = 0; attempt < ACQUIRE_MAX_ATTEMPTS; attempt += 1) {
    const created = await firestoreCall(
      fetchImpl,
      `${collectionUrl}?documentId=${encodeURIComponent(lockId)}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          fields: lockFields({
            job,
            date,
            runId,
            trigger,
            status: "running",
            startedAt,
            finishedAt: "",
          }),
        }),
      },
    );
    if (created.ok) {
      return {
        acquired: true,
        lockId,
        updateTime: created.body.updateTime || "",
        tookOver: tookOverFallback,
      };
    }
    if (created.status !== 409) {
      throw new Error(
        `Ambil kunci ${lockId} gagal: HTTP ${created.status}.`,
      );
    }
    /* 409: dokumen sudah ada — baca keadaannya. */
    const existing = await firestoreCall(fetchImpl, url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (existing.status === 404) {
      /* Dokumen lenyap di antara 409 dan baca (dihapus proses
       * lain): coba buat lagi sekali. */
      continue;
    }
    if (!existing.ok) {
      throw new Error(
        `Baca kunci ${lockId} gagal: HTTP ${existing.status}.`,
      );
    }
    const lock = parseLockDoc(existing.body);
    if (!lock) {
      throw new Error(`Dokumen kunci ${lockId} tidak bisa dibaca.`);
    }
    if (lock.status === "done" && !allowRerun) {
      return { acquired: false, reason: "done", lockId };
    }
    const stale = lockIsStale(lock, nowMs, ttlMs);
    const failed = lock.status === "failed";
    const rerun = lock.status === "done" && allowRerun;
    if (!stale && !failed && !rerun) {
      return { acquired: false, reason: "running", lockId };
    }
    /* Takeover: kunci basi, gagal, atau jalan-ulang yang diizinkan.
     * CAS dengan prasyarat updateTime — hanya satu pemenang bila
     * dua pemicu mengambil alih bersamaan. */
    const takeover = await tryTakeover({
      fetchImpl,
      url,
      headers,
      fields: lockFields({
        job,
        date,
        runId,
        trigger,
        status: "running",
        startedAt,
        finishedAt: "",
      }),
      updateTime: lock.updateTime,
    });
    if (takeover.result === "acquired") {
      return {
        acquired: true,
        lockId,
        updateTime: takeover.updateTime,
        tookOver: true,
      };
    }
    if (takeover.result === "lost") {
      return { acquired: false, reason: "running", lockId };
    }
    /* Prasyarat ditolak formatnya (bukan 412): fallback
     * hapus-lalu-buat — bila create berikut 409, loop akan
     * membaca ulang dan menolak dengan benar. */
    const deleted = await firestoreCall(fetchImpl, url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!deleted.ok && deleted.status !== 404) {
      throw new Error(
        `Hapus kunci basi ${lockId} gagal: HTTP ${deleted.status}.`,
      );
    }
    tookOverFallback = true;
  }
  /* Dua percobaan habis tanpa keputusan (dokumen lenyap dua kali):
   * fail-closed — pemanggil menjawab 503, pemicu cadangan mencoba
   * lagi di jadwalnya. */
  throw new Error(`Ambil kunci ${lockId} gagal: dokumen tidak stabil.`);
}

/* Satu percobaan takeover dengan prasyarat updateTime.
 * Kembalikan { result, updateTime }: "acquired" (200, dengan
 * updateTime baru dari balasan), "lost" (412 — pemicu lain menang),
 * atau "unsupported" (status lain — pemanggil memakai fallback). */
async function tryTakeover({ fetchImpl, url, headers, fields, updateTime }) {
  const mask = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${k}`)
    .join("&");
  const precondition = updateTime
    ? `&currentDocument.updateTime=${encodeURIComponent(updateTime)}`
    : "";
  const res = await firestoreCall(fetchImpl, `${url}?${mask}${precondition}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields }),
  });
  if (res.ok) return { result: "acquired", updateTime: res.body.updateTime || "" };
  if (res.status === 412) return { result: "lost", updateTime: "" };
  return { result: "unsupported", updateTime: "" };
}

/* Lepas kunci sesudah run selesai: tandai status "done" atau
 * "failed" + finishedAt. Best-effort total, tidak pernah melempar:
 * kegagalan lepas hanya berarti kunci tetap "running" sampai TTL
 * (3 menit) — tidak menggagalkan balasan run. Prasyarat updateTime
 * dipakai bila diketahui supaya tidak menimpa kunci yang sudah
 * diambil alih run lain; 412/404 diabaikan diam-diam. */
export async function releaseCronLock({
  fsBase,
  token,
  job,
  date,
  status = "done",
  updateTime = "",
  fetchImpl = fetch,
  nowMs = Date.now(),
}) {
  try {
    const lockId = buildLockId(job, date);
    const mask =
      "updateMask.fieldPaths=status&updateMask.fieldPaths=finishedAt";
    const precondition = updateTime
      ? `&currentDocument.updateTime=${encodeURIComponent(updateTime)}`
      : "";
    const res = await firestoreCall(
      fetchImpl,
      `${lockUrl(fsBase, lockId)}?${mask}${precondition}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            status: { stringValue: status },
            finishedAt: { stringValue: new Date(nowMs).toISOString() },
          },
        }),
      },
    );
    if (!res.ok && res.status !== 412 && res.status !== 404) {
      console.warn(
        `Lepas kunci ${lockId} gagal: HTTP ${res.status} (TTL akan memulihkan).`,
      );
    }
  } catch (err) {
    console.warn(
      `Lepas kunci ${job}-${date} gagal:`,
      err && err.message ? err.message : err,
    );
  }
}
