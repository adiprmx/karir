/* Helper notifikasi lowongan baru Karir.
 * Dipakai cron cek ulang harian (app/api/cron/recheck/route.js) dan
 * watcher agent-side (notify_watch.py membaca dokumen alerts yang
 * ditulis cron). Murni fungsi tanpa dependensi Next, supaya bisa
 * diuji langsung dengan node --test (lihat lib/notify.test.js).
 *
 * Aturan yang dijaga di sini:
 * - Id alert deterministik (new-target-{no}-{tanggal} dan
 *   deadline-{no}-{batas_lamar}) supaya satu kejadian tidak pernah
 *   tercatat dua kali, dan tidak ada spam harian untuk alert yang sama.
 * - Satu run cron mengirim paling banyak satu pesan Telegram gabungan,
 *   hanya bila ada alert baru di run itu.
 * - Tanggal batas lamar hanya dari catatan yang sudah ada, tidak pernah
 *   dikarang. Parser di bawah menolak tanggal yang tidak bisa diparse
 *   tanpa ragu (bulan tidak dikenal, tanggal kalender tidak valid).
 * - Token Telegram tidak pernah dicetak atau ditulis ke log di mana pun;
 *   fungsi kirim hanya menerima token sebagai argumen. */

export const NEW_WINDOW_MS = 48 * 60 * 60 * 1000;
export const DEADLINE_WINDOW_DAYS = 3;
export const OPEN_STATUS = "Ada lowongan";
export const DEFAULT_CHAT_ID = "2028330429";

const BULAN = {
  jan: 0,
  januari: 0,
  feb: 1,
  februari: 1,
  mar: 2,
  maret: 2,
  apr: 3,
  april: 3,
  mei: 4,
  jun: 5,
  juni: 5,
  jul: 6,
  juli: 6,
  agu: 7,
  agustus: 7,
  sep: 8,
  september: 8,
  okt: 9,
  oktober: 9,
  nov: 10,
  november: 10,
  des: 11,
  desember: 11,
};
const BULAN_SINGKAT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function validDate(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return false;
  }
  if (m < 0 || m > 11 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m && dt.getUTCDate() === d
  );
}

function toIso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* Parse tanggal batas lamar dari teks catatan ke "YYYY-MM-DD".
 * Format yang diterima: ISO (2026-11-10), "10 November 2026" /
 * "31 Des 2026" (nama bulan Indonesia, singkat atau penuh), dan
 * "06/11/2026" (hari/bulan/tahun). Selain itu, atau bila tanggalnya
 * tidak ada di kalender (mis. 31 Feb), kembalikan null. */
export function parseBatasLamar(text) {
  if (typeof text !== "string") return null;
  const s = text.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    return validDate(y, mo, d) ? s : null;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const y = Number(m[3]);
    return validDate(y, mo, d) ? toIso(y, mo, d) : null;
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = BULAN[m[2].toLowerCase()];
    const y = Number(m[3]);
    if (mo === undefined) return null;
    return validDate(y, mo, d) ? toIso(y, mo, d) : null;
  }
  return null;
}

/* "2026-11-10" -> "10 Nov 2026". Bila bukan ISO valid, kembalikan apa adanya. */
export function formatTanggalId(iso) {
  if (typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (!validDate(y, mo, d)) return iso;
  return `${d} ${BULAN_SINGKAT[mo]} ${y}`;
}

/* Tanggal hari ini (WIB) sebagai "YYYY-MM-DD". */
export function todayWib(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

/* Selisih hari dari todayIso ke iso ("2026-11-10" minus "2026-11-08" = 2).
 * Negatif bila tanggal sudah lewat; null bila salah satu bukan ISO valid. */
export function daysUntil(iso, todayIso) {
  const a = Date.parse(`${todayIso}T00:00:00Z`);
  const b = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/* "Baru" bila createdAt ISO masih dalam 48 jam terakhir. Sumber kebenaran
 * adalah createdAt di koleksi changes. Entri tanpa createdAt yang bisa
 * diparse bukan entri baru. */
export function isNewChange(createdAt, nowMs = Date.now()) {
  if (typeof createdAt !== "string" || !createdAt) return false;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  const age = nowMs - t;
  return age >= 0 && age <= NEW_WINDOW_MS;
}

export function newTargetAlertId(no, todayIso) {
  return `new-target-${Number(no)}-${todayIso}`;
}

export function deadlineAlertId(no, batasLamar) {
  return `deadline-${Number(no)}-${batasLamar}`;
}

/* Lowongan baru: nomor yang ada di daftar perusahaan yang sedang ada
 * lowongan sekarang tapi belum ada di snapshot run sebelumnya. Urutan
 * naik nomor supaya pesan dan penulisan deterministik. */
export function collectNewTargetAlerts(previousNos, currentTargets, todayIso) {
  const prev = new Set((previousNos || []).map((n) => Number(n)));
  return (currentTargets || [])
    .filter((c) => !prev.has(Number(c.no)))
    .sort((a, b) => Number(a.no) - Number(b.no))
    .map((c) => ({
      id: newTargetAlertId(c.no, todayIso),
      type: "new-target",
      companyNo: Number(c.no),
      perusahaan: c.perusahaan || "",
      posisi: c.posisi || "",
      link: c.link_karir || "",
      createdAt: todayIso,
    }));
}

/* Peringatan batas lamar: perusahaan yang ada lowongannya dan
 * batas_lamar-nya 0-3 hari ke depan (hari ini sampai 3 hari lagi).
 * Yang sudah lewat atau lebih dari 3 hari lagi tidak masuk. */
export function collectDeadlineAlerts(targets, todayIso) {
  return (targets || [])
    .filter((c) => typeof c.batas_lamar === "string" && c.batas_lamar)
    .map((c) => ({
      company: c,
      daysLeft: daysUntil(c.batas_lamar, todayIso),
    }))
    .filter(
      (x) =>
        x.daysLeft !== null &&
        x.daysLeft >= 0 &&
        x.daysLeft <= DEADLINE_WINDOW_DAYS,
    )
    .sort((a, b) => Number(a.company.no) - Number(b.company.no))
    .map(({ company: c, daysLeft }) => ({
      id: deadlineAlertId(c.no, c.batas_lamar),
      type: "deadline",
      companyNo: Number(c.no),
      perusahaan: c.perusahaan || "",
      posisi: c.posisi || "",
      link: c.link_karir || "",
      batasLamar: c.batas_lamar,
      daysLeft,
      createdAt: todayIso,
    }));
}

function shortPosisi(posisi, max = 140) {
  const s = (posisi || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

/* Satu pesan gabungan untuk semua alert baru di satu run. Bahasa
 * Indonesia, ringkas: nama perusahaan, posisi, status/batas, tautan.
 * Daftar kosong menghasilkan string kosong (pemanggil tidak mengirim). */
export function formatTelegramMessage(alerts, todayIso) {
  const list = alerts || [];
  if (list.length === 0) return "";
  const lines = [`Lowongan baru di Karir (${formatTanggalId(todayIso)}):`];
  for (const a of list) {
    const posisi = shortPosisi(a.posisi);
    const head = posisi ? `${a.perusahaan} (${posisi})` : a.perusahaan;
    if (a.type === "deadline") {
      const kapan =
        a.daysLeft === 0
          ? "hari ini"
          : `${a.daysLeft} hari lagi`;
      lines.push(
        `• ${head} — batas lamar ${formatTanggalId(a.batasLamar)} (${kapan}).`,
      );
    } else {
      lines.push(`• ${head} — lowongan baru.`);
    }
    if (a.link) lines.push(`  ${a.link}`);
  }
  lines.push("Lihat daftar lengkap di https://karir-adiprmx.vercel.app/");
  return lines.join("\n");
}

/* Kirim satu pesan ke Telegram Bot API. Timeout 10 detik. Tidak pernah
 * melempar: setiap kegagalan (timeout, HTTP bukan 200, jawaban bukan
 * JSON ok) dikembalikan sebagai {ok:false, error} supaya pemanggil
 * (cron) tetap bisa lanjut dan membalas sukses. Token hanya dipakai
 * di URL request, tidak pernah dicetak. */
export async function sendTelegramMessage({
  token,
  chatId = DEFAULT_CHAT_ID,
  text,
  fetchImpl = fetch,
  timeoutMs = 10_000,
}) {
  if (!token || !text) return { ok: false, error: "token atau teks kosong" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: String(chatId), text }),
      },
    );
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = await res.json().catch(() => null);
    if (!body || body.ok !== true) {
      return { ok: false, error: "jawaban Telegram tidak ok" };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err && err.name === "AbortError" ? "timeout" : "gagal terhubung",
    };
  } finally {
    clearTimeout(timer);
  }
}
