/* GET /api/changes — umpan perubahan status, 10 terbaru, bisa dibaca
 * siapa pun. Bila Firestore tidak bisa dijangkau, kembalikan daftar
 * kosong (bukan 500) supaya halaman tetap tampil. */
import { NextResponse } from "next/server";
import { getChanges } from "@/lib/changes";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const changes = await getChanges(10);
    return NextResponse.json({ changes });
  } catch {
    return NextResponse.json({ changes: [] });
  }
}
