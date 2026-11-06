/* GET /api/cron/recheck — cek ulang harian 22 portal target Karir.
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
 * 4. Tiap portal dicek paralel batch 5 lewat lib/check.js. Cek ini hanya
 *    menguji portal bisa dibuka atau tidak, BUKAN isi lowongannya. Karena
 *    itu pemetaan statusnya hati-hati:
 *    - target + portal mati -> "Portal tidak bisa dibuka" + catat perubahan
 *    - target + portal hidup -> tanggal cek diperbarui, tanpa perubahan
 *    - portal yang tadinya mati + sekarang hidup -> "Tidak dapat
 *      diverifikasi" + catat perubahan (lowongannya sendiri belum dicek
 *      ulang manusia, jadi tidak boleh langsung kembali jadi target)
 *    Setelah 22 target selesai, bila waktu masih ada, giliran portal yang
 *    sedang berstatus "Portal tidak bisa dibuka" dicek juga supaya ada
 *    jalan pulih; sisanya menunggu hari berikut bila waktu habis.
 *
 * Balasan: {checked, changed, updated, skipped, truncated}.
 * checked = portal yang sempat dicek; changed = status yang berbalik
 * (sekaligus tercatat di koleksi changes); updated = tanggal cek saja
 * yang diperbarui; skipped = tidak sempat dicek atau tidak punya tautan. */
import { NextResponse } from "next/server";
import { createSign } from "node:crypto";
import { getCompanies, STATUS_ORDER } from "@/lib/companies";
import { checkUrl } from "@/lib/check";

export const dynamic = "force-dynamic";

const DEADLINE_MS = 50_000;
const BATCH = 5;
const TARGET_STATUSES = [
  "Ada lowongan target",
  "Ada lowongan target (tidak cocok)",
];
const DEAD_STATUS = "Portal tidak bisa dibuka";
const UNVERIFIED_STATUS = "Tidak dapat diverifikasi";

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

  /* 22 target dulu, lalu portal yang sedang mati (jalan pulih). */
  const targets = companies.filter((c) =>
    TARGET_STATUSES.includes(c.status),
  );
  const dead = companies.filter(
    (c) => c.status === DEAD_STATUS && c.link_karir,
  );
  const queue = [...targets, ...dead];

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

  const summary = {
    checked: 0,
    changed: 0,
    updated: 0,
    skipped: 0,
    truncated: false,
  };

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
      if (!result.ok && TARGET_STATUSES.includes(oldStatus)) {
        newStatus = DEAD_STATUS;
      } else if (result.ok && oldStatus === DEAD_STATUS) {
        newStatus = UNVERIFIED_STATUS;
      }
      /* Status baru harus salah satu dari 6 nilai yang diakui. */
      if (newStatus && !STATUS_ORDER.includes(newStatus)) newStatus = null;

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
