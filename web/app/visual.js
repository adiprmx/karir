"use client";

/* Komponen UI bersama Karir: ikon, animasi masuk, angka naik, stempel
 * status, sheet, toast, dan penyorot kata kunci. Semua gerak mati bila
 * pengguna memakai prefers-reduced-motion. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { toastDurationMs } from "@/lib/a11y";

export function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* ---------- Ikon ----------
 * Set gambar sendiri: garis lurus, sudut tegas, tebal 2. Sengaja bukan
 * Lucide: bentuknya mengikuti karakter tempat kerja (rak, palet, papan
 * nama), bukan ikon aplikasi generik. */
const ICONS = {
  home: <path d="M3.5 11.5 12 4l8.5 7.5M6 10v10h12V10M10 20v-6h4v6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.2" />
    </>
  ),
  map: <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20ZM9 4v13.5M15 6.5V20" />,
  bookmark: <path d="M6 3.5h12V21l-6-4.5L6 21Z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: <path d="M12 4 21 20H3ZM12 10v4.5M12 17.4v.2" />,
  dash: <path d="M6 12h12" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  ext: <path d="M14 4h6v6M20 4l-9.5 9.5M18 14v6H4V6h6" />,
  arrow: <path d="M4 12h16M14 6l6 6-6 6" />,
  back: <path d="M20 12H4M10 6l-6 6 6 6" />,
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  share: <path d="M12 15V4M7 9l5-5 5 5M5 14v6h14v-6" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  bars: <path d="M5 20v-8M12 20V5M19 20V9" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.4v.2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
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
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name] || null}
    </svg>
  );
}

/* ---------- Animasi masuk ---------- */

/* Muncul saat masuk viewport: sekali saja, lalu observer dilepas.
 * FE-03: konten tampil secara default di CSS; kelas `js` di <html>
 * (ditambahkan di bawah, sebelum cat pertama) yang mengaktifkan
 * keadaan tersembunyi — bila JavaScript gagal sebagian, kelas itu
 * tidak ada dan konten tetap terlihat. Properti lang/tabIndex/role/
 * label diteruskan ke elemen (UX-16 strip foto, AKSES-12 Dasbor). */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
  lang,
  tabIndex,
  role,
  label,
}) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useLayoutEffect(() => {
    document.documentElement.classList.add("js");
  }, []);
  useEffect(() => {
    if (reducedMotion()) {
      /* Tampilkan langsung dijadwalkan sebagai microtask: setState di
       * dalam callback, bukan sinkron di badan effect. */
      queueMicrotask(() => setShown(true));
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
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
      { threshold: 0.08, rootMargin: "0px 0px -32px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const cls = `reveal${shown ? " revealed" : ""}${className ? ` ${className}` : ""}`;
  return (
    <Tag
      ref={ref}
      className={cls}
      lang={lang}
      tabIndex={tabIndex}
      role={role}
      aria-label={label}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

/* Angka yang naik dari 0 ke nilai asli saat terlihat. Tanpa JavaScript
 * atau dengan reduced-motion, angka asli langsung tampil.
 * DASH-11: angka TIDAK di-reset ke 0 saat mount — reset itu membuat
 * nilai akhir hasil render server berkedip jadi 0 begitu komponen
 * dipasang, lalu diam di 0 sampai elemen terlihat. Animasi baru
 * dimulai dari 0 di dalam tick pertama, saat elemen sudah masuk
 * viewport; sebelum itu angka asli tetap tampil. */
export function CountUp({ value, duration = 800 }) {
  const ref = useRef(null);
  const [n, setN] = useState(value);
  useEffect(() => {
    if (reducedMotion()) {
      /* Nilai akhir dijadwalkan sebagai microtask: setState di dalam
       * callback, bukan sinkron di badan effect. */
      queueMicrotask(() => setN(value));
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now) => {
          const p = Math.min(1, (now - start) / duration);
          setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);
  return (
    <span ref={ref} className="num">
      {n}
    </span>
  );
}

/* ---------- Status ---------- */

const STATUS_META = {
  "Ada lowongan": { cls: "ok", icon: "check" },
  "Portal tidak bisa dibuka": { cls: "off", icon: "x" },
};

/* Stempel status: satu-satunya tempat warna hijau dan kuning dipakai
 * untuk arti. Stempel hijau "jatuh" sekali saat muncul, tidak berulang. */
export function StatusStamp({ status, index = 0 }) {
  const meta = STATUS_META[status] || { cls: "", icon: "dash" };
  return (
    <span className={`stamp ${meta.cls}`} style={{ "--i": index }}>
      <Icon name={meta.icon} size={13} />
      {status}
    </span>
  );
}

/* Penanda status kecil untuk daftar padat. Hanya menandai keadaan nyata. */
export function StatusDot({ status }) {
  const cls = status === "Ada lowongan" ? "dot ok" : "dot";
  return <span className={cls} aria-hidden="true" />;
}

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
    <button type="button" className="btn ghost" onClick={() => window.print()}>
      {label}
    </button>
  );
}

/* ---------- Sheet (panel dari bawah di HP) ---------- */

/* Selektor elemen yang bisa difokus keyboard, untuk jebakan fokus. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

/* Sheet: dialog modal. Perilaku fokusnya satu sistem dengan fokus
 * pindah rute (template.js): saat dibuka, fokus masuk ke panel dan
 * DIJEBAK di dalamnya (UX-07) sampai sheet ditutup; saat ditutup,
 * fokus kembali ke pemicunya. Konten di balik sheet dibuat `inert`
 * selama terbuka, supaya pembaca layar pun tidak bisa menjelajah ke
 * belakangnya. Sheet di-portal ke <body> supaya inert latar bekerja
 * di mana pun Sheet diletakkan (menu di navigasi, filter di /cari).
 * onClose dibaca lewat ref supaya efek tidak jalan ulang tiap render
 * pemanggil yang mengoper onClose inline. */
export function Sheet({ open, onClose, title, children }) {
  const panel = useRef(null);
  const back = useRef(null);
  const onCloseRef = useRef(onClose);
  /* Simpan onClose terbaru tanpa me-render ulang effect fokus:
   * pemanggil yang mengirim arrow inline (search-app) membuat
   * identitas onClose berubah tiap render. Penulisan ref dilakukan
   * di effect, bukan saat render (aturan react-hooks/refs). */
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    /* Portal hanya setelah mount klien, supaya render server dan
     * render pertama klien sama (null) — tanpa portal saat SSR. */
    queueMicrotask(() => setMounted(true));
  }, []);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    panel.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = focusableIn(panel.current);
      if (items.length === 0) {
        e.preventDefault();
        panel.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = panel.current.contains(active);
      if (e.shiftKey) {
        if (active === first || !inside) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !inside) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const inerted = [];
    for (const child of document.body.children) {
      if (child === panel.current || child === back.current) continue;
      /* Toast dikecualikan supaya pengumumannya tetap terdengar
       * selama sheet terbuka (tautannya tetap tak terjangkau Tab
       * karena jebakan fokus di atas). */
      if (child.classList && child.classList.contains("toast-wrap")) continue;
      if (child.hasAttribute("inert")) continue;
      child.setAttribute("inert", "");
      inerted.push(child);
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      for (const el of inerted) el.removeAttribute("inert");
      if (prev && prev.focus) prev.focus();
    };
  }, [open]);
  if (!mounted) return null;
  return createPortal(
    <>
      <div
        ref={back}
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
    </>,
    document.body,
  );
}

/* ---------- Dialog konfirmasi ---------- */

/* Konfirmasi sebelum aksi yang tidak bisa diurungkan (LAM-07 hapus
 * lamaran, ONB-11 hapus pilihan): Sheet yang sama dengan panel lain,
 * jadi perilaku fokus, Escape, dan inert-nya ikut satu sistem.
 * `message` boleh string atau elemen. Tutup lewat latar/Escape sama
 * dengan batal (onCancel). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Batal",
  onConfirm,
  onCancel,
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <p>{message}</p>
      <div className="actions-row" style={{ marginTop: 16 }}>
        <button type="button" className="btn" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </Sheet>
  );
}

/* ---------- Toast ---------- */

export function showToast(message, href, label) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("karir-toast", { detail: { message, href, label } }),
  );
}

/* AKSES-08: toast yang berisi tautan bertahan 9 detik (bukan 3,6)
 * supaya pengguna keyboard sempat mencapai tautannya; semua toast
 * bisa ditutup manual lewat tombol tutup yang bisa difokus. */
export function ToastHost({ closeLabel }) {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    let id;
    const on = (e) => {
      setToast({ ...e.detail, k: Date.now() });
      clearTimeout(id);
      id = setTimeout(
        () => setToast(null),
        toastDurationMs(Boolean(e.detail.href)),
      );
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
          <button
            type="button"
            className="toast-close"
            onClick={() => setToast(null)}
            aria-label={closeLabel || "Tutup pemberitahuan"}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
