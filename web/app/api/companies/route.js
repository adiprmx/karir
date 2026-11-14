/* API pencarian server Karir.
 * GET /api/companies?domisili=&posisi=&q=&kota=&kategori=&status=&urutan=&limit=&offset=
 * Pencarian dan skor jalan di server (bukan di browser), memakai logika
 * yang sama dengan halaman Cari. Mengembalikan JSON.
 * Respons membawa `source` ("live" | "seed") + `seedDate`: "seed"
 * berarti hasil dihitung dari seed cadangan karena Firestore sedang
 * tidak bisa dibaca (mis. kuota habis) — bukan 503 (arsitektur
 * seed-first S3). Respons juga membawa `groups` (hitungan per kelompok
 * "Perusahaan"/"Lowongan" di mode perusahaan, null di mode semua). */
import { NextResponse } from "next/server";
import { getCompaniesWithSource } from "@/lib/companies";
import { runSearch, matchesFreeText } from "@/lib/search";
import { isBotUa, getClientIp } from "@/lib/api-guard";
import { getSharedLimiter, scopedKey } from "@/lib/rate-limit";
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
    const key = scopedKey(
      "companies",
      hashVisitor(getClientIp(request), todayJakarta()),
    );
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
    // matchesFreeText mengecek tiap field terpisah lalu OR (CARI-05):
    // string gabungan membuat jendela penyangkalan bocor lintas field.
    if (q) {
      companies = companies.filter((c) => matchesFreeText(c, q));
    }
    const { results, mode, groups } = runSearch(companies, {
      domisili: params.get("domisili") || "",
      posisi: q || params.get("posisi") || "",
      kota: params.get("kota") || "",
      kategori: params.get("kategori") || "",
      status: params.get("status") || "",
      urutan: params.get("urutan") || "relevansi",
    });
    return NextResponse.json({
      source,
      seedDate,
      total: results.length,
      mode,
      groups: groups
        ? {
            companies: groups.companies.length,
            roles: groups.roles.length,
          }
        : null,
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
