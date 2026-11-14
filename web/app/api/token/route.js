/* GET /api/token — keluarkan token berumur pendek untuk memanggil
 * /api/index. Token hanya diberikan bila halaman peminta berasal
 * dari situs ini sendiri: origin header Referer atau Origin harus
 * sama dengan origin request. Tanpa origin yang cocok, jawab 403.
 * Penerimaan desain (SEC-11): gerbang Referer/Origin ini adalah
 * pemeriksaan asal situs yang sama, BUKAN autentikasi — token bisa
 * diperoleh browser mana pun yang membuka situs, oleh desain, dan
 * header Referer/Origin memang bisa dipalsukan klien non-browser.
 * Yang membatasi penyalahgunaan adalah penolakan UA otomatis +
 * batas laju per hash IP di bawah, bukan kerahasiaan token.
 * Firebase App Check sengaja tidak dipakai: keputusan koordinator
 * adalah opsi minimal yang diizinkan audit (terima sebagai desain,
 * bukan membangun App Check). Catatan penerimaan desain di
 * SECURITY.md dikerjakan batch dokumen; komentar ini menjaga
 * alasannya tetap menempel pada kode.
 * Gerbang: tolak UA otomatis (403), lalu batas laju 60/menit per
 * hash IP lewat limiter bersama (429) — batas longgar, karena
 * pemakaian normal hanya ~1 token per menit (BE-11). Urutan gerbang
 * disengaja: cek origin jalan SEBELUM batas laju, supaya request
 * dari luar situs tidak membakar jatah batas laju.
 * Respons membawa `expiresIn` (detik) supaya klien tahu umur token
 * tanpa menebak (BE-12); nilainya sama dengan umur yang diterima
 * /api/index (TOKEN_MAX_AGE_SEC, satu sumber kebenaran).
 * Secret dibaca dari env API_TOKEN_SECRET dan tidak punya nilai
 * pengganti: bila env kosong, rute menjawab 503 dan tidak
 * mengeluarkan token. Secret dan token tidak pernah dicatat. */
import { NextResponse } from "next/server";
import { issueToken, isBotUa, getClientIp, TOKEN_MAX_AGE_SEC } from "@/lib/api-guard";
import { getSharedLimiter, scopedKey } from "@/lib/rate-limit";
import { hashVisitor, todayJakarta } from "@/lib/analytics-server";
import { requireEnv } from "@/lib/require-env";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const LIMIT_PER_MINUTE = 60;

function headerOrigin(value) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

export async function GET(request) {
  if (isBotUa(request.headers.get("user-agent") || "")) {
    return NextResponse.json(
      { error: "Permintaan otomatis ditolak." },
      { status: 403 },
    );
  }
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
  /* Batas laju memakai hash IP; bila garam analitik belum dipasang,
   * hash tidak bisa dibuat dan batas laju dilewati — tidak ada hash
   * lemah dan tidak ada IP mentah yang disimpan. */
  let limited = false;
  try {
    const key = scopedKey(
      "token",
      hashVisitor(getClientIp(request), todayJakarta()),
    );
    limited = !(await getSharedLimiter().check(key, LIMIT_PER_MINUTE, WINDOW_MS));
  } catch {
    console.warn("Batas laju /api/token dilewati: env ANALYTICS_SALT belum dipasang.");
  }
  if (limited) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
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
    { token: issueToken(secret), expiresIn: TOKEN_MAX_AGE_SEC },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
