export default function manifest() {
  return {
    name: "Karir: cari kanal lowongan kerja",
    short_name: "Karir",
    description: "Kanal karir resmi perusahaan Indonesia, dicek langsung di browser.",
    lang: "id",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6f0",
    theme_color: "#101c16",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
