/* Cron pembersihan retensi analitik (ANALITIK-10, S8): hapus event
 * analitik mentah yang lebih tua dari 90 hari, maksimal 200 event
 * per run. Dijalankan Vercel Cron tiap Senin 02:00 WIB (vercel.json).
 *
 * Guard sama seperti recheck: fail-closed bila CRON_SECRET belum
 * dipasang (503 generik), Bearer timing-safe, dan service account
 * wajib ada. Kegagalan hapus dicatat di log dan dijawab 500 — run
 * berikutnya mencoba lagi; tidak ada data pengguna yang hilang
 * bila satu run gagal, hanya event lama yang tertunda dihapus. */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/require-env";
import { cleanupOldEvents } from "@/lib/analytics-server";

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

export async function GET(request) {
  /* 1. Keamanan cron: fail-closed. Tanpa CRON_SECRET, rute tidak
   * pernah berjalan — menjawab 503, bukan mengizinkan tanpa auth. */
  let secret;
  try {
    secret = requireEnv("CRON_SECRET");
  } catch {
    console.warn("Cron cleanup ditolak: CRON_SECRET belum dipasang.");
    return cronUnavailable();
  }
  const auth = request.headers.get("authorization") || "";
  if (!secretsEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  /* 2. Service account wajib ada: hapus event anonim ditutup rules,
   * jadi penghapusan hanya bisa lewat token service account. */
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.warn("Cron cleanup ditolak: service account belum dipasang.");
    return cronUnavailable();
  }

  /* 3. Hapus event lama. cleanupOldEvents melempar bila gagal —
   * catat dan jawab 500 supaya kegagalannya terlihat di log. */
  try {
    const result = await cleanupOldEvents();
    return NextResponse.json(result);
  } catch (err) {
    console.warn("Cron cleanup gagal:", err && err.message ? err.message : err);
    return NextResponse.json(
      { error: "Pembersihan event gagal." },
      { status: 500 },
    );
  }
}
