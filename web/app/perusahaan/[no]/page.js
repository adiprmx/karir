import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanyByIdOrSeed, getRelatedOrSeed } from "@/lib/companies";
import { getLocale, t } from "@/lib/i18n";
import {
  STATUS_EXPLAIN,
  daysSince,
  formatDate,
  safeLink,
} from "@/app/components";
import { Icon, Reveal, StatusStamp } from "@/app/visual";
import { TrackerControl } from "@/app/tracker";
import { DetailActions } from "./actions";
import { CompanyLogo } from "@/lib/logos";

const SITE_URL = "https://karir-adiprmx.vercel.app";

function shortDescription(company) {
  const base = [company.perusahaan, company.kategori, company.status]
    .filter(Boolean)
    .join(", ");
  const withLocation = company.lokasi
    ? `${base}. Lokasi: ${company.lokasi}`
    : base;
  return withLocation.slice(0, 160);
}

/* Normalisasi nomor WhatsApp ke tautan wa.me: buang spasi/strip,
 * awalan 0 diganti 62. Null bila tidak ada digit sama sekali. */
function waLink(number) {
  const digits = String(number || "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const intl = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

export async function generateMetadata({ params }) {
  const { no } = await params;
  const company = await getCompanyByIdOrSeed(no);
  if (!company) notFound();
  const description = shortDescription(company);
  return {
    title: company.perusahaan,
    description,
    openGraph: {
      title: company.perusahaan,
      description,
      type: "website",
      url: `${SITE_URL}/perusahaan/${company.no}`,
    },
  };
}

export default async function CompanyDetail({ params }) {
  const { no } = await params;
  const [company, locale] = await Promise.all([
    getCompanyByIdOrSeed(no),
    getLocale(),
  ]);
  if (!company) notFound();
  const related = await getRelatedOrSeed(company, 4);
  const hasLink = safeLink(company.link_karir);
  const hasChannels = Boolean(
    company.email_hrd || company.wa_hrd || company.kontak_lain,
  );
  const waUrl = waLink(company.wa_hrd);
  const url = `${SITE_URL}/perusahaan/${company.no}`;
  const description = shortDescription(company);
  const days = daysSince(company.tanggal_cek);
  const ago =
    days === null
      ? null
      : days === 0
        ? t(locale, "detail.today")
        : t(locale, "detail.daysAgo", { n: days });

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: company.perusahaan,
        ...(hasLink ? { url: company.link_karir } : {}),
      },
      {
        "@type": "WebPage",
        name: `${company.perusahaan} — Karir`,
        url,
        description,
        inLanguage: locale,
      },
    ],
  };

  return (
    <div className="wrap detail">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/cari">
          <Icon name="back" size={16} />
          {t(locale, "nav.search")}
        </Link>
      </nav>

      <header className="d-head">
        <CompanyLogo
          linkKarir={company.link_karir}
          name={company.perusahaan}
          size={64}
        />
        <div className="d-head-text">
          {company.kategori && <p className="co-cat">{company.kategori}</p>}
          <h1>{company.perusahaan}</h1>
          <StatusStamp status={company.status} />
        </div>
      </header>

      <p className="d-explain">
        {STATUS_EXPLAIN[company.status] || ""}
      </p>

      <div className="d-cta">
        {hasLink ? (
          <a
            className="btn d-portal"
            href={company.link_karir}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t(locale, "detail.portalBtn")}
            <Icon name="ext" size={18} />
          </a>
        ) : (
          <p className="note-line">
            <Icon name="info" size={16} />
            {t(locale, "detail.noLink")}
          </p>
        )}
        <DetailActions
          company={company}
          url={url}
          labels={{
            share: t(locale, "detail.share"),
            copied: t(locale, "detail.copied"),
            report: t(locale, "detail.report"),
            reportHint: t(locale, "detail.reportHint"),
            reportSent: t(locale, "detail.reportSent"),
            loading: t(locale, "common.loading"),
          }}
        />
      </div>

      {hasChannels && (
        <section className="panel" aria-labelledby="channels-h">
          <h2 id="channels-h" className="panel-title">
            {t(locale, "detail.applyChannels")}
          </h2>
          <dl className="facts">
            {company.email_hrd && (
              <div>
                <dt>{t(locale, "detail.emailHrd")}</dt>
                <dd>
                  <a href={`mailto:${company.email_hrd}`}>
                    {company.email_hrd}
                  </a>
                </dd>
              </div>
            )}
            {company.wa_hrd && (
              <div>
                <dt>{t(locale, "detail.waHrd")}</dt>
                <dd>
                  {waUrl ? (
                    <a href={waUrl} target="_blank" rel="noopener noreferrer">
                      {company.wa_hrd}
                    </a>
                  ) : (
                    company.wa_hrd
                  )}
                </dd>
              </div>
            )}
            {company.kontak_lain && (
              <div>
                <dt>{t(locale, "detail.otherChannels")}</dt>
                <dd>{company.kontak_lain}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <div className="d-grid">
        <Reveal className="d-col">
          <section className="panel" aria-labelledby="hasil-h">
            <h2 id="hasil-h" className="panel-title">
              {t(locale, "detail.notes")}
            </h2>
            <dl className="facts">
              <div>
                <dt>{t(locale, "detail.checked")}</dt>
                <dd>
                  {formatDate(company.tanggal_cek, locale) ||
                    "Belum ada tanggal cek."}
                  {ago && <span className="ago"> · {ago}</span>}
                </dd>
              </div>
              <div>
                <dt>{t(locale, "detail.location")}</dt>
                <dd>{company.lokasi || t(locale, "common.notListed")}</dd>
              </div>
              <div>
                <dt>{t(locale, "detail.positions")}</dt>
                <dd>{company.posisi || t(locale, "detail.noPositions")}</dd>
              </div>
              <div>
                <dt>{t(locale, "detail.notes")}</dt>
                <dd>{company.catatan || t(locale, "detail.noNotes")}</dd>
              </div>
            </dl>
          </section>
        </Reveal>

        <Reveal className="d-col" delay={80}>
          <TrackerControl company={company} />
        </Reveal>
      </div>

      <section className="sec" aria-labelledby="related-h">
        <Reveal>
          <h2 id="related-h">{t(locale, "detail.related")}</h2>
          {related.length > 0 ? (
            <ul className="mini-list">
              {related.map((c) => (
                <li key={c.no}>
                  <Link href={`/perusahaan/${c.no}`}>
                    <CompanyLogo
                      linkKarir={c.link_karir}
                      name={c.perusahaan}
                      size={36}
                    />
                    <span className="mini-name">{c.perusahaan}</span>
                    <StatusStamp status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-line">{t(locale, "detail.noRelated")}</p>
          )}
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
