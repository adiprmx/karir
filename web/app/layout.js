import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import { getStats } from "@/lib/companies";
import { getLocale, t } from "@/lib/i18n";
import LocaleToggle from "./locale-toggle";

export const metadata = {
  metadataBase: new URL("https://karir-adiprmx.vercel.app"),
  title: {
    default: "Karir — Cari Kanal Lowongan Kerja",
    template: "%s — Karir",
  },
  description:
    "406 kanal karir resmi perusahaan Indonesia, dicek langsung di browser. Cari berdasarkan domisili dan posisi.",
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: "Karir",
    title: "Karir — Cari Kanal Lowongan Kerja",
    description:
      "406 kanal karir resmi perusahaan Indonesia, dicek langsung di browser. Cari berdasarkan domisili dan posisi.",
  },
  twitter: {
    card: "summary",
    title: "Karir — Cari Kanal Lowongan Kerja",
    description:
      "406 kanal karir resmi perusahaan Indonesia, dicek langsung di browser.",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }) {
  const [stats, locale] = await Promise.all([getStats(), getLocale()]);
  return (
    <html lang={locale}>
      <body>
        <header className="site-header">
          <div className="wrap header-inner">
            <Link href="/" className="wordmark">
              KARIR
            </Link>
            <nav className="site-nav" aria-label="Navigasi utama">
              <Link href="/">{t(locale, "nav.home")}</Link>
              <Link href="/cari">{t(locale, "nav.search")}</Link>
              <Link href="/dasbor">{t(locale, "nav.dashboard")}</Link>
              <Link href="/tentang">{t(locale, "nav.about")}</Link>
              <Link href="/faq">{t(locale, "nav.faq")}</Link>
            </nav>
            <span className="header-count">
              {t(locale, "header.count", { n: stats.total })}
            </span>
            <Suspense
              fallback={
                <span className="locale-toggle" aria-hidden="true">
                  ID / EN
                </span>
              }
            >
              <LocaleToggle locale={locale} />
            </Suspense>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap footer-inner">
            <p>{t(locale, "footer.note")}</p>
            <p>
              <Link href="/tentang">{t(locale, "footer.about")}</Link>
              {" · "}
              <Link href="/metode">{t(locale, "footer.method")}</Link>
              {" · "}
              <Link href="/faq">{t(locale, "footer.faq")}</Link>
              {" · "}
              <Link href="/changelog">{t(locale, "footer.changelog")}</Link>
              {" · "}
              <a
                href="https://github.com/adiprmx/karir"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t(locale, "footer.repo")}
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
