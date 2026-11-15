import Link from "next/link";
import { Suspense } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { getStats } from "@/lib/companies";
import seed from "@/data/companies.json";
import { getLocale, t } from "@/lib/i18n";
import SiteNav from "./site-nav";
import AnalyticsTrack from "./analytics-track";
import { InstallPromptListener } from "./install-prompt";
import { LabelsProvider } from "./labels-provider";
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
  /* Favicon: pakai ikon SVG yang sudah ada di public/ (FE-09). Tanpa
   * field ini browser meminta /favicon.ico dan mendapat 404. */
  icons: { icon: "/icon.svg" },
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: "Karir",
    title: "Karir — Cari Kanal Lowongan Kerja",
    description: DESKRIPSI_PANJANG,
  },
  twitter: {
    /* Gambar OG berukuran 1200x630, jadi pakai kartu gambar besar
     * (SEO-08): kartu "summary" menampilkan gambar kecil di X. */
    card: "summary_large_image",
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
    close: t(locale, "common.close"),
    /* W2a: label panel akun (UX-08) — diteruskan SiteNav ke AuthPanel.
     * Kunci invalidEmail..verifySent adalah pesan lib/account-data.js
     * (authErrorMessage dkk. menerima objek pesan sebagai argumen
     * kedua; tanpa itu pesan Indonesia dipakai sebagai bawaan). */
    auth: {
      account: t(locale, "settings.account"),
      loadingStatus: t(locale, "auth.loadingStatus"),
      signedInAs: t(locale, "settings.signedInAs"),
      syncNote: t(locale, "auth.syncNote"),
      notVerifiedNote: t(locale, "auth.notVerifiedNote"),
      resendVerify: t(locale, "auth.resendVerify"),
      checkAgain: t(locale, "settings.checkAgain"),
      verified: t(locale, "settings.emailVerified"),
      signingOut: t(locale, "auth.signingOut"),
      signOut: t(locale, "auth.signOut"),
      signInChoice: t(locale, "auth.signInChoice"),
      modeLabel: t(locale, "auth.modeLabel"),
      signIn: t(locale, "auth.signIn"),
      signUp: t(locale, "auth.signUp"),
      displayName: t(locale, "auth.displayName"),
      displayNameLabel: t(locale, "auth.displayNameLabel"),
      displayNamePh: t(locale, "auth.displayNamePh"),
      email: t(locale, "auth.email"),
      password: t(locale, "auth.password"),
      passwordPh: t(locale, "auth.passwordPh"),
      passwordPhSignUp: t(locale, "auth.passwordPhSignUp"),
      wait: t(locale, "auth.wait"),
      createAccount: t(locale, "auth.createAccount"),
      sending: t(locale, "settings.sending"),
      forgotPassword: t(locale, "auth.forgotPassword"),
      writeEmailFirst: t(locale, "auth.writeEmailFirst"),
      verifyStillNot: t(locale, "settings.verifyStillNot"),
      verifyCheckFailed: t(locale, "settings.verifyCheckFailed"),
      close: t(locale, "common.close"),
      invalidEmail: t(locale, "auth.errInvalidEmail"),
      wrongCredentials: t(locale, "auth.errWrongCredentials"),
      cannotRegister: t(locale, "auth.errCannotRegister"),
      weakPassword: t(locale, "auth.errWeakPassword"),
      tooManyRequests: t(locale, "auth.errTooManyRequests"),
      noConnection: t(locale, "auth.errNoConnection"),
      cannotSignIn: t(locale, "auth.errCannotSignIn"),
      resetSent: t(locale, "auth.resetSent"),
      cannotSendReset: t(locale, "auth.errCannotSendReset"),
      noAccount: t(locale, "auth.noAccount"),
      verifySent: t(locale, "auth.verifySent"),
    },
  };
  /* W2a: label bersama untuk komponen klien di dalam <main> (UX-08,
   * KONTEN-04, KONTEN-08) — toast pelacak (dipakai useTracker di
   * Beranda, /cari, dan halaman detail) dan halaman error. Label
   * halaman (Lamaran, Mulai, Pengaturan) ditambah layout rutenya
   * masing-masing lewat provider bersarang. */
  const sharedLabels = {
    trackerMarked: t(locale, "tracker.marked"),
    trackerView: t(locale, "tracker.view"),
    trackerSaveRefused: t(locale, "tracker.saveRefused"),
    trackerUnmarked: t(locale, "tracker.unmarked"),
    trackerInProgress: t(locale, "tracker.inProgress"),
    errorTitle: t(locale, "error.title"),
    errorMessage: t(locale, "error.message"),
    retry: t(locale, "search.retry"),
  };
  return (
    <html lang={locale} className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* MKT-10: umpan RSS perubahan lowongan — pembaca umpan
          * menemukannya lewat tautan ini. Ditulis langsung sebagai
          * tag link (bukan lewat metadata alternates) supaya selalu
          * ada di semua halaman tanpa bergantung pada semantik
          * gabung metadata antar-segmen. */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Karir — Perubahan lowongan"
          href="/feed.xml"
        />
        <noscript>
          <style>{`.reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body>
        <a className="skip" href="#main">
          {locale === "en" ? "Skip to content" : "Lewati ke isi"}
        </a>
        {/* AKSES-02: pesan jujur bila JavaScript nonaktif — halaman
          * yang butuh JS disebut namanya, bukan sekadar halaman kosong. */}
        <noscript>
          <p className="noscript-note">{t(locale, "common.noJs")}</p>
        </noscript>
        <Suspense fallback={null}>
          <SiteNav labels={labels} locale={locale} />
        </Suspense>
        <Suspense fallback={null}>
          <AnalyticsTrack />
        </Suspense>
        {/* MKT-08: menangkap event pasang aplikasi sejak awal supaya
          * kartu di /pengaturan tidak kelewat eventnya. */}
        <InstallPromptListener />
        {/* tabIndex -1: target skip link dan cadangan fokus pindah
          * rute (AKSES-01); tidak menambah tab stop. */}
        <LabelsProvider locale={locale} labels={sharedLabels}>
          <main id="main" tabIndex={-1}>{children}</main>
        </LabelsProvider>
        <footer className="foot">
          <div className="wrap foot-inner">
            <p className="foot-note">{t(locale, "footer.note")}</p>
            <p className="foot-note">{t(locale, "footer.privacy")}</p>
            <nav className="foot-links" aria-label="Footer">
              <Link href="/tentang">{t(locale, "footer.about")}</Link>
              <Link href="/metode">{t(locale, "footer.method")}</Link>
              <Link href="/faq">{t(locale, "footer.faq")}</Link>
              <Link href="/dukungan">{t(locale, "footer.support")}</Link>
              <Link href="/changelog">{t(locale, "footer.changelog")}</Link>
              <Link href="/peta">{t(locale, "footer.map")}</Link>
              <Link href="/pengaturan">{t(locale, "footer.settings")}</Link>
              <Link href="/privasi">{t(locale, "footer.privacyPolicy")}</Link>
              <Link href="/syarat">{t(locale, "footer.terms")}</Link>
              <Link href="/feed.xml">{t(locale, "footer.feed")}</Link>
              <a
                href="https://github.com/adiprmx/karir"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t(locale, "footer.repo")}
                {/* AKSES-13: beri tahu pembaca layar bahwa tautan
                  * membuka tab baru. */}
                <span className="sr-only"> {t(locale, "common.newTab")}</span>
                <Icon name="ext" size={13} />
              </a>
            </nav>
          </div>
        </footer>
        <ToastHost closeLabel={t(locale, "common.toastClose")} />
      </body>
    </html>
  );
}
