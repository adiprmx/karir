/* POST /api/analytics — terima satu event analitik pengunjung anonim.
 * IP mentah hanya dipakai untuk hash + rate limit, lalu dibuang:
 * tidak pernah ditulis ke Firestore dan tidak pernah di-log.
 * Tulis Firestore yang gagal (termasuk 403 karena aturan belum terbit)
 * tetap dijawab 202 supaya situs tidak rusak; event boleh hilang.
 * Sengaja TIDAK ada penolakan 403 untuk UA otomatis di endpoint ini:
 * endpoint ini alat ukur, dan menolak request di sini merusak
 * pengukurannya sendiri. Sebagai ganti, request yang UA-nya kosong
 * atau cocok pola bot ditandai field uaFlag pada dokumen, supaya
 * dasbor admin bisa melihatnya. */
import { NextResponse } from "next/server";
import {
  validateEvent,
  hashVisitor,
  todayJakarta,
  writeAnalyticsEvent,
} from "@/lib/analytics-server";
import { isBotUa, getClientIp } from "@/lib/api-guard";
import { getSharedLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body JSON tidak valid" }, { status: 400 });
  }
  const checked = validateEvent(body);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const day = todayJakarta();
  /* Tanpa garam analitik, event tidak boleh disimpan dengan garam
   * lemah. Jawab 200 {skipped: true} supaya klien tidak retry
   * membabi buta; tidak ada yang ditulis dan rute tidak crash. */
  let visitorHash;
  try {
    visitorHash = hashVisitor(getClientIp(request), day);
  } catch {
    console.warn("Event analitik dilewati: env ANALYTICS_SALT belum dipasang.");
    return NextResponse.json({ skipped: true }, { status: 200 });
  }
  /* Batas 30/menit per hash pengunjung, lewat limiter bersama supaya
   * dihitung di semua instance, bukan per instance. */
  if (!(await getSharedLimiter().check(visitorHash, 30, 60_000))) {
    return NextResponse.json(
      { error: "terlalu banyak request" },
      { status: 429 },
    );
  }
  const uaFlag = isBotUa(request.headers.get("user-agent") || "");
  await writeAnalyticsEvent(checked.event, visitorHash, day, uaFlag);
  return NextResponse.json({ ok: true }, { status: 202 });
}
