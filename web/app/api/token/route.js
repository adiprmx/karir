/* GET /api/token — keluarkan token berumur pendek (60 detik) untuk
 * memanggil /api/index. Token hanya diberikan bila halaman peminta
 * berasal dari situs ini sendiri: origin header Referer atau Origin
 * harus sama dengan origin request. Tanpa origin yang cocok, jawab 403.
 * Secret dibaca dari env API_TOKEN_SECRET. Bila env kosong, dipakai
 * string dev-only supaya pengembangan lokal tetap jalan; Vercel WAJIB
 * diisi env ini, karena secret dev itu sama di semua instalasi.
 * Secret dan token tidak pernah dicatat. */
import { NextResponse } from "next/server";
import { issueToken } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const DEV_ONLY_SECRET = "karir-dev-only-token-secret";

function headerOrigin(value) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

export async function GET(request) {
  let ownOrigin = "";
  try {
    ownOrigin = new URL(request.url).origin;
  } catch {
    ownOrigin = "";
  }
  const refererOrigin = headerOrigin(request.headers.get("referer"));
  const originHeader = request.headers.get("origin") || "";
  const fromOwnSite =
    (refererOrigin !== "" && refererOrigin === ownOrigin) ||
    (originHeader !== "" && originHeader === ownOrigin);
  if (!fromOwnSite) {
    return NextResponse.json(
      { error: "Token hanya diberikan untuk situs ini." },
      { status: 403 },
    );
  }
  const secret = process.env.API_TOKEN_SECRET || DEV_ONLY_SECRET;
  return NextResponse.json(
    { token: issueToken(secret) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
