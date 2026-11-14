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
 *   hanya bila ada alert baru di run itu. Pesan di atas 4096 karakter
 *   dipecah jadi beberapa potongan (Bot API menolak pesan panjang utuh).
 * - Setelah kirim langsung berhasil, cron menandai tiap alert sent=true
 *   (markAlertsSent) supaya watcher tidak mengirim ulang (NOTIF-01).
 * - Tiap run cron menulis dokumen heartbeat ke koleksi cron-runs
 *   (buildCronRunRecord) supaya watcher bisa mendeteksi run yang
 *   hilang atau terpotong (OPS-01).
 * - Tanggal batas lamar hanya dari catatan yang sudah ada, tidak pernah
 *   dikarang. Parser di bawah menolak tanggal yang tidak bisa diparse
 *   tanpa ragu (bulan tidak dikenal, tanggal kalender tidak valid).
 * - Token Telegram tidak pernah dicetak atau ditulis ke log di mana pun;
 *   fungsi kirim hanya menerima token sebagai argumen. */

export const NEW_WINDOW_MS = 48 * 60 * 60 * 1000;
export const DEADLINE_WINDOW_DAYS = 3;
export const OPEN_STATUS = "Ada lowongan";
export const DEFAULT_CHAT_ID = "2028330429";

/* Kuota baca harian Firestore paket Spark (50.000 baca/hari, reset
 * tengah malam Pasifik / 15:00 WIB). Lapisan data (lib/companies.js)
 * menghitung sendiri pemakaian lewat pencacah di dokumen
 * meta/lastChange: tiap refill daftar penuh menaikkan refillsToday
 * dan readsEstimate. Begitu estimasi mencapai 70% kuota, satu alert
 * `quota` dibuat di koleksi alerts (id deterministik per hari, jadi
 * hanya satu per hari) supaya watcher agent-side bisa meneruskannya.
 * Insiden 15 Nov 2026: kuota habis 00:15 WIB dan semua baca 429 —
 * alert ini peringatan dini sebelum itu terulang. */
export const QUOTA_DAILY_LIMIT = 50000;
export const QUOTA_ALERT_RATIO = 0.7;
export const QUOTA_ALERT_READS = Math.round(
  QUOTA_DAILY_LIMIT * QUOTA_ALERT_RATIO,
);
export const QUOTA_ALERT_TYPE = "quota";

export function quotaAlertId(dayIso) {
  return `quota-70-${dayIso}`;
}

/* Persen pemakaian kuota dari estimasi baca, dibulatkan. */
export function quotaPercent(readsEstimate) {
  const n = Number(readsEstimate) || 0;
  return Math.round((n / QUOTA_DAILY_LIMIT) * 100);
}

/* Teks pesan alert kuota, untuk diteruskan watcher ke Telegram.
 * Bentuknya mengikuti formatTelegramMessage di bawah. */
export function formatQuotaAlertMessage(readsEstimate, dayIso) {
  const n = Number(readsEstimate) || 0;
  return [
    `Pemakaian baca Firestore Karir sudah ${quotaPercent(n)}% dari kuota harian (${n.toLocaleString("id-ID")} dari ${QUOTA_DAILY_LIMIT.toLocaleString("id-ID")} baca, ${formatTanggalId(dayIso)}).`,
    "Bila kuota habis, situs tetap jalan dari data cadangan, tapi data live tidak bisa diperbarui sampai kuota reset pukul 15:00 WIB.",
    "Lihat panel admin di https://karir-adiprmx.vercel.app/admin",
  ].join("\n");
}

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

/* Batas panjang satu pesan teks Bot API Telegram. Pesan yang lebih
 * panjang ditolak utuh (HTTP 400), jadi pesan gabungan dipecah
 * sebelum dikirim (NOTIF-08): tanpa pemecahan, satu hari dengan
 * banyak alert baru membuat owner tidak menerima apa pun, dan
 * watcher mengulang pesan gagal yang sama di tiap run. */
export const TELEGRAM_MESSAGE_LIMIT = 4096;

/* Pecah teks menjadi potongan-potongan yang masing-masing tidak
 * lebih dari limit karakter, sedapat mungkin pada batas baris
 * supaya tidak memotong tengah kalimat. Baris tunggal yang lebih
 * panjang dari limit dipotong keras per limit karakter. Teks kosong
 * menghasilkan [] (pemanggil tidak mengirim apa pun). */
export function splitTelegramMessage(text, limit = TELEGRAM_MESSAGE_LIMIT) {
  if (typeof text !== "string" || text.length === 0) return [];
  if (text.length <= limit) return [text];
  const chunks = [];
  let current = "";
  const pushLine = (line) => {
    if (line.length > limit) {
      /* Baris terlalu panjang: tutup potongan berjalan, lalu potong
       * keras barisnya. */
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < line.length; i += limit) {
        chunks.push(line.slice(i, i + limit));
      }
      return;
    }
    const next = current ? `${current}\n${line}` : line;
    if (next.length > limit) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  };
  for (const line of text.split("\n")) pushLine(line);
  if (current) chunks.push(current);
  return chunks;
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

/* Kirim satu pesan ke Telegram Bot API. Timeout 10 detik per
 * potongan. Pesan di atas 4096 karakter dipecah dulu lewat
 * splitTelegramMessage dan dikirim berurutan (NOTIF-08) — Bot API
 * menolak pesan panjang utuh. Tidak pernah melempar: setiap
 * kegagalan (timeout, HTTP bukan 200, jawaban bukan JSON ok)
 * dikembalikan sebagai {ok:false, error} supaya pemanggil (cron)
 * tetap bisa lanjut dan membalas sukses. Token hanya dipakai di URL
 * request, tidak pernah dicetak. {ok:true} berarti SEMUA potongan
 * terkirim; bila satu potongan gagal, sisanya tidak dicoba. */
export async function sendTelegramMessage({
  token,
  chatId = DEFAULT_CHAT_ID,
  text,
  fetchImpl = fetch,
  timeoutMs = 10_000,
}) {
  if (!token || !text) return { ok: false, error: "token atau teks kosong" };
  const chunks = splitTelegramMessage(text);
  for (const chunk of chunks) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: String(chatId), text: chunk }),
        },
      );
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const body = await res.json().catch(() => null);
      if (!body || body.ok !== true) {
        return { ok: false, error: "jawaban Telegram tidak ok" };
      }
    } catch (err) {
      return {
        ok: false,
        error: err && err.name === "AbortError" ? "timeout" : "gagal terhubung",
      };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: true };
}

/* Tandai alert sudah terkirim (NOTIF-01): setelah cron berhasil
 * mengirim pesan Telegram langsung, tiap alert ditandai sent=true +
 * sentAt supaya watcher agent-side tidak mengirim ulang alert yang
 * sama (satu sumber kebenaran untuk status terkirim). patchFn
 * disuntik pemanggil — di route cron, PATCH Firestore per id alert —
 * dan mengembalikan true bila penandaan berhasil. Tidak pernah
 * melempar; kegagalan dilaporkan per id supaya pemanggil bisa
 * mencatatnya. Alert yang gagal ditandai tetap sent=false sehingga
 * watcher akan mengirimnya: duplikat sesekali lebih baik daripada
 * alert yang hilang. */
export async function markAlertsSent(patchFn, alerts) {
  const marked = [];
  const failed = [];
  await Promise.all(
    (alerts || []).map(async (alert) => {
      try {
        const ok = await patchFn(alert);
        if (ok) marked.push(alert.id);
        else failed.push(alert.id);
      } catch {
        failed.push(alert.id);
      }
    }),
  );
  return { marked, failed };
}

/* Bentuk dokumen heartbeat satu run cron (OPS-01): koleksi
 * `cron-runs`, id dokumen = tanggal WIB run. Ditulis cron di akhir
 * run; dibaca watcher agent-side untuk mendeteksi run yang hilang
 * (dokumen tidak ada) atau perusahaan yang ada lowongan tidak
 * sempat dicek 2 hari berturut-turut (openSkipped > 0). Nilai
 * dikembalikan dalam bentuk field Firestore (stringValue /
 * integerValue / booleanValue) supaya route tinggal membungkusnya
 * dalam {fields}. */
export function buildCronRunRecord(summary, { date, startedAt, finishedAt }) {
  const s = summary || {};
  const queue = s.queue || {};
  return {
    date: { stringValue: date },
    status: { stringValue: s.truncated === true ? "truncated" : "ok" },
    startedAt: { stringValue: new Date(startedAt).toISOString() },
    finishedAt: { stringValue: new Date(finishedAt).toISOString() },
    durationMs: {
      integerValue: String(Math.max(0, finishedAt - startedAt)),
    },
    checked: { integerValue: String(s.checked || 0) },
    changed: { integerValue: String(s.changed || 0) },
    updated: { integerValue: String(s.updated || 0) },
    skipped: { integerValue: String(s.skipped || 0) },
    openSkipped: { integerValue: String(s.openSkipped || 0) },
    alerts: { integerValue: String(s.alerts || 0) },
    alertsFailed: { integerValue: String(s.alertsFailed || 0) },
    telegram: { stringValue: s.telegram || "none" },
    telegramMarked: { integerValue: String(s.telegramMarked || 0) },
    markerBumped: { booleanValue: s.markerBumped === true },
    queueTotal: { integerValue: String(queue.total || 0) },
    queueUrgent: { integerValue: String(queue.urgent || 0) },
    queueOpen: { integerValue: String(queue.open || 0) },
    queueDead: { integerValue: String(queue.dead || 0) },
    alertPhaseTruncated: {
      booleanValue: s.alertPhaseTruncated === true,
    },
    snapshotKnown: { booleanValue: s.snapshotKnown !== false },
    snapshotWritten: { booleanValue: s.snapshotWritten === true },
  };
}
