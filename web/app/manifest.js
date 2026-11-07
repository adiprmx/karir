export default function manifest() {
  return {
    name: "Karir — Cari Kanal Lowongan Kerja",
    short_name: "Karir",
    description:
      "406 kanal karir resmi perusahaan Indonesia, dicek langsung di browser.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1ea",
    theme_color: "#15140f",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
