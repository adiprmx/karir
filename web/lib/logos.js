"use client";

/* Logo asli perusahaan dari domain link karir resminya, lewat layanan
 * favicon Google. Domain TIDAK pernah ditebak: hanya yang tertulis di
 * link karir. Bila link kosong atau tidak valid, kembalikan null. */
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

/* Logo perusahaan sebagai client leaf: sembunyikan gambar bila favicon
 * gagal dimuat, supaya baris tetap rapi. */
export function CompanyLogo({ linkKarir, name, size }) {
  const src = logoUrl(linkKarir);
  if (!src) return null;
  return (
    <img
      className="company-logo"
      src={src}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}
