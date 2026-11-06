"use client";

/* Komponen visual Karir: angka yang naik, donat, bar animasi, ikon
 * kategori, titik status, dan pencarian langsung. Semua animasi mati
 * bila pengguna memakai prefers-reduced-motion. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { saveRecentSearch } from "@/app/recent";

function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* Muncul saat masuk viewport: sekali saja, lalu observer dilepas.
 * Pengguna prefers-reduced-motion langsung melihat isinya. */
export function Reveal({ children, delay = 0, className }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (reducedMotion()) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const cls = `reveal${shown ? " revealed" : ""}${
    className ? ` ${className}` : ""
  }`;
  const style = delay ? { transitionDelay: `${delay}ms` } : undefined;
  return (
    <div ref={ref} className={cls} style={style}>
      {children}
    </div>
  );
}

/* Angka yang naik dari 0 ke nilai asli, baru jalan saat terlihat. */
export function CountUp({ value }) {
  const ref = useRef(null);
  const [n, setN] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (reducedMotion()) {
      setN(value);
      setStarted(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setStarted(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);
  useEffect(() => {
    if (!started) return;
    if (reducedMotion()) {
      setN(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 700;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, started]);
  return (
    <span ref={ref} className="num">
      {n}
    </span>
  );
}

/* Titik status: hijau berdenyut untuk lowongan target, kuning untuk
 * tidak cocok, abu untuk sisanya. */
export function StatusDot({ status }) {
  const cls =
    status === "Ada lowongan target"
      ? "dot ok pulse"
      : status === "Ada lowongan target (tidak cocok)"
        ? "dot warn"
        : "dot";
  return <span className={cls} aria-hidden="true" />;
}

/* Ikon garis sederhana per kategori (dekorasi, bukan logo merek). */
const ICONS = {
  Manufaktur: (
    <path d="M3 21V9l6 4V9l6 4V5h4v16H3z" />
  ),
  Mining: (
    <path d="M3 20L10 5l4 8 3-5 4 12H3z" />
  ),
  Tech: (
    <rect x="6" y="6" width="12" height="12" rx="2" />
  ),
  Fintech: (
    <rect x="3" y="6" width="18" height="13" rx="2" />
  ),
  BUMN: (
    <path d="M4 21V5a2 2 0 012-2h9a2 2 0 012 2v16M4 21h16M9 9h2m3 0h2M9 13h2m3 0h2" />
  ),
  BANK: (
    <path d="M3 10l9-6 9 6M4 10v9m4-9v9m4-9v9m4-9v9m4-9v9" />
  ),
  FMCG: (
    <path d="M3 9l9-5 9 5v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
  ),
  Retail: (
    <path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6" />
  ),
};

export function CategoryIcon({ kategori }) {
  const path = ICONS[kategori] || (
    <path d="M4 8h16v11H4zM9 8V6a3 3 0 016 0v2" />
  );
  return (
    <svg
      className="cat-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

/* Donat SVG: segmen tumbuh dari 0 saat komponen muncul. */
export function DonutChart({ segments, total, centerLabel }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(t);
  }, []);
  let offset = 25; // mulai dari atas
  return (
    <div className="donut-wrap">
      <svg
        className="donut"
        viewBox="0 0 120 120"
        width="160"
        height="160"
        role="img"
        aria-label={centerLabel}
      >
        <circle cx="60" cy="60" r="48" fill="none" stroke="#f4f4f5" strokeWidth="16" />
        {segments.map((s) => {
          const frac = total > 0 ? s.value / total : 0;
          const len = frac * 100;
          const dash = ready ? `${len} ${100 - len}` : "0 100";
          const el = (
            <circle
              key={s.label}
              cx="60"
              cy="60"
              r="48"
              fill="none"
              stroke={s.color}
              strokeWidth="16"
              pathLength="100"
              strokeDasharray={dash}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dasharray 700ms ease-out" }}
            />
          );
          offset -= len;
          return el;
        })}
        <text x="60" y="58" textAnchor="middle" className="donut-num">
          {total}
        </text>
        <text x="60" y="74" textAnchor="middle" className="donut-label">
          {centerLabel}
        </text>
      </svg>
      <ul className="donut-legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span
              className="legend-swatch"
              style={{ background: s.color }}
              aria-hidden="true"
            />
            <span className="legend-label">{s.label}</span>
            <span className="legend-num num">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Bar horizontal yang tumbuh dari 0 saat muncul. */
export function AnimatedBar({ value, max, color }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() =>
      setW(max > 0 ? Math.round((value / max) * 100) : 0),
    );
    return () => cancelAnimationFrame(t);
  }, [value, max]);
  return (
    <span className="bar-track">
      <span
        className="bar-fill"
        style={{ width: `${w}%`, background: color || "#0a0a0a" }}
      />
    </span>
  );
}

/* Tombol cetak: memanggil dialog cetak browser. */
export function PrintButton({ label }) {
  return (
    <button
      type="button"
      className="btn ghost"
      onClick={() => window.print()}
    >
      {label}
    </button>
  );
}

/* Pencarian langsung di Beranda: ketik, hasil 6 teratas muncul di bawah
 * tanpa pindah halaman. Enter atau tombol tetap mengirim form GET ke /cari.
 * Panah bawah/atas memilih hasil, Enter membuka hasil yang dipilih,
 * Escape menutup daftar. */
export function LiveSearch({ labels }) {
  const [domisili, setDomisili] = useState("");
  const [posisi, setPosisi] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef(null);
  const abort = useRef(null);

  /* Tutup dropdown saat halaman di-scroll, supaya tidak menutupi header. */
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, { passive: true });
    return () => window.removeEventListener("scroll", close);
  }, []);

  function run(d, p) {
    if (!d.trim() && !p.trim()) {
      setResults(null);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    if (abort.current) abort.current.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const q = new URLSearchParams({
      domisili: d,
      posisi: p,
      limit: "6",
    });
    fetch(`/api/companies?${q.toString()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setResults(j.results || []);
        setActive(-1);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      if (!results || results.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      if (!results || results.length === 0) return;
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && results && results[active]) {
        e.preventDefault();
        saveRecentSearch(domisili, posisi);
        window.location.assign(
          `/perusahaan/${results[active].company.no}`,
        );
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  function onChange(setter, other) {
    return (e) => {
      const v = e.target.value;
      setter(v);
      setActive(-1);
      clearTimeout(timer.current);
      timer.current = setTimeout(
        () => run(setter === setDomisili ? v : domisili, setter === setPosisi ? v : posisi),
        300,
      );
      void other;
    };
  }

  const activeId =
    active >= 0 && results && results[active]
      ? `live-result-${results[active].company.no}`
      : undefined;

  return (
    <div className="live-search">
      <form
        className="searchbar"
        method="get"
        action="/cari"
        onSubmit={() => saveRecentSearch(domisili, posisi)}
      >
        <label htmlFor="hero-domisili">{labels.domisili}</label>
        <input
          id="hero-domisili"
          name="domisili"
          type="text"
          placeholder={labels.domisiliPh}
          autoComplete="off"
          value={domisili}
          onChange={onChange(setDomisili)}
          onKeyDown={onKeyDown}
          onFocus={() => results && setOpen(true)}
          role="combobox"
          aria-expanded={open}
          aria-controls="live-results"
          aria-activedescendant={activeId}
        />
        <label htmlFor="hero-posisi">{labels.posisi}</label>
        <input
          id="hero-posisi"
          name="posisi"
          type="text"
          placeholder={labels.posisiPh}
          autoComplete="off"
          value={posisi}
          onChange={onChange(setPosisi)}
          onKeyDown={onKeyDown}
          onFocus={() => results && setOpen(true)}
          role="combobox"
          aria-expanded={open}
          aria-controls="live-results"
          aria-activedescendant={activeId}
        />
        <button type="submit">{labels.searchBtn}</button>
      </form>
      {open && (
        <div
          id="live-results"
          className="live-results"
          onMouseDown={(e) => e.preventDefault()}
          role="listbox"
          aria-label="Hasil pencarian"
        >
          {loading && (
            <div className="live-loading">
              <span className="shimmer" />
              <span className="shimmer" />
            </div>
          )}
          {!loading && results && results.length === 0 && (
            <p className="live-empty">
              Tidak ada yang cocok. Tekan {labels.searchBtn} untuk melihat
              semua kanal.
            </p>
          )}
          {!loading &&
            results &&
            results.map((e, i) => (
              <Link
                key={e.company.no}
                id={`live-result-${e.company.no}`}
                href={`/perusahaan/${e.company.no}`}
                className={
                  i === active ? "live-item live-item-active" : "live-item"
                }
                role="option"
                aria-selected={i === active}
              >
                <StatusDot status={e.company.status} />
                <span className="live-name">{e.company.perusahaan}</span>
                <span className="live-meta">
                  {e.company.lokasi ? `${e.company.lokasi} · ` : ""}
                  {e.score}
                </span>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
