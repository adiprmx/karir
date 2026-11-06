import Link from "next/link";
import { getCompanies, getStats, STATUS_ORDER, getTargets } from "@/lib/companies";
import { countBy, topEntries } from "@/lib/search";
import { getLocale, t } from "@/lib/i18n";
import {
  CountUp,
  DonutChart,
  AnimatedBar,
  StatusDot,
  CategoryIcon,
} from "@/app/visual";

/* Data di-render saat request, bukan saat build. */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: t(locale, "dash.metaTitle") };
}

/* Warna donat per status: hijau target, kuning tidak cocok, sisanya
 * abu dari gelap ke terang sesuai urutan STATUS_ORDER. */
const STATUS_COLORS = {
  "Ada lowongan target": "#16a34a",
  "Ada lowongan target (tidak cocok)": "#d97706",
  "Tidak ada lowongan target": "#0a0a0a",
  "Tidak ada lowongan terlihat": "#52525b",
  "Tidak dapat diverifikasi": "#a1a1aa",
  "Portal tidak bisa dibuka": "#d4d4d8",
};

function shortText(text, max) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

/* Satu baris daftar perusahaan: titik status, ikon kategori, nama yang
 * menaut ke halaman detail, lalu posisi dan lokasi sebagai sub-baris. */
function CompanyListRow({ company, locale }) {
  return (
    <li>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StatusDot status={company.status} />
        <CategoryIcon kategori={company.kategori} />
        <span style={{ minWidth: 0 }}>
          <Link href={`/perusahaan/${company.no}`}>{company.perusahaan}</Link>
          <span className="cell-sub">
            {shortText(
              `${company.posisi || ""} · ${company.lokasi || t(locale, "common.notListed")}`,
              140,
            )}
          </span>
        </span>
      </span>
    </li>
  );
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
          <CompanyListRow key={c.no} company={c} locale={locale} />
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
  const topCatMax = topCats.length > 0 ? topCats[0].count : 0;
  const portalDead = companies
    .filter((c) => c.status === "Portal tidak bisa dibuka")
    .sort((a, b) => a.perusahaan.localeCompare(b.perusahaan, "id"));
  const unverified = companies
    .filter((c) => c.status === "Tidak dapat diverifikasi")
    .sort((a, b) => a.perusahaan.localeCompare(b.perusahaan, "id"));
  const d4 = stats.byDate["2026-11-04"] || 0;
  const d5 = stats.byDate["2026-11-05"] || 0;
  const segments = STATUS_ORDER.map((s) => ({
    label: s,
    value: stats.byStatus[s] || 0,
    color: STATUS_COLORS[s],
  }));

  return (
    <div className="wrap">
      <div className="page-head anim-fade-up">
        <h1>{t(locale, "dash.title")}</h1>
      </div>

      <div className="stat-stack anim-fade-up" aria-label={t(locale, "home.stats")}>
        <div className="stat-row">
          <span className="stat-num">
            <CountUp value={total} />
          </span>
          <span className="stat-label">{t(locale, "dash.totalLabel")}</span>
        </div>
        <div className="stat-row">
          <span className="stat-num ok">
            <CountUp value={targets.length} />
          </span>
          <span className="stat-label">{t(locale, "dash.targets")}</span>
        </div>
      </div>

      <div className="dash-grid">
        <div className="anim-fade-up-1">
          <section className="dash-section" aria-label={t(locale, "dash.byStatus")}>
            <p className="section-label">{t(locale, "dash.byStatus")}</p>
            <h2>{t(locale, "dash.statusHeading", { n: total })}</h2>
            <DonutChart segments={segments} total={total} centerLabel="perusahaan" />
          </section>

          <section className="dash-section" aria-label={t(locale, "dash.byCategory")}>
            <p className="section-label">{t(locale, "dash.byCategory")}</p>
            <h2>{t(locale, "dash.topCategories", { n: topCats.length })}</h2>
            {topCats.map((e) => (
              <div className="bar-row" key={e.label}>
                <div className="bar-head">
                  <span className="bar-label">{e.label}</span>
                  <span className="bar-count num">
                    <CountUp value={e.count} />
                  </span>
                </div>
                <AnimatedBar value={e.count} max={topCatMax} color="#0a0a0a" />
              </div>
            ))}
          </section>
        </div>

        <div className="anim-fade-up-2">
          <section className="dash-section" aria-label={t(locale, "dash.targets")}>
            <p className="section-label">
              {t(locale, "dash.targets")} ({targets.length})
            </p>
            <h2>{t(locale, "dash.targetCompanies")}</h2>
            <ul className="recheck-list">
              {targets.map((c) => (
                <CompanyListRow key={c.no} company={c} locale={locale} />
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
