import Link from "next/link";
import "./globals.css";
import { getStats } from "@/lib/companies";

export const metadata = {
  title: "Karir — Cari Kanal Lowongan Kerja",
  description:
    "406 kanal karir resmi perusahaan Indonesia, dicek langsung di browser. Cari berdasarkan domisili dan posisi.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  const stats = getStats();
  return (
    <html lang="id">
      <body>
        <header className="site-header">
          <div className="wrap header-inner">
            <Link href="/" className="wordmark">
              KARIR
            </Link>
            <nav className="site-nav" aria-label="Navigasi utama">
              <Link href="/">Beranda</Link>
              <Link href="/cari">Cari</Link>
              <Link href="/dasbor">Dasbor</Link>
            </nav>
            <span className="header-count">{stats.total} perusahaan</span>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap footer-inner">
            <p>
              Data dicek langsung di browser pada 4 dan 5 November 2026. Lowongan
              bisa berubah setelah tanggal cek — selalu periksa portal resminya.
            </p>
            <p>
              <a
                href="https://github.com/adiprmx/karir"
                target="_blank"
                rel="noopener noreferrer"
              >
                Repo GitHub
              </a>
              {" · "}
              <a
                href="https://github.com/adiprmx/karir/blob/main/docs/METODE.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Metode pengecekan
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
