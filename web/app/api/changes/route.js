/* GET /api/changes: umpan perubahan status, 10 terbaru, bisa dibaca siapa
 * pun. Gerbang yang sama dengan /api/stats: tolak UA otomatis (403) dan
 * batas laju 60/menit per hash IP (429), dengan kunci terpisah supaya
 * hitungannya tidak bercampur dengan rute lain. Bentuk respons sukses tidak
 * berubah. Bila Firestore tidak bisa dijangkau, kembalikan daftar kosong
 * (bukan 500) supaya halaman tetap tampil. */
import { NextResponse } from "next/server";
import { getChanges } from "@/lib/changes";
import { isBotUa, getClientIp } from "@/lib/api-guard";
import { getSharedLimiter } from "@/lib/rate-limit";
import { hashVisitor, todayJakarta } from "@/lib/analytics-server";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const LIMIT_PER_MINUTE = 60;

export async function GET(request) {
  if (isBotUa(request.headers.get("user-agent") || "")) {
    return NextResponse.json(
      { error: "Permintaan otomatis ditolak." },
      { status: 403 },
    );
  }
  const key = `changes:${hashVisitor(getClientIp(request), todayJakarta())}`;
  if (!(await getSharedLimiter().check(key, LIMIT_PER_MINUTE, WINDOW_MS))) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }
  try {
    const changes = await getChanges(10);
    return NextResponse.json({ changes });
  } catch {
    return NextResponse.json({ changes: [] });
  }
}
