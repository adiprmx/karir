/* POST /api/admin/check-link — cek apakah tautan karir sebuah perusahaan
 * masih bisa dibuka. Dipakai panel admin.
 * Keamanan:
 * - Auth admin WAJIB dan diperiksa PALING AWAL, sebelum rate limit dan
 *   sebelum membaca body (requireAdmin dari lib/admin-auth).
 * - URL TIDAK PERNAH diambil dari request. Endpoint hanya menerima
 *   nomor perusahaan, lalu memakai link_karir yang tersimpan di
 *   Firestore. Jadi tidak bisa dipakai untuk menembak URL sembarangan.
 * - Batas laju memakai limiter bersama (OPS-08), bukan Map lokal:
 *   ember dibagikan antar instance dan bertahan melewati cold start.
 *   IP klien diambil lewat getClientIp (x-real-ip dulu, lalu elemen
 *   TERAKHIR x-forwarded-for — elemen pertama adalah klaim pengirim
 *   yang bisa dipalsukan) lalu di-hash harian (hashVisitor) dan
 *   dibuang; IP mentah tidak pernah disimpan.
 * Timeout 10 dtk, maksimal 5 redirect, batas laju 10/menit.
 * Logika ceknya tinggal di lib/check.js (dipakai bersama cron harian). */
import { NextResponse } from "next/server";
import { getCompanyById } from "@/lib/companies";
import { checkUrl } from "@/lib/check";
import { getClientIp } from "@/lib/api-guard";
import { getSharedLimiter, scopedKey } from "@/lib/rate-limit";
import { hashVisitor, todayJakarta } from "@/lib/analytics-server";
import { requireAdmin } from "@/lib/admin-auth";

const WINDOW_MS = 60 * 1000;
const MAX_REQ = 10;

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  /* Batas laju memakai hash IP; bila garam analitik belum dipasang,
   * hash tidak bisa dibuat dan batas laju dilewati — tidak ada hash
   * lemah dan tidak ada IP mentah yang disimpan. Rute ini tetap di
   * belakang auth admin, jadi yang dilewati hanya lapisan kedua. */
  let limited = false;
  try {
    const key = scopedKey(
      "check-link",
      hashVisitor(getClientIp(request), todayJakarta()),
    );
    limited = !(await getSharedLimiter().check(key, MAX_REQ, WINDOW_MS));
  } catch {
    console.warn("Batas laju /api/admin/check-link dilewati: env ANALYTICS_SALT belum dipasang.");
  }
  if (limited) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }
  const no = Number(body?.no);
  if (!no) {
    return NextResponse.json(
      { error: "Nomor perusahaan wajib diisi." },
      { status: 400 },
    );
  }
  let company;
  try {
    company = await getCompanyById(no);
  } catch {
    return NextResponse.json(
      { error: "Data perusahaan tidak bisa dimuat." },
      { status: 503 },
    );
  }
  if (!company || !company.link_karir) {
    return NextResponse.json(
      { error: "Perusahaan tidak punya tautan karir." },
      { status: 404 },
    );
  }
  const url = company.link_karir;
  const result = await checkUrl(url, { timeoutMs: 10_000 });
  /* Respons 200 tidak pernah membawa field `error` (BE-13): `error`
   * hanya untuk respons gagal (4xx/5xx). Bila portal tidak bisa
   * dibuka, penjelasannya ada di `detail` dan `ok: false` — klien
   * membedakan "pemeriksaan gagal" (status bukan 2xx + `error`)
   * dari "portal mati" (200 + `ok: false` + `detail`). */
  return NextResponse.json({
    no,
    url,
    ok: result.ok,
    status: result.status ?? 0,
    finalUrl: result.finalUrl,
    checkedAt: new Date().toISOString(),
    ...(result.ok ? {} : { detail: "Tidak bisa dihubungi." }),
  });
}
