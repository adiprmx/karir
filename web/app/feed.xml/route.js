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
import { OBS_CODES, emitObservabilityEvent } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET() {
  let changes = [];
  try {
    changes = await getChanges(20);
  } catch (err) {
    /* getChanges sudah mencatat kegagalannya sendiri; emit rute ini
     * menandai umpan kosong karena degradasi (throttle per kode
     * mencegah duplikasi baris log dalam satu menit). */
    emitObservabilityEvent({
      code: OBS_CODES.API_ROUTE_ERROR,
      component: "feed",
      message: err && err.message ? err.message : "Rute /feed.xml gagal.",
      meta: { route: "/feed.xml" },
    });
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
