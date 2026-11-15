/* GET /feed.xml — umpan RSS 2.0 perubahan lowongan (MKT-10).
 * Datanya sama dengan /api/changes (lib/changes.js, cache 1 jam).
 * Degradasi: bila Firestore tidak bisa dijangkau, jawab umpan
 * kosong (200) — bukan error — supaya pembaca umpan tidak
 * menganggap umpannya mati. Di-cache 1 jam di tepi (perubahan
 * paling banyak ditulis sekali sehari oleh cron). Sengaja TANPA
 * gerbang tolak-bot seperti /api/changes: pembaca umpan memang
 * permintaan otomatis, dan menolaknya merusak fungsi umpan ini. */
import { getChanges } from "@/lib/changes";
import { buildFeedXml } from "@/lib/feed";

export const dynamic = "force-dynamic";

export async function GET() {
  let changes = [];
  try {
    changes = await getChanges(20);
  } catch {
    changes = [];
  }
  return new Response(buildFeedXml(changes), {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
