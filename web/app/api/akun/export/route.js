/* GET /api/akun/export — unduh event analitik milik pengguna yang
 * masuk (S8/C-05). Dipakai tombol "Unduh dataku" di /pengaturan
 * untuk melengkapi berkas JSON dengan catatan kunjungan.
 *
 * Keamanan (SEC-07, pola yang sama dengan route analitik dan
 * route admin): UID HANYA dari ID token Firebase yang
 * terverifikasi (header Authorization: Bearer <token>, lewat
 * verifyIdToken di lib/admin-auth.js). Tidak ada parameter UID
 * di query/body — satu pengguna tidak bisa membaca event
 * pengguna lain, karena query Firestore selalu memakai UID dari
 * tokennya sendiri. UID dan token tidak pernah ditulis ke log.
 *
 * Batas laju: 5/menit per hash IP harian, lewat limiter bersama
 * (lib/rate-limit.js, cakupan "akun-export") — sama seperti
 * route analitik, hash dibuat dari IP + garam harian, IP mentah
 * tidak pernah disimpan. Tanpa garam analitik, layanan menjawab
 * 503 (ekspor adalah aksi pengguna yang butuh jawaban jelas,
 * bukan fire-and-forget seperti pencatatan event).
 *
 * Balasan 200: { events, count, truncated } — events terbaru
 * dulu, maks 500 (USER_EXPORT_MAX_EVENTS); truncated true bila
 * masih ada event yang tidak ikut. Field tiap event: ts, type,
 * path, ditambah q/results/filter/companyNo/action/visitor bila
 * ada. Hash pengunjung dan penanda bot tidak ikut (lihat
 * fetchUserAnalyticsEvents di lib/analytics-server.js). */
import { NextResponse } from "next/server";
import {
  fetchUserAnalyticsEvents,
  hashVisitor,
  todayJakarta,
} from "@/lib/analytics-server";
import { verifyIdToken } from "@/lib/admin-auth";
import { getClientIp } from "@/lib/api-guard";
import { getSharedLimiter, scopedKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/* Ekspor adalah aksi langka (satu ketukan tombol per unduhan);
 * 5/menit per pengunjung sudah longgar untuk pemakaian normal
 * dan menutup pemborosan baca Firestore. */
const EXPORT_LIMIT_PER_MINUTE = 5;

export async function GET(request) {
  /* 1. Token wajib ada dan terverifikasi; UID peminta hanya dari
   * token ini. */
  const authHeader = (request.headers.get("authorization") || "").trim();
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) {
    return NextResponse.json(
      { error: "Masuk dulu untuk mengunduh data." },
      { status: 401 },
    );
  }
  const verified = await verifyIdToken(match[1]);
  if (verified.error) {
    return NextResponse.json(
      { error: verified.error },
      { status: verified.status },
    );
  }

  /* 2. Batas laju per hash IP (dihitung sesudah auth, supaya
   * request anonim tidak bisa menghabiskan ember alamat
   * bersama). */
  let visitorHash;
  try {
    visitorHash = hashVisitor(getClientIp(request), todayJakarta());
  } catch {
    console.warn("Ekspor akun dilewati: env ANALYTICS_SALT belum dipasang.");
    return NextResponse.json(
      { error: "Layanan belum siap. Coba lagi nanti." },
      { status: 503 },
    );
  }
  if (
    !(await getSharedLimiter().check(
      scopedKey("akun-export", visitorHash),
      EXPORT_LIMIT_PER_MINUTE,
      60_000,
    ))
  ) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }

  /* 3. Ambil event milik UID terverifikasi itu saja. Pesan error
   * sengaja generik (tanpa UID, tanpa detail internal). */
  try {
    const { events, truncated } = await fetchUserAnalyticsEvents(
      verified.uid,
    );
    return NextResponse.json({ events, count: events.length, truncated });
  } catch (err) {
    const status = err && err.status === 503 ? 503 : 500;
    console.warn(
      status === 503
        ? "Ekspor akun gagal: service account tidak tersedia."
        : "Ekspor akun gagal: query event pengguna gagal.",
    );
    return NextResponse.json(
      {
        error:
          status === 503
            ? "Layanan belum siap. Coba lagi nanti."
            : "Catatan kunjungan tidak bisa diambil. Coba lagi nanti.",
      },
      { status },
    );
  }
}
