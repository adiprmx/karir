/* GET /api/index — seluruh daftar perusahaan dalam satu JSON, supaya
 * browser bisa mengurutkan hasil pencarian sendiri tanpa menunggu
 * server tiap ketukan. Data sama dengan /api/companies, bentuk padat. */
import { NextResponse } from "next/server";
import { getCompanies } from "@/lib/companies";

export async function GET() {
  try {
    const companies = await getCompanies();
    return NextResponse.json(
      { companies },
      {
        headers: {
          "Cache-Control":
            "public, max-age=60, s-maxage=300, stale-while-revalidate=900",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Data perusahaan tidak bisa dimuat." },
      { status: 503 },
    );
  }
}
