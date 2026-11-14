/* GET /api/companies/[no] — satu perusahaan, JSON.
 * Gerbang: tolak UA otomatis (403), batas laju 60/menit per hash IP
 * (429) lewat limiter bersama supaya dihitung di semua instance,
 * bukan per instance (BE-07). Respons membawa `source` ("live" |
 * "seed") + `seedDate`: saat Firestore tidak bisa dibaca, perusahaan
 * diambil dari seed cadangan (bukan 503) — arsitektur seed-first S3,
 * sama seperti rute daftar. */
import { NextResponse } from "next/server";
import { getCompanyByIdWithSource, getSeedDate } from "@/lib/companies";
import { isBotUa, getClientIp } from "@/lib/api-guard";
import { getSharedLimiter, scopedKey } from "@/lib/rate-limit";
import { hashVisitor, todayJakarta } from "@/lib/analytics-server";

const WINDOW_MS = 60_000;
const LIMIT_PER_MINUTE = 60;

export async function GET(request, { params }) {
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
    const key = scopedKey(
      "company",
      hashVisitor(getClientIp(request), todayJakarta()),
    );
    limited = !(await getSharedLimiter().check(key, LIMIT_PER_MINUTE, WINDOW_MS));
  } catch {
    console.warn("Batas laju /api/companies/[no] dilewati: env ANALYTICS_SALT belum dipasang.");
  }
  if (limited) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }
  try {
    const { no } = await params;
    const [{ company, source }, seedDate] = await Promise.all([
      getCompanyByIdWithSource(no),
      getSeedDate(),
    ]);
    if (!company) {
      return NextResponse.json(
        { error: "Perusahaan tidak ditemukan." },
        { status: 404 },
      );
    }
    return NextResponse.json({ company, source, seedDate });
  } catch (err) {
    /* getCompanyByIdWithSource tidak pernah melempar karena Firestore
     * (jatuh ke seed); 503 di sini hanya untuk kegagalan tak terduga
     * (mis. seed ikut tidak bisa dimuat). */
    return NextResponse.json(
      { error: "Data perusahaan tidak bisa dimuat." },
      { status: 503 },
    );
  }
}
