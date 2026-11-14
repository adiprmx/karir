import { getCompaniesOrSeed } from "@/lib/companies";

/* Di-render saat request, bukan saat build, supaya build tidak gagal
 * bila Firestore tidak bisa dijangkau dari mesin build. */
export const dynamic = "force-dynamic";

const BASE = "https://karir-adiprmx.vercel.app";

/* Halaman statis yang layak diindeks (SEO-03/FE-10). /lamaran dan
 * /pengaturan TIDAK masuk: isinya data personal pengunjung, tanpa
 * nilai pencarian — /pengaturan juga memakai meta noindex. /mulai
 * dan /dasbor tetap masuk sampai koordinator memutuskan (SEO-03). */
const STATIC_PATHS = [
  "",
  "/cari",
  "/dasbor",
  "/peta",
  "/mulai",
  "/tentang",
  "/metode",
  "/faq",
  "/dukungan",
  "/changelog",
  "/privasi",
  "/syarat",
];

const FALLBACK_DATE = new Date("2026-11-05");

export default async function sitemap() {
  const companies = await getCompaniesOrSeed();
  /* Tanggal halaman statis mengikuti cek data terbaru (tanggal_cek
   * terbesar di seed) — isi halaman statis berubah saat data dicek
   * ulang. Tanpa tanggal yang sah, pakai tanggal cadangan. */
  let latestCheck = FALLBACK_DATE;
  for (const c of companies) {
    if (!c.tanggal_cek) continue;
    const d = new Date(c.tanggal_cek);
    if (!Number.isNaN(d.getTime()) && d > latestCheck) latestCheck = d;
  }
  return [
    ...STATIC_PATHS.map((path) => ({
      url: `${BASE}${path}`,
      lastModified: latestCheck,
    })),
    ...companies.map((c) => ({
      url: `${BASE}/perusahaan/${c.no}`,
      lastModified: c.tanggal_cek
        ? new Date(c.tanggal_cek)
        : new Date("2026-11-05"),
    })),
  ];
}
