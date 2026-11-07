"use client";

/* Pengirim event pengunjung Karir: dipakai ulang dari lib/analytics.js
 * tim inti (export getVisitorId() + trackEvent()). Bentuk event:
 * {type, path, q?, companyNo?, action?}; type: pageview, search,
 * detail, portal_click, tracker_mark, filter. Dikirim dengan
 * sendBeacon, tanpa await yang memblokir, tanpa throw. */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics";

export { trackEvent };

/* Satu komponen kecil untuk dua hal: pageview sekali per navigasi, dan
 * satu delegated click listener untuk klik portal di halaman detail.
 * Listener membaca tautan yang diklik (a[href^="http"]) dan hanya
 * mengirim bila sedang di /perusahaan/<no> dan tautan itu bukan wa.me,
 * bukan github.com, dan bukan domain situs sendiri. Halaman detail
 * tidak disentuh sama sekali. */
export default function AnalyticsTrack() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (!pathname) return;
    trackEvent({ type: "pageview", path: pathname });
  }, [pathname]);

  useEffect(() => {
    function onClick(e) {
      try {
        const path = pathRef.current || "";
        const m = path.match(/^\/perusahaan\/([^/]+)$/);
        if (!m) return;
        const a = e.target && e.target.closest
          ? e.target.closest('a[href^="http"]')
          : null;
        if (!a) return;
        const url = new URL(a.href);
        if (url.hostname === window.location.hostname) return;
        if (url.hostname === "wa.me" || url.hostname === "github.com") return;
        trackEvent({
          type: "portal_click",
          path,
          companyNo: m[1],
        });
      } catch {
        /* Klik tetap jalan seperti biasa walau pelacakan gagal. */
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
