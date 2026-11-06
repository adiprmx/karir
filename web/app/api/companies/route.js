/* API pencarian server Karir.
 * GET /api/companies?domisili=&posisi=&q=&kategori=&status=&urutan=&limit=&offset=
 * Pencarian dan skor jalan di server (bukan di browser), memakai logika
 * yang sama dengan halaman Cari. Mengembalikan JSON. */
import { NextResponse } from "next/server";
import { getCompanies } from "@/lib/companies";
import { runSearch, tokenize, fieldMatchesAffirmative } from "@/lib/search";

export async function GET(request) {
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
    let companies = await getCompanies();
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
    return NextResponse.json(
      { error: "Data perusahaan tidak bisa dimuat." },
      { status: 503 },
    );
  }
}
