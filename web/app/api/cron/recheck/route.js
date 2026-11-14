/* GET /api/cron/recheck — cek ulang harian portal Karir.
 * Dijalankan Vercel Cron tiap hari 18:00 UTC (01:00 WIB), lihat vercel.json.
 *
 * Cara kerja:
 * 1. Keamanan: env CRON_SECRET wajib terisi dan request wajib membawa
 *    header Authorization: Bearer <CRON_SECRET> (Vercel Cron mengirimnya
 *    sendiri bila variabel itu dipasang). Bila CRON_SECRET kosong, rute
 *    menjawab 503 dan tidak pernah berjalan tanpa autentikasi.
 *    Perbandingan secret memakai timingSafeEqual.
 * 2. Tulis ke Firestore lewat REST API memakai access token dari service
 *    account (env FIREBASE_SERVICE_ACCOUNT, string JSON). Token dibuat
 *    dari JWT RS256 yang ditandatangani node:crypto, tanpa dependensi
 *    baru. Bila env itu tidak ada, rute menjawab 503 dan tidak gagal total.
 * 3. Anggaran waktu 50 detik (batas fungsi Vercel Hobby sekitar 60 detik,
 *    dinyatakan eksplisit lewat maxDuration = 60). Bila waktu habis di
 *    tengah jalan, sisanya dicatat sebagai terpotong. Batas waktu juga
 *    dicek sebelum fase tulis tiap batch, supaya batch yang mulai
 *    dekat batas tidak memaksa tulis melewati batas fungsi (OPS-07).
 * 4. Fase alert jalan DULU, sebelum loop cek portal (lihat butir
 *    Notifikasi di bawah). Alasannya: loop cek bisa menghabiskan
 *    seluruh anggaran, dan bila fase alert menunggu giliran sesudah
 *    loop, fase itu tidak pernah jalan (terbukti 9 Nov 2026: run
 *    56,8 detik, alert + snapshot dilewati utuh). Fase alert sendiri
 *    dibatasi anggaran 15 detik dan menulis alert paralel batch 5,
 *    supaya tidak memakan jatah loop cek (NOTIF-15).
 * 5. Tiap portal dicek paralel batch 8 lewat lib/check.js. Cek ini hanya
 *    menguji portal bisa dibuka atau tidak, BUKAN isi lowongannya. Karena
 *    itu pemetaan statusnya hati-hati:
 *    - ada lowongan + portal mati -> "Portal tidak bisa dibuka" + catat perubahan
 *    - ada lowongan + portal hidup -> tanggal cek diperbarui, tanpa perubahan
 *    - portal yang tadinya mati + sekarang hidup -> "Tidak dapat
 *      diverifikasi" + catat perubahan (lowongannya sendiri belum dicek
 *      ulang manusia, jadi tidak boleh langsung kembali jadi ada lowongan)
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
 * truncated, alerts, alertsFailed, telegram, telegramMarked,
 * alertPhaseTruncated, snapshotKnown, snapshotWritten, queue,
 * markerBumped, heartbeatWritten}. alerts = alert baru yang dibuat
 * di run ini; telegram = "sent" | "failed" | "skipped-no-token" |
 * "none"; telegramMarked = alert yang berhasil ditandai terkirim
 * sesudah kirim langsung (NOTIF-01); openSkipped = perusahaan tier
 * mendesak/terbuka yang tidak sempat dicek karena terpotong;
 * queue = {urgent, open, dead, total}; markerBumped = true bila
 * marker kesegaran dinaikkan di run ini; heartbeatWritten = true
 * bila dokumen cron-runs tercatat (OPS-01).
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
 *   dan ringkasan, bukan ditelan diam-diam (NOTIF-07). */
import { NextResponse } from "next/server";
import { createSign, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/require-env";
import { jsonWithTimeout } from "@/lib/companies";
import { getCompaniesWithSource, STATUS_ORDER } from "@/lib/companies";
import { buildCheckQueue, checkUrl } from "@/lib/check";
import {
  OPEN_STATUS,
  DEFAULT_CHAT_ID,
  collectNewTargetAlerts,
  collectDeadlineAlerts,
  formatTelegramMessage,
  sendTelegramMessage,
  markAlertsSent,
  buildCronRunRecord,
} from "@/lib/notify";

export const dynamic = "force-dynamic";
/* Batas durasi fungsi di Vercel (paket Hobby: maks 60 detik).
 * Dinyatakan eksplisit supaya anggaran internal 50 detik selalu
 * punya margin 10 detik untuk tulis heartbeat + balasan (OPS-07). */
export const maxDuration = 60;

const DEADLINE_MS = 50_000;
const BATCH = 8;
/* Anggaran fase alert, dihitung sejak fase itu mulai (bukan sejak
 * run mulai, karena muat data + tukar token bisa lambat sendiri).
 * Alert ditulis paralel per batch kecil supaya fase ini tidak
 * memakan jatah loop cek (NOTIF-15). */
const ALERT_BUDGET_MS = 15_000;
const ALERT_BATCH = 5;
const OPEN_STATUSES = ["Ada lowongan"];
const DEAD_STATUS = "Portal tidak bisa dibuka";
const UNVERIFIED_STATUS = "Tidak dapat diverifikasi";
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

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

/* Tukar service account menjadi access token Firestore. */
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(sa.private_key, "base64url");
  const jwt = `${header}.${payload}.${signature}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }).toString(),
    });
    if (!res.ok) {
      throw new Error(`Token tukar gagal: HTTP ${res.status}`);
    }
    const body = await res.json();
    if (!body.access_token) throw new Error("Token tidak ada di balasan.");
    return body.access_token;
  } finally {
    clearTimeout(timer);
  }
}

async function firestoreFetch(url, token, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Firestore tulis gagal: HTTP ${res.status}`);
    }
    /* res.json() di sini WAJIB bertimeout (BE-09): return langsung
     * mematikan timer AbortController di finally sebelum body
     * dibaca, jadi tanpa jsonWithTimeout panggilan ini bisa
     * menggantung selamanya saat body stall. */
    return jsonWithTimeout(res, 10_000).catch(() => ({}));
  } finally {
    clearTimeout(timer);
  }
}

/* Baca satu dokumen Firestore. Kembalikan null bila dokumen belum ada
 * (HTTP 404); lempar untuk kegagalan lain. */
async function firestoreGet(url, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Firestore baca gagal: HTTP ${res.status}`);
    }
    /* Lihat catatan di firestoreFetch: res.json() tanpa timeout
     * bisa menggantung selamanya karena timer sudah dimatikan. */
    return jsonWithTimeout(res, 10_000);
  } finally {
    clearTimeout(timer);
  }
}

/* Buat satu dokumen alert dengan id deterministik. Kembalikan "created"
 * bila baru dibuat, "exists" bila id sudah ada (bukan error: id yang
 * sama berarti kejadian yang sama di run sebelumnya), dan "failed" bila
 * tulisnya gagal. */
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
    if (res.status === 409) return "exists";
    if (!res.ok) return "failed";
    return "created";
  } catch {
    return "failed";
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

/* Perbandingan string timing-safe: panjang beda langsung gagal, isi
 * dibandingkan tanpa bocor lewat waktu. */
function secretsEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
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

export async function GET(request) {
  /* 1. Keamanan cron: fail-closed. Tanpa CRON_SECRET, rute tidak
   * pernah berjalan — menjawab 503, bukan mengizinkan tanpa auth. */
  let secret;
  try {
    secret = requireEnv("CRON_SECRET");
  } catch {
    console.warn("Cron ditolak: CRON_SECRET belum dipasang.");
    return cronUnavailable();
  }
  const auth = request.headers.get("authorization") || "";
  if (!secretsEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  /* 2. Service account wajib ada untuk menulis. */
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!saRaw) {
    console.warn("Cron ditolak: service account belum dipasang.");
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

  /* Cron adalah penulis: ia hanya boleh berjalan dari data LIVE.
   * Bila Firestore tidak bisa dibaca (source=seed), lewati run —
   * bertindak dari seed bisa membuat alert palsu dan tulis
   * berdasarkan data basi. */
  let companies;
  try {
    const loaded = await getCompaniesWithSource();
    if (loaded.source !== "live") {
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

  let token;
  try {
    token = await getAccessToken(sa);
  } catch {
    return NextResponse.json(
      { error: "Token service account gagal dibuat." },
      { status: 503 },
    );
  }
  const fsBase = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;

  /* Snapshot perusahaan yang ada lowongannya run sebelumnya. Bila
   * dokumen belum ada (run pertama dengan fitur ini), snapshot ditulis
   * tanpa alert supaya perusahaan yang sudah lama ada lowongan tidak
   * langsung terkirim sebagai "baru". */
  let previousTargetNos = null;
  let snapshotKnown = true;
  try {
    const snap = await firestoreGet(`${fsBase}/meta/targets`, token);
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

  const summary = {
    checked: 0,
    changed: 0,
    updated: 0,
    skipped: 0,
    openSkipped: 0,
    truncated: false,
    alerts: 0,
    alertsFailed: 0,
    telegram: "none",
    telegramMarked: 0,
    alertPhaseTruncated: false,
    snapshotKnown,
    snapshotWritten: false,
    queue: queueCounts,
    markerBumped: false,
    heartbeatWritten: false,
  };

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
        if (result === "created") freshAlerts.push(alert);
        else if (result === "failed") {
          alertsFailed += 1;
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
    }
  } catch {
    /* Alert dan Telegram tidak boleh menggagalkan cron. */
    summary.telegram = "failed";
  }

  /* 6. Loop cek portal, tetap dibatasi anggaran 50 detik. Bila waktu
   * habis di tengah jalan, sisanya dicatat sebagai terpotong dan
   * menunggu hari berikut.
   * statusPatched menghitung PATCH status perusahaan yang BERHASIL
   * (berbeda dari summary.changed yang baru naik setelah entri
   * changes ikut tertulis): bila PATCH status berhasil tapi tulis
   * changes gagal, data tetap berubah dan marker tetap harus naik. */
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
        const result = await checkUrl(c.link_karir);
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
      summary.checked += 1;
      const oldStatus = company.status;
      let newStatus = null;
      if (!result.ok && OPEN_STATUSES.includes(oldStatus)) {
        newStatus = DEAD_STATUS;
      } else if (result.ok && oldStatus === DEAD_STATUS) {
        newStatus = UNVERIFIED_STATUS;
      }
      /* Status baru harus salah satu dari 4 nilai yang diakui. */
      if (newStatus && !STATUS_ORDER.includes(newStatus)) newStatus = null;
      if (newStatus) statusAfter.set(company.no, newStatus);

      const patchUrl =
        `${fsBase}/companies/${company.no}` +
        `?updateMask.fieldPaths=status&updateMask.fieldPaths=tanggal_cek`;
      const patchBody = {
        fields: {
          status: { stringValue: newStatus || oldStatus },
          tanggal_cek: { stringValue: today },
        },
      };
      if (newStatus) {
        const changeBody = {
          fields: {
            companyNo: { integerValue: String(company.no) },
            perusahaan: { stringValue: company.perusahaan },
            from: { stringValue: oldStatus },
            to: { stringValue: newStatus },
            checkedAt: { stringValue: today },
            createdAt: { stringValue: new Date().toISOString() },
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
          })().catch(() => {
            summary.skipped += 1;
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
            .catch(() => {
              summary.skipped += 1;
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
  if (statusPatched > 0 || summary.updated > 0) {
    summary.markerBumped = await bumpMarker(fsBase, token, today);
  }

  /* 8. Heartbeat (OPS-01): catat ringkasan run ini ke
   * cron-runs/{tanggal} supaya watcher bisa mendeteksi run yang
   * hilang atau terpotong. Best-effort: gagal menulis hanya
   * dicatat di ringkasan — watcher akan menganggap run ini tidak
   * tercatat dan memberitahu owner. */
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
  if (!summary.heartbeatWritten) {
    console.warn(
      "Heartbeat cron gagal ditulis: dokumen cron-runs tidak tercatat.",
    );
  }

  return NextResponse.json(summary);
}
