"use client";

/* Pengirim event pengunjung Karir: dipakai ulang dari lib/analytics.js
 * tim inti (export getVisitorId() + trackEvent()). Bentuk event:
 * {type, path, q?, results?, filter?, companyNo?, action?}; type:
 * pageview, search, detail, portal_click, tracker_mark, filter,
 * onboarding, report, channel_copy. Dikirim dengan sendBeacon,
 * tanpa await yang memblokir, tanpa throw.
 *
 * Semua pengirim event di aplikasi mengimpor trackEvent dari file
 * ini (bukan dari lib/analytics langsung), jadi pembungkus
 * trackEvent di bawah adalah satu-satunya gerbang: opt-out di sini
 * berlaku untuk semua jenis event. */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackEvent as trackEventBase } from "@/lib/analytics";

/* Kunci localStorage untuk opt-out analitik (ANALITIK-11): bila
 * bernilai "1", tidak ada event apa pun yang dikirim. Toggle di
 * /pengaturan memakai setAnalyticsOptOut di bawah; kunci
 * karir-visitor sendiri ditampilkan/dihapus dari /pengaturan
 * (milik T4). */
export const ANALYTICS_OPT_OUT_KEY = "karir-tanpa-analitik";

export function isAnalyticsOptedOut() {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(ANALYTICS_OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAnalyticsOptOut(optOut) {
  try {
    if (typeof localStorage === "undefined") return;
    if (optOut) localStorage.setItem(ANALYTICS_OPT_OUT_KEY, "1");
    else localStorage.removeItem(ANALYTICS_OPT_OUT_KEY);
  } catch {
    /* Browser menolak penyimpanan: opt-out tidak tersimpan dan
     * event tetap terkirim. Tidak ada yang bisa dilakukan dari sini
     * selain tidak merusak halaman. */
  }
}

/* Gerbang tunggal pengiriman event: hormati opt-out, lalu teruskan
 * ke pengirim dasar. Semua pemanggil di aplikasi memakai fungsi ini. */
export function trackEvent(event) {
  if (isAnalyticsOptedOut()) return;
  trackEventBase(event);
}

/* Nomor perusahaan dari path /perusahaan/<no>; null bila path bukan
 * halaman detail atau nomornya bukan bilangan bulat (ANALITIK-01:
 * server menolak companyNo string, jadi klien WAJIB mengirim angka
 * — Number(m[1]) dengan penjaga, bukan m[1] mentah). */
export function extractCompanyNo(path) {
  if (typeof path !== "string") return null;
  const m = path.match(/^\/perusahaan\/([^/]+)$/);
  if (!m) return null;
  const no = Number(m[1]);
  return Number.isInteger(no) && no >= 1 ? no : null;
}

/* Halaman admin tidak dilacak (ANALITIK-07): kunjungan pengelola
 * sendiri tidak boleh mencemari statistik pengunjung. */
export function isAdminPath(path) {
  return (
    path === "/admin" ||
    (typeof path === "string" && path.startsWith("/admin/"))
  );
}

/* Klasifikasi tautan keluar di halaman detail untuk portal_click
 * (ANALITIK-01/05). Kembalikan kanal ("portal" | "wa" | "email")
 * atau null bila tautan bukan klik lamar: tautan internal, tautan
 * github.com (bukan kanal lamar), atau skema lain. Klik ke WA HRD
 * (wa.me) dan email (mailto:) ikut terhitung dengan penanda
 * kanalnya di field action, supaya perusahaan yang kanal utamanya
 * WA/email tidak tampak tidak diminati. */
export function classifyPortalLink(href, siteHostname) {
  if (typeof href !== "string" || !href) return null;
  if (href.startsWith("mailto:")) return "email";
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (siteHostname && url.hostname === siteHostname) return null;
  if (url.hostname === "github.com") return null;
  if (url.hostname === "wa.me") return "wa";
  return "portal";
}

/* Satu komponen kecil untuk dua hal: pageview sekali per navigasi
 * (kecuali halaman admin), dan satu delegated click listener untuk
 * klik lamar di halaman detail. Listener membaca tautan yang diklik
 * (a[href^="http"] atau a[href^="mailto:"]) dan hanya mengirim bila
 * sedang di /perusahaan/<no> dan tautan itu kanal lamar (portal web,
 * wa.me, atau email). Halaman detail tidak disentuh sama sekali. */
export default function AnalyticsTrack() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);

  useEffect(() => {
    /* Ref hanya ditulis di dalam effect, bukan saat render. */
    pathRef.current = pathname;
    if (!pathname) return;
    if (isAdminPath(pathname)) return;
    trackEvent({ type: "pageview", path: pathname });
  }, [pathname]);

  useEffect(() => {
    function onClick(e) {
      try {
        const path = pathRef.current || "";
        const companyNo = extractCompanyNo(path);
        if (companyNo === null) return;
        const a = e.target && e.target.closest
          ? e.target.closest('a[href^="http"], a[href^="mailto:"]')
          : null;
        if (!a) return;
        const channel = classifyPortalLink(a.href, window.location.hostname);
        if (!channel) return;
        trackEvent({
          type: "portal_click",
          path,
          companyNo,
          action: channel,
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
