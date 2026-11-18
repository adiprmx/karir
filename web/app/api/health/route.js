/* GET /api/health — status komponen Karir untuk monitor uptime +
 * ekspor riwayat harian (P-06, K8).
 *
 * Kontrak:
 * - NOL baca Firestore per panggilan: semua field berasal dari
 *   cache modul instance ini (lib/companies.js) + keadaan modul
 *   (lib/health-state.js). Monitor yang memanggil tiap menit tidak
 *   pernah menghabiskan kuota baca.
 * - TIDAK ADA gerbang tolak-bot (penyimpangan dari rencana §1.4
 *   yang didokumentasikan): monitor uptime dan workflow ekspor
 *   memang permintaan otomatis; isBotUa menolak curl/python dan
 *   akan merusak keduanya. Perlindungan: batas laju 60/menit per
 *   hash IP.
 * - TIDAK ADA secret/UID/email di respons: field yang ditampilkan
 *   adalah status agregat + stempel waktu + angka kuota.
 *
 * Keterbatasan yang jujur: `source` mencerminkan cache instance
 * INI — instance yang baru dingin (belum pernah refill) melaporkan
 * "seed" walau Firestore sehat, sampai request pertama menghangatkan
 * cache-nya. `liveAsOf` menunjukkan kapan data live terakhir
 * berhasil di-refill supaya "live" dari cache basi tidak terbaca
 * sebagai data segar (C13). Sumber kebenaran run cron tetap dokumen
 * heartbeat cron-runs yang dibaca watcher, bukan endpoint ini. */
import { NextResponse } from "next/server";
import { getCompaniesHealthSnapshot } from "@/lib/companies";
import { getLastCronRun, getUptimeMs } from "@/lib/health-state";
import { getClientIp } from "@/lib/api-guard";
import { createMemoryStore, scopedKey } from "@/lib/rate-limit";
import { hashVisitor, todayJakarta } from "@/lib/analytics-server";

const WINDOW_MS = 60_000;
const LIMIT_PER_MINUTE = 60;

/* Limiter MEMORI LOKAL (bukan limiter bersama): limiter bersama
 * membaca dokumen rate_limits dari Firestore (1 baca per
 * panggilan) — itu melanggar kontrak 0-baca endpoint ini — dan
 * fail-open (melewati batas laju) saat Firestore 429, tepat saat
 * perlindungan paling dibutuhkan. Limiter lokal tetap jalan
 * walau Firestore mati. Trade-off yang diterima: batas berlaku
 * per instance, bukan global — dapat diterima karena endpoint ini
 * murah dan hanya-baca. */
const localLimiter = createMemoryStore();

export async function GET(request) {
  /* Batas laju memakai hash IP; bila garam analitik belum dipasang,
   * hash tidak bisa dibuat dan batas laju dilewati — kondisi itu
   * dilaporkan sebagai rateLimitDegraded di respons. */
  const rateLimitDegraded = !process.env.ANALYTICS_SALT;
  let limited = false;
  if (!rateLimitDegraded) {
    const key = scopedKey(
      "health",
      hashVisitor(getClientIp(request), todayJakarta()),
    );
    limited = !localLimiter.check(key, LIMIT_PER_MINUTE, WINDOW_MS);
  }
  if (limited) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }

  const snapshot = await getCompaniesHealthSnapshot();
  const ok = snapshot.source === "live";
  return NextResponse.json(
    {
      ok,
      degraded: !ok || rateLimitDegraded,
      source: snapshot.source,
      rev: snapshot.rev,
      seedDate: snapshot.seedDate,
      readsEstimate: snapshot.readsEstimate,
      quotaPercent: snapshot.quotaPercent,
      liveAsOf: snapshot.liveAsOf,
      lastMarkerCheck: snapshot.lastMarkerCheck,
      lastCronRun: getLastCronRun(),
      seedModeMinutes: snapshot.seedModeMinutes,
      cacheAgeMs: snapshot.cacheAgeMs,
      cacheWarm: snapshot.cacheWarm,
      rateLimitDegraded,
      uptimeMs: getUptimeMs(),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    },
  );
}
