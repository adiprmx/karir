/* GET /api/index — seluruh daftar perusahaan dalam satu JSON, supaya
 * browser bisa mengurutkan hasil pencarian sendiri tanpa menunggu
 * server tiap ketukan. Data sama dengan /api/companies, bentuk padat.
 * Gerbang: tolak UA otomatis (403), batas laju 30/menit per hash IP
 * (429), lalu wajib token valid di header Authorization Bearer (401).
 * Respons memakai "private, no-store": data ber-token tidak boleh
 * disajikan dari edge cache tanpa token. */
import { NextResponse } from "next/server";
import { getCompanies } from "@/lib/companies";
import {
  isBotUa,
  checkRateLimit,
  getClientIp,
  verifyToken,
} from "@/lib/api-guard";
import { hashVisitor, todayJakarta } from "@/lib/analytics-server";

export const dynamic = "force-dynamic";

const hits = new Map();
const WINDOW_MS = 60_000;
const LIMIT_PER_MINUTE = 30;
const DEV_ONLY_SECRET = "karir-dev-only-token-secret";

function bearerToken(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice("Bearer ".length).trim();
}

export async function GET(request) {
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
  const secret = process.env.API_TOKEN_SECRET || DEV_ONLY_SECRET;
  const token = bearerToken(request);
  if (!token || !verifyToken(token, secret, 60)) {
    return NextResponse.json(
      { error: "Token tidak ada atau tidak valid." },
      { status: 401 },
    );
  }
  try {
    const companies = await getCompanies();
    return NextResponse.json(
      { companies },
      {
        headers: {
          "Cache-Control": "private, no-store",
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
