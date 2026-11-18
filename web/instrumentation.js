/* Instrumentasi Next.js (P-06, K3): dieksekusi sekali saat server
 * start (runtime nodejs). Tugasnya:
 * 1. Muat konfigurasi Sentry server (sentry.server.config.js) —
 *    Sentry.init hanya jalan bila env SENTRY_DSN dipasang; tanpa
 *    DSN, SDK tidak diinisialisasi dan semua pemanggilan Sentry
 *    menjadi no-op diam (fail-safe Fase A).
 * 2. Daftarkan sink observabilitas: sentrySink (satu exception per
 *    kode per jam) + incidentsSink (log terstruktur ke Firestore,
 *    dedup per kode per jam). Pendaftaran memakai Set, jadi aman
 *    bila register() dipanggil lebih dari sekali.
 *
 * onRequestError (pola resmi Next.js 16 + @sentry/nextjs v11):
 * menangkap error request server yang lolos dari handler rute dan
 * meneruskannya ke Sentry. Bentuknya BUKAN re-ekspor nama
 * (`export { onRequestError } from "@sentry/nextjs"` — nama itu
 * tidak diekspor paket dan mematahkan build Turbopack, terbukti
 * deployment Vercel 18 Nov 2026), melainkan penugasan dari
 * Sentry.captureRequestError. Tanpa DSN, penugasan ini tetap aman —
 * captureRequestError no-op bila SDK tidak diinisialisasi. */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config.js");
    const { registerObservabilitySink } = await import(
      "./lib/observability.js"
    );
    const { sentrySink } = await import("./lib/sentry.js");
    const { incidentsSink } = await import("./lib/incidents.js");
    registerObservabilitySink(sentrySink);
    registerObservabilitySink(incidentsSink);
  }
}

export const onRequestError = Sentry.captureRequestError;
