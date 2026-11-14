/* POST /api/admin/check-link — cek apakah tautan karir sebuah perusahaan
 * masih bisa dibuka. Dipakai panel admin.
 * Keamanan:
 * - Auth admin WAJIB dan diperiksa PALING AWAL, sebelum rate limit dan
 *   sebelum membaca body (requireAdmin dari lib/admin-auth).
 * - URL TIDAK PERNAH diambil dari request. Endpoint hanya menerima
 *   nomor perusahaan, lalu memakai link_karir yang tersimpan di
 *   Firestore. Jadi tidak bisa dipakai untuk menembak URL sembarangan.
 * - IP klien diambil lewat getClientIp (x-real-ip dulu, lalu elemen
 *   TERAKHIR x-forwarded-for — elemen pertama adalah klaim pengirim
 *   yang bisa dipalsukan) dan hanya dipakai untuk hash + rate limit,
 *   lalu dibuang. Kunci Map batas laju adalah hash SHA-256 harian
 *   atas IP; IP mentah tidak pernah disimpan.
 * Timeout 10 dtk, maksimal 5 redirect, batas laju 10/menit.
 * Logika ceknya tinggal di lib/check.js (dipakai bersama cron harian). */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getCompanyById } from "@/lib/companies";
import { checkUrl } from "@/lib/check";
import { getClientIp } from "@/lib/api-guard";
import { requireAdmin } from "@/lib/admin-auth";

const WINDOW_MS = 60 * 1000;
const MAX_REQ = 10;
const hits = new Map();

/* Garam statis di memori untuk hash kunci batas laju. Bukan secret:
 * hash ini hanya pengenal bucket batas laju, bukan token. Garam
 * digabung tanggal (UTC) supaya kunci berganti tiap hari dan hash
 * lama tidak berlaku selamanya. */
const IP_SALT = "karir-check-link";

function hashIp(ip) {
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256")
    .update(`${IP_SALT}:${day}:${ip}`)
    .digest("hex");
}

function rateLimited(ipHash) {
  const now = Date.now();
  const list = (hits.get(ipHash) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ipHash, list);
  return list.length > MAX_REQ;
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const ipHash = hashIp(getClientIp(request));
  if (rateLimited(ipHash)) {
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
