/* GET /api/cron/recheck — cek ulang harian portal Karir.
 * Dijalankan terjadwal tiap hari 18:00 UTC (01:00 WIB) oleh
 * workflow GitHub Actions (utama, .github/workflows/
 * scheduled-recheck.yml), dengan jadwal QStash sebagai pemicu
 * cadangan dan Vercel Cron selama masa transisi (lihat
 * docs/monitoring-cron.md). Endpoint menerima GET (Vercel Cron,
 * GitHub Actions) dan POST (QStash, bila jadwalnya memakai POST).
 *
 * Cara kerja:
 * 1. Keamanan: env CRON_SECRET wajib terisi (tanpa itu, rute
 *    menjawab 503 dan tidak pernah berjalan tanpa autentikasi).
 *    Request lolos bila membawa header Authorization: Bearer
 *    <CRON_SECRET> (perbandingan timing-safe) ATAU signature
 *    QStash yang valid di header Upstash-Signature (JWT HS256,
 *    lihat lib/qstash-verify.js). Keduanya diperiksa lib/cron-auth.js.
 * 2. Pengaman jalan-ganda (P-05, C9): sesudah token service
 *    account tersedia, handler mengambil kunci idempotency di
 *    Firestore (koleksi cron-locks, id recheck-{tanggal-WIB})
 *    SEBELUM memuat data — pemicu duplikat ditolak murah, tanpa
 *    membaca 685 dokumen perusahaan. Pemicu kedua menjawab 200
 *    { duplicate: true } (bukan error: QStash tidak perlu retry,
 *    workflow Actions tidak gagal) dan penolakannya dicatat di
 *    log. Kunci dilepas di akhir run (status done/failed); bila
 *    run mati sebelum lepas, TTL 3 menit memulihkannya.
 * 3. Tulis ke Firestore lewat REST API memakai access token dari service
 *    account (env FIREBASE_SERVICE_ACCOUNT, string JSON). Token dibuat
 *    dari JWT RS256 yang ditandatangani node:crypto, tanpa dependensi
 *    baru. Bila env itu tidak ada, rute menjawab 503 dan tidak gagal total.
 * 4. Anggaran waktu 50 detik (batas fungsi Vercel Hobby sekitar 60 detik,
 *    dinyatakan eksplisit lewat maxDuration = 60). Bila waktu habis di
 *    tengah jalan, sisanya dicatat sebagai terpotong. Batas waktu juga
 *    dicek sebelum fase tulis tiap batch, supaya batch yang mulai
 *    dekat batas tidak memaksa tulis melewati batas fungsi (OPS-07).
 * 5. Fase alert jalan DULU, sebelum loop cek portal (lihat butir
 *    Notifikasi di bawah). Alasannya: loop cek bisa menghabiskan
 *    seluruh anggaran, dan bila fase alert menunggu giliran sesudah
 *    loop, fase itu tidak pernah jalan (terbukti 9 Nov 2026: run
 *    56,8 detik, alert + snapshot dilewati utuh). Fase alert sendiri
 *    dibatasi anggaran 15 detik dan menulis alert paralel batch 5,
 *    supaya tidak memakan jatah loop cek (NOTIF-15).
 * 6. Tiap portal dicek paralel batch 16 lewat lib/check.js
 *    (checkUrlWithRetry: retry 1x bila hasil pertama gagal), timeout
 *    cek 5 detik per percobaan. Batch naik dari 8 dan timeout turun
 *    dari 8 detik di P-04 karena antrean rutin terpotong: run
 *    18 Nov 2026 01:36 WIB hanya checked=48 dari queueTotal=317
 *    dengan openSkipped=185. Cek ini hanya menguji portal bisa
 *    dibuka atau tidak, BUKAN isi lowongannya. Karena itu pemetaan
 *    statusnya hati-hati (P-04/BE2-01, K-11 — lihat
 *    decideRecheckAction di lib/check.js):
 *    - portal tidak bisa dihubungi (status null, sesudah retry) ->
 *      "tidak diketahui": status TIDAK diubah, tanggal cek TIDAK
 *      diperbarui, dihitung skipped + unreachable, pencacah
 *      gagal_cek perusahaan naik 1. Bukti O-01: 26 dari 28 flip
 *      16-17 Nov 2026 salah karena satu kegagalan jangkau sesaat
 *      dianggap portal mati — pola itu tidak boleh terulang.
 *    - portal menjawab 403/diblokir -> status TIDAK PERNAH diubah
 *      (K-11): server hidup, cek otomatisnya yang diblokir.
 *      Dihitung skipped + blocked, nomornya masuk blockedNos
 *      (antrean tinjau manual) di heartbeat; tanggal cek tetap
 *      diperbarui karena ceknya selesai.
 *    - portal menjawab 404/410 sesudah retry -> benar-benar tidak
 *      ada: ada lowongan -> "Portal tidak bisa dibuka" + catat
 *      perubahan (sumber "recheck").
 *    - portal menjawab 5xx sesudah retry -> strike pertama hanya
 *      dicatat (skipped + serverError); baru bila portal yang sama
 *      juga 5xx di run kemarin (two-strike, dibaca dari dokumen
 *      cron-runs kemarin) status boleh flip.
 *    - ada lowongan + portal hidup -> tanggal cek diperbarui, tanpa
 *      perubahan; gagal_cek direset ke 0 bila sebelumnya > 0.
 *    - portal yang tadinya mati + sekarang hidup -> "Tidak dapat
 *      diverifikasi" + catat perubahan (lowongannya sendiri belum
 *      dicek ulang manusia, jadi tidak boleh langsung kembali jadi
 *      ada lowongan).
 *    Antrean disusun buildCheckQueue (lib/check.js, BE-05) dalam tiga
 *    tier: (1) mendesak — ada lowongan + batas lamar 0-7 hari lagi,
 *    dicek pertama tiap run; (2) terbuka — ada lowongan lainnya,
 *    dari yang paling lama tidak dicek; (3) mati — portal mati yang
 *    dicek bergilir dengan sisa anggaran. Dalam tiap tier, urutan
 *    tanggal_cek tertua dulu membuat cek harian berputar ke seluruh
 *    daftar: perusahaan yang baru dicek (tanggal cek diperbarui
 *    tiap run) otomatis pindah ke belakang. Tanpa urutan ini, run
 *    yang terpotong anggaran akan selalu mengecek perusahaan yang
 *    sama dan sisanya tidak pernah terjangkau.
 *    Perusahaan tanpa tautan karir tidak masuk antrean (tidak ada yang
 *    bisa dicek lewat URL) dan tidak menyumbat antrean.
 *
 * Balasan: {checked, changed, updated, skipped, openSkipped,
 * unreachable, blocked, serverError, unreachableNos, blockedNos,
 * serverErrorNos, truncated, alerts, alertsFailed, telegram,
 * telegramMarked, push, pushSent, pushFailed, pushPruned,
 * pushTruncated, alertPhaseTruncated, snapshotKnown,
 * snapshotWritten, queue, markerBumped, heartbeatWritten}.
 * alerts = alert baru yang dibuat di run ini; telegram = "sent" |
 * "failed" | "skipped-no-token" | "none"; telegramMarked = alert
 * yang berhasil ditandai terkirim sesudah kirim langsung
 * (NOTIF-01); push = "sent" | "failed" | "skipped-no-vapid" |
 * "none" (digest web push, T10 — "none" bila tidak ada alert baru);
 * pushSent/pushFailed/pushPruned = hasil kirim per langganan;
 * pushTruncated = true bila kirim push kehabisan anggaran 10 detik;
 * openSkipped = perusahaan tier mendesak/terbuka yang tidak sempat
 * dicek karena terpotong; checked = portal dengan hasil cek
 * DEFINITIF (hidup/diblokir/404/5xx) — portal yang tidak bisa
 * dihubungi TIDAK dihitung checked, melainkan skipped + unreachable;
 * unreachable/blocked/serverError = hitungan hasil cek "tidak
 * diketahui"/diblokir/5xx-strike-pertama (P-04); unreachableNos/
 * blockedNos/serverErrorNos = nomor perusahaannya (blockedNos
 * adalah antrean tinjau manual, serverErrorNos dipakai run besok
 * untuk two-strike 5xx); queue = {urgent, open, dead, total};
 * markerBumped = true bila marker kesegaran dinaikkan di run ini;
 * heartbeatWritten = true bila dokumen cron-runs tercatat (OPS-01).
 *
 * Heartbeat (OPS-01): di akhir run, ringkasan ditulis ke dokumen
 * cron-runs/{tanggal-WIB} (buildCronRunRecord, lib/notify.js).
 * Watcher agent-side (notify_watch.py) membaca dokumen itu tiap
 * pagi: bila tidak ada, cron dianggap tidak jalan dan owner
 * diberitahu lewat Telegram; bila openSkipped > 0 dua hari
 * berturut-turut, owner diberitahu antrean terpotong. Tulis
 * heartbeat best-effort — gagal menulis tidak menggagalkan run,
 * hanya dicatat di ringkasan.
 *
 * Marker kesegaran (meta/lastChange, arsitektur seed-first S3): bila
 * run ini mengubah status perusahaan apa pun (PATCH status berhasil)
 * atau memperbarui tanggal_cek perusahaan, rev marker dinaikkan 1
 * (updatedAt=now) supaya semua instance server web refill dari
 * Firestore di cek marker berikut. Bila tidak ada perubahan sama
 * sekali, marker TIDAK disentuh. Tulis memakai token
 * service account yang sama (melewati rules). Cron adalah PENULIS
 * data, jadi ia TIDAK boleh berjalan dari seed: bila data yang
 * dimuat berasal dari seed (Firestore tidak bisa dibaca), run
 * dilewati dengan 503 supaya tidak ada alert palsu atau tulis
 * berdasarkan data basi.
 *
 * Notifikasi (lihat lib/notify.js):
 * - Sebelum loop cek, daftar perusahaan yang ada lowongannya dibandingkan
 *   dengan snapshot meta/targets run sebelumnya. Nomor yang baru muncul =
 *   lowongan baru -> alert new-target-{no}-{tanggal}.
 * - Perusahaan yang ada lowongannya dan batas_lamar-nya 0-3 hari lagi ->
 *   alert deadline-{no}-{batas_lamar}.
 * - Alert ditulis ke koleksi alerts dengan id deterministik (jadi
 *   idempotent), lalu paling banyak satu pesan Telegram gabungan
 *   dikirim bila ada alert baru. Pesan di atas 4096 karakter dipecah
 *   jadi beberapa potongan (NOTIF-08). Sesudah kirim langsung
 *   berhasil, tiap alert ditandai sent=true + sentAt supaya watcher
 *   tidak mengirim ulang (NOTIF-01). Kegagalan Telegram tidak pernah
 *   menggagalkan cron. Bila env TELEGRAM_BOT_TOKEN belum dipasang,
 *   pengiriman dilewati dan alert tetap tercatat untuk watcher
 *   agent-side (notify_watch.py).
 * - Bila tulis alert new-target gagal (atau fase alert kehabisan
 *   anggaran sebelum mencoba), nomor itu dikeluarkan dari snapshot
 *   meta/targets supaya run berikut mencoba lagi — bukan hilang
 *   selamanya (NOTIF-06). Kegagalan tulis snapshot dicatat di log
 *   dan ringkasan, bukan ditelan diam-diam (NOTIF-07).
 * - Digest web push (T10, lib/push.js sendPushDigest): sesudah
 *   Telegram, bila ada alert baru, satu digest dikirim ke semua
 *   langganan push_subscriptions. Anggaran sendiri 10 detik,
 *   best-effort total — gagal kirim tidak menggagalkan run.
 *   Langganan yang jawabannya 410/404 dihapus; 401/403 adalah
 *   alarm konfigurasi VAPID (bukan salah langganan); 429/5xx
 *   dicoba lagi besok. Bila digest terkirim penuh (tidak
 *   terpotong anggaran), tiap alert baru ditandai pushed=true
 *   (P-05) supaya endpoint digest mandiri 01:30 WIB tidak
 *   mengirim ulang alert yang sama; bila terpotong, penanda
 *   tidak ditulis dan endpoint digest mencoba lagi. */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authorizeCronRequest } from "@/lib/cron-auth";
import {
  acquireCronLock,
  releaseCronLock,
} from "@/lib/cron-idempotency";
import { markAlertsPushed } from "@/lib/cron-digest";
import {
  getCompaniesWithSource,
  getSeedModeInfo,
  STATUS_ORDER,
} from "@/lib/companies";
import {
  firestoreFetch,
  firestoreGet,
  getAccessToken,
} from "@/lib/firestore-server";
import { sendPushDigest } from "@/lib/push";
import {
  buildCheckQueue,
  checkUrlWithRetry,
  decideRecheckAction,
} from "@/lib/check";
import {
  OPEN_STATUS,
  DEFAULT_CHAT_ID,
  QUOTA_ALERT_READS,
  QUOTA_ALERT_90_READS,
  QUOTA_ALERT_TYPE,
  collectNewTargetAlerts,
  collectDeadlineAlerts,
  formatTelegramMessage,
  sendTelegramMessage,
  markAlertsSent,
  buildCronRunRecord,
  buildSkippedCronRunRecord,
  quotaAlertId,
  quotaAlert90Id,
  quotaPercent,
} from "@/lib/notify";
import {
  OBS_CODES,
  emitObservabilityEvent,
  sanitizeMessage,
} from "@/lib/observability";
import { checkInCron, flushSentry } from "@/lib/sentry";
import { noteCronRun } from "@/lib/health-state";
import { recordReads, flushReadMeters } from "@/lib/read-meter";

export const dynamic = "force-dynamic";
/* Batas durasi fungsi di Vercel (paket Hobby: maks 60 detik).
 * Dinyatakan eksplisit supaya anggaran internal 50 detik selalu
 * punya margin 10 detik untuk tulis heartbeat + balasan (OPS-07). */
export const maxDuration = 60;

const DEADLINE_MS = 50_000;
/* Paralelisme batch cek + timeout per percobaan cek (P-04,
 * kriteria 4): batch 8 -> 16, timeout 8 -> 5 detik, karena antrean
 * rutin terpotong (baseline run 18 Nov 2026 01:36 WIB:
 * checked=48, openSkipped=185, queueTotal=317). Timeout lebih
 * pendek bisa menambah portal "tidak diketahui" di hari jaringan
 * lambat — tetapi sejak P-04, tidak diketahui TIDAK PERNAH
 * membalik status, jadi risikonya hanya cek tertunda, bukan data
 * rusak. Target observasi pasca-merge: openSkipped = 0 pada tiga
 * run berturut-turut; bila tidak tercapai, P-05 (GitHub Actions,
 * durasi job 6 jam) yang menyelesaikannya. */
const BATCH = 16;
const CHECK_TIMEOUT_MS = 5_000;
/* Anggaran fase alert, dihitung sejak fase itu mulai (bukan sejak
 * run mulai, karena muat data + tukar token bisa lambat sendiri).
 * Alert ditulis paralel per batch kecil supaya fase ini tidak
 * memakan jatah loop cek (NOTIF-15). */
const ALERT_BUDGET_MS = 15_000;
const ALERT_BATCH = 5;
/* Taksonomi 4 status dipakai lewat decideRecheckAction di
 * lib/check.js (P-04) — tidak ada konstanta status lokal di sini
 * supaya hanya ada satu sumber kebenaran pemetaan status. */
/* Snapshot daftar perusahaan yang ada lowongannya run sebelumnya
 * (dokumen meta/targets) dan koleksi alerts. Snapshot dipakai untuk
 * mendeteksi "lowongan baru": cron hanya menguji portal bisa dibuka
 * atau tidak, jadi kemunculan lowongan baru hanya terlihat dari
 * perbandingan snapshot. Id alert deterministik (lihat lib/notify.js)
 * supaya satu kejadian tidak tercatat dua kali dan tidak ada spam
 * harian. Nama dokumen meta/targets dipertahankan dari versi lama
 * supaya snapshot yang sudah ada tetap terbaca. */

function todayWib() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

/* Tanggal WIB kemarin ("YYYY-MM-DD") — id dokumen cron-runs run
 * sebelumnya, dibaca untuk two-strike 5xx (K-11, P-04). */
function yesterdayWib() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString(
    "en-CA",
    { timeZone: "Asia/Jakarta" },
  );
}

/* Buat satu dokumen alert dengan id deterministik. Kembalikan
 * { status, reason }: status "created" bila baru dibuat, "exists"
 * bila id sudah ada (bukan error: id yang sama berarti kejadian
 * yang sama di run sebelumnya), dan "failed" bila tulisnya gagal —
 * reason menjelaskan penyebabnya ("http-{status}" | "timeout" |
 * "network"). Kegagalan dicatat log terstruktur throttled
 * (BE2-11, P-06) — sebelumnya "failed" tanpa alasan apa pun. */
async function createAlert(fsBase, token, alert) {
  const fields = {
    type: { stringValue: alert.type },
    companyNo: { integerValue: String(alert.companyNo) },
    perusahaan: { stringValue: alert.perusahaan },
    posisi: { stringValue: alert.posisi || "" },
    link: { stringValue: alert.link || "" },
    sent: { booleanValue: false },
    createdAt: { stringValue: new Date().toISOString() },
  };
  if (alert.type === "deadline") {
    fields.batasLamar = { stringValue: alert.batasLamar };
    fields.daysLeft = { integerValue: String(alert.daysLeft) };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      `${fsBase}/alerts?documentId=${encodeURIComponent(alert.id)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      },
    );
    if (res.status === 409) return { status: "exists", reason: null };
    if (!res.ok) {
      const reason = `http-${res.status}`;
      emitObservabilityEvent({
        code: OBS_CODES.CRON_WRITE_FAILED,
        component: "cron-recheck",
        message: `Tulis alert ${alert.type} gagal.`,
        meta: { reason, alertType: alert.type },
      });
      return { status: "failed", reason };
    }
    return { status: "created", reason: null };
  } catch (err) {
    const reason = err && err.name === "AbortError" ? "timeout" : "network";
    emitObservabilityEvent({
      code: OBS_CODES.CRON_WRITE_FAILED,
      component: "cron-recheck",
      message: `Tulis alert ${alert.type} gagal.`,
      meta: { reason, alertType: alert.type },
    });
    return { status: "failed", reason };
  } finally {
    clearTimeout(timer);
  }
}

/* Catat kegagalan pertama run ini ke summary.error (maks 300
 * karakter, dibersihkan dari email/kredensial): pemenang pertama
 * bertahan — error berikutnya tidak menimpanya, supaya heartbeat
 * menunjukkan penyebab awal, bukan gejala lanjutan. */
function recordRunError(summary, message) {
  if (!summary || summary.error) return;
  const clean = sanitizeMessage(message || "");
  if (clean) summary.error = clean.slice(0, 300);
}

/* Buat alert kuota (70% atau 90%) dengan id deterministik, lalu
 * baca balik untuk memastikan dokumennya benar-benar ada (K2).
 * Kembalikan true bila alert ada (baru dibuat atau sudah ada),
 * false bila pembuatan/verifikasi gagal. Bentuk field sama dengan
 * alert kuota dari lapisan web (lib/companies.js) supaya watcher
 * meneruskannya lewat jalur relay yang sama. */
async function createQuotaAlert(fsBase, token, alertId, readsEstimate) {
  const fields = {
    type: { stringValue: QUOTA_ALERT_TYPE },
    companyNo: { integerValue: "0" },
    perusahaan: { stringValue: "" },
    sent: { booleanValue: false },
    createdAt: { stringValue: new Date().toISOString() },
    readsEstimate: { integerValue: String(readsEstimate) },
    percent: { integerValue: String(quotaPercent(readsEstimate)) },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      `${fsBase}/alerts?documentId=${encodeURIComponent(alertId)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      },
    );
    /* 409 = sudah dibuat run/jalur lain hari ini — tetap sah,
     * verifikasi baca-balik di bawah yang memutuskan. */
    if (res.status !== 409 && !res.ok) return false;
    const doc = await firestoreGet(`${fsBase}/alerts/${alertId}`, token);
    return Boolean(doc);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/* Naikkan marker kesegaran meta/lastChange (rev+1, updatedAt=now)
 * setelah run mengubah status atau tanggal_cek perusahaan. Bila dokumen belum ada,
 * buat lengkap dengan pencacah nol (rev 1). Bila sudah ada, PATCH
 * hanya rev + updatedAt supaya pencacah refill (refillsToday,
 * readsEstimate, counterDay) tidak terganggu. Kembalikan true bila
 * tulis berhasil, false bila gagal (tidak pernah melempar: kegagalan
 * menaikkan marker tidak boleh menggagalkan balasan cron). */
async function bumpMarker(fsBase, token, today) {
  try {
    const existing = await firestoreGet(`${fsBase}/meta/lastChange`, token);
    if (!existing) {
      await firestoreFetch(`${fsBase}/meta/lastChange`, token, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            rev: { integerValue: "1" },
            updatedAt: { stringValue: new Date().toISOString() },
            counterDay: { stringValue: today },
            refillsToday: { integerValue: "0" },
            readsEstimate: { integerValue: "0" },
          },
        }),
      });
      return true;
    }
    const rev = Number(existing.fields?.rev?.integerValue || 0);
    await firestoreFetch(
      `${fsBase}/meta/lastChange` +
        `?updateMask.fieldPaths=rev&updateMask.fieldPaths=updatedAt`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            rev: { integerValue: String(rev + 1) },
            updatedAt: { stringValue: new Date().toISOString() },
          },
        }),
      },
    );
    return true;
  } catch {
    return false;
  }
}

/* Balasan 503 generik untuk semua kegagalan konfigurasi cron
 * (SEC-05): satu pesan yang sama, tanpa menyebut variabel mana
 * yang hilang atau bagian service account mana yang bermasalah —
 * detail itu hanya dicatat di log server. Pemanggil anonim tidak
 * bisa memetakan status konfigurasi server dari balasan ini. */
function cronUnavailable() {
  return NextResponse.json(
    {
      error: "cron belum diaktifkan",
      detail: "konfigurasi cron belum lengkap",
    },
    { status: 503 },
  );
}

/* Tulis dokumen heartbeat run ini ke koleksi cron-runs
 * (id dokumen = tanggal WIB run). Kembalikan true bila tulis
 * berhasil, false bila gagal (tidak pernah melempar: kegagalan
 * menulis heartbeat tidak boleh menggagalkan balasan cron —
 * watcher akan menganggap run ini tidak tercatat). */
async function writeCronRunRecord(fsBase, token, date, fields) {
  try {
    await firestoreFetch(`${fsBase}/cron-runs/${date}`, token, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
    return true;
  } catch {
    return false;
  }
}

/* Tulis heartbeat "skipped" untuk run yang dilewati sebelum
 * pemeriksaan dimulai (P-06/C2). Best-effort: tidak pernah
 * melempar. */
async function writeSkippedHeartbeat(
  fsBase,
  token,
  { today, startedAt, skipReason, trigger, error },
) {
  try {
    const seedModeMinutes = getSeedModeInfo().seedModeMinutes;
    await writeCronRunRecord(
      fsBase,
      token,
      today,
      buildSkippedCronRunRecord(
        { skipReason, trigger, seedModeMinutes, error },
        { date: today, startedAt, finishedAt: Date.now() },
      ),
    );
  } catch {
    /* Best-effort: gagal menulis heartbeat skipped tidak boleh
     * menggagalkan balasan 503. */
  }
}

/* Upaya best-effort menulis heartbeat skipped dari env (dipakai
 * jalur 503 awal sebelum token tersedia): bila SA tidak ada/tidak
 * lengkap atau token gagal, diam — watcher menyimpulkan dari
 * dokumen yang tidak ada. */
async function tryWriteSkippedFromEnv({ skipReason, trigger, error }) {
  try {
    const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
    if (!saRaw) return;
    const sa = JSON.parse(saRaw);
    if (!sa.client_email || !sa.private_key || !sa.project_id) return;
    const token = await getAccessToken(sa);
    const fsBase = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
    await writeSkippedHeartbeat(fsBase, token, {
      today: todayWib(),
      startedAt: Date.now(),
      skipReason,
      trigger,
      error,
    });
  } catch {
    /* Best-effort: lihat writeSkippedHeartbeat. */
  }
}

export async function GET(request) {
  return runRecheck(request);
}

/* POST diterima untuk QStash (jadwal QStash dapat memakai POST):
 * perilakunya identik dengan GET; body mentah dipakai verifikasi
 * signature (klaim body JWT). */
export async function POST(request) {
  return runRecheck(request);
}

async function runRecheck(request) {
  /* 1. Keamanan cron: fail-closed. Tanpa CRON_SECRET, rute tidak
   * pernah berjalan — menjawab 503, bukan mengizinkan tanpa auth.
   * Dua jalur lolos: Bearer CRON_SECRET atau signature QStash
   * yang valid (lib/cron-auth.js). */
  const rawBody =
    request.method === "POST" && typeof request.text === "function"
      ? await request.text()
      : "";
  const auth = authorizeCronRequest(request, { rawBody });
  if (!auth.ok) {
    if (auth.error === "unconfigured") {
      console.warn("Cron ditolak: CRON_SECRET belum dipasang.");
      /* Jejak jalur 503 awal (P-06/C2): coba tulis heartbeat
       * skipped dari env — bila SA tidak ada, watcher menyimpulkan
       * dari dokumen yang tidak ada. Jalur 401 (secret salah)
       * TIDAK menulis apa pun: permintaan tak terautentikasi tidak
       * boleh memicu tulis Firestore. */
      await tryWriteSkippedFromEnv({
        skipReason: "no-secret",
        trigger: auth.trigger || "",
        error: "CRON_SECRET belum dipasang.",
      });
      return cronUnavailable();
    }
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  /* 2. Service account wajib ada untuk menulis. */
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!saRaw) {
    console.warn("Cron ditolak: service account belum dipasang.");
    /* Tanpa SA tidak ada token untuk menulis heartbeat — watcher
     * menyimpulkan dari dokumen yang tidak ada (P-06/C2). */
    return cronUnavailable();
  }
  let sa;
  try {
    sa = JSON.parse(saRaw);
  } catch {
    console.warn("Cron ditolak: service account tidak bisa dibaca.");
    return cronUnavailable();
  }
  if (!sa.client_email || !sa.private_key || !sa.project_id) {
    console.warn("Cron ditolak: service account tidak lengkap.");
    return cronUnavailable();
  }

  const startedAt = Date.now();
  const deadline = startedAt + DEADLINE_MS;
  const today = todayWib();

  /* 3. Token service account — diambil LEBIH AWAL dari versi lama
   * (P-05): kunci idempotency butuh token, dan kunci harus
   * diambil sebelum muat data supaya pemicu duplikat ditolak
   * murah tanpa membaca 685 dokumen perusahaan. */
  let token;
  try {
    token = await getAccessToken(sa);
  } catch {
    /* Penukaran token baru saja gagal — mencoba lagi lewat jalur
     * yang sama kemungkinan besar gagal juga, jadi heartbeat
     * skipped tidak dicoba di sini; watcher menyimpulkan dari
     * dokumen yang tidak ada (P-06/C2). Kegagalan penukarannya
     * sendiri sudah dicatat SA_TOKEN_FAILED (BE2-11). */
    return NextResponse.json(
      { error: "Token service account gagal dibuat." },
      { status: 503 },
    );
  }
  const fsBase = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;

  /* 4. Pengaman jalan-ganda (P-05, C9): satu eksekusi per hari
   * untuk job recheck. Pemicu kedua menjawab 200 { duplicate:
   * true } — bukan error — supaya QStash tidak retry sia-sia dan
   * workflow Actions tidak gagal; penolakan dicatat di log
   * sebagai bukti (kriteria P-05 no. 4). */
  let lock;
  try {
    lock = await acquireCronLock({
      fsBase,
      token,
      job: "recheck",
      date: today,
      runId: randomUUID(),
      trigger: auth.trigger,
    });
  } catch (err) {
    console.warn(
      "Cron ditolak: kunci tidak bisa diambil:",
      err && err.message ? err.message : err,
    );
    /* Token tersedia: coba tulis jejak skipped (best-effort —
     * bila Firestore sedang tidak bisa ditulis, gagal diam). */
    await writeSkippedHeartbeat(fsBase, token, {
      today,
      startedAt,
      skipReason: "lock-failed",
      trigger: auth.trigger,
      error: "Kunci cron tidak bisa diambil.",
    });
    return NextResponse.json(
      { error: "Kunci cron tidak bisa diambil." },
      { status: 503 },
    );
  }
  if (!lock.acquired) {
    console.warn(
      `Cron recheck duplikat ditolak (alasan: ${lock.reason}, ` +
        `pemicu: ${auth.trigger}, tanggal: ${today}).`,
    );
    /* Duplikat tidak check-in ke Sentry: run pertama yang memegang
     * kunci yang check-in. */
    return NextResponse.json({
      duplicate: true,
      reason: lock.reason,
      job: "recheck",
      date: today,
      trigger: auth.trigger,
    });
  }

  /* Check-in Sentry "in_progress" — HANYA pemegang kunci yang
   * check-in, supaya monitor tidak mencatat run duplikat. Tanpa
   * DSN ini no-op diam (fail-safe, P-06). */
  let sentryCheckInId = null;
  sentryCheckInId = await checkInCron({
    status: "in_progress",
    includeConfig: true,
  });

  /* Ringkasan run — dibuat LEBIH AWAL dari versi lama (P-06/K4)
   * supaya cek kuota + jalur dilewati bisa mencatat error/fase
   * ke dalamnya. `queue` diisi sesudah antrean dibangun, dan
   * `snapshotKnown` diperbarui sesudah snapshot dibaca. */
  const summary = {
    checked: 0,
    changed: 0,
    updated: 0,
    skipped: 0,
    openSkipped: 0,
    /* Hasil cek "tidak diketahui" (P-04): unreachable = tidak bisa
     * dihubungi, blocked = server menolak cek otomatis, serverError
     * = 5xx strike pertama. Daftar nomornya masuk heartbeat (tanpa
     * URL/pesan error) — blockedNos untuk tinjau manual,
     * serverErrorNos untuk two-strike run besok. */
    unreachable: 0,
    blocked: 0,
    serverError: 0,
    unreachableNos: [],
    blockedNos: [],
    serverErrorNos: [],
    truncated: false,
    alerts: 0,
    alertsFailed: 0,
    telegram: "none",
    telegramMarked: 0,
    push: "none",
    pushSent: 0,
    pushFailed: 0,
    pushPruned: 0,
    pushTruncated: false,
    /* Konteks digest push (P-06/P2) — lihat buildCronRunRecord. */
    pushTotal: 0,
    pushHasMore: false,
    pushMalformed: 0,
    /* Konteks digest push (P-07): error konfigurasi VAPID, jumlah
     * halaman daftar, langganan epoch kunci lama/tanpa sidik. */
    pushConfigError: false,
    pushPages: 0,
    pushStaleKey: 0,
    pushUnknownKey: 0,
    /* Penanda pushed (P-05) + pemicu run — lihat buildCronRunRecord. */
    pushedMarked: 0,
    pushedFailed: 0,
    trigger: auth.trigger,
    alertPhaseTruncated: false,
    snapshotKnown: true,
    snapshotWritten: false,
    queue: null,
    markerBumped: false,
    heartbeatWritten: false,
    /* Observabilitas (P-06/K4): error pertama run ini (maks 300
     * karakter, dibersihkan), fase terakhir yang dicapai, durasi
     * tiap fase, menit berjalan dari seed saat run dimulai, dan
     * hasil cek kuota independen (K2). */
    error: "",
    lastPhase: "",
    phaseMs: {},
    skipReason: "",
    seedModeMinutes: getSeedModeInfo().seedModeMinutes,
    readsEstimate: 0,
    quotaPercent: 0,
    quotaAlert: "none",
  };
  /* Pelacak fase: lastPhase + durasi per fase (K4). */
  const phaseStartedAt = {};
  const startPhase = (name) => {
    summary.lastPhase = name;
    phaseStartedAt[name] = Date.now();
  };
  const endPhase = (name) => {
    if (phaseStartedAt[name]) {
      summary.phaseMs[name] = Date.now() - phaseStartedAt[name];
    }
  };

  /* Cek kuota independen (P-06/K2, BE2-06/C12): baca marker (1
   * baca) dan buat alert kuota bila melewati ambang — tanpa
   * bergantung pada refill web, yang ikut mati saat kuota habis.
   * 90% hanya membuat alert 90 (bukan 70 + 90) supaya watcher
   * tidak mengirim dua pesan Telegram. Kegagalan cek tidak
   * menggagalkan run; hasilnya dicatat di summary. */
  try {
    const marker = await firestoreGet(`${fsBase}/meta/lastChange`, token);
    recordReads("cron-recheck", 1);
    const reads = Number(marker?.fields?.readsEstimate?.integerValue) || 0;
    summary.readsEstimate = reads;
    summary.quotaPercent = quotaPercent(reads);
    if (reads >= QUOTA_ALERT_90_READS) {
      const ok = await createQuotaAlert(
        fsBase,
        token,
        quotaAlert90Id(today),
        reads,
      );
      summary.quotaAlert = ok ? "90" : "90-failed";
      if (!ok) {
        recordRunError(summary, "Alert kuota 90% gagal dibuat.");
      }
    } else if (reads >= QUOTA_ALERT_READS) {
      const ok = await createQuotaAlert(
        fsBase,
        token,
        quotaAlertId(today),
        reads,
      );
      summary.quotaAlert = ok ? "70" : "70-failed";
      if (!ok) {
        recordRunError(summary, "Alert kuota 70% gagal dibuat.");
      }
    }
  } catch (err) {
    recordRunError(
      summary,
      err && err.message
        ? `Cek kuota gagal: ${err.message}`
        : "Cek kuota gagal.",
    );
  }

  /* Cron adalah penulis: ia hanya boleh berjalan dari data LIVE.
   * Bila Firestore tidak bisa dibaca (source=seed), lewati run —
   * bertindak dari seed bisa membuat alert palsu dan tulis
   * berdasarkan data basi. Kunci dilepas dengan status failed
   * supaya pemicu cadangan bisa mengambil alih di jadwalnya. */
  let companies;
  try {
    const loaded = await getCompaniesWithSource();
    if (loaded.source !== "live") {
      await releaseCronLock({
        fsBase,
        token,
        job: "recheck",
        date: today,
        status: "failed",
        updateTime: lock.updateTime,
      });
      /* Jejak dilewati (P-06/C2) + Sentry error: run ini gagal
       * sebelum pemeriksaan dimulai — watcher + Sentry harus tahu. */
      await writeSkippedHeartbeat(fsBase, token, {
        today,
        startedAt,
        skipReason: "seed-only",
        trigger: auth.trigger,
        error: "Sumber data seed.",
      });
      await checkInCron({ status: "error", checkInId: sentryCheckInId });
      await flushSentry();
      return NextResponse.json(
        {
          error: "Data live tidak bisa dimuat, cron dilewati.",
          detail: "Firestore tidak bisa dibaca saat ini.",
        },
        { status: 503 },
      );
    }
    companies = loaded.companies;
  } catch {
    await releaseCronLock({
      fsBase,
      token,
      job: "recheck",
      date: today,
      status: "failed",
      updateTime: lock.updateTime,
    });
    await writeSkippedHeartbeat(fsBase, token, {
      today,
      startedAt,
      skipReason: "load-failed",
      trigger: auth.trigger,
      error: "Data perusahaan tidak bisa dimuat.",
    });
    await checkInCron({ status: "error", checkInId: sentryCheckInId });
    await flushSentry();
    return NextResponse.json(
      { error: "Data perusahaan tidak bisa dimuat." },
      { status: 503 },
    );
  }

  /* Antrean cek tiga tier (BE-05, lihat buildCheckQueue di
   * lib/check.js): mendesak (batas lamar dekat) dulu tiap run,
   * lalu yang ada lowongan, lalu portal mati bergilir. */
  const { queue, counts: queueCounts } = buildCheckQueue(companies, {
    todayIso: today,
  });
  summary.queue = queueCounts;

  /* Two-strike 5xx (K-11, P-04): nomor perusahaan yang 5xx di run
   * kemarin, dibaca dari dokumen cron-runs kemarin (1 baca/run).
   * Bila dokumen tidak ada atau baca gagal, dianggap tidak ada
   * strike — gagal tertutup: 5xx hari ini hanya dicatat, tidak
   * membalik status. */
  let struckYesterday = new Set();
  try {
    const prevRun = await firestoreGet(
      `${fsBase}/cron-runs/${yesterdayWib()}`,
      token,
    );
    recordReads("cron-recheck", 1);
    const values =
      prevRun?.fields?.serverErrorNos?.arrayValue?.values || [];
    struckYesterday = new Set(
      values
        .map((v) => Number(v.integerValue))
        .filter((n) => Number.isInteger(n)),
    );
  } catch {
    struckYesterday = new Set();
  }

  /* Snapshot perusahaan yang ada lowongannya run sebelumnya. Bila
   * dokumen belum ada (run pertama dengan fitur ini), snapshot ditulis
   * tanpa alert supaya perusahaan yang sudah lama ada lowongan tidak
   * langsung terkirim sebagai "baru". */
  let previousTargetNos = null;
  let snapshotKnown = true;
  try {
    const snap = await firestoreGet(`${fsBase}/meta/targets`, token);
    recordReads("cron-recheck", 1);
    if (snap && snap.fields && snap.fields.targetNos) {
      const values = snap.fields.targetNos.arrayValue?.values || [];
      previousTargetNos = values
        .map((v) => Number(v.integerValue))
        .filter((n) => Number.isInteger(n));
    }
  } catch {
    /* Baca snapshot gagal: tandai tidak diketahui supaya fase alert
     * tidak menimpa snapshot dengan data yang bisa menghilangkan
     * deteksi lowongan baru di run berikut. */
    snapshotKnown = false;
  }

  /* summary dibuat lebih awal (sesudah kunci diambil, P-06/K4);
   * snapshotKnown diperbarui di sini sesudah snapshot dibaca. */
  summary.snapshotKnown = snapshotKnown;

  /* Status tiap perusahaan, mulai dari data yang baru dimuat. Fase
   * alert di bawah membaca peta ini sebelum loop cek jalan; loop cek
   * memperbaruinya tiap ada perubahan status. */
  const statusAfter = new Map(companies.map((c) => [c.no, c.status]));

  /* 5. Fase alert jalan DULU, sebelum loop cek portal. Alasannya:
   * loop cek bisa menghabiskan seluruh anggaran 50 detik; bila fase
   * ini menunggu sesudah loop, fase ini tidak pernah jalan dan
   * snapshot meta/targets tidak pernah diperbarui (terbukti 9 Nov
   * 2026). Daftar perusahaan yang ada lowongannya di sini adalah data
   * yang baru dimuat; loop cek di bawah tidak pernah menambah
   * perusahaan baru ke daftar itu (hanya ada lowongan -> mati atau
   * mati -> belum terverifikasi), jadi perbandingan snapshot tetap
   * benar. */
  startPhase("alerts");
  const freshAlerts = [];
  /* Nomor new-target yang tulis alertnya gagal (atau belum sempat
   * dicoba karena anggaran fase alert habis): dikeluarkan dari
   * snapshot supaya run berikut mencoba lagi (NOTIF-06). */
  const failedNewTargetNos = new Set();
  try {
    const currentTargets = companies
      .filter((c) => statusAfter.get(c.no) === OPEN_STATUS)
      .map((c) => ({ ...c, status: statusAfter.get(c.no) }));
    const newTargetAlerts =
      !snapshotKnown || previousTargetNos === null
        ? []
        : collectNewTargetAlerts(previousTargetNos, currentTargets, today);
    const deadlineAlerts = collectDeadlineAlerts(currentTargets, today);
    const allAlerts = [...newTargetAlerts, ...deadlineAlerts];
    const newTargetIds = new Set(newTargetAlerts.map((a) => a.id));
    /* Tulis alert paralel per batch kecil, dibatasi anggaran fase
     * sendiri (NOTIF-15): tanpa batas ini, banyak alert baru +
     * jaringan lambat bisa memakan seluruh anggaran run sebelum
     * satu portal pun dicek. Urutan freshAlerts tetap deterministik
     * (Promise.all menjaga urutan dalam batch, batch jalan urut). */
    const alertPhaseStart = Date.now();
    let alertsFailed = 0;
    for (let j = 0; j < allAlerts.length; j += ALERT_BATCH) {
      if (Date.now() - alertPhaseStart > ALERT_BUDGET_MS) {
        summary.alertPhaseTruncated = true;
        for (const alert of allAlerts.slice(j)) {
          if (newTargetIds.has(alert.id)) {
            failedNewTargetNos.add(alert.companyNo);
          }
        }
        console.warn(
          "Fase alert kehabisan anggaran 15 detik; " +
            `${allAlerts.length - j} alert ditunda ke run berikut.`,
        );
        break;
      }
      const results = await Promise.all(
        allAlerts.slice(j, j + ALERT_BATCH).map(async (alert) => ({
          alert,
          result: await createAlert(fsBase, token, alert),
        })),
      );
      for (const { alert, result } of results) {
        if (result.status === "created") freshAlerts.push(alert);
        else if (result.status === "failed") {
          alertsFailed += 1;
          recordRunError(
            summary,
            `Tulis alert ${alert.type} gagal (${result.reason || "tidak diketahui"}).`,
          );
          if (alert.type === "new-target") {
            failedNewTargetNos.add(alert.companyNo);
          }
        }
      }
    }
    summary.alerts = freshAlerts.length;
    summary.alertsFailed = alertsFailed;

    /* Tulis snapshot baru (selalu, walau tidak ada alert baru) —
     * kecuali bila baca snapshot sebelumnya gagal, supaya deteksi
     * tidak hilang diam-diam. Nomor yang alertnya gagal dibuat
     * dikeluarkan dari snapshot (NOTIF-06). Kegagalan tulis
     * dicatat di log + ringkasan, bukan ditelan (NOTIF-07). */
    if (snapshotKnown) {
      const snapshotNos = currentTargets
        .map((c) => c.no)
        .filter((no) => !failedNewTargetNos.has(no));
      try {
        await firestoreFetch(`${fsBase}/meta/targets`, token, {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              targetNos: {
                arrayValue: {
                  values: snapshotNos.map((no) => ({
                    integerValue: String(no),
                  })),
                },
              },
              updatedAt: { stringValue: new Date().toISOString() },
            },
          }),
        });
        summary.snapshotWritten = true;
      } catch {
        console.warn(
          "Tulis snapshot meta/targets gagal; deteksi lowongan baru " +
            "bisa berulang besok.",
        );
        recordRunError(summary, "Tulis snapshot meta/targets gagal.");
      }
    }

    /* Satu pesan gabungan, hanya bila ada alert baru di run ini.
     * Pesan panjang dipecah otomatis di sendTelegramMessage. */
    if (freshAlerts.length > 0) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
      if (!botToken) {
        summary.telegram = "skipped-no-token";
        console.warn(
          "Notifikasi Telegram dilewati: env TELEGRAM_BOT_TOKEN belum dipasang.",
        );
      } else {
        const text = formatTelegramMessage(freshAlerts, today);
        const sent = await sendTelegramMessage({
          token: botToken,
          chatId: process.env.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID,
          text,
        });
        summary.telegram = sent.ok ? "sent" : "failed";
        if (!sent.ok) {
          console.warn(`Notifikasi Telegram gagal: ${sent.error}`);
          recordRunError(
            summary,
            `Notifikasi Telegram gagal: ${sent.error || "tidak diketahui"}`,
          );
        } else {
          /* NOTIF-01: kirim langsung berhasil — tandai tiap alert
           * sent=true + sentAt supaya watcher agent-side tidak
           * mengirim ulang alert yang sama. Penandaan yang gagal
           * dibiarkan sent=false: watcher akan mengirimnya, dan
           * duplikat sesekali lebih baik daripada alert hilang. */
          const sentAt = new Date().toISOString();
          const { marked, failed } = await markAlertsSent(
            async (alert) => {
              try {
                await firestoreFetch(
                  `${fsBase}/alerts/${alert.id}` +
                    `?updateMask.fieldPaths=sent&updateMask.fieldPaths=sentAt`,
                  token,
                  {
                    method: "PATCH",
                    body: JSON.stringify({
                      fields: {
                        sent: { booleanValue: true },
                        sentAt: { stringValue: sentAt },
                      },
                    }),
                  },
                );
                return true;
              } catch {
                return false;
              }
            },
            freshAlerts,
          );
          summary.telegramMarked = marked.length;
          if (failed.length > 0) {
            console.warn(
              `Penandaan terkirim gagal untuk ${failed.length} alert; ` +
                "watcher akan mengirim ulang.",
            );
          }
        }
      }

      /* Digest web push (T10): sesudah Telegram, dari freshAlerts
       * yang sama. Best-effort total — sendPushDigest tidak pernah
       * melempar, dan hasilnya hanya dicatat di ringkasan. */
      const pushResult = await sendPushDigest({
        fsBase,
        token,
        alerts: freshAlerts,
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
      /* Penanda pushed (P-05): bila digest terkirim penuh (tidak
       * terpotong anggaran), tandai alert sudah masuk digest supaya
       * endpoint digest mandiri 01:30 WIB tidak mengirim ulang.
       * Bila terpotong/gagal, penanda TIDAK ditulis — endpoint
       * digest akan mencoba lagi. "none" ikut ditandai: nol
       * langganan berarti tidak ada yang perlu dikirimi ulang
       * (P-07/P3). Best-effort: gagal menandai
       * tidak menggagalkan run (risiko terburuk: digest ganda
       * dengan tag yang sama, yang ditimpa di perangkat). */
      if (
        (pushResult.push === "sent" || pushResult.push === "none") &&
        !pushResult.pushTruncated &&
        freshAlerts.length > 0
      ) {
        const marked = await markAlertsPushed({
          fsBase,
          token,
          alertIds: freshAlerts.map((a) => a.id),
        });
        summary.pushedMarked = marked.marked;
        summary.pushedFailed = marked.failed;
      }
    }
  } catch (err) {
    /* Alert dan Telegram tidak boleh menggagalkan cron — tetapi
     * kegagalan fase ini dicatat (BE2-11): sebelumnya hanya
     * telegram="failed" tanpa pesan apa pun. */
    summary.telegram = "failed";
    recordRunError(
      summary,
      err && err.message ? `Fase alert gagal: ${err.message}` : "Fase alert gagal.",
    );
    emitObservabilityEvent({
      code: OBS_CODES.CRON_WRITE_FAILED,
      component: "cron-recheck",
      message:
        err && err.message ? err.message : "Fase alert gagal.",
      meta: { phase: "alerts" },
    });
  } finally {
    endPhase("alerts");
  }

  /* 6. Loop cek portal, tetap dibatasi anggaran 50 detik. Bila waktu
   * habis di tengah jalan, sisanya dicatat sebagai terpotong dan
   * menunggu hari berikut.
   * statusPatched menghitung PATCH status perusahaan yang BERHASIL
   * (berbeda dari summary.changed yang baru naik setelah entri
   * changes ikut tertulis): bila PATCH status berhasil tapi tulis
   * changes gagal, data tetap berubah dan marker tetap harus naik. */
  startPhase("checks");
  let statusPatched = 0;
  for (let i = 0; i < queue.length; i += BATCH) {
    if (Date.now() > deadline) {
      summary.truncated = true;
      summary.skipped += queue.length - i;
      /* openSkipped = tier mendesak/terbuka yang tidak sempat dicek:
       * sinyal utama untuk watcher (OPS-01). Tier mati yang
       * terpotong tidak dihitung — itu rotasi yang disengaja. */
      summary.openSkipped += queue
        .slice(i)
        .filter((q) => q.tier !== "dead").length;
      break;
    }
    const batch = queue.slice(i, i + BATCH);
    const checks = await Promise.all(
      batch.map(async ({ company: c }) => {
        if (!c.link_karir) return { company: c, result: null };
        /* Retry 1x untuk hasil gagal (P-04, kriteria 2) sebelum
         * keputusan apa pun diambil — lihat checkUrlWithRetry. */
        const { result } = await checkUrlWithRetry(c.link_karir, {
          timeoutMs: CHECK_TIMEOUT_MS,
        });
        return { company: c, result };
      }),
    );

    /* OPS-07: cek batas waktu lagi SEBELUM fase tulis. Batch yang
     * mulai dekat batas bisa selesai cek sesudah batas; tanpa cek
     * ini, tulis paralel (timeout 10 detik tiap tulis) memaksa run
     * melewati batas fungsi dan Vercel mematikannya di tengah
     * tulis. Hasil cek batch ini dibuang (tidak dihitung checked,
     * tanggal_cek tidak diperbarui) dan dicoba lagi besok. */
    if (Date.now() > deadline) {
      summary.truncated = true;
      summary.skipped += batch.length;
      summary.openSkipped += batch.filter((q) => q.tier !== "dead").length;
      break;
    }

    const writes = [];
    for (const { company, result } of checks) {
      if (!result) {
        summary.skipped += 1;
        continue;
      }
      const oldStatus = company.status;
      /* Keputusan dari hasil AKHIR (sesudah retry) — lihat
       * decideRecheckAction di lib/check.js (P-04/K-11). */
      const { outcome, newStatus: decided } = decideRecheckAction(
        oldStatus,
        result,
        { struckYesterday: struckYesterday.has(company.no) },
      );
      /* Status baru harus salah satu dari 4 nilai yang diakui. */
      const newStatus =
        decided && STATUS_ORDER.includes(decided) ? decided : null;
      if (newStatus) statusAfter.set(company.no, newStatus);
      const gagalCek = Number(company.gagal_cek) || 0;

      if (outcome === "unreachable") {
        /* Tidak diketahui (BE2-01): status dan tanggal cek TIDAK
         * disentuh — tanggal cek yang tertua membuat portal tetap
         * di depan antrean supaya dicek lagi besok. Hanya gagal_cek
         * naik 1 (K-10). Tidak dihitung checked: ceknya tidak
         * menghasilkan kepastian apa pun. Tulis gagal_cek
         * best-effort — gagal menulisnya tidak menambah skipped
         * (portal ini sudah dihitung skipped sekali di atas). */
        summary.skipped += 1;
        summary.unreachable += 1;
        summary.unreachableNos.push(company.no);
        writes.push(
          firestoreFetch(
            `${fsBase}/companies/${company.no}` +
              `?updateMask.fieldPaths=gagal_cek`,
            token,
            {
              method: "PATCH",
              body: JSON.stringify({
                fields: {
                  gagal_cek: { integerValue: String(gagalCek + 1) },
                },
              }),
            },
          ).catch((err) => {
            /* Tulis gagal_cek best-effort (BE2-11): kegagalan
             * dicatat throttled, tidak menambah skipped. */
            emitObservabilityEvent({
              code: OBS_CODES.CRON_WRITE_FAILED,
              component: "cron-recheck",
              message:
                err && err.message
                  ? err.message
                  : "Tulis gagal_cek gagal.",
              meta: { kind: "gagal-cek" },
            });
          }),
        );
        continue;
      }

      /* Hasil definitif (hidup/diblokir/404/5xx): portal terhitung
       * checked. Portal diblokir dan 5xx strike pertama dilewati
       * (status tidak berubah) dengan pencacah masing-masing. */
      summary.checked += 1;
      if (outcome === "blocked") {
        summary.skipped += 1;
        summary.blocked += 1;
        summary.blockedNos.push(company.no);
      } else if (outcome === "server-error" && !newStatus) {
        summary.skipped += 1;
        summary.serverError += 1;
        summary.serverErrorNos.push(company.no);
      }

      /* PATCH status + tanggal cek (+ reset gagal_cek ke 0 bila
       * sempat > 0 — cek definitif memutus rantai kegagalan):
       * satu tulis per portal, sama seperti sebelum P-04. */
      const mask = ["status", "tanggal_cek"];
      const fields = {
        status: { stringValue: newStatus || oldStatus },
        tanggal_cek: { stringValue: today },
      };
      if (gagalCek > 0) {
        mask.push("gagal_cek");
        fields.gagal_cek = { integerValue: "0" };
      }
      const patchUrl =
        `${fsBase}/companies/${company.no}?` +
        mask.map((f) => `updateMask.fieldPaths=${f}`).join("&");
      const patchBody = { fields };
      if (newStatus) {
        const changeBody = {
          fields: {
            companyNo: { integerValue: String(company.no) },
            perusahaan: { stringValue: company.perusahaan },
            from: { stringValue: oldStatus },
            to: { stringValue: newStatus },
            checkedAt: { stringValue: today },
            createdAt: { stringValue: new Date().toISOString() },
            /* Asal flip (K-10): "recheck" membedakannya dari flip
             * manusia ("admin") dan menentukan jalur pulih (D5). */
            sumber: { stringValue: "recheck" },
          },
        };
        writes.push(
          (async () => {
            await firestoreFetch(patchUrl, token, {
              method: "PATCH",
              body: JSON.stringify(patchBody),
            });
            /* Status di Firestore sudah berubah di titik ini —
             * marker wajib naik walau tulis changes di bawah gagal. */
            statusPatched += 1;
            await firestoreFetch(`${fsBase}/changes`, token, {
              method: "POST",
              body: JSON.stringify(changeBody),
            });
            summary.changed += 1;
          })().catch((err) => {
            summary.skipped += 1;
            recordRunError(
              summary,
              err && err.message
                ? `Tulis status/perubahan gagal: ${err.message}`
                : "Tulis status/perubahan gagal.",
            );
            emitObservabilityEvent({
              code: OBS_CODES.CRON_WRITE_FAILED,
              component: "cron-recheck",
              message:
                err && err.message
                  ? err.message
                  : "Tulis status/perubahan gagal.",
              meta: { kind: "status-change" },
            });
          }),
        );
      } else {
        writes.push(
          firestoreFetch(patchUrl, token, {
            method: "PATCH",
            body: JSON.stringify(patchBody),
          })
            .then(() => {
              summary.updated += 1;
            })
            .catch((err) => {
              summary.skipped += 1;
              recordRunError(
                summary,
                err && err.message
                  ? `Tulis status gagal: ${err.message}`
                  : "Tulis status gagal.",
              );
              emitObservabilityEvent({
                code: OBS_CODES.CRON_WRITE_FAILED,
                component: "cron-recheck",
                message:
                  err && err.message
                    ? err.message
                    : "Tulis status gagal.",
                meta: { kind: "status-patch" },
              });
            }),
        );
      }
    }
    await Promise.all(writes);
  }

  /* 7. Marker kesegaran: naikkan bila run ini mengubah status
   * perusahaan apa pun (statusPatched, bukan summary.changed —
   * lihat catatan di atas) ATAU memperbarui tanggal_cek perusahaan
   * (summary.updated). Tanpa keduanya, marker tidak disentuh.
   * Tanggal_cek ikut memicu bump supaya tanggal cek yang tampil
   * tidak basi: biayanya ~1 refill/hari/instance (±610 baca),
   * jauh di bawah kuota, dan metering FIN-02 menjaganya. */
  endPhase("checks");
  startPhase("writes");
  if (statusPatched > 0 || summary.updated > 0) {
    summary.markerBumped = await bumpMarker(fsBase, token, today);
    if (!summary.markerBumped) {
      recordRunError(summary, "Naikkan marker gagal.");
    }
  }
  endPhase("writes");

  /* 8. Heartbeat (OPS-01): catat ringkasan run ini ke
   * cron-runs/{tanggal} supaya watcher bisa mendeteksi run yang
   * hilang atau terpotong. Best-effort: gagal menulis hanya
   * dicatat di ringkasan — watcher akan menganggap run ini tidak
   * tercatat dan memberitahu owner. */
  startPhase("heartbeat");
  const finishedAt = Date.now();
  summary.heartbeatWritten = await writeCronRunRecord(
    fsBase,
    token,
    today,
    buildCronRunRecord(summary, {
      date: today,
      startedAt,
      finishedAt,
    }),
  );
  endPhase("heartbeat");
  if (!summary.heartbeatWritten) {
    console.warn(
      "Heartbeat cron gagal ditulis: dokumen cron-runs tidak tercatat.",
    );
    recordRunError(summary, "Heartbeat cron gagal ditulis.");
    emitObservabilityEvent({
      code: OBS_CODES.CRON_WRITE_FAILED,
      component: "cron-recheck",
      message: "Heartbeat cron gagal ditulis.",
      meta: { phase: "heartbeat" },
    });
  }

  /* Lepas kunci idempotency (P-05): run selesai, status done.
   * Best-effort — releaseCronLock tidak pernah melempar. */
  await releaseCronLock({
    fsBase,
    token,
    job: "recheck",
    date: today,
    status: "done",
    updateTime: lock.updateTime,
  });

  /* Observabilitas akhir run (P-06): catat ringkasan untuk
   * /api/health (0 baca), check-in Sentry "ok" (run selesai —
   * termasuk bila terpotong anggaran, karena itu hasil normal,
   * bukan kegagalan), lalu flush meter baca + antrean Sentry
   * sebelum fungsi serverless dibekukan. */
  noteCronRun({
    date: today,
    status: summary.truncated ? "truncated" : "ok",
    trigger: auth.trigger,
    finishedAt: new Date(finishedAt).toISOString(),
  });
  await checkInCron({ status: "ok", checkInId: sentryCheckInId });
  await flushReadMeters();
  await flushSentry();

  return NextResponse.json(summary);
}
