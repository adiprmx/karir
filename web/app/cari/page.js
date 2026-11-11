import { getCategoriesOrSeed, STATUS_ORDER } from "@/lib/companies";
import SearchApp from "./search-app";

/* Data di-render saat request, bukan saat build. */
export const dynamic = "force-dynamic";

export const metadata = { title: "Cari perusahaan" };

export default async function Cari({ searchParams }) {
  const params = await searchParams;
  const pick = (k) => (typeof params[k] === "string" ? params[k] : "");
  const categories = await getCategoriesOrSeed();
  return (
    <SearchApp
      initial={{
        domisili: pick("domisili"),
        posisi: pick("posisi"),
        kategori: pick("kategori"),
        status: pick("status"),
        urutan: pick("urutan") === "nama" ? "nama" : "relevansi",
      }}
      categories={categories}
      statuses={STATUS_ORDER}
    />
  );
}
