import { getCompanies } from "@/lib/companies";

/* Di-render saat request, bukan saat build, supaya build tidak gagal
 * bila Firestore tidak bisa dijangkau dari mesin build. */
export const dynamic = "force-dynamic";

const BASE = "https://karir-adiprmx.vercel.app";

const STATIC_PAGES = [
  { path: "", lastModified: "2026-11-06" },
  { path: "/cari", lastModified: "2026-11-06" },
  { path: "/dasbor", lastModified: "2026-11-06" },
  { path: "/lamaran", lastModified: "2026-11-06" },
  { path: "/peta", lastModified: "2026-11-06" },
  { path: "/mulai", lastModified: "2026-11-06" },
  { path: "/tentang", lastModified: "2026-11-06" },
  { path: "/metode", lastModified: "2026-11-06" },
  { path: "/faq", lastModified: "2026-11-06" },
  { path: "/changelog", lastModified: "2026-11-06" },
];

export default async function sitemap() {
  const companies = await getCompanies();
  return [
    ...STATIC_PAGES.map((p) => ({
      url: `${BASE}${p.path}`,
      lastModified: new Date(p.lastModified),
    })),
    ...companies.map((c) => ({
      url: `${BASE}/perusahaan/${c.no}`,
      lastModified: c.tanggal_cek
        ? new Date(c.tanggal_cek)
        : new Date("2026-11-05"),
    })),
  ];
}
