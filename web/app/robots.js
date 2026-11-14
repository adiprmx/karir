/* Kebijakan indexation (S7/SEO-03): crawler boleh menjelajah halaman
 * publik, tapi tidak /api/ (endpoint data, bukan konten) dan tidak
 * /admin (panel pemilik). /pengaturan memakai meta noindex, bukan
 * Disallow, supaya crawler tetap bisa membaca tag noindex-nya. */
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin"],
    },
    sitemap: "https://karir-adiprmx.vercel.app/sitemap.xml",
  };
}
