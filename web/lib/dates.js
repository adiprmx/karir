/* Pembantu tanggal Karir, fungsi murni tanpa DOM dan tanpa Next supaya
 * bisa diuji dengan node:test (lib/dates.test.js). Semua hitungan hari
 * memakai tanggal kalender WIB (Asia/Jakarta), bukan zona waktu perangkat,
 * supaya server dan browser sepakat soal "hari ini". */

const MS_DAY = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/* "2026-11-05" menjadi "5 Nov 2026". Kosong bila bentuknya salah. */
export function formatDate(value) {
  const m = ISO.exec(String(value || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* Tanggal kalender WIB hari ini, "YYYY-MM-DD". */
export function todayJakarta(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function utcDay(iso) {
  const m = ISO.exec(String(iso || ""));
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const back = new Date(t);
  /* Tolak tanggal kalender yang tidak ada (mis. 2026-02-31). */
  if (
    back.getUTCFullYear() !== Number(m[1]) ||
    back.getUTCMonth() !== Number(m[2]) - 1 ||
    back.getUTCDate() !== Number(m[3])
  ) {
    return null;
  }
  return t;
}

/* Selisih hari kalender dari tanggal cek sampai hari ini (WIB), atau null. */
export function daysSince(value, now = new Date()) {
  const t = utcDay(value);
  const today = utcDay(todayJakarta(now));
  if (t === null || today === null) return null;
  return Math.max(0, Math.round((today - t) / MS_DAY));
}

/* Selisih hari kalender dari hari ini (WIB) sampai tanggal itu. Negatif bila
 * sudah lewat. Null bila tanggal kosong atau tidak valid. */
export function daysUntil(value, now = new Date()) {
  const t = utcDay(value);
  const today = utcDay(todayJakarta(now));
  if (t === null || today === null) return null;
  return Math.round((t - today) / MS_DAY);
}

/* Teks batas lamar untuk kartu. Hanya dari kolom batas_lamar yang memang
 * terisi, tidak pernah ditebak. Mengembalikan null bila tidak ada batas
 * yang valid. `urgent` benar bila tinggal 0 sampai 3 hari. */
export function deadlineInfo(batasLamar, now = new Date()) {
  const days = daysUntil(batasLamar, now);
  if (days === null) return null;
  const date = formatDate(batasLamar);
  if (days < 0) return { days, urgent: false, past: true, text: `Batas lamar lewat (${date})` };
  if (days === 0) return { days, urgent: true, past: false, text: "Tutup hari ini" };
  if (days === 1) return { days, urgent: true, past: false, text: "Tutup besok" };
  if (days <= 3) return { days, urgent: true, past: false, text: `Tutup ${days} hari lagi` };
  return { days, urgent: false, past: false, text: `Tutup ${date}` };
}
