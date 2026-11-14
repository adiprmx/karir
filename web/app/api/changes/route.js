/* GET /api/changes — umpan perubahan status, 10 terbaru, bisa dibaca
 * siapa pun.
 * Gerbang (BE-10): tolak UA otomatis (403) + batas laju 60/menit per
 * hash IP lewat limiter bersama (429), sama seperti rute baca lain.
 * Degradasi (BE-14): bila Firestore tidak bisa dijangkau dan tidak
 * ada cache, jawab 200 + `{changes: [], degraded: true}` — bukan
 * daftar kosong polos — supaya umpan bisa membedakan "belum ada
 * perubahan" dari "umpan sedang tidak bisa dimuat". Respons sehat
 * membawa `degraded: false` secara eksplisit. */
import { NextResponse } from "next/server";
import { getChanges } from "@/lib/changes";
import { isBotUa, getClientIp } from "@/lib/api-guard";
import { getSharedLimiter, scopedKey } from "@/lib/rate-limit";
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
  /* Batas laju memakai hash IP; bila garam analitik belum dipasang,
   * hash tidak bisa dibuat dan batas laju dilewati — tidak ada hash
   * lemah dan tidak ada IP mentah yang disimpan. */
  let limited = false;
  try {
    const key = scopedKey(
      "changes",
      hashVisitor(getClientIp(request), todayJakarta()),
    );
    limited = !(await getSharedLimiter().check(key, LIMIT_PER_MINUTE, WINDOW_MS));
  } catch {
    console.warn("Batas laju /api/changes dilewati: env ANALYTICS_SALT belum dipasang.");
  }
  if (limited) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }
  try {
    const changes = await getChanges(10);
    return NextResponse.json({ changes, degraded: false });
  } catch {
    return NextResponse.json({ changes: [], degraded: true });
  }
}
