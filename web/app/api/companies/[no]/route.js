/* GET /api/companies/[no] — satu perusahaan, JSON.
 * Gerbang: tolak UA otomatis (403), batas laju 60/menit per hash IP
 * (429). Bentuk respons sukses tidak berubah. */
import { NextResponse } from "next/server";
import { getCompanyById } from "@/lib/companies";
import { isBotUa, checkRateLimit, getClientIp } from "@/lib/api-guard";
import { hashVisitor, todayJakarta } from "@/lib/analytics-server";

const hits = new Map();
const WINDOW_MS = 60_000;
const LIMIT_PER_MINUTE = 60;

export async function GET(request, { params }) {
  if (isBotUa(request.headers.get("user-agent") || "")) {
    return NextResponse.json(
      { error: "Permintaan otomatis ditolak." },
      { status: 403 },
    );
  }
  const key = hashVisitor(getClientIp(request), todayJakarta());
  if (!checkRateLimit(hits, key, LIMIT_PER_MINUTE, WINDOW_MS)) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }
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
