import { getCompanies, getStats, STATUS_ORDER, getTargets } from "@/lib/companies";
import { countBy, topEntries } from "@/lib/search";
import { safeLink } from "@/app/components";
import { getLocale, t } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: t(locale, "dash.metaTitle") };
}

function BarRow({ label, count, total, tone }) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
  return (
    <div className="bar-row">
      <div className="bar-head">
        <span className="bar-label">{label}</span>
        <span className="bar-count num">{count}</span>
      </div>
      <div className="bar-track">
        <span
          className={tone ? `bar-fill ${tone}` : "bar-fill"}
          style={{ display: "block", width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function shortText(text, max) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

function RecheckList({ title, count, list, locale }) {
  return (
    <section className="dash-section" aria-label={title}>
      <p className="section-label">
        {title} ({count})
      </p>
      <h2>{title}</h2>
      <ul className="recheck-list">
        {list.slice(0, 10).map((c) => (
          <li key={c.no}>
            {safeLink(c.link_karir) ? (
              <a href={c.link_karir} target="_blank" rel="noopener noreferrer">
                {c.perusahaan}
              </a>
            ) : (
              c.perusahaan
            )}
          </li>
        ))}
        {list.length > 10 && (
          <li className="plain-more">
            {t(locale, "dash.andMore", { n: list.length - 10 })}
          </li>
        )}
      </ul>
    </section>
  );
}

export default async function Dasbor() {
  const [companies, stats, targets, locale] = await Promise.all([
    getCompanies(),
    getStats(),
    getTargets(),
    getLocale(),
  ]);
  const total = stats.total;
  const topCats = topEntries(countBy(companies, "kategori"), 8);
  const portalDead = companies
    .filter((c) => c.status === "Portal tidak bisa dibuka")
    .sort((a, b) => a.perusahaan.localeCompare(b.perusahaan, "id"));
  const unverified = companies
    .filter((c) => c.status === "Tidak dapat diverifikasi")
    .sort((a, b) => a.perusahaan.localeCompare(b.perusahaan, "id"));
  const d4 = stats.byDate["2026-11-04"] || 0;
  const d5 = stats.byDate["2026-11-05"] || 0;

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>{t(locale, "dash.title")}</h1>
        <p className="lede">
          {t(locale, "dash.numbersNote", { n: total })}
        </p>
      </div>

      <div className="dash-grid">
        <div>
          <section className="dash-section" aria-label={t(locale, "dash.byStatus")}>
            <p className="section-label">{t(locale, "dash.byStatus")}</p>
            <h2>{t(locale, "dash.statusHeading", { n: total })}</h2>
            {STATUS_ORDER.map((s) => (
              <BarRow
                key={s}
                label={s}
                count={stats.byStatus[s] || 0}
                total={total}
                tone={
                  s === "Ada lowongan target"
                    ? "ok"
                    : s === "Ada lowongan target (tidak cocok)"
                      ? "warn"
                      : undefined
                }
              />
            ))}
          </section>

          <section className="dash-section" aria-label={t(locale, "dash.byCategory")}>
            <p className="section-label">{t(locale, "dash.byCategory")}</p>
            <h2>
              {t(locale, "dash.topCategories", { n: topCats.length })}
            </h2>
            {topCats.map((e) => (
              <BarRow key={e.label} label={e.label} count={e.count} total={total} />
            ))}
          </section>
        </div>

        <div>
          <section className="dash-section" aria-label={t(locale, "dash.targets")}>
            <p className="section-label">
              {t(locale, "dash.targets")} ({targets.length})
            </p>
            <h2>{t(locale, "dash.targetCompanies")}</h2>
            <ul className="recheck-list">
              {targets.map((c) => (
                <li key={c.no}>
                  {safeLink(c.link_karir) ? (
                    <a
                      href={c.link_karir}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {c.perusahaan}
                    </a>
                  ) : (
                    c.perusahaan
                  )}
                  <span className="cell-sub">
                    {shortText(
                      `${c.posisi || ""} · ${c.lokasi || t(locale, "common.notListed")}`,
                      140,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <RecheckList
            title="Portal tidak bisa dibuka"
            count={portalDead.length}
            list={portalDead}
            locale={locale}
          />
          <RecheckList
            title="Tidak dapat diverifikasi"
            count={unverified.length}
            list={unverified}
            locale={locale}
          />

          <section className="dash-section" aria-label={t(locale, "dash.freshness")}>
            <p className="section-label">{t(locale, "dash.freshness")}</p>
            <h2>{t(locale, "dash.whenChecked")}</h2>
            <p className="fresh-note" style={{ marginTop: 0 }}>
              {t(locale, "home.freshNote", { a: d4, b: d5 })}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
