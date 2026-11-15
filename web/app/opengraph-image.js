import { ImageResponse } from "next/og";
import seed from "@/data/companies.json";
import { OG_COLORS, OG_FONT } from "@/lib/og-theme";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: OG_COLORS.background,
          color: OG_COLORS.ink,
          padding: 80,
          fontFamily: OG_FONT,
        }}
      >
        <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: 6 }}>
          KARIR
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1.2,
            marginTop: 32,
          }}
        >
          Lowongan yang dicek, bukan yang dicopas.
        </div>
        <div style={{ fontSize: 28, color: OG_COLORS.muted, marginTop: 24 }}>
          {`${seed.length} kanal karir resmi`}
        </div>
      </div>
    ),
    { ...size },
  );
}
