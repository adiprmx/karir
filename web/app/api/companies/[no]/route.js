/* GET /api/companies/[no] — satu perusahaan, JSON. */
import { NextResponse } from "next/server";
import { getCompanyById } from "@/lib/companies";

export async function GET(request, { params }) {
  try {
    const company = await getCompanyById(params.no);
    if (!company) {
      return NextResponse.json(
        { error: "Perusahaan tidak ditemukan." },
        { status: 404 },
      );
    }
    return NextResponse.json({ company });
  } catch (err) {
    return NextResponse.json(
      { error: "Data perusahaan tidak bisa dimuat." },
      { status: 503 },
    );
  }
}
