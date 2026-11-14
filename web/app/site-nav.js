"use client";

/* Kerangka navigasi Karir. Di HP: bilah atas tipis dan tab bawah yang
 * terjangkau jempol (5 tujuan, satu di antaranya Menu). Di layar lebar:
 * navigasi di bilah atas. Tema terang/gelap disimpan di browser. */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, Sheet } from "./visual";
import { useTracker } from "./tracker";
import AuthPanel, { AuthWatcher, useAuthUser } from "./auth-panel";

function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ThemeToggle({ label }) {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    /* Baca tema awal dijadwalkan sebagai microtask: setState di dalam
     * callback, bukan sinkron di badan effect. */
    queueMicrotask(() => {
      setTheme(
        document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      );
    });
  }, []);
  function flip() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("karir-theme", next);
    } catch {
      /* Browser menolak tulis: tema tetap berubah untuk sesi ini. */
    }
  }
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={flip}
      aria-label={label}
      aria-pressed={theme === "dark"}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
    </button>
  );
}

function LocaleSwitch({ locale }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search.toString();
  const next = encodeURIComponent(pathname + (qs ? `?${qs}` : ""));
  return (
    <span className="locale" role="group" aria-label="Bahasa / Language">
      <a
        href={`/api/locale?lang=id&next=${next}`}
        aria-current={locale === "id" ? "true" : undefined}
      >
        ID
      </a>
      <a
        href={`/api/locale?lang=en&next=${next}`}
        aria-current={locale === "en" ? "true" : undefined}
      >
        EN
      </a>
    </span>
  );
}

export default function SiteNav({ labels, locale }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const { entries } = useTracker();
  const tracked = Object.keys(entries || {}).length;
  const authUser = useAuthUser();
  const authLabel = authUser
    ? (authUser.displayName || authUser.email || "Akun")
        .split("@")[0]
        .slice(0, 12) || "Akun"
    : "Masuk";
  const close = useCallback(() => setMenu(false), []);

  /* Tutup menu begitu halaman berpindah. Penyesuaian state saat render
   * (pola resmi React untuk state yang mengikuti perubahan nilai lain),
   * bukan setState di dalam effect. */
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMenu(false);
  }

  const main = [
    { href: "/", label: labels.home, icon: "home" },
    { href: "/cari", label: labels.search, icon: "search" },
    { href: "/peta", label: labels.map, icon: "map" },
    { href: "/lamaran", label: labels.lamaran, icon: "bookmark", badge: tracked },
  ];
  const more = [
    { href: "/dasbor", label: labels.dashboard, icon: "bars" },
    { href: "/mulai", label: labels.mulai, icon: "user" },
    { href: "/pengaturan", label: labels.settings, icon: "sliders" },
    { href: "/tentang", label: labels.about, icon: "info" },
    { href: "/metode", label: labels.method, icon: "check" },
    { href: "/faq", label: labels.faq, icon: "info" },
    { href: "/changelog", label: labels.changelog, icon: "arrow" },
  ];
  const moreActive = more.some((m) => isActive(pathname, m.href));

  return (
    <>
      <AuthWatcher />
      <header className="topbar">
        <div className="wrap topbar-in">
          <Link href="/" className="brand" aria-label="Karir, beranda">
            <span className="brand-mark" aria-hidden="true">
              <Icon name="check" size={16} />
            </span>
            <span className="brand-word">karir</span>
          </Link>
          <nav className="topnav" aria-label="Navigasi utama">
            {[...main, more[0]].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive(pathname, n.href) ? "page" : undefined}
              >
                {n.label}
                {n.badge > 0 && <span className="badge-n num">{n.badge}</span>}
              </Link>
            ))}
          </nav>
          <div className="topbar-end">
            {labels.count && <span className="topbar-count num">{labels.count}</span>}
            <button
              type="button"
              className="btn small ghost"
              onClick={() => setMenu(true)}
              aria-haspopup="dialog"
              aria-expanded={menu}
              aria-label={
                authUser ? `Akun ${authUser.email}` : "Masuk atau daftar"
              }
            >
              <Icon name="user" size={16} />
              {authLabel}
            </button>
            <LocaleSwitch locale={locale} />
            <ThemeToggle label={labels.theme} />
            <Link href="/mulai" className="btn small top-cta">
              {labels.mulai}
            </Link>
          </div>
        </div>
      </header>

      <nav className="tabbar" aria-label="Navigasi utama">
        {main.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="tab"
            aria-current={isActive(pathname, n.href) ? "page" : undefined}
          >
            <span className="ti">
              <Icon name={n.icon} size={20} />
              {n.badge > 0 && <span className="badge-n num">{n.badge}</span>}
            </span>
            {n.label}
          </Link>
        ))}
        <button
          type="button"
          className="tab"
          aria-haspopup="dialog"
          aria-expanded={menu}
          aria-current={moreActive ? "page" : undefined}
          onClick={() => setMenu(true)}
        >
          <span className="ti">
            <Icon name="menu" size={20} />
          </span>
          {labels.menu}
        </button>
      </nav>

      <Sheet open={menu} onClose={close} title={labels.menu}>
        <AuthPanel />
        <ul className="menu-list">
          {more.map((m) => (
            <li key={m.href}>
              <Link
                href={m.href}
                aria-current={isActive(pathname, m.href) ? "page" : undefined}
                onClick={close}
              >
                <Icon name={m.icon} size={20} />
                {m.label}
                <Icon name="arrow" size={16} className="menu-go" />
              </Link>
            </li>
          ))}
        </ul>
        <div className="menu-tools">
          <LocaleSwitch locale={locale} />
          <ThemeToggle label={labels.theme} />
        </div>
      </Sheet>
    </>
  );
}
