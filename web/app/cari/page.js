import { getCategoriesOrSeed, STATUS_ORDER } from "@/lib/companies";
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
    error: t(locale, "search.error"),
    retry: t(locale, "search.retry"),
    mark: t(locale, "search.mark"),
    unmark: t(locale, "search.unmark"),
    open: t(locale, "search.open"),
    resultsLabel: t(locale, "search.resultsLabel"),
  };
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
      labels={labels}
    />
  );
}
