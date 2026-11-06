/* GET /api/locale?lang=id|en&next=/jalan — atur cookie bahasa lalu kembali. */
import { NextResponse } from "next/server";

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const lang = params.get("lang") === "en" ? "en" : "id";
  let next = params.get("next") || "/";
  if (!next.startsWith("/") || next.startsWith("//")) next = "/";
  const res = NextResponse.redirect(new URL(next, request.url));
  res.cookies.set("karir-locale", lang, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
  });
  return res;
}
