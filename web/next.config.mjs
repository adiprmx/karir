/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /* Header keamanan (SEC-15): frame, content-type, referrer, HSTS.
   * - X-Frame-Options DENY: situs tidak memakai iframe sama sekali
   *   (grep <iframe>: nol), jadi tidak ada yang rusak bila situs
   *   tidak bisa di-frame pihak lain.
   * - Referrer-Policy strict-origin-when-cross-origin: request
   *   sesama origin tetap mengirim Referer penuh, jadi gerbang
   *   /api/token yang membaca Referer tidak terganggu; tautan
   *   keluar hanya membawa origin.
   * - HSTS TANPA includeSubDomains dan TANPA preload: cukup untuk
   *   host ini (Vercel hanya melayani HTTPS) tanpa mengunci
   *   subdomain lain atau mendaftarkan domain ke daftar preload
   *   browser yang sulit dicabut.
   * - CSP sengaja TIDAK ditambahkan di sini: situs memakai skrip
   *   dan gaya sebaris, dan kebijakan CSP yang salah bisa memecah
   *   halaman — itu pekerjaan terpisah bila diputuskan.
   * Header-header ini diverifikasi live pasca-deploy oleh
   * koordinator (tidak bisa dibuktikan dari kode saja). */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
