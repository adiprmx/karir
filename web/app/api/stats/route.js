/* GET /api/stats — angka ringkas data Karir, JSON.
 * Gerbang: tolak UA otomatis (403), batas laju 60/menit per hash IP
 * (429). Bentuk respons sukses tidak berubah. */
import { NextResponse } from "next/server";
import { getCompanies, getStats, getStaleCount } from "@/lib/companies";
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
  const key = hashVisitor(getClientIp(request), todayJakarta());
  if (!(await getSharedLimiter().check(key, LIMIT_PER_MINUTE, WINDOW_MS))) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }
  try {
    const [companies, stats, stale] = await Promise.all([
      getCompanies(),
      getStats(),
      getStaleCount(),
    ]);
    return NextResponse.json({
      total: stats.total,
      byStatus: stats.byStatus,
      byCategory: topEntries(countBy(companies, "kategori"), 8),
      byDate: stats.byDate,
      targets: companies.filter((c) => c.status === "Ada lowongan")
        .length,
      stale,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Data perusahaan tidak bisa dimuat." },
      { status: 503 },
    );
  }
}
