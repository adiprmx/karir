/* GET /api/token — keluarkan token berumur pendek (60 detik) untuk
 * memanggil /api/index. Token hanya diberikan bila halaman peminta
 * berasal dari situs ini sendiri: origin header Referer atau Origin
 * harus sama dengan origin request. Tanpa origin yang cocok, jawab 403.
 * Secret dibaca dari env API_TOKEN_SECRET dan tidak punya nilai
 * pengganti: bila env kosong, rute menjawab 503 dan tidak mengeluarkan
 * token. Secret dan token tidak pernah dicatat. */
import { NextResponse } from "next/server";
import { issueToken } from "@/lib/api-guard";
import { requireEnv } from "@/lib/require-env";

export const dynamic = "force-dynamic";

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
  let secret;
  try {
    secret = requireEnv("API_TOKEN_SECRET");
  } catch {
    return NextResponse.json(
      { error: "Layanan token belum dikonfigurasi." },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { token: issueToken(secret) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
