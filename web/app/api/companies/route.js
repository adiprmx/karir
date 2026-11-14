/* API pencarian server Karir.
 * GET /api/companies?domisili=&posisi=&q=&kategori=&status=&urutan=&limit=&offset=
 * Pencarian dan skor jalan di server (bukan di browser), memakai logika
 * yang sama dengan halaman Cari. Mengembalikan JSON.
 * Respons membawa `source` ("live" | "seed") + `seedDate`: "seed"
 * berarti hasil dihitung dari seed cadangan karena Firestore sedang
 * tidak bisa dibaca (mis. kuota habis) — bukan 503 (arsitektur
 * seed-first S3). */
import { NextResponse } from "next/server";
import { getCompaniesWithSource } from "@/lib/companies";
import { runSearch, tokenize, fieldMatchesAffirmative } from "@/lib/search";
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
    console.warn("Batas laju /api/companies dilewati: env ANALYTICS_SALT belum dipasang.");
  }
  if (limited) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }
  const params = request.nextUrl.searchParams;
  const limit = Math.max(
    1,
    Math.min(400, parseInt(params.get("limit") || "20", 10) || 20),
  );
  const offset = Math.max(
    0,
    parseInt(params.get("offset") || "0", 10) || 0,
  );
  const q = params.get("q") || "";
  try {
    const { companies: all, source, seedDate } =
      await getCompaniesWithSource();
    let companies = all;
    // Pencarian bebas: saring ke baris yang menyebut kata kunci di nama,
    // posisi, lokasi, atau catatan, lalu skor dengan kata kunci itu.
    if (q) {
      const tokens = tokenize(q);
      companies = companies.filter((c) =>
        fieldMatchesAffirmative(
          `${c.perusahaan} ${c.posisi} ${c.lokasi} ${c.catatan}`,
          tokens,
        ),
      );
    }
    const { results, mode } = runSearch(companies, {
      domisili: params.get("domisili") || "",
      posisi: q || params.get("posisi") || "",
      kategori: params.get("kategori") || "",
      status: params.get("status") || "",
      urutan: params.get("urutan") || "relevansi",
    });
    return NextResponse.json({
      source,
      seedDate,
      total: results.length,
      mode,
      limit,
      offset,
      results: results.slice(offset, offset + limit).map((e) => ({
        company: e.company,
        score: e.score,
        reasons: e.reasons,
      })),
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
