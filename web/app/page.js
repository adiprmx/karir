import Link from "next/link";
import { getCompaniesOrSeed, getTargetsOrSeed, getStatsOrSeed } from "@/lib/companies";
import { runSearch } from "@/lib/search";
import { getLocale, t } from "@/lib/i18n";
import { CountUp, Icon, PrintButton, Reveal } from "@/app/visual";
import HeroSearch from "@/app/hero-search";
import ChangesFeed from "@/app/changes-feed";
import TargetFilter from "@/app/target-filter";
import { formatDate } from "@/app/components";

/* Data di-render saat request, bukan saat build, supaya build tidak
 * gagal bila Firestore tidak bisa dijangkau dari mesin build. */
export const dynamic = "force-dynamic";

/* Posisi yang dicari pencari kerja lulusan SMK (dari brief produk). */
const ROLE_NAMES = [
  "Helper Gudang",
  "Staff Gudang",
  "Cleaning Service",
  "Office Boy",
  "Packing",
  "Operator Produksi",
  "Crew Store",
];

/* Batas segar data: tanggal data terbaru masih dalam 7 hari terakhir
 * dari waktu request. Beranda di-render per request (force-dynamic),
 * jadi waktu di sini adalah waktu request, bukan waktu build. */
function isFreshData(latestMs) {
  return latestMs > 0 && (Date.now() - latestMs) / 86400000 <= 7;
}

export default async function Beranda() {
  const [companies, stats, targets, locale] = await Promise.all([
    getCompaniesOrSeed(),
    getStatsOrSeed(),
    getTargetsOrSeed(),
    getLocale(),
  ]);

  /* Angka di chip posisi: kanal yang terverifikasi punya lowongan
   * DAN posisinya cocok dengan nama posisi itu. Dihitung dari data. */
  const roles = ROLE_NAMES.map((name) => {
    const { results } = runSearch(companies, { posisi: name });
    const count = results.filter(
      (e) => e.positionMatched && e.company.status === "Ada lowongan",
    ).length;
    return { name, count };
  });

  const dateKeys = Object.keys(stats.byDate).sort();
  const latestDate = dateKeys.length ? dateKeys[dateKeys.length - 1] : null;
  const latestMs = latestDate ? Date.parse(`${latestDate}T00:00:00Z`) : 0;
  const fresh = isFreshData(latestMs);

  const shareText =
    (locale === "en"
      ? `Openings on Karir (${targets.length} companies):\n`
      : `Lowongan di Karir (${targets.length} perusahaan):\n`) +
    targets
      .map(
        (c) =>
          `- ${c.perusahaan}: https://karir-adiprmx.vercel.app/perusahaan/${c.no}`,
      )
      .join("\n");
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const heroLabels = {
    domisili: t(locale, "home.domisili"),
    domisiliPh: t(locale, "home.domisiliPh"),
    posisi: t(locale, "home.posisiPerusahaan"),
    posisiPh: t(locale, "home.posisiPh"),
    searchBtn: t(locale, "home.searchBtn"),
    rolesLabel: t(locale, "hero.rolesLabel"),
    vizQuestion: t(locale, "hero.vizQuestion"),
    vizIdle: t(locale, "hero.vizIdle"),
    vizMatch: t(locale, "hero.vizMatch"),
    vizVerified: t(locale, "hero.vizVerified"),
    vizLoading: t(locale, "hero.vizLoading"),
    vizError: t(locale, "hero.vizError"),
    seedNote: t(locale, "common.seedNote"),
    legendTarget: t(locale, "hero.legendTarget"),
    legendMatch: t(locale, "hero.legendMatch"),
    legendOther: t(locale, "hero.legendOther"),
    top: t(locale, "hero.top"),
    seeAll: t(locale, "hero.seeAll"),
    recent: t(locale, "hero.recent"),
    noMatch: t(locale, "search.noPositionMatch"),
    mark: t(locale, "search.mark"),
    unmark: t(locale, "search.unmark"),
    open: t(locale, "search.open"),
    newTab: t(locale, "common.newTab"),
  };

  return (
    <div className="wrap">
      <section className="hero" aria-labelledby="hero-h">
        <div className="hero-copy">
          <h1 id="hero-h">{t(locale, "home.title")}</h1>
          <p className="lede">{t(locale, "home.intro", { n: stats.total })}</p>
          {latestDate && (
            <p className="fresh">
              <span className={`fresh-tag ${fresh ? "ok" : "warn"}`}>
                <Icon name={fresh ? "check" : "alert"} size={13} />
                {fresh
                  ? t(locale, "landing.freshOk")
                  : t(locale, "landing.freshStale")}
              </span>
              {t(locale, "landing.freshLabel", {
                date: formatDate(latestDate, locale),
              })}
            </p>
          )}
        </div>
        <HeroSearch
          labels={heroLabels}
          nos={companies.map((c) => c.no)}
          targetMask={companies
            .map((c) => (c.status === "Ada lowongan" ? "1" : "0"))
            .join("")}
          roles={roles}
        />
      </section>

      {/* UX-16: strip foto bisa difokus keyboard di HP (di sana ketiga
        * foto bergeser horizontal; tanpa fokus, foto 2-3 tidak
        * terjangkau keyboard). Di desktop stripnya grid tanpa geser,
        * tetapi satu tab stop tambahan dapat diterima. */}
      <Reveal
        className="photo-strip"
        tabIndex={0}
        role="region"
        label={
          locale === "en"
            ? "Photos of the work: warehouse, production, cleaning"
            : "Foto pekerjaan: gudang, produksi, cleaning"
        }
      >
        <figure>
          <img
            src="https://images.unsplash.com/photo-1553413077-190dd305871c?q=80&w=800&auto=format&fit=crop"
            alt="Pekerja mengangkat kardus di dalam gudang"
            loading="lazy"
          />
          <figcaption>Gudang</figcaption>
        </figure>
        <figure>
          <img
            src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?q=80&w=800&auto=format&fit=crop"
            alt="Pekerja memeriksa mesin di lini produksi"
            loading="lazy"
          />
          <figcaption>Produksi</figcaption>
        </figure>
        <figure>
          <img
            src="https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=800&auto=format&fit=crop"
            alt="Petugas cleaning membersihkan lantai"
            loading="lazy"
          />
          <figcaption>Cleaning</figcaption>
        </figure>
      </Reveal>

      <section className="sec" aria-labelledby="target-h">
        <Reveal>
          <div className="sec-head">
            <div>
              <p className="kicker ok">
                <Icon name="check" size={14} />
                {t(locale, "home.targetsLead")}
              </p>
              <h2 id="target-h">
                {t(locale, "home.targetsHeading", { n: targets.length })}
              </h2>
            </div>
          </div>
        </Reveal>
        <TargetFilter
          targets={targets}
          labels={{
            filter: t(locale, "home.targets"),
            mark: t(locale, "search.mark"),
            unmark: t(locale, "search.unmark"),
            open: t(locale, "search.open"),
            newTab: t(locale, "common.newTab"),
            shown: t(locale, "home.targetsShown"),
          }}
        />
        <div className="actions-row no-print">
          <a
            className="btn ghost small"
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="share" size={16} />
            {t(locale, "home.shareTargets")}
            {/* AKSES-13: beri tahu pembaca layar bahwa tautan membuka
              * tab baru (WhatsApp). */}
            <span className="sr-only"> {t(locale, "common.newTab")}</span>
          </a>
          <PrintButton label={t(locale, "home.printTargets")} />
        </div>
      </section>

      <section className="sec proof" aria-labelledby="proof-h">
        <Reveal className="proof-lead">
          <h2 id="proof-h">{t(locale, "home.proofTitle")}</h2>
          <p>{t(locale, "landing.problem1")}</p>
          <p>{t(locale, "landing.problem2")}</p>
        </Reveal>
        <Reveal className="proof-list" delay={80}>
          <div className="proof-row">
            <span className="proof-num">
              <CountUp value={stats.total} />
            </span>
            <span>{t(locale, "home.proof1")}</span>
          </div>
          <div className="proof-row">
            <span className="proof-num ok">
              <CountUp value={targets.length} />
            </span>
            <span>{t(locale, "home.proof2")}</span>
          </div>
          <div className="proof-row">
            <span className="proof-num">
              <CountUp value={stats.byStatus["Portal tidak bisa dibuka"] || 0} />
            </span>
            <span>{t(locale, "landing.trustDead")}</span>
          </div>
          <p className="proof-foot">{t(locale, "home.proof3")}</p>
        </Reveal>
      </section>

      <section className="sec" id="berubah" aria-labelledby="changes-h">
        <Reveal>
          <h2 id="changes-h">{t(locale, "landing.changesTitle")}</h2>
          <ChangesFeed
            labels={{
              empty: t(locale, "home.changesEmpty"),
              error: t(locale, "home.changesError"),
              degraded: t(locale, "home.changesDegraded"),
              loading: t(locale, "home.changesLoading"),
            }}
          />
        </Reveal>
      </section>

      <section className="sec faq-teaser no-print" aria-labelledby="faq-h">
        <Reveal>
          <h2 id="faq-h">{t(locale, "landing.faqTitle")}</h2>
          {[1, 2, 3].map((n) => (
            <details className="faq-item" key={n}>
              <summary>{t(locale, `landing.faq${n}q`)}</summary>
              <p>{t(locale, `landing.faq${n}a`)}</p>
            </details>
          ))}
          <p className="more">
            <Link href="/faq">
              {t(locale, "landing.faqMore")}
              <Icon name="arrow" size={16} />
            </Link>
          </p>
        </Reveal>
      </section>
    </div>
  );
}
