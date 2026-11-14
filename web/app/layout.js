import Link from "next/link";
import { Suspense } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { getStats } from "@/lib/companies";
import seed from "@/data/companies.json";
import { getLocale, t } from "@/lib/i18n";
import SiteNav from "./site-nav";
import AnalyticsTrack from "./analytics-track";
import { Icon, ToastHost } from "./visual";

/* Plus Jakarta Sans: huruf rancangan studio Indonesia (Tokotype), dibuat
 * untuk teks layar kecil dan terbaca jelas di HP murah. Berkasnya ikut di
 * repo (lisensi OFL), jadi tidak ada permintaan ke server font luar. */
const jakarta = localFont({
  src: "./fonts/PlusJakartaSans.woff2",
  variable: "--font-jakarta",
  weight: "200 800",
  display: "swap",
});

/* Jumlah kanal di deskripsi metadata ikut seed repo, bukan angka yang
 * dikode keras — data bertambah lewat hunting harian. */
const TOTAL_KANAL = seed.length;
const DESKRIPSI_PANJANG = `${TOTAL_KANAL} kanal karir resmi perusahaan Indonesia, dicek langsung di browser. Cari berdasarkan domisili dan posisi.`;
const DESKRIPSI_SINGKAT = `${TOTAL_KANAL} kanal karir resmi perusahaan Indonesia, dicek langsung di browser.`;

export const metadata = {
  metadataBase: new URL("https://karir-adiprmx.vercel.app"),
  title: {
    default: "Karir — Cari Kanal Lowongan Kerja",
    template: "%s — Karir",
  },
  description: DESKRIPSI_PANJANG,
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: "Karir",
    title: "Karir — Cari Kanal Lowongan Kerja",
    description: DESKRIPSI_PANJANG,
  },
  twitter: {
    card: "summary",
    title: "Karir — Cari Kanal Lowongan Kerja",
    description: DESKRIPSI_SINGKAT,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#12120f" },
  ],
};

/* Dijalankan sebelum cat pertama supaya tema tidak berkedip. Memakai
 * pilihan tersimpan; tanpa pilihan, mengikuti pengaturan perangkat. */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('karir-theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default async function RootLayout({ children }) {
  const locale = await getLocale();
  // Hitungan header tidak boleh menggagalkan build: kalau Firestore tidak
  // bisa dijangkau saat build, header tampil tanpa angka.
  let total = null;
  try {
    total = (await getStats()).total;
  } catch {
    total = null;
  }
  const labels = {
    home: t(locale, "nav.home"),
    search: t(locale, "nav.search"),
    map: t(locale, "nav.map"),
    lamaran: t(locale, "nav.lamaran"),
    dashboard: t(locale, "nav.dashboard"),
    about: t(locale, "nav.about"),
    method: t(locale, "nav.method"),
    faq: t(locale, "nav.faq"),
    changelog: t(locale, "nav.changelog"),
    settings: t(locale, "nav.settings"),
    mulai: t(locale, "nav.mulai"),
    menu: t(locale, "nav.menu"),
    theme: t(locale, "nav.theme"),
    count: total ? t(locale, "header.count", { n: total }) : "",
  };
  return (
    <html lang={locale} className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <noscript>
          <style>{`.reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body>
        <a className="skip" href="#main">
          {locale === "en" ? "Skip to content" : "Lewati ke isi"}
        </a>
        <Suspense fallback={null}>
          <SiteNav labels={labels} locale={locale} />
        </Suspense>
        <Suspense fallback={null}>
          <AnalyticsTrack />
        </Suspense>
        <main id="main">{children}</main>
        <footer className="foot">
          <div className="wrap foot-inner">
            <p className="foot-note">{t(locale, "footer.note")}</p>
            <p className="foot-note">{t(locale, "footer.privacy")}</p>
            <nav className="foot-links" aria-label="Footer">
              <Link href="/tentang">{t(locale, "footer.about")}</Link>
              <Link href="/metode">{t(locale, "footer.method")}</Link>
              <Link href="/faq">{t(locale, "footer.faq")}</Link>
              <Link href="/changelog">{t(locale, "footer.changelog")}</Link>
              <Link href="/peta">{t(locale, "footer.map")}</Link>
              <Link href="/pengaturan">{t(locale, "footer.settings")}</Link>
              <a
                href="https://github.com/adiprmx/karir"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t(locale, "footer.repo")}
                <Icon name="ext" size={13} />
              </a>
            </nav>
          </div>
        </footer>
        <ToastHost />
      </body>
    </html>
  );
}
