import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* Kartu bagikan: tinta, satu slab oranye, tanpa angka tulisan tangan. */
export default async function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f4f6f0", color: "#101c16", fontFamily: "sans-serif" }}>
        <div style={{ width: 360, background: "#ff6a13", display: "flex", alignItems: "flex-end", padding: 40, fontSize: 120, fontWeight: 900 }}>
          karir
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: 72 }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>Cari kanal lowongan kerja resmi</div>
          <div style={{ fontSize: 30, color: "#3a4840", marginTop: 28 }}>Dicek langsung di browser, bukan dicopas.</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
