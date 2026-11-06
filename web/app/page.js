import Link from "next/link";
import { getCompanies, getTargets, getStats } from "@/lib/companies";
import { getLocale, t } from "@/lib/i18n";

export default async function Beranda() {
  const [stats, targets, locale] = await Promise.all([
    getStats(),
    getTargets(),
    getLocale(),
  ]);
  const byDate = stats.byDate;
  const d4 = byDate["2026-11-04"] || 0;
  const d5 = byDate["2026-11-05"] || 0;

  return (
    <div className="wrap">
      <section className="hero">
        <h1>{t(locale, "home.title")}</h1>
        <p className="lede">
          {t(locale, "home.intro", { n: stats.total })}
        </p>
        <form className="searchbar" method="get" action="/cari">
          <label htmlFor="hero-domisili">{t(locale, "home.domisili")}</label>
          <input
            id="hero-domisili"
            name="domisili"
            type="text"
            placeholder={t(locale, "home.domisiliPh")}
            autoComplete="off"
          />
          <label htmlFor="hero-posisi">
            {t(locale, "home.posisiPerusahaan")}
          </label>
          <input
            id="hero-posisi"
            name="posisi"
            type="text"
            placeholder={t(locale, "home.posisiPh")}
            autoComplete="off"
          />
          <button type="submit">{t(locale, "home.searchBtn")}</button>
        </form>
        <div className="examples">
          <span>{t(locale, "home.try")}</span>
          <a className="example-chip" href="/cari?domisili=Depok&posisi=Administrasi">
            Depok + Administrasi
          </a>
          <a className="example-chip" href="/cari?domisili=Bogor&posisi=Helper+Gudang">
            Bogor + Helper Gudang
          </a>
          <a className="example-chip" href="/cari?posisi=PGN">
            PGN
          </a>
        </div>
      </section>

      <div className="split">
        <section aria-labelledby="target-title">
          <p className="section-label" id="target-title">
            {t(locale, "home.targets")}
          </p>
          <h2>
            {t(locale, "home.targetsHeading", { n: targets.length })}
          </h2>
          <ol className="index-list">
            {targets.map((c, i) => (
              <li key={c.no}>
                <a
                  href={c.link_karir}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="index-no">{String(i + 1).padStart(2, "0")}</span>
                  <span className="index-name">{c.perusahaan}</span>
                  <span className="index-meta">
                    {(c.posisi || "").split(",")[0]}
                    {" · "}
                    {c.lokasi || t(locale, "common.notListed")}
                  </span>
                  <span className="index-arrow" aria-hidden="true">
                    →
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <aside aria-label={t(locale, "home.stats")}>
          <p className="section-label">{t(locale, "home.stats")}</p>
          <h2>{t(locale, "home.dataState")}</h2>
          <div className="stat-stack">
            <div className="stat-row">
              <span className="stat-num num">{stats.total}</span>
              <span className="stat-label">{t(locale, "home.checked")}</span>
            </div>
            <div className="stat-row">
              <span className="stat-num ok num">
                {stats.byStatus["Ada lowongan target"]}
              </span>
              <span className="stat-label">{t(locale, "home.hasTarget")}</span>
            </div>
            <div className="stat-row">
              <span className="stat-num warn num">
                {stats.byStatus["Ada lowongan target (tidak cocok)"]}
              </span>
              <span className="stat-label">
                {t(locale, "home.targetMismatch")}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-num num">
                {stats.byStatus["Tidak dapat diverifikasi"]}
              </span>
              <span className="stat-label">Tidak dapat diverifikasi</span>
            </div>
            <div className="stat-row">
              <span className="stat-num num">
                {stats.byStatus["Portal tidak bisa dibuka"]}
              </span>
              <span className="stat-label">Portal tidak bisa dibuka</span>
            </div>
          </div>
          <p className="fresh-note">
            {t(locale, "home.freshNote", { a: d4, b: d5 })}
          </p>
          <div style={{ marginTop: 32 }}>
            <p className="section-label">{t(locale, "home.howTitle")}</p>
            <ol className="steps">
              <li>{t(locale, "home.how1")}</li>
              <li>{t(locale, "home.how2")}</li>
              <li>{t(locale, "home.applyStep")}</li>
            </ol>
          </div>
          <p style={{ marginTop: 32 }}>
            <Link href="/dasbor">
              {t(locale, "home.viewDashboard")} →
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
