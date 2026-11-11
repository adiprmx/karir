"use client";

/* Komponen UI bersama Karir v3: ikon, tag status, reveal, sheet, toast,
 * penyorot kata kunci. Semua gerak mati bila pengguna memakai
 * prefers-reduced-motion. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* ---------- Ikon ----------
 * Set gambar sendiri: garis tebal 2,5, ujung rata, sudut tegas, bentuk
 * persegi seperti papan nama. Tiap ikon dipakai untuk benda yang sama
 * dengan maknanya (rumah = beranda, bendera lamaran = tanda, dst). */
const ICONS = {
  home: <path d="M3 11 12 3l9 8M5.5 9.5V21h13V9.5M10 21v-6h4v6" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 6 6" />
    </>
  ),
  pin: (
    <>
      <path d="M12 22s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z" />
      <rect x="10" y="8" width="4" height="4" />
    </>
  ),
  map: <path d="M3 5.5 9 3l6 2.5L21 3v15.5L15 21l-6-2.5L3 21ZM9 3v15.5M15 5.5V21" />,
  flag: <path d="M6 21V3M6 4h13l-3 4.5 3 4.5H6" />,
  menu: <path d="M3 6.5h18M3 12h18M3 17.5h18" />,
  sun: (
    <>
      <rect x="8" y="8" width="8" height="8" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2 2M17.1 17.1l2 2M19.1 4.9l-2 2M6.9 17.1l-2 2" />
    </>
  ),
  moon: <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />,
  check: <path d="m4 12.5 5 5L20 6.5" />,
  alert: <path d="M12 3 22 21H2ZM12 10v5M12 17.8v.4" />,
  x: <path d="M5 5l14 14M19 5 5 19" />,
  ext: <path d="M13 3h8v8M21 3l-10 10M18 14v7H3V6h7" />,
  arrow: <path d="M3 12h17M14 6l6 6-6 6" />,
  back: <path d="M21 12H4M10 6l-6 6 6 6" />,
  sliders: (
    <>
      <path d="M3 7h9M17 7h4M3 17h4M12 17h9" />
      <rect x="12" y="4.5" width="5" height="5" />
      <rect x="7" y="14.5" width="5" height="5" />
    </>
  ),
  share: <path d="M12 15V3M7 8l5-5 5 5M4 13v8h16v-8" />,
  trash: <path d="M4 7h16M9 7V3h6v4M6 7l1 14h10l1-14" />,
  bars: <path d="M4 21V13M10 21V4M16 21V9M22 21H2" />,
  chevron: <path d="m5 9 7 7 7-7" />,
  info: (
    <>
      <rect x="3" y="3" width="18" height="18" />
      <path d="M12 11v6M12 7v.4" />
    </>
  ),
  user: (
    <>
      <rect x="8" y="3" width="8" height="8" />
      <path d="M3 21c0-4.5 4-7 9-7s9 2.5 9 7" />
    </>
  ),
  plus: <path d="M12 4v16M4 12h16" />,
};

export function Icon({ name, size = 20, filled = false, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name] || null}
    </svg>
  );
}

/* ---------- Animasi masuk ---------- */

/* Muncul sekali saat masuk layar. Tanpa JavaScript (kelas .js tidak ada)
 * isinya langsung tampil, lihat globals.css. */
export function Reveal({ children, className, as: Tag = "div", ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (reducedMotion() || !el || typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setShown(true));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: "0px 0px -24px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      className={`rv${shown ? " in" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/* ---------- Status ----------
 * Warna oranye hanya untuk "ada lowongan terverifikasi". Status lain
 * dibedakan lewat bentuk penanda dan teks. */

const STATUS_META = {
  "Ada lowongan target": { cls: "open", glyph: "full" },
  "Ada lowongan target (tidak cocok)": { cls: "partial", glyph: "half" },
  "Tidak ada lowongan target": { cls: "none", glyph: "empty" },
  "Tidak ada lowongan terlihat": { cls: "none", glyph: "empty" },
  "Tidak dapat diverifikasi": { cls: "unknown", glyph: "dashed" },
  "Portal tidak bisa dibuka": { cls: "dead", glyph: "cross" },
};

function Glyph({ kind }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 12 12",
    "aria-hidden": "true",
    focusable: "false",
  };
  if (kind === "full") {
    return (
      <svg {...common}>
        <rect width="12" height="12" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "half") {
    return (
      <svg {...common}>
        <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="1" y="1" width="5" height="10" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "dashed") {
    return (
      <svg {...common}>
        <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
      </svg>
    );
  }
  if (kind === "cross") {
    return (
      <svg {...common}>
        <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function StatusTag({ status }) {
  const meta = STATUS_META[status] || { cls: "none", glyph: "empty" };
  return (
    <span className={`tag ${meta.cls}`}>
      <Glyph kind={meta.glyph} />
      {status}
    </span>
  );
}

/* Kotak warna kecil untuk legenda sebaran status di Dasbor. */
export const STATUS_SWATCH = {
  "Ada lowongan target": "s0",
  "Ada lowongan target (tidak cocok)": "s1",
  "Tidak ada lowongan target": "s2",
  "Tidak ada lowongan terlihat": "s3",
  "Tidak dapat diverifikasi": "s4",
  "Portal tidak bisa dibuka": "s5",
};

/* ---------- Teks ---------- */

/* Sorot kata kunci yang cocok. Tanpa kata kunci, teks apa adanya. */
export function Highlight({ text, terms }) {
  if (!text) return text || null;
  const esc = (terms || [])
    .filter((t) => t && t.length > 1)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (esc.length === 0) return text;
  const re = new RegExp(`(${esc.join("|")})`, "gi");
  const parts = String(text).split(re);
  return parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : p));
}

export function PrintButton({ label }) {
  return (
    <button type="button" className="btn ghost small" onClick={() => window.print()}>
      {label}
    </button>
  );
}

/* ---------- Sheet (panel dari bawah di HP, dari kanan di layar lebar) ---------- */

export function Sheet({ open, onClose, title, children }) {
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    panel.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (prev && prev.focus) prev.focus();
    };
  }, [open, onClose]);
  return (
    <>
      <div
        className={`sheet-back${open ? " open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`sheet${open ? " open" : ""}`}
        inert={!open}
      >
        <div className="sheet-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Tutup"
          >
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/* ---------- Toast ---------- */

export function showToast(message, href, label) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("karir-toast", { detail: { message, href, label } }),
  );
}

export function ToastHost() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    let id;
    const on = (e) => {
      setToast({ ...e.detail, k: Date.now() });
      clearTimeout(id);
      id = setTimeout(() => setToast(null), 4000);
    };
    window.addEventListener("karir-toast", on);
    return () => {
      window.removeEventListener("karir-toast", on);
      clearTimeout(id);
    };
  }, []);
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.k}>
          <span>{toast.message}</span>
          {toast.href && <Link href={toast.href}>{toast.label}</Link>}
        </div>
      )}
    </div>
  );
}
