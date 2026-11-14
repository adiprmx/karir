/* GET /api/stats — angka ringkas data Karir, JSON.
 * Gerbang: tolak UA otomatis (403), batas laju 60/menit per hash IP
 * (429). Respons membawa `source` ("live" | "seed") + `seedDate`:
 * "seed" berarti data berasal dari seed cadangan karena Firestore
 * sedang tidak bisa dibaca (mis. kuota habis) — angkanya tetap
 * dihitung dari data itu, bukan 503 (arsitektur seed-first S3). */
import { NextResponse } from "next/server";
import { getCompaniesWithSource, getStats, getStaleCount } from "@/lib/companies";
import { countBy, topEntries } from "@/lib/search";
import { isBotUa, getClientIp } from "@/lib/api-guard";
import { getSharedLimiter } from "@/lib/rate-limit";
import { hashVisitor, todayJakarta } from "@/lib/analytics-server";

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
    const key = hashVisitor(getClientIp(request), todayJakarta());
    limited = !(await getSharedLimiter().check(key, LIMIT_PER_MINUTE, WINDOW_MS));
  } catch {
    console.warn("Batas laju /api/stats dilewati: env ANALYTICS_SALT belum dipasang.");
  }
  if (limited) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }
  try {
    const [{ companies, source, seedDate }, stats, stale] =
      await Promise.all([
        getCompaniesWithSource(),
        getStats(),
        getStaleCount(),
      ]);
    return NextResponse.json({
      source,
      seedDate,
      total: stats.total,
      byStatus: stats.byStatus,
      byCategory: topEntries(countBy(companies, "kategori"), 8),
      byDate: stats.byDate,
      targets: companies.filter((c) => c.status === "Ada lowongan")
        .length,
      stale,
    });
  } catch (err) {
    /* getCompaniesWithSource tidak pernah melempar karena Firestore
     * (jatuh ke seed); 503 di sini hanya untuk kegagalan tak terduga
     * (mis. seed ikut tidak bisa dimuat). */
    return NextResponse.json(
      { error: "Data perusahaan tidak bisa dimuat." },
      { status: 503 },
    );
  }
}
