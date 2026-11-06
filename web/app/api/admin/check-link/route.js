/* POST /api/admin/check-link — cek apakah tautan karir sebuah perusahaan
 * masih bisa dibuka. Dipakai panel admin.
 * Keamanan: URL TIDAK PERNAH diambil dari request. Endpoint hanya menerima
 * nomor perusahaan, lalu memakai link_karir yang tersimpan di Firestore.
 * Jadi tidak bisa dipakai untuk menembak URL sembarangan. Timeout 10 dtk,
 * maksimal 5 redirect, dan batas laju sederhana per IP. */
import { NextResponse } from "next/server";
import { getCompanyById } from "@/lib/companies";

const WINDOW_MS = 60 * 1000;
const MAX_REQ = 10;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > MAX_REQ;
}

export async function POST(request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  if (rateLimited(ip)) {
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    // HEAD dulu (ringan); kalau server menolak HEAD, coba GET.
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "Karir-LinkCheck/1.0" },
    });
    let hops = 0;
    while (
      res.status >= 300 &&
      res.status < 400 &&
      res.headers.get("location") &&
      hops < 5
    ) {
      const next = new URL(res.headers.get("location"), url).toString();
      res = await fetch(next, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "Karir-LinkCheck/1.0" },
      });
      hops++;
    }
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "Karir-LinkCheck/1.0" },
      });
    }
    return NextResponse.json({
      no,
      url,
      ok: res.status < 400,
      status: res.status,
      finalUrl: res.url || url,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      no,
      url,
      ok: false,
      status: 0,
      finalUrl: url,
      checkedAt: new Date().toISOString(),
      error: err?.name === "AbortError" ? "Timeout 10 detik." : "Tidak bisa dihubungi.",
    });
  } finally {
    clearTimeout(timer);
  }
}
