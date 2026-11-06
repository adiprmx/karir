/* GET /api/stats — angka ringkas data Karir, JSON. */
import { NextResponse } from "next/server";
import { getCompanies, getStats, getStaleCount } from "@/lib/companies";
import { countBy, topEntries } from "@/lib/search";

export async function GET() {
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
      targets: companies.filter((c) => c.status === "Ada lowongan target")
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
