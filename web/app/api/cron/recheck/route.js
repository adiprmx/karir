/* GET /api/cron/recheck — cek ulang harian portal Karir.
 * Dijalankan Vercel Cron tiap hari 18:00 UTC (01:00 WIB), lihat vercel.json.
 *
 * Cara kerja:
 * 1. Keamanan: bila env CRON_SECRET terisi, request wajib membawa header
 *    Authorization: Bearer <CRON_SECRET> (Vercel Cron mengirimnya sendiri
 *    bila variabel itu dipasang). Bila CRON_SECRET kosong, diizinkan —
 *    hanya untuk dev lokal.
 * 2. Tulis ke Firestore lewat REST API memakai access token dari service
 *    account (env FIREBASE_SERVICE_ACCOUNT, string JSON). Token dibuat
 *    dari JWT RS256 yang ditandatangani node:crypto, tanpa dependensi
 *    baru. Bila env itu tidak ada, rute menjawab 503 dan tidak gagal total.
 * 3. Anggaran waktu 50 detik (batas fungsi Vercel Hobby sekitar 60 detik).
 *    Bila waktu habis di tengah jalan, sisanya dicatat sebagai terpotong.
 * 4. Fase alert jalan DULU, sebelum loop cek portal (lihat butir
 *    Notifikasi di bawah). Alasannya: loop cek bisa menghabiskan
 *    seluruh anggaran, dan bila fase alert menunggu giliran sesudah
 *    loop, fase itu tidak pernah jalan (terbukti 9 Nov 2026: run
 *    56,8 detik, alert + snapshot dilewati utuh).
 * 5. Tiap portal dicek paralel batch 5 lewat lib/check.js. Cek ini hanya
 *    menguji portal bisa dibuka atau tidak, BUKAN isi lowongannya. Karena
 *    itu pemetaan statusnya hati-hati:
 *    - ada lowongan + portal mati -> "Portal tidak bisa dibuka" + catat perubahan
 *    - ada lowongan + portal hidup -> tanggal cek diperbarui, tanpa perubahan
 *    - portal yang tadinya mati + sekarang hidup -> "Tidak dapat
 *      diverifikasi" + catat perubahan (lowongannya sendiri belum dicek
 *      ulang manusia, jadi tidak boleh langsung kembali jadi ada lowongan)
 *    Antrean diurutkan dari yang paling lama tidak dicek, supaya cek
 *    harian berputar ke seluruh daftar: perusahaan yang baru dicek
 *    (tanggal cek diperbarui tiap run) otomatis pindah ke belakang.
 *    Tanpa urutan ini, run yang terpotong anggaran akan selalu mengecek
 *    perusahaan yang sama dan sisanya tidak pernah terjangkau.
 *    Perusahaan tanpa tautan karir tidak masuk antrean (tidak ada yang
 *    bisa dicek lewat URL) dan tidak menyumbat antrean.
 *
 * Balasan: {checked, changed, updated, skipped, truncated, alerts,
 * telegram}. alerts = alert baru yang dibuat di run ini; telegram =
 * "sent" | "failed" | "skipped-no-token" | "none".
 *
 * Notifikasi (lihat lib/notify.js):
 * - Sebelum loop cek, daftar perusahaan yang ada lowongannya dibandingkan
 *   dengan snapshot meta/targets run sebelumnya. Nomor yang baru muncul =
 *   lowongan baru -> alert new-target-{no}-{tanggal}.
 * - Perusahaan yang ada lowongannya dan batas_lamar-nya 0-3 hari lagi ->
 *   alert deadline-{no}-{batas_lamar}.
 * - Alert ditulis ke koleksi alerts dengan id deterministik (jadi
 *   idempotent), lalu paling banyak satu pesan Telegram gabungan
 *   dikirim bila ada alert baru. Kegagalan Telegram tidak pernah
 *   menggagalkan cron. Bila env TELEGRAM_BOT_TOKEN belum dipasang,
 *   pengiriman dilewati dan alert tetap tercatat untuk watcher
 *   agent-side (notify_watch.py). */
import { NextResponse } from "next/server";
import { createSign } from "node:crypto";
import { getCompanies, STATUS_ORDER } from "@/lib/companies";
import { checkUrl } from "@/lib/check";
import {
  OPEN_STATUS,
  DEFAULT_CHAT_ID,
  collectNewTargetAlerts,
  collectDeadlineAlerts,
  formatTelegramMessage,
  sendTelegramMessage,
} from "@/lib/notify";

export const dynamic = "force-dynamic";

const DEADLINE_MS = 50_000;
const BATCH = 5;
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
    return res.json().catch(() => ({}));
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
    return res.json();
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

export async function GET(request) {
  /* 1. Keamanan cron. */
  const secret = process.env.CRON_SECRET || "";
  if (secret) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
    }
  }

  /* 2. Service account wajib ada untuk menulis. */
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!saRaw) {
    return NextResponse.json(
      {
        error: "cron belum diaktifkan",
        detail: "service account belum dipasang",
      },
      { status: 503 },
    );
  }
  let sa;
  try {
    sa = JSON.parse(saRaw);
  } catch {
    return NextResponse.json(
      {
        error: "cron belum diaktifkan",
        detail: "service account tidak bisa dibaca",
      },
      { status: 503 },
    );
  }
  if (!sa.client_email || !sa.private_key || !sa.project_id) {
    return NextResponse.json(
      {
        error: "cron belum diaktifkan",
        detail: "service account tidak lengkap",
      },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  const deadline = startedAt + DEADLINE_MS;
  const today = todayWib();

  let companies;
  try {
    companies = await getCompanies();
  } catch {
    return NextResponse.json(
      { error: "Data perusahaan tidak bisa dimuat." },
      { status: 503 },
    );
  }

  /* Perusahaan yang ada lowongannya dulu, lalu portal yang sedang mati
   * (jalan pulih), diurutkan dari yang paling lama tidak dicek supaya
   * cek harian berputar ke seluruh daftar. Tanpa tautan karir tidak
   * masuk antrean: tidak ada URL yang bisa dicek. */
  const open = companies.filter(
    (c) => OPEN_STATUSES.includes(c.status) && c.link_karir,
  );
  const dead = companies.filter(
    (c) => c.status === DEAD_STATUS && c.link_karir,
  );
  const queue = [...open, ...dead].sort((a, b) =>
    (a.tanggal_cek || "").localeCompare(b.tanggal_cek || ""),
  );

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
    truncated: false,
    alerts: 0,
    telegram: "none",
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
  try {
    const currentTargets = companies
      .filter((c) => statusAfter.get(c.no) === OPEN_STATUS)
      .map((c) => ({ ...c, status: statusAfter.get(c.no) }));
    const newTargetAlerts =
      !snapshotKnown || previousTargetNos === null
        ? []
        : collectNewTargetAlerts(previousTargetNos, currentTargets, today);
    const deadlineAlerts = collectDeadlineAlerts(currentTargets, today);
    for (const alert of [...newTargetAlerts, ...deadlineAlerts]) {
      const result = await createAlert(fsBase, token, alert);
      if (result === "created") freshAlerts.push(alert);
    }
    summary.alerts = freshAlerts.length;

    /* Tulis snapshot baru (selalu, walau tidak ada alert baru) —
     * kecuali bila baca snapshot sebelumnya gagal, supaya deteksi
     * tidak hilang diam-diam. */
    if (snapshotKnown) {
      await firestoreFetch(`${fsBase}/meta/targets`, token, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            targetNos: {
              arrayValue: {
                values: currentTargets.map((c) => ({
                  integerValue: String(c.no),
                })),
              },
            },
            updatedAt: { stringValue: new Date().toISOString() },
          },
        }),
      }).catch(() => {});
    }

    /* Satu pesan gabungan, hanya bila ada alert baru di run ini. */
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
        }
      }
    }
  } catch {
    /* Alert dan Telegram tidak boleh menggagalkan cron. */
    summary.telegram = "failed";
  }

  /* 6. Loop cek portal, tetap dibatasi anggaran 50 detik. Bila waktu
   * habis di tengah jalan, sisanya dicatat sebagai terpotong dan
   * menunggu hari berikut. */
  for (let i = 0; i < queue.length; i += BATCH) {
    if (Date.now() > deadline) {
      summary.truncated = true;
      summary.skipped += queue.length - i;
      break;
    }
    const batch = queue.slice(i, i + BATCH);
    const checks = await Promise.all(
      batch.map(async (c) => {
        if (!c.link_karir) return { company: c, result: null };
        const result = await checkUrl(c.link_karir);
        return { company: c, result };
      }),
    );

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

  return NextResponse.json(summary);
}
