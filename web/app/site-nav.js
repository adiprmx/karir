"use client";

/* Kerangka navigasi. HP: bilah atas tipis + dock bawah 5 tujuan (satu
 * adalah Menu, berlabel). Layar lebar: tautan di bilah atas, panel
 * Menu dari kanan. Tema terang/gelap disimpan di browser. */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Sheet } from "./visual";
import { useTracker } from "./tracker";
import AuthPanel, { AuthWatcher, useAuthUser } from "./auth-panel";

function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ThemeToggle() {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    queueMicrotask(() =>
      setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    );
  }, []);
  function flip() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("karir-theme", next);
    } catch {
      /* Tema tetap berubah untuk sesi ini. */
    }
  }
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={flip}
      aria-label="Ganti tema terang atau gelap"
      aria-pressed={theme === "dark"}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={20} />
    </button>
  );
}

const MAIN = [
  { href: "/", label: "Beranda", icon: "home" },
  { href: "/cari", label: "Cari", icon: "search" },
  { href: "/peta", label: "Peta", icon: "map" },
  { href: "/lamaran", label: "Lamaran", icon: "flag" },
];
const MORE = [
  { href: "/dasbor", label: "Dasbor", icon: "bars" },
  { href: "/mulai", label: "Mulai", icon: "user" },
  { href: "/pengaturan", label: "Pengaturan", icon: "sliders" },
  { href: "/tentang", label: "Tentang", icon: "info" },
  { href: "/metode", label: "Metode pengecekan", icon: "check" },
  { href: "/faq", label: "Pertanyaan umum", icon: "info" },
  { href: "/changelog", label: "Riwayat perubahan", icon: "arrow" },
];

export default function SiteNav() {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const { entries } = useTracker();
  const tracked = Object.keys(entries || {}).length;
  const authUser = useAuthUser();
  const close = useCallback(() => setMenu(false), []);

  /* Tutup menu begitu halaman berpindah (penyesuaian state saat render). */
  const [prev, setPrev] = useState(pathname);
  if (pathname !== prev) {
    setPrev(pathname);
    setMenu(false);
  }

  const moreActive = MORE.some((m) => isActive(pathname, m.href));

  return (
    <>
      <AuthWatcher />
      <header className="top">
        <div className="wrap top-in">
          <Link href="/" className="brand" aria-label="Karir, ke beranda">
            <span className="brand-sq" aria-hidden="true" />
            karir
          </Link>
          <nav className="top-nav" aria-label="Navigasi utama">
            {[...MAIN, MORE[0]].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive(pathname, n.href) ? "page" : undefined}
              >
                {n.label}
                {n.href === "/lamaran" && tracked > 0 && (
                  <span className="count num">{tracked}</span>
                )}
              </Link>
            ))}
          </nav>
          <div className="top-end">
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setMenu(true)}
              aria-haspopup="dialog"
            >
              <Icon name="user" size={18} />
              {authUser ? "Akun" : "Masuk"}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <nav className="dock" aria-label="Navigasi bawah">
        {MAIN.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive(pathname, n.href) ? "page" : undefined}
          >
            <Icon name={n.icon} size={22} />
            {n.label}
            {n.href === "/lamaran" && tracked > 0 && (
              <span className="count num">{tracked}</span>
            )}
          </Link>
        ))}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={menu}
          aria-current={moreActive ? "page" : undefined}
          onClick={() => setMenu(true)}
        >
          <Icon name="menu" size={22} />
          Menu
        </button>
      </nav>

      <Sheet open={menu} onClose={close} title="Menu">
        <ul className="mini-list">
          {MORE.map((m) => (
            <li key={m.href}>
              <Link
                href={m.href}
                aria-current={isActive(pathname, m.href) ? "page" : undefined}
                onClick={close}
              >
                <span className="mini-name">
                  <Icon name={m.icon} size={18} /> {m.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <AuthPanel />
      </Sheet>
    </>
  );
}
