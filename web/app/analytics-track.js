"use client";

/* Pengirim event pengunjung Karir: dipakai ulang dari lib/analytics.js
 * tim inti (export getVisitorId() + trackEvent()). Bentuk event:
 * {type, path, q?, results?, filter?, companyNo?, action?}; type:
 * pageview, search, detail, portal_click, tracker_mark, filter,
 * onboarding, report, channel_copy, share. Dikirim dengan sendBeacon,
 * tanpa await yang memblokir, tanpa throw.
 *
 * Aturan anti-duplikasi share vs portal_click (MKT-07): klik kanal
 * LAMAR (portal web, wa.me/<nomor> WA HRD, mailto: email HRD) tercatat
 * sebagai portal_click; klik/tindakan BERBAGI (tombol bagikan,
 * tautan wa.me TANPA nomor) tercatat sebagai share dengan penanda
 * sumber di field action ("detail" / "daftar_target" / "hasil_cari").
 * Satu klik hanya menghasilkan satu event — klasifikasinya saling
 * lepas, dan listener memeriksa share dulu lalu berhenti (return)
 * sebelum memeriksa portal_click. Pembeda wa.me adalah path-nya:
 * ada nomor → kanal lamar, tanpa nomor (wa.me/?text=...) → berbagi.
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

/* ============ BLOK LOGIKA MURNI (MKT-07) ============
 * Fungsi-fungsi di antara penanda __PURE_START__ dan __PURE_END__
 * diuji unit lewat ekstraksi sumber di lib/analytics.test.js:
 * berkas ini tidak bisa diimpor langsung oleh node:test karena
 * impor next/navigation. Blok ini WAJIB mandiri: hanya memakai
 * global standar (URL, Number), tanpa impor atau state lain.
 * Jangan menambah ketergantungan di dalam blok ini.
/* __PURE_START__ */

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

/* Klasifikasi tautan keluar di halaman detail untuk portal_click
 * (ANALITIK-01/05). Kembalikan kanal ("portal" | "wa" | "email")
 * atau null bila tautan bukan klik lamar: tautan internal, tautan
 * github.com (bukan kanal lamar), skema lain, atau tautan BERBAGI
 * (wa.me tanpa nomor — lihat classifyShareLink). Klik ke WA HRD
 * (wa.me/<nomor>) dan email (mailto:) ikut terhitung dengan penanda
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
  if (url.hostname === "wa.me") {
    /* MKT-07: wa.me/<nomor> adalah kanal lamar WA HRD; wa.me tanpa
     * nomor (wa.me/?text=...) adalah tautan berbagi, bukan lamar —
     * kembalikan null supaya tidak tercatat sebagai portal_click
     * (pencatatan ganda). Tautan berbagi ditangani
     * classifyShareLink. */
    return /^\/\d/.test(url.pathname) ? "wa" : null;
  }
  return "portal";
}

/* Klasifikasi tautan berbagi (MKT-07). Kembalikan sumber
 * ("detail" | "daftar_target") atau null bila tautan bukan aksi
 * berbagi. Satu-satunya bentuk tautan berbagi saat ini adalah
 * wa.me TANPA nomor: tombol "WhatsApp" di halaman detail dan
 * tautan "Bagikan daftar lowongan" di beranda sama-sama memakai
 * wa.me/?text=.... Nilai "hasil_cari" dicadangkan untuk tombol
 * bagikan hasil di /cari bila sudah ada (pengirim langsung
 * trackEvent, bukan lewat listener ini). */
export function classifyShareLink(href, path) {
  if (typeof href !== "string" || !href) return null;
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.hostname !== "wa.me") return null;
  /* Ada path bernomor (wa.me/<nomor>) berarti kanal lamar WA HRD,
   * bukan berbagi — ditangani classifyPortalLink. */
  if (url.pathname !== "/" && url.pathname !== "") return null;
  if (extractCompanyNo(path) !== null) return "detail";
  if (path === "/") return "daftar_target";
  return null;
}

/* __PURE_END__ */
/* ============ AKHIR BLOK LOGIKA MURNI ============ */

/* Halaman admin tidak dilacak (ANALITIK-07): kunjungan pengelola
 * sendiri tidak boleh mencemari statistik pengunjung. */
export function isAdminPath(path) {
  return (
    path === "/admin" ||
    (typeof path === "string" && path.startsWith("/admin/"))
  );
}

/* Satu komponen kecil untuk tiga hal: pageview sekali per navigasi
 * (kecuali halaman admin), dan satu delegated click listener untuk
 * klik lamar di halaman detail plus klik berbagi (MKT-07). Listener
 * membaca tautan yang diklik (a[href^="http"] atau a[href^="mailto:"]):
 * tautan berbagi (wa.me tanpa nomor) di halaman detail atau beranda
 * tercatat sebagai share; tautan kanal lamar (portal web, wa.me/<nomor>,
 * email) di halaman detail tercatat sebagai portal_click. Satu klik
 * hanya menghasilkan satu event — share diperiksa dulu, lalu return.
 * Halaman detail tidak disentuh sama sekali. */
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
        const a = e.target && e.target.closest
          ? e.target.closest('a[href^="http"], a[href^="mailto:"]')
          : null;
        if (!a) return;
        const companyNo = extractCompanyNo(path);
        /* Berbagi dulu (MKT-07): tautan wa.me tanpa nomor di halaman
         * detail ("WhatsApp") atau beranda ("Bagikan daftar lowongan")
         * tercatat sebagai share — dan return di sini menjamin klik
         * itu TIDAK ikut tercatat sebagai portal_click. */
        const shareSource = classifyShareLink(a.href, path);
        if (shareSource) {
          trackEvent({
            type: "share",
            path,
            ...(companyNo !== null ? { companyNo } : {}),
            action: shareSource,
          });
          return;
        }
        if (companyNo === null) return;
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
