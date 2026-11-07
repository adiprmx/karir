import Link from "next/link";
import { getCompaniesOrSeed, getStatsOrSeed, getTargetsOrSeed, STATUS_ORDER } from "@/lib/companies";
import { countBy, topEntries } from "@/lib/search";
import { getLocale, t } from "@/lib/i18n";
import { CountUp, Icon, Reveal, StatusStamp } from "@/app/visual";
import { CompanyLogo } from "@/lib/logos";
import DashboardPersonal from "@/app/dashboard-personal";

/* Data di-render saat request, bukan saat build. */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: t(locale, "dash.metaTitle") };
}

/* Warna per status mengikuti makna: hijau target, kuning tidak cocok,
 * sisanya gradasi netral dari gelap ke terang. */
const SEG_CLASS = {
  "Ada lowongan target": "s-ok",
  "Ada lowongan target (tidak cocok)": "s-warn",
  "Tidak ada lowongan target": "s-1",
  "Tidak ada lowongan terlihat": "s-2",
  "Tidak dapat diverifikasi": "s-3",
  "Portal tidak bisa dibuka": "s-4",
};

function MiniRow({ c }) {
  return (
    <li>
      <Link href={`/perusahaan/${c.no}`}>
        <CompanyLogo linkKarir={c.link_karir} name={c.perusahaan} size={32} />
        <span className="mini-name">
          {c.perusahaan}
          <span className="mini-sub">
            {(c.posisi || "").split(",")[0]}
            {c.lokasi ? ` · ${c.lokasi}` : ""}
          </span>
        </span>
      </Link>
    </li>
  );
}

function RecheckList({ title, status, list, locale }) {
  return (
    <details className="fold">
      <summary>
        <span>{title}</span>
        <span className="num fold-n">{list.length}</span>
        <Icon name="chevron" size={18} className="fold-ic" />
      </summary>
      <ul className="mini-list">
        {list.slice(0, 10).map((c) => (
          <MiniRow key={c.no} c={c} />
        ))}
      </ul>
      {list.length > 10 && (
        <p className="more">
          <Link href={`/cari?status=${encodeURIComponent(status)}`}>
            {t(locale, "dash.andMore", { n: list.length - 10 })}
            <Icon name="arrow" size={16} />
          </Link>
        </p>
      )}
    </details>
  );
}

export default async function Dasbor() {
  const [companies, stats, targets, locale] = await Promise.all([
    getCompaniesOrSeed(),
    getStatsOrSeed(),
    getTargetsOrSeed(),
    getLocale(),
  ]);
  const total = stats.total;
  const topCats = topEntries(countBy(companies, "kategori"), 8);
  const topCatMax = topCats.length > 0 ? topCats[0].count : 1;
  const byName = (a, b) => a.perusahaan.localeCompare(b.perusahaan, "id");
  const portalDead = companies
    .filter((c) => c.status === "Portal tidak bisa dibuka")
    .sort(byName);
  const unverified = companies
    .filter((c) => c.status === "Tidak dapat diverifikasi")
    .sort(byName);
  const d4 = stats.byDate["2026-11-04"] || 0;
  const d5 = stats.byDate["2026-11-05"] || 0;

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>{t(locale, "dash.title")}</h1>
        <p className="lede">{t(locale, "dash.numbersNote", { n: total })}</p>
      </div>

      <DashboardPersonal />

      <div className="dash-grid">
        <Reveal className="panel">
          <h2 className="panel-title">
            {t(locale, "dash.statusQuestion", { n: total })}
          </h2>
          <div className="stackbar" role="img" aria-label={t(locale, "dash.byStatus")}>
            {STATUS_ORDER.map((s) => {
              const n = stats.byStatus[s] || 0;
              return n > 0 ? (
                <span
                  key={s}
                  className={`seg-bar ${SEG_CLASS[s]}`}
                  style={{ flexGrow: n }}
                />
              ) : null;
            })}
          </div>
          <ul className="status-rows">
            {STATUS_ORDER.map((s) => {
              const n = stats.byStatus[s] || 0;
              return (
                <li key={s}>
                  <Link href={`/cari?status=${encodeURIComponent(s)}`}>
                    <span className={`sw ${SEG_CLASS[s]}`} aria-hidden="true" />
                    <span className="status-name">{s}</span>
                    <span className="status-n num">
                      <CountUp value={n} duration={600} />
                    </span>
                    <span className="status-pct num">
                      {Math.round((n / total) * 100)}%
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Reveal>

        <Reveal className="panel" delay={80}>
          <h2 className="panel-title">{t(locale, "dash.topCategories", { n: topCats.length })}</h2>
          <ul className="bars">
            {topCats.map((e) => (
              <li key={e.label}>
                <Link href={`/cari?kategori=${encodeURIComponent(e.label)}`}>
                  <span className="bar-head">
                    <span>{e.label}</span>
                    <span className="num">{e.count}</span>
                  </span>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{ "--w": (e.count / topCatMax) * 100 }}
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      <section className="sec" aria-labelledby="dash-targets">
        <Reveal>
          <div className="sec-head">
            <h2 id="dash-targets">
              {t(locale, "dash.targetCompanies")}{" "}
              <span className="num sub">({targets.length})</span>
            </h2>
            <Link className="textlink" href="/peta">
              {t(locale, "nav.map")}
              <Icon name="arrow" size={16} />
            </Link>
          </div>
          <ul className="mini-list cols">
            {targets.map((c) => (
              <MiniRow key={c.no} c={c} />
            ))}
          </ul>
        </Reveal>
      </section>

      <section className="sec" aria-label={t(locale, "dash.recheck")}>
        <Reveal>
          <RecheckList
            title="Portal tidak bisa dibuka"
            status="Portal tidak bisa dibuka"
            list={portalDead}
            locale={locale}
          />
          <RecheckList
            title="Tidak dapat diverifikasi"
            status="Tidak dapat diverifikasi"
            list={unverified}
            locale={locale}
          />
          <p className="hint" style={{ marginTop: 16 }}>
            {t(locale, "home.freshNote", { a: d4, b: d5 })}
          </p>
        </Reveal>
      </section>
    </div>
  );
}
