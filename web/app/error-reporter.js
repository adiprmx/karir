/* Pelapor error klien (P-06, K3): komponen "use client" tanpa
 * tampilan yang menangkap window.onerror + unhandledrejection dan
 * mengirimkannya ke /api/client-error (rute server yang meneruskan
 * ke Sentry + incidents sesudah dibersihkan). Dipasang sekali di
 * app/layout.js.
 *
 * Bukan SDK Sentry browser (keputusan bundle — lihat
 * /api/client-error): komponen ini hanya ~1 KiB dan tidak
 * menambah dependensi.
 *
 * Pembatas: paling banyak 1 laporan per menit dan 5 laporan per
 * sesi — error yang berulang (mis. loop render) tidak boleh
 * membanjiri endpoint. Pengiriman best-effort total: gagal kirim
 * tidak pernah mengganggu halaman. Tidak ada data pribadi yang
 * dikirim: hanya pesan error + path halaman + nomor baris. */
"use client";

import { useEffect } from "react";

const MIN_INTERVAL_MS = 60_000;
const MAX_PER_SESSION = 5;

let lastSentAt = 0;
let sentCount = 0;

function shouldReport() {
  const now = Date.now();
  if (sentCount >= MAX_PER_SESSION) return false;
  if (now - lastSentAt < MIN_INTERVAL_MS) return false;
  lastSentAt = now;
  sentCount += 1;
  return true;
}

function reportError({ message, url, lineno, colno }) {
  if (!shouldReport()) return;
  const payload = JSON.stringify({
    message: String(message || "Error tidak diketahui").slice(0, 500),
    url: typeof url === "string" ? url.slice(0, 200) : "",
    lineno: Number.isInteger(lineno) ? lineno : 0,
    colno: Number.isInteger(colno) ? colno : 0,
  });
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon("/api/client-error", blob)) return;
    }
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* Best-effort: gagal kirim tidak mengganggu halaman. */
    });
  } catch {
    /* Best-effort: lihat di atas. */
  }
}

export default function ErrorReporter() {
  useEffect(() => {
    const onError = (event) => {
      reportError({
        message:
          (event && event.message) || "Error tidak diketahui (onerror)",
        url: (event && event.filename) || window.location.pathname,
        lineno: event && event.lineno,
        colno: event && event.colno,
      });
    };
    const onUnhandledRejection = (event) => {
      const reason = event && event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Promise ditolak tanpa pesan";
      reportError({
        message: `Unhandled rejection: ${message}`,
        url: window.location.pathname,
        lineno: 0,
        colno: 0,
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener(
        "unhandledrejection",
        onUnhandledRejection,
      );
    };
  }, []);

  return null;
}
