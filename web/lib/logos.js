"use client";

/* Logo asli perusahaan dari domain link karir resminya, lewat layanan
 * favicon Google. Domain TIDAK pernah ditebak: hanya yang tertulis di
 * link karir. Bila link kosong, tidak valid, atau gambar gagal dimuat,
 * tile menampilkan inisial nama perusahaan supaya baris tetap rapi. */
import { useEffect, useRef, useState } from "react";

export function logoUrl(linkKarir) {
  if (!linkKarir || typeof linkKarir !== "string") return null;
  try {
    const domain = new URL(linkKarir).hostname;
    if (!domain) return null;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  } catch {
    return null;
  }
}

function initialsOf(name) {
  return String(name || "?")
    .replace(/^(PT|CV)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function CompanyLogo({ linkKarir, name, size = 44 }) {
  const src = logoUrl(linkKarir);
  const [failed, setFailed] = useState(false);
  const img = useRef(null);
  /* Gambar dari server bisa gagal sebelum React terpasang; cek saat mount. */
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);
  return (
    <span
      className="logo"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {src && !failed ? (
        <img
          ref={img}
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="logo-init" style={{ fontSize: Math.round(size * 0.36) }}>
          {initialsOf(name)}
        </span>
      )}
    </span>
  );
}
