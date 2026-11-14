import { getCategoriesOrSeed, STATUS_ORDER } from "@/lib/companies";
import { CITIES } from "@/lib/cities";
import { getLocale, t } from "@/lib/i18n";
import SearchApp from "./search-app";

/* Data di-render saat request, bukan saat build. */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: t(locale, "search.metaTitle") };
}

export default async function Cari({ searchParams }) {
  const params = await searchParams;
  const pick = (k) => (typeof params[k] === "string" ? params[k] : "");
  const [categories, locale] = await Promise.all([getCategoriesOrSeed(), getLocale()]);
  const labels = {
    title: t(locale, "search.title"),
    sortNote: t(locale, "search.sortNote"),
    domisili: t(locale, "home.domisili"),
    domisiliPh: t(locale, "search.domisiliPh"),
    posisi: t(locale, "home.posisiPerusahaan"),
    posisiPh: t(locale, "search.posisiPh"),
    category: t(locale, "search.category"),
    allCategories: t(locale, "search.allCategories"),
    city: t(locale, "search.city"),
    allCities: t(locale, "search.allCities"),
    status: t(locale, "search.status"),
    allStatuses: t(locale, "search.allStatuses"),
    order: t(locale, "search.order"),
    orderRelevance: t(locale, "search.orderRelevance"),
    orderName: t(locale, "search.orderName"),
    reset: t(locale, "search.reset"),
    showing: t(locale, "search.showing"),
    matchCount: t(locale, "search.matchCount"),
    noPositionMatch: t(locale, "search.noPositionMatch"),
    verifyNote: t(locale, "search.verifyNote"),
    loadMore: t(locale, "search.loadMore"),
    filters: t(locale, "search.filters"),
    apply: t(locale, "search.apply"),
    empty: t(locale, "search.empty"),
    emptyHint: t(locale, "search.emptyHint"),
    loading: t(locale, "search.loading"),
    seedNote: t(locale, "common.seedNote"),
    error: t(locale, "search.error"),
    retry: t(locale, "search.retry"),
    mark: t(locale, "search.mark"),
    unmark: t(locale, "search.unmark"),
    open: t(locale, "search.open"),
    resultsLabel: t(locale, "search.resultsLabel"),
    groupCompanies: t(locale, "search.groupCompanies"),
    groupRoles: t(locale, "search.groupRoles"),
    share: t(locale, "search.share"),
    shareCopied: t(locale, "search.shareCopied"),
    shareFailed: t(locale, "search.shareFailed"),
  };
  /* Nilai kota dari alamat hanya diterima bila kota itu dikenal
   * (daftar lib/cities.js); nilai asing diabaikan jadi tanpa filter. */
  const kota = pick("kota");
  const initialKota = CITIES.some((c) => c.name === kota) ? kota : "";
  return (
    <SearchApp
      initial={{
        domisili: pick("domisili"),
        posisi: pick("posisi"),
        kategori: pick("kategori"),
        kota: initialKota,
        status: pick("status"),
        urutan: pick("urutan") === "nama" ? "nama" : "relevansi",
      }}
      categories={categories}
      statuses={STATUS_ORDER}
      labels={labels}
    />
  );
}
