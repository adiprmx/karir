import Link from "next/link";
import { getCompanies, getCategories, STATUS_ORDER } from "@/lib/companies";
import { runSearch, tokenize } from "@/lib/search";
import { ResultsTable } from "@/app/components";
import { getLocale, t } from "@/lib/i18n";

const PAGE_SIZE = 20;

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: t(locale, "search.metaTitle") };
}

export default async function Cari({ searchParams }) {
  const params = await searchParams;
  const domisili = params.domisili || "";
  const posisi = params.posisi || "";
  const kategori = params.kategori || "";
  const status = params.status || "";
  const urutan = params.urutan || "relevansi";
  const limit = Math.max(
    PAGE_SIZE,
    Math.min(400, parseInt(params.limit || String(PAGE_SIZE), 10) || PAGE_SIZE),
  );

  const [companies, categories, locale] = await Promise.all([
    getCompanies(),
    getCategories(),
    getLocale(),
  ]);
  const { results, mode, query } = runSearch(companies, {
    domisili,
    posisi,
    kategori,
    status,
    urutan,
  });
  const shown = results.slice(0, limit);
  const queryHasPosisi = tokenize(posisi).length > 0;
  const anyPositionMatch =
    mode === "perusahaan" || results.some((e) => e.positionMatched);

  const qs = new URLSearchParams();
  if (domisili) qs.set("domisili", domisili);
  if (posisi) qs.set("posisi", posisi);
  if (kategori) qs.set("kategori", kategori);
  if (status) qs.set("status", status);
  if (urutan) qs.set("urutan", urutan);

  const moreQs = new URLSearchParams(qs);
  moreQs.set("limit", String(limit + PAGE_SIZE));

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>{t(locale, "search.title")}</h1>
        <p className="lede">{t(locale, "search.sortNote")}</p>
      </div>

      <div className="cari-grid">
        <form className="filters" method="get" action="/cari">
          <fieldset>
            <legend>{t(locale, "home.domisili")}</legend>
            <input
              name="domisili"
              type="text"
              defaultValue={domisili}
              placeholder={t(locale, "search.domisiliPh")}
              autoComplete="off"
            />
          </fieldset>
          <fieldset>
            <legend>{t(locale, "home.posisiPerusahaan")}</legend>
            <input
              name="posisi"
              type="text"
              defaultValue={posisi}
              placeholder={t(locale, "search.posisiPh")}
              autoComplete="off"
            />
          </fieldset>
          <fieldset>
            <legend>{t(locale, "search.category")}</legend>
            <select name="kategori" defaultValue={kategori}>
              <option value="">{t(locale, "search.allCategories")}</option>
              {categories.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </fieldset>
          <fieldset>
            <legend>{t(locale, "search.status")}</legend>
            <select name="status" defaultValue={status}>
              <option value="">{t(locale, "search.allStatuses")}</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </fieldset>
          <fieldset>
            <legend>{t(locale, "search.order")}</legend>
            <select name="urutan" defaultValue={urutan}>
              <option value="relevansi">
                {t(locale, "search.orderRelevance")}
              </option>
              <option value="nama">{t(locale, "search.orderName")}</option>
            </select>
          </fieldset>
          <div className="filter-actions">
            <button className="btn" type="submit">
              {t(locale, "search.submit")}
            </button>
            <Link className="btn ghost" href="/cari">
              {t(locale, "search.reset")}
            </Link>
          </div>
        </form>

        <section aria-label={t(locale, "search.resultsLabel")}>
          <p className="result-count">
            {t(locale, "search.showing", {
              a: shown.length,
              b: results.length,
            })}
          </p>
          {queryHasPosisi && mode !== "perusahaan" && !anyPositionMatch && (
            <p className="search-note">
              {t(locale, "search.noPositionMatch")}
            </p>
          )}
          <ResultsTable entries={shown} queryHasPosisi={queryHasPosisi} />
          {results.length > limit && (
            <div className="load-more">
              <Link className="btn ghost" href={`/cari?${moreQs.toString()}`}>
                {t(locale, "search.loadMore")}
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
