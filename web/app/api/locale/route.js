/* GET /api/locale?lang=id|en&next=/jalan — atur cookie bahasa lalu kembali.
 * Gerbang (SEC-14): tolak UA otomatis (403) + batas laju 60/menit per
 * hash IP lewat limiter bersama (429), sama seperti rute baca lain.
 * Cookie (SEC-16): `secure` + `httpOnly`. Cookie ini hanya dibaca
 * server (getLocale di lib/i18n.js lewat next/headers); tidak ada
 * JavaScript klien yang membacanya (grep document.cookie: nol),
 * jadi httpOnly aman. Secure aman karena situs hanya dilayani
 * lewat HTTPS (Vercel) dan localhost adalah konteks aman untuk
 * cookie Secure saat pengembangan. */
import { NextResponse } from "next/server";
import { isBotUa, getClientIp } from "@/lib/api-guard";
import { getSharedLimiter, scopedKey } from "@/lib/rate-limit";
import { hashVisitor, todayJakarta } from "@/lib/analytics-server";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const LIMIT_PER_MINUTE = 60;

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
      "locale",
      hashVisitor(getClientIp(request), todayJakarta()),
    );
    limited = !(await getSharedLimiter().check(key, LIMIT_PER_MINUTE, WINDOW_MS));
  } catch {
    console.warn("Batas laju /api/locale dilewati: env ANALYTICS_SALT belum dipasang.");
  }
  if (limited) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }
  const params = request.nextUrl.searchParams;
  const lang = params.get("lang") === "en" ? "en" : "id";
  const next = safeNext(params.get("next") || "/", request.url);
  const res = NextResponse.redirect(new URL(next, request.url));
  res.cookies.set("karir-locale", lang, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
    secure: true,
    httpOnly: true,
  });
  return res;
}
