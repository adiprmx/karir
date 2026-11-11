import Link from "next/link";
import { Suspense } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { getStatsOrSeed } from "@/lib/companies";
import { formatDate } from "@/lib/dates";
import SiteNav from "./site-nav";
import AnalyticsTrack from "./analytics-track";
import { ToastHost } from "./visual";

/* Archivo variabel (tebal + lebar): huruf papan nama industri, nomor urut
 * bisa dipadatkan dan teks tetap lebar. Berkas lokal (OFL), tanpa
 * permintaan ke server font luar. */
const archivo = localFont({
  src: "./fonts/Archivo-wdth-wght.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});

const DESC =
  "Kanal karir resmi perusahaan Indonesia yang dicek langsung di browser. Cari berdasarkan domisili dan posisi.";

export const metadata = {
  metadataBase: new URL("https://karir-adiprmx.vercel.app"),
  title: { default: "Karir: cari kanal lowongan kerja", template: "%s | Karir" },
  description: DESC,
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: "Karir",
    title: "Karir: cari kanal lowongan kerja",
    description: DESC,
  },
  twitter: { card: "summary", title: "Karir: cari kanal lowongan kerja", description: DESC },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1410" },
  ],
};

/* Jalan sebelum cat pertama supaya tema tidak berkedip. */
const BOOT = `(function(){var d=document.documentElement;d.classList.add('js');try{var t=localStorage.getItem('karir-theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=t}catch(e){}})()`;

export default async function RootLayout({ children }) {
  /* Tanggal cek di footer dibaca dari data, bukan ditulis tangan. */
  let latest = null;
  try {
    const stats = await getStatsOrSeed();
    const keys = Object.keys(stats.byDate).sort();
    latest = keys.length ? keys[keys.length - 1] : null;
  } catch {
    latest = null;
  }
  return (
    <html lang="id" className={archivo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body>
        <a className="skip" href="#main">
          Lewati ke isi
        </a>
        <Suspense fallback={null}>
          <SiteNav />
        </Suspense>
        <Suspense fallback={null}>
          <AnalyticsTrack />
        </Suspense>
        <main id="main">{children}</main>
        <footer className="foot">
          <div className="wrap foot-in">
            <div>
              <p>
                {latest
                  ? `Data terakhir dicek ${formatDate(latest)}. `
                  : ""}
                Lowongan bisa berubah setelah tanggal cek, selalu periksa portal resminya.
              </p>
              <p style={{ marginTop: 8 }}>
                Masuk akun itu pilihan. Tanpa masuk, semua fitur tetap bisa
                dipakai dan lamaranmu hanya tersimpan di browser ini. Situs
                mencatat kunjungan secara anonim (halaman yang dibuka dan kata
                pencarian), tanpa nama atau email.
              </p>
            </div>
            <nav className="foot-links" aria-label="Tautan bawah">
              <Link href="/mulai">Mulai</Link>
              <Link href="/tentang">Tentang</Link>
              <Link href="/metode">Metode</Link>
              <Link href="/faq">FAQ</Link>
              <Link href="/changelog">Perubahan</Link>
              <Link href="/pengaturan">Pengaturan</Link>
              <a href="https://github.com/adiprmx/karir" target="_blank" rel="noopener noreferrer">
                Repo GitHub
              </a>
            </nav>
          </div>
        </footer>
        <ToastHost />
      </body>
    </html>
  );
}
