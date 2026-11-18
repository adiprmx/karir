/* GET /api/cron/digest — digest web push harian mandiri (P-05).
 * Dijalankan terjadwal tiap hari 18:30 UTC (01:30 WIB) oleh
 * workflow GitHub Actions (utama, .github/workflows/
 * scheduled-digest.yml), dengan jadwal QStash sebagai pemicu
 * cadangan. Endpoint menerima GET dan POST (POST untuk QStash).
 *
 * Tugas: kirim satu digest push ke semua langganan untuk alert
 * hari ini (tanggal WIB) yang BELUM masuk digest — yaitu alert
 * yang tidak ditandai pushed=true oleh cron recheck 01:00 WIB.
 * Recheck menandai pushed sesudah digestnya terkirim penuh; bila
 * digest recheck gagal/terpotong (anggaran 10 detik, daftar
 * langganan gagal dibaca, 429), alert itu tetap belum pushed dan
 * endpoint ini mencoba lagi. Bila tidak ada alert yang belum
 * pushed, run selesai normal dengan push "none" (bukan gagal).
 *
 * Anti-duplikat dua lapis: (1) kunci idempotency
 * digest-{tanggal-WIB} (satu eksekusi per hari; pemicu kedua
 * menjawab 200 { duplicate: true }); (2) penanda pushed per
 * alert — sesudah digest terkirim penuh, alert ditandai pushed
 * supaya run berikut (atau endpoint lain) tidak mengirim ulang.
 * Lapisan tampilan: payload push memakai tag karir-digest-{tanggal},
 * jadi bila duplikat tetap lolos, notifikasi di perangkat ditimpa,
 * bukan bertumpuk.
 *
 * Hanya tipe new-target dan deadline yang masuk digest (lihat
 * lib/cron-digest.js); alert kuota adalah peringatan infrastruktur
 * untuk owner lewat Telegram, bukan konten push pelanggan.
 *
 * Guard sama seperti cron lain: fail-closed bila CRON_SECRET
 * belum dipasang (503 generik), Bearer timing-safe ATAU signature
 * QStash yang valid (lib/cron-auth.js), dan service account wajib
 * ada. Kunci dilepas dengan status "failed" bila kueri alert atau
 * kirim push gagal total — pemicu cadangan boleh mengambil alih
 * kunci gagal di jadwalnya.
 *
 * Heartbeat: ringkasan ditulis ke dokumen
 * cron-runs/digest-{tanggal-WIB} (buildDigestRunRecord,
 * lib/notify.js), mengikuti pola cleanup (awalan "digest-"
 * supaya tidak menimpa heartbeat recheck hari yang sama).
 * Kegagalan guard (401/503) tidak menulis heartbeat — sama
 * seperti recheck/cleanup.
 *
 * Balasan: {status, alertsFound, alertsTotal, hasMore, push,
 * pushSent, pushFailed, pushPruned, pushTruncated, pushTotal,
 * pushHasMore, pushMalformed, pushConfigError, pushPages,
 * pushStaleKey, pushUnknownKey, pushedMarked, pushedFailed, trigger,
 * heartbeatWritten} (200 bila run selesai,
 * 500 + error bila kueri alert gagal atau digest tidak terkirim
 * sama sekali — kunci dilepas failed supaya pemicu cadangan bisa
 * mencoba lagi). `push` "none" berarti tidak ada alert yang belum
 * pushed ATAU nol langganan (P-07/P3) — keduanya hasil normal,
 * bukan kegagalan; alert ditandai pushed pada "none" karena
 * tidak ada pelanggan yang perlu dikirimi ulang. */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authorizeCronRequest } from "@/lib/cron-auth";
import {
  acquireCronLock,
  releaseCronLock,
} from "@/lib/cron-idempotency";
import {
  listUnpushedAlertsToday,
  markAlertsPushed,
} from "@/lib/cron-digest";
import { sendPushDigest } from "@/lib/push";
import {
  getServiceAccountAccessToken,
  todayJakarta,
} from "@/lib/analytics-server";
import { firestoreFetch } from "@/lib/firestore-server";
import { buildDigestRunRecord } from "@/lib/notify";

export const dynamic = "force-dynamic";
/* Batas durasi fungsi di Vercel (paket Hobby: maks 60 detik),
 * sama seperti recheck/cleanup. Digest ringan (satu kueri +
 * kirim push anggaran 10 detik) dan jauh dari batas ini. */
export const maxDuration = 60;

/* Balasan 503 generik untuk semua kegagalan konfigurasi cron
 * (SEC-05): satu pesan yang sama, tanpa menyebut variabel mana
 * yang hilang — detail itu hanya dicatat di log server. */
function cronUnavailable() {
  return NextResponse.json(
    {
      error: "cron belum diaktifkan",
      detail: "konfigurasi cron belum lengkap",
    },
    { status: 503 },
  );
}

/* Tulis heartbeat run ini ke cron-runs/digest-{tanggal-WIB},
 * mengikuti pola writeCronRunRecord di route recheck: PATCH
 * dokumen penuh, best-effort, tidak pernah melempar. */
async function writeDigestHeartbeat(fsBase, token, date, fields) {
  try {
    await firestoreFetch(`${fsBase}/cron-runs/digest-${date}`, token, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function GET(request) {
  return runDigest(request);
}

/* POST diterima untuk QStash (jadwal QStash dapat memakai POST):
 * perilakunya identik dengan GET; body mentah dipakai verifikasi
 * signature (klaim body JWT). */
export async function POST(request) {
  return runDigest(request);
}

async function runDigest(request) {
  /* 1. Keamanan cron: fail-closed (lib/cron-auth.js). */
  const rawBody =
    request.method === "POST" && typeof request.text === "function"
      ? await request.text()
      : "";
  const auth = authorizeCronRequest(request, { rawBody });
  if (!auth.ok) {
    if (auth.error === "unconfigured") {
      console.warn("Cron digest ditolak: CRON_SECRET belum dipasang.");
      return cronUnavailable();
    }
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  /* 2. Service account + project ID wajib ada. */
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.warn("Cron digest ditolak: service account belum dipasang.");
    return cronUnavailable();
  }
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.warn("Cron digest ditolak: project ID belum dipasang.");
    return cronUnavailable();
  }

  const startedAt = Date.now();
  const today = todayJakarta();

  /* 3. Token service account (cache modul bersama, BE2-24). */
  const token = await getServiceAccountAccessToken();
  if (!token) {
    console.warn("Cron digest ditolak: token service account gagal dibuat.");
    return NextResponse.json(
      { error: "Token service account gagal dibuat." },
      { status: 503 },
    );
  }
  const fsBase =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents`;

  /* 4. Pengaman jalan-ganda (P-05, C9): satu eksekusi per hari
   * untuk job digest. Pemicu kedua menjawab 200 { duplicate:
   * true } (bukan error). */
  let lock;
  try {
    lock = await acquireCronLock({
      fsBase,
      token,
      job: "digest",
      date: today,
      runId: randomUUID(),
      trigger: auth.trigger,
    });
  } catch (err) {
    console.warn(
      "Cron digest ditolak: kunci tidak bisa diambil:",
      err && err.message ? err.message : err,
    );
    return NextResponse.json(
      { error: "Kunci cron tidak bisa diambil." },
      { status: 503 },
    );
  }
  if (!lock.acquired) {
    console.warn(
      `Cron digest duplikat ditolak (alasan: ${lock.reason}, ` +
        `pemicu: ${auth.trigger}, tanggal: ${today}).`,
    );
    return NextResponse.json({
      duplicate: true,
      reason: lock.reason,
      job: "digest",
      date: today,
      trigger: auth.trigger,
    });
  }
  const release = (status) =>
    releaseCronLock({
      fsBase,
      token,
      job: "digest",
      date: today,
      status,
      updateTime: lock.updateTime,
    });

  const summary = {
    status: "ok",
    alertsFound: 0,
    alertsTotal: 0,
    hasMore: false,
    push: "none",
    pushSent: 0,
    pushFailed: 0,
    pushPruned: 0,
    pushTruncated: false,
    /* Konteks digest push (P-06/P2) — lihat buildDigestRunRecord. */
    pushTotal: 0,
    pushHasMore: false,
    pushMalformed: 0,
    /* Konteks digest push (P-07): error konfigurasi VAPID, jumlah
     * halaman daftar, langganan epoch kunci lama/tanpa sidik. */
    pushConfigError: false,
    pushPages: 0,
    pushStaleKey: 0,
    pushUnknownKey: 0,
    pushedMarked: 0,
    pushedFailed: 0,
    trigger: auth.trigger,
    heartbeatWritten: false,
  };

  /* 5. Ambil alert hari ini yang belum masuk digest. Kueri gagal
   * (mis. 429) = run gagal: heartbeat failed + kunci failed
   * supaya pemicu cadangan bisa mencoba lagi; jawab 500 supaya
   * kegagalannya terlihat di log workflow. */
  let found;
  try {
    found = await listUnpushedAlertsToday({
      fsBase,
      token,
      todayWib: today,
    });
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.warn("Cron digest gagal:", message);
    summary.status = "failed";
    summary.error = message;
    summary.heartbeatWritten = await writeDigestHeartbeat(
      fsBase,
      token,
      today,
      buildDigestRunRecord(summary, {
        date: today,
        startedAt,
        finishedAt: Date.now(),
      }),
    );
    await release("failed");
    return NextResponse.json(
      { error: "Daftar alert tidak bisa dibaca." },
      { status: 500 },
    );
  }
  summary.alertsFound = found.alerts.length;
  summary.alertsTotal = found.totalToday;
  summary.hasMore = found.hasMore;

  /* 6. Kirim digest bila ada alert yang belum pushed. Tanpa alert,
   * run selesai normal (push "none") — bukan kegagalan. */
  if (found.alerts.length > 0) {
    const pushResult = await sendPushDigest({
      fsBase,
      token,
      alerts: found.alerts,
      todayIso: today,
    });
    summary.push = pushResult.push;
    summary.pushSent = pushResult.pushSent;
    summary.pushFailed = pushResult.pushFailed;
    summary.pushPruned = pushResult.pushPruned;
    summary.pushTruncated = pushResult.pushTruncated;
    summary.pushTotal = pushResult.pushTotal;
    summary.pushHasMore = pushResult.pushHasMore;
    summary.pushMalformed = pushResult.pushMalformed;
    summary.pushConfigError = pushResult.pushConfigError;
    summary.pushPages = pushResult.pushPages;
    summary.pushStaleKey = pushResult.pushStaleKey;
    summary.pushUnknownKey = pushResult.pushUnknownKey;
    /* Penanda pushed — hanya bila digest terkirim penuh (tidak
     * terpotong): bila terpotong, sebagian langganan belum
     * menerima dan run besok mencoba lagi. "none" ikut ditandai:
     * nol langganan berarti tidak ada yang perlu dikirimi ulang
     * (P-07/P3). */
    if (
      (pushResult.push === "sent" || pushResult.push === "none") &&
      !pushResult.pushTruncated
    ) {
      const marked = await markAlertsPushed({
        fsBase,
        token,
        alertIds: found.alerts.map((a) => a.id),
      });
      summary.pushedMarked = marked.marked;
      summary.pushedFailed = marked.failed;
    }
    if (pushResult.push === "failed" || pushResult.push === "skipped-no-vapid") {
      /* Kirim gagal total (daftar langganan tidak bisa dibaca,
       * konfigurasi VAPID salah, atau kunci VAPID belum dipasang):
       * run gagal — digest adalah pekerjaan job ini, jadi tidak
       * terkirimnya digest adalah kegagalan, bukan hasil kosong.
       * Kunci failed supaya pemicu cadangan bisa mencoba lagi. */
      summary.status = "failed";
      summary.error =
        pushResult.push === "skipped-no-vapid"
          ? "Kunci VAPID belum dipasang."
          : "Digest push gagal.";
    }
  }

  /* 7. Heartbeat + lepas kunci + balasan. Run gagal menjawab 500
   * (sama seperti cleanup) supaya workflow Actions menandainya
   * gagal dan watcher memberi alarm; ringkasan tetap ikut supaya
   * bukti run tidak hilang. */
  const finishedAt = Date.now();
  summary.heartbeatWritten = await writeDigestHeartbeat(
    fsBase,
    token,
    today,
    buildDigestRunRecord(summary, {
      date: today,
      startedAt,
      finishedAt,
    }),
  );
  if (!summary.heartbeatWritten) {
    console.warn(
      "Heartbeat digest gagal ditulis: dokumen cron-runs tidak tercatat.",
    );
  }
  await release(summary.status === "failed" ? "failed" : "done");
  if (summary.status === "failed") {
    return NextResponse.json(
      { ...summary, error: summary.error || "Digest push gagal." },
      { status: 500 },
    );
  }
  return NextResponse.json(summary);
}
