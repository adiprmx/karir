import { ImageResponse } from "next/og";
import { getCompanyByIdOrSeed } from "@/lib/companies";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }) {
  const { no } = await params;
  const company = await getCompanyByIdOrSeed(no);
  const name = company ? company.perusahaan : "Karir";
  const status = company ? company.status : "";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#ffffff",
          color: "#0a0a0a",
          padding: 80,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            lineHeight: 1.15,
          }}
        >
          {name}
        </div>
        {status ? (
          <div style={{ fontSize: 32, marginTop: 28 }}>{status}</div>
        ) : null}
        <div style={{ fontSize: 28, color: "#52525b", marginTop: 16 }}>
          Karir
        </div>
      </div>
    ),
    { ...size },
  );
}
