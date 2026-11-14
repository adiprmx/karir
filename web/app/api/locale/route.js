/* GET /api/locale?lang=id|en&next=/jalan — atur cookie bahasa lalu kembali. */
import { NextResponse } from "next/server";

/* Target kembali yang aman (SEC-04): hanya jalur di origin sendiri.
 * Guard lama hanya menolak `//` — `next=/\evil.com` lolos guard itu
 * dan parser URL WHATWG mengubah backslash menjadi slash, sehingga
 * redirect keluar ke domain penyerang. Karena itu dua lapis
 * pemeriksaan: tolak karakter backslash mentah, DAN pastikan origin
 * hasil parse sama dengan origin request. Bentuk yang tidak lolos
 * diganti "/" — tidak pernah redirect ke luar situs. */
function safeNext(next, requestUrl) {
  if (typeof next !== "string" || next === "") return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  if (next.includes("\\")) return "/";
  let target;
  try {
    target = new URL(next, requestUrl);
  } catch {
    return "/";
  }
  let ownOrigin = "";
  try {
    ownOrigin = new URL(requestUrl).origin;
  } catch {
    return "/";
  }
  if (target.origin !== ownOrigin) return "/";
  return target.pathname + target.search + target.hash;
}

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const lang = params.get("lang") === "en" ? "en" : "id";
  const next = safeNext(params.get("next") || "/", request.url);
  const res = NextResponse.redirect(new URL(next, request.url));
  res.cookies.set("karir-locale", lang, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
  });
  return res;
}
