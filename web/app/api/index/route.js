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
  getClientIp,
  verifyToken,
} from "@/lib/api-guard";
import { getSharedLimiter } from "@/lib/rate-limit";
import { hashVisitor, todayJakarta } from "@/lib/analytics-server";
import { requireEnv } from "@/lib/require-env";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const LIMIT_PER_MINUTE = 30;

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
  /* Batas laju memakai hash IP; bila garam analitik belum dipasang,
   * hash tidak bisa dibuat dan batas laju dilewati — tidak ada hash
   * lemah dan tidak ada IP mentah yang disimpan. */
  let limited = false;
  try {
    const key = hashVisitor(getClientIp(request), todayJakarta());
    limited = !(await getSharedLimiter().check(key, LIMIT_PER_MINUTE, WINDOW_MS));
  } catch {
    console.warn("Batas laju /api/index dilewati: env ANALYTICS_SALT belum dipasang.");
  }
  if (limited) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }
  let secret;
  try {
    secret = requireEnv("API_TOKEN_SECRET");
  } catch {
    return NextResponse.json(
      { error: "Layanan belum dikonfigurasi." },
      { status: 503 },
    );
  }
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
