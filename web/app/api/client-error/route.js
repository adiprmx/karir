/* POST /api/client-error — penampung error klien (P-06, K3).
 *
 * Browser tidak memakai SDK Sentry penuh (anggaran bundle hanya
 * tersisa ~10 KiB; SDK browser akan melampaui batas halaman —
 * keputusan didokumentasikan di laporan P-06, SDK penuh ditunda ke
 * P-10). Sebagai gantinya, komponen app/error-reporter.js mengirim
 * error window.onerror/unhandledrejection ke rute ini, dan rute ini
 * meneruskannya ke observabilitas server (log terstruktur + sink
 * Sentry server + incidents) sesudah dibersihkan.
 *
 * Perlindungan dari spam luar:
 * - Batas laju 10/menit per hash IP (lebih ketat dari rute baca).
 * - Body maks 4 KiB (413 bila lebih).
 * - Bentuk body ketat: { message: string wajib (maks 500 karakter),
 *   url?: string, lineno?: number, colno?: number } — field lain
 *   diabaikan, bentuk salah dijawab 400.
 * - URL disimpan HANYA path-nya (tanpa query/host) supaya token di
 *   query string tidak pernah tercatat.
 * - Pesan dibersihkan sanitizeMessage (email + kredensial URL
 *   disamarkan) oleh emitObservabilityEvent.
 * - Tidak ada field bebas (stack trace TIDAK diterima — bisa
 *   memuat data pengguna dari halaman lain). */
import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/api-guard";
import { createMemoryStore, scopedKey } from "@/lib/rate-limit";
import { hashVisitor, todayJakarta } from "@/lib/analytics-server";
import {
  OBS_CODES,
  emitObservabilityEvent,
} from "@/lib/observability";

const WINDOW_MS = 60_000;
const LIMIT_PER_MINUTE = 10;
const MAX_BODY_BYTES = 4096;
const MAX_MESSAGE_LENGTH = 500;

/* Limiter MEMORI LOKAL — alasan yang sama dengan /api/health:
 * limiter bersama membaca Firestore dan fail-open saat kuota
 * habis; rute ini harus tetap terlindungi justru saat itu. */
const localLimiter = createMemoryStore();

/* Ambil path dari URL (relatif atau absolut); kembalikan "" bila
 * tidak bisa diparse. Query + host dibuang — tidak pernah tercatat. */
export function urlPathOnly(raw) {
  if (typeof raw !== "string" || raw.length === 0) return "";
  try {
    const parsed = new URL(raw, "https://karir.local");
    return parsed.pathname.slice(0, 200);
  } catch {
    return "";
  }
}

export async function POST(request) {
  let limited = false;
  try {
    const key = scopedKey(
      "client-error",
      hashVisitor(getClientIp(request), todayJakarta()),
    );
    limited = !localLimiter.check(key, LIMIT_PER_MINUTE, WINDOW_MS);
  } catch {
    /* Batas laju dilewati bila garam belum dipasang — sama seperti
     * rute baca lain. */
  }
  if (limited) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }

  let raw;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Body tidak bisa dibaca." },
      { status: 400 },
    );
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Body terlalu besar." },
      { status: 413 },
    );
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Body bukan JSON yang valid." },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Body harus objek JSON." },
      { status: 400 },
    );
  }
  if (typeof body.message !== "string" || body.message.trim() === "") {
    return NextResponse.json(
      { error: "Field message wajib diisi." },
      { status: 400 },
    );
  }
  const message = body.message.slice(0, MAX_MESSAGE_LENGTH);
  const path = urlPathOnly(body.url);
  const lineno =
    Number.isInteger(body.lineno) && body.lineno >= 0 ? body.lineno : 0;
  const colno =
    Number.isInteger(body.colno) && body.colno >= 0 ? body.colno : 0;

  emitObservabilityEvent({
    code: OBS_CODES.CLIENT_ERROR,
    component: "client",
    message,
    meta: { path, lineno, colno },
  });
  return NextResponse.json({ ok: true });
}
