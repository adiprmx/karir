import Link from "next/link";
import { getCompanies, getTargets, getStats } from "@/lib/companies";
import { getLocale, t } from "@/lib/i18n";
import { CategoryIcon, CountUp, LiveSearch, PrintButton, StatusDot } from "@/app/visual";
import RecentChip from "@/app/recent-chip";
import PhotoStrip from "@/app/photo-strip";
import ChangesFeed from "@/app/changes-feed";
import { CompanyLogo } from "@/lib/logos";

/* Data di-render saat request, bukan saat build, supaya build tidak
 * gagal bila Firestore tidak bisa dijangkau dari mesin build. */
export const dynamic = "force-dynamic";

export default async function Beranda() {
  const [stats, targets, locale] = await Promise.all([
    getStats(),
    getTargets(),
    getLocale(),
  ]);
  const byDate = stats.byDate;
  const d4 = byDate["2026-11-04"] || 0;
  const d5 = byDate["2026-11-05"] || 0;
  const dateKeys = Object.keys(byDate).sort();
  const latestDate = dateKeys.length ? dateKeys[dateKeys.length - 1] : null;
  const latestMs = latestDate ? Date.parse(`${latestDate}T00:00:00Z`) : 0;
  const latestLabel = latestDate
    ? new Date(`${latestDate}T00:00:00Z`).toLocaleDateString(
        locale === "en" ? "en-GB" : "id-ID",
        { day: "numeric", month: "long", year: "numeric" },
      )
    : null;
  const fresh =
    latestMs > 0 && (Date.now() - latestMs) / 86400000 <= 7;
  const shareText =
    (locale === "en"
      ? `Target openings on Karir (${targets.length} companies):\n`
      : `Lowongan target di Karir (${targets.length} perusahaan):\n`) +
    targets
      .map(
        (c) =>
          `- ${c.perusahaan}: https://karir-adiprmx.vercel.app/perusahaan/${c.no}`,
      )
      .join("\n");
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="wrap">
      <section className="hero anim-fade-up">
        <h1>{t(locale, "home.title")}</h1>
        <p className="lede">
          {t(locale, "home.intro", { n: stats.total })}
        </p>
        <LiveSearch
          labels={{
            domisili: t(locale, "home.domisili"),
            domisiliPh: t(locale, "home.domisiliPh"),
            posisi: t(locale, "home.posisiPerusahaan"),
            posisiPh: t(locale, "home.posisiPh"),
            searchBtn: t(locale, "home.searchBtn"),
          }}
        />
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
          <RecentChip label={t(locale, "landing.recentLabel")} />
        </div>
      </section>

      <section
        className="trust-strip anim-fade-in-1"
        aria-label={t(locale, "landing.trustLabel")}
      >
        <div className="trust-item">
          <span className="trust-num num">
            <CountUp value={stats.total} />
          </span>
          <span className="trust-label">
            {t(locale, "landing.trustChecked")}
          </span>
        </div>
        <div className="trust-item">
          <span className="trust-num ok num">
            <CountUp value={stats.byStatus["Ada lowongan target"]} />
          </span>
          <span className="trust-label">
            {t(locale, "landing.trustTarget")}
          </span>
        </div>
        <div className="trust-item">
          <span className="trust-num warn num">
            <CountUp
              value={stats.byStatus["Ada lowongan target (tidak cocok)"]}
            />
          </span>
          <span className="trust-label">
            {t(locale, "landing.trustMismatch")}
          </span>
        </div>
        <div className="trust-item">
          <span className="trust-num num">
            <CountUp value={stats.byStatus["Portal tidak bisa dibuka"]} />
          </span>
          <span className="trust-label">
            {t(locale, "landing.trustDead")}
          </span>
        </div>
      </section>

      {latestDate ? (
        <p className="fresh-stamp anim-fade-in-1">
          {t(locale, "landing.freshLabel", { date: latestLabel })}
          {" · "}
          <span className={fresh ? "ok" : "warn"}>
            {fresh
              ? t(locale, "landing.freshOk")
              : t(locale, "landing.freshStale")}
          </span>
        </p>
      ) : null}

      <section
        className="landing-section problem-outcome anim-fade-in-2"
        aria-labelledby="problem-title"
      >
        <h2 id="problem-title">{t(locale, "landing.problemTitle")}</h2>
        <div className="problem-cols">
          <div>
            <p className="section-label">
              {t(locale, "landing.problemLabel")}
            </p>
            <p>{t(locale, "landing.problem1")}</p>
            <p>{t(locale, "landing.problem2")}</p>
          </div>
          <div>
            <p className="section-label">
              {t(locale, "landing.outcomeLabel")}
            </p>
            <p>
              {t(locale, "landing.outcome1", { n: stats.total })}
            </p>
            <p>
              {t(locale, "landing.outcome2", { n: targets.length })}
            </p>
            <p>{t(locale, "landing.outcome3")}</p>
          </div>
        </div>
      </section>

      <PhotoStrip
        title={t(locale, "landing.photosTitle")}
        captions={{
          warehouse: t(locale, "landing.photoWarehouse"),
          production: t(locale, "landing.photoProduction"),
          cleaning: t(locale, "landing.photoCleaning"),
        }}
      />

      <section
        className="landing-section anim-fade-in-2"
        aria-labelledby="how-title"
      >
        <h2 id="how-title">{t(locale, "home.howTitle")}</h2>
        <ol className="steps">
          <li>{t(locale, "landing.step1")}</li>
          <li>{t(locale, "landing.step2")}</li>
          <li>{t(locale, "landing.step3")}</li>
        </ol>
      </section>

      <section
        className="landing-section anim-fade-in"
        aria-labelledby="features-title"
      >
        <h2 id="features-title">{t(locale, "landing.featuresTitle")}</h2>
        <ul className="feature-rows">
          <li>
            <Link href="/cari">
              <span className="feature-title">
                {t(locale, "landing.featureSearchTitle")}
              </span>
              <span className="feature-desc">
                {t(locale, "landing.featureSearchDesc")}
              </span>
              <span className="feature-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
          <li>
            <Link href="/lamaran">
              <span className="feature-title">
                {t(locale, "landing.featureTrackTitle")}
              </span>
              <span className="feature-desc">
                {t(locale, "landing.featureTrackDesc")}
              </span>
              <span className="feature-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
          <li>
            <Link href="/peta">
              <span className="feature-title">
                {t(locale, "landing.featureMapTitle")}
              </span>
              <span className="feature-desc">
                {t(locale, "landing.featureMapDesc", { n: targets.length })}
              </span>
              <span className="feature-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        </ul>
      </section>

      <section
        className="landing-section anim-fade-in"
        aria-labelledby="target-title"
      >
        <p className="section-label" id="target-title">
          <StatusDot status="Ada lowongan target" />{" "}
          {t(locale, "home.targets")}
        </p>
        <h2>{t(locale, "home.targetsHeading", { n: targets.length })}</h2>
        <ol className="index-list">
          {targets.map((c, i) => (
            <li key={c.no}>
              <Link href={`/perusahaan/${c.no}`}>
                <span className="index-no">{String(i + 1).padStart(2, "0")}</span>
                <CompanyLogo
                  linkKarir={c.link_karir}
                  name={c.perusahaan}
                  size={32}
                />
                <CategoryIcon kategori={c.kategori} />
                <span className="index-name">{c.perusahaan}</span>
                <span className="index-meta">
                  {(c.posisi || "").split(",")[0]}
                  {" · "}
                  {c.lokasi || t(locale, "common.notListed")}
                </span>
                <span className="index-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <div className="target-actions">
          <a
            className="btn ghost"
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            {locale === "en"
              ? "Share the target list"
              : "Bagikan daftar target"}
          </a>
          <PrintButton
            label={
              locale === "en"
                ? "Print the target list"
                : "Cetak daftar target"
            }
          />
        </div>
      </section>

      <section
        className="landing-section anim-fade-in"
        id="berubah"
        aria-labelledby="changes-title"
      >
        <h2 id="changes-title">{t(locale, "landing.changesTitle")}</h2>
        <ChangesFeed />
      </section>

      <section
        className="landing-section anim-fade-in"
        aria-labelledby="stats-title"
      >
        <h2 id="stats-title">{t(locale, "home.stats")}</h2>
        <div className="stat-stack">
          <div className="stat-row">
            <span className="stat-num num">
              <CountUp value={stats.total} />
            </span>
            <span className="stat-label">{t(locale, "home.checked")}</span>
          </div>
          <div className="stat-row">
            <span className="stat-num ok num">
              <CountUp value={stats.byStatus["Ada lowongan target"]} />
            </span>
            <span className="stat-label">{t(locale, "home.hasTarget")}</span>
          </div>
          <div className="stat-row">
            <span className="stat-num warn num">
              <CountUp
                value={stats.byStatus["Ada lowongan target (tidak cocok)"]}
              />
            </span>
            <span className="stat-label">
              {t(locale, "home.targetMismatch")}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-num num">
              <CountUp value={stats.byStatus["Tidak dapat diverifikasi"]} />
            </span>
            <span className="stat-label">Tidak dapat diverifikasi</span>
          </div>
          <div className="stat-row">
            <span className="stat-num num">
              <CountUp value={stats.byStatus["Portal tidak bisa dibuka"]} />
            </span>
            <span className="stat-label">Portal tidak bisa dibuka</span>
          </div>
        </div>
        <p className="fresh-note">
          {t(locale, "home.freshNote", { a: d4, b: d5 })}
        </p>
      </section>

      <section
        className="landing-section faq-teaser anim-fade-in no-print"
        aria-labelledby="faq-title"
      >
        <h2 id="faq-title">{t(locale, "landing.faqTitle")}</h2>
        <details className="faq-item">
          <summary>{t(locale, "landing.faq1q")}</summary>
          <p>{t(locale, "landing.faq1a")}</p>
        </details>
        <details className="faq-item">
          <summary>{t(locale, "landing.faq2q")}</summary>
          <p>{t(locale, "landing.faq2a")}</p>
        </details>
        <details className="faq-item">
          <summary>{t(locale, "landing.faq3q")}</summary>
          <p>{t(locale, "landing.faq3a")}</p>
        </details>
        <p className="faq-more">
          <Link href="/faq">{t(locale, "landing.faqMore")} →</Link>
        </p>
      </section>

      <section className="cta-close anim-fade-in no-print">
        <p className="cta-text">{t(locale, "landing.ctaText")}</p>
        <div className="cta-actions">
          <Link className="btn" href="/mulai">
            {t(locale, "landing.ctaStart")}
          </Link>
          <Link className="btn ghost" href="/dasbor">
            {t(locale, "home.viewDashboard")}
          </Link>
        </div>
      </section>
    </div>
  );
}
