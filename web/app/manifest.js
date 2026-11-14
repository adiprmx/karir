import seed from "@/data/companies.json";

export default function manifest() {
  return {
    name: "Karir — Cari Kanal Lowongan Kerja",
    short_name: "Karir",
    description: `${seed.length} kanal karir resmi perusahaan Indonesia, dicek langsung di browser.`,
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1ea",
    theme_color: "#15140f",
    /* FE-08: ikon PNG 192/512 + maskable, dirender dari icon.svg yang
     * sama (latar penuh, tanda centang di zona aman tengah) — prasyarat
     * ajakan pasang (MKT-08). SVG dipertahankan sebagai cadangan. */
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
