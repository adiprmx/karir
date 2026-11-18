/* Konfigurasi Sentry server (P-06, K3). Dimuat oleh
 * instrumentation.js saat server start.
 *
 * Fail-safe: tanpa env SENTRY_DSN, Sentry.init TIDAK dipanggil dan
 * SDK tetap nonaktif diam — tidak ada log, tidak ada error, tidak
 * ada spam (Fase A: akun Sentry O-03 belum ada).
 *
 * Privasi: tracesSampleRate 0 (tanpa tracing performa — kuota
 * gratis dipakai untuk error, bukan trace), sendDefaultPii false,
 * dan beforeSend scrubSentryEvent menghapus user/header/cookie
 * serta menyamarkan kunci sensitif + email di semua konteks.
 * Environment dari VERCEL_ENV (production/preview/development)
 * dengan fallback NODE_ENV. */
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./lib/sentry.js";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment:
      process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
  });
}
