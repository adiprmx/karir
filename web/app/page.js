import Link from "next/link";
import { getCompaniesOrSeed, getTargetsOrSeed, getStatsOrSeed } from "@/lib/companies";
import { runSearch } from "@/lib/search";
import { getLocale, t } from "@/lib/i18n";
import { CountUp, Icon, PrintButton, Reveal } from "@/app/visual";
import HeroSearch, { PhotoStrip } from "@/app/hero-search";
import ChangesFeed from "@/app/changes-feed";
import TargetFilter from "@/app/target-filter";
import { formatDate } from "@/app/components";

/* Data di-render saat request, bukan saat build, supaya build tidak
 * gagal bila Firestore tidak bisa dijangkau dari mesin build. */
export const dynamic = "force-dynamic";

/* SEO-04 + MKT-03 + DET-09 (satu pass metadata kanonis, W2b):
 * canonical ditulis PER HALAMAN, bukan di root layout — canonical
 * di root akan diwariskan ke semua halaman yang tidak menimpanya
 * (termasuk /lamaran dan /pengaturan) dan mengklaim "/" sebagai
 * kanonis mereka. Beranda memakai "/"; halaman lain memakai
 * jalurnya sendiri; /cari memakai "/cari" polos supaya URL
 * berparameter tidak menciptakan duplikat. */
export const metadata = {
  alternates: { canonical: "/" },
};

const SITE_URL = "https://karir-adiprmx.vercel.app";

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

  /* MKT-06: "Bagikan daftar lowongan" tidak lagi mengirim cuplikan
   * puluhan tautan yang basi keesokan hari — yang dikirim satu
   * tautan ke daftar live (/cari dengan filter "Ada lowongan") plus
   * jumlah perusahaan saat ini. */
  const shareText = t(locale, "home.shareTargetsMsg", {
    n: targets.length,
    url: `${SITE_URL}/cari?status=${encodeURIComponent("Ada lowongan")}`,
  });
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  /* MKT-05: ajakan membagikan Karir itu sendiri (bukan daftarnya). */
  const waShareKarirHref = `https://wa.me/?text=${encodeURIComponent(
    t(locale, "home.shareKarirMsg", { url: `${SITE_URL}/` }),
  )}`;

  /* SEO-07 + MKT-11: data terstruktur beranda — Organization dan
   * WebSite dengan SearchAction supaya mesin pencari tahu cara
   * mencari di situs ini. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Karir",
        url: SITE_URL,
        logo: `${SITE_URL}/icon.svg`,
      },
      {
        "@type": "WebSite",
        name: "Karir",
        url: SITE_URL,
        inLanguage: "id",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/cari?posisi={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

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
    error: t(locale, "search.error"),
    retry: t(locale, "search.retry"),
    seeAll: t(locale, "hero.seeAll"),
    recent: t(locale, "hero.recent"),
    noMatch: t(locale, "search.noPositionMatch"),
    mark: t(locale, "search.mark"),
    unmark: t(locale, "search.unmark"),
    open: t(locale, "search.open"),
    newTab: t(locale, "common.newTab"),
    /* W2a (KONTEN-04): chip "Baru" dan chip alasan kecocokan di kartu
     * perusahaan hasil pencarian hero. */
    new: t(locale, "common.new"),
    matchPosition: t(locale, "search.matchPosition"),
    matchLocation: t(locale, "search.matchLocation"),
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
        {/* LAND-08: caption dan alt memakai kunci i18n, bukan teks
          * Indonesia kode-keras. LAND-11: foto disimpan lokal di
          * web/public/ (bukan hotlink Unsplash); PhotoStrip
          * menyediakan fallback onError bila satu foto gagal dimuat. */}
        <PhotoStrip
          photos={[
            {
              src: "/foto-gudang.jpg",
              alt: t(locale, "landing.photoAltWarehouse"),
              caption: t(locale, "landing.photoWarehouse"),
            },
            {
              src: "/foto-produksi.jpg",
              alt: t(locale, "landing.photoAltProduction"),
              caption: t(locale, "landing.photoProduction"),
            },
            {
              src: "/foto-cleaning.jpg",
              alt: t(locale, "landing.photoAltCleaning"),
              caption: t(locale, "landing.photoCleaning"),
            },
          ]}
        />
      </Reveal>

      <section className="sec" aria-labelledby="target-h">
        <Reveal>
          <div className="sec-head">
            <div>
              <p className="kicker ok">
                <Icon name="check" size={14} />
                {/* TS-04: kata "terverifikasi" menaut ke definisinya
                  * di halaman Metode, bukan sekadar klaim. */}
                <Link href="/metode">{t(locale, "home.targetsLead")}</Link>
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
            /* W2a (KONTEN-04/UX-08): chip kelompok "Semua", chip
             * "Baru", dan chip alasan kecocokan di kartu. */
            all: t(locale, "common.all"),
            new: t(locale, "common.new"),
            matchPosition: t(locale, "search.matchPosition"),
            matchLocation: t(locale, "search.matchLocation"),
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
            locale={locale}
            labels={{
              empty: t(locale, "home.changesEmpty"),
              error: t(locale, "home.changesError"),
              degraded: t(locale, "home.changesDegraded"),
              loading: t(locale, "home.changesLoading"),
              /* W2a (KONTEN-04): chip "Baru" pada perubahan terbaru. */
              new: t(locale, "common.new"),
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

      {/* MKT-05: ajakan membagikan Karir itu sendiri — sebelumnya
        * beranda hanya punya "Bagikan daftar lowongan". Tautan
        * WhatsApp (pola yang sama dengan tombol berbagi lain di
        * situs ini), jadi berfungsi tanpa JavaScript. */}
      <section className="sec" aria-labelledby="share-h">
        <Reveal>
          <h2 id="share-h">{t(locale, "home.shareKarirTitle")}</h2>
          <p>{t(locale, "home.shareKarirText")}</p>
          <div className="actions-row no-print">
            <a
              className="btn"
              href={waShareKarirHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="share" size={16} />
              {t(locale, "home.shareKarir")}
              {/* AKSES-13: beri tahu pembaca layar bahwa tautan
                * membuka tab baru (WhatsApp). */}
              <span className="sr-only"> {t(locale, "common.newTab")}</span>
            </a>
          </div>
        </Reveal>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}
