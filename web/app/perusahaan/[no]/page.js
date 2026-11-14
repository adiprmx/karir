import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanyByIdOrSeed, getRelatedOrSeed } from "@/lib/companies";
import { getLocale, t } from "@/lib/i18n";
import {
  STATUS_EXPLAIN,
  daysSince,
  daysUntil,
  formatDate,
  linkifySegments,
  safeLink,
  splitContacts,
  waLink,
} from "@/app/components";
import { Icon, Reveal, StatusStamp } from "@/app/visual";
import { TrackerControl } from "@/app/tracker";
import { FraudWarning } from "@/app/fraud-warning";
import { DetailActions, CopyChannelButton } from "./actions";
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

/* Render teks bebas (kontak_lain, catatan) dengan URL dan alamat email
 * yang bisa diklik. Potongan dibuat helper murni linkifySegments; di
 * sini hanya dipetakan ke elemen React biasa, tanpa HTML mentah. */
function LinkedText({ text }) {
  return linkifySegments(text).map((seg, i) =>
    seg.href ? (
      <a
        key={i}
        href={seg.href}
        {...(seg.href.startsWith("mailto:")
          ? {}
          : { target: "_blank", rel: "noopener noreferrer" })}
      >
        {seg.text}
      </a>
    ) : (
      seg.text
    ),
  );
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
  /* Portal yang diketahui tidak bisa dibuka tetap boleh dicoba, tapi
   * tombolnya bukan lagi ajakan utama (DET-05). */
  const portalDead = company.status === "Portal tidak bisa dibuka";
  const hasChannels = Boolean(
    company.email_hrd || company.wa_hrd || company.kontak_lain,
  );
  const url = `${SITE_URL}/perusahaan/${company.no}`;
  const description = shortDescription(company);
  const days = daysSince(company.tanggal_cek);
  const ago =
    days === null
      ? null
      : days === 0
        ? t(locale, "detail.today")
        : t(locale, "detail.daysAgo", { n: days });
  /* Batas lamar: tampilkan tanggalnya, plus penanda seberapa dekat
   * bila masih dalam 30 hari ke depan ("3 hari lagi", "hari ini"),
   * atau "Sudah lewat" bila tanggalnya sudah berlalu. */
  const deadlineDays = daysUntil(company.batas_lamar);
  const deadlineNote =
    deadlineDays === null
      ? null
      : deadlineDays === 0
        ? t(locale, "detail.today")
        : deadlineDays > 0 && deadlineDays <= 30
          ? t(locale, "detail.daysLeft", { n: deadlineDays })
          : deadlineDays < 0
            ? t(locale, "detail.deadlinePassed")
            : null;

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
          portalDead ? (
            <>
              <p className="note-line">
                <Icon name="alert" size={16} />
                {t(locale, "detail.portalDown")}
              </p>
              <a
                className="btn ghost"
                href={company.link_karir}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t(locale, "detail.tryPortalAnyway")}
                <Icon name="ext" size={18} />
              </a>
            </>
          ) : (
            <a
              className="btn d-portal"
              href={company.link_karir}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t(locale, "detail.portalBtn")}
              <Icon name="ext" size={18} />
            </a>
          )
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

      <FraudWarning locale={locale} variant="short" />

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
                  {splitContacts(company.email_hrd).map((email, i) => (
                    <div key={i}>
                      {email.includes("@") ? (
                        <a href={`mailto:${email}`}>{email}</a>
                      ) : (
                        email
                      )}
                      <CopyChannelButton
                        value={email}
                        channel="email"
                        companyNo={company.no}
                        labels={{
                          copy: t(locale, "detail.copyChannel"),
                          copied: t(locale, "detail.channelCopied"),
                          copyFailed: t(locale, "detail.channelCopyFailed"),
                          copyWa: t(locale, "detail.copyWa"),
                          copyEmail: t(locale, "detail.copyEmail"),
                        }}
                      />
                    </div>
                  ))}
                </dd>
              </div>
            )}
            {company.wa_hrd && (
              <div>
                <dt>{t(locale, "detail.waHrd")}</dt>
                <dd>
                  {splitContacts(company.wa_hrd).map((number, i) => {
                    const waUrl = waLink(number);
                    return (
                      <div key={i}>
                        {waUrl ? (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {number}
                          </a>
                        ) : (
                          number
                        )}
                        <CopyChannelButton
                          value={number}
                          channel="wa"
                          companyNo={company.no}
                          labels={{
                            copy: t(locale, "detail.copyChannel"),
                            copied: t(locale, "detail.channelCopied"),
                            copyFailed: t(locale, "detail.channelCopyFailed"),
                            copyWa: t(locale, "detail.copyWa"),
                            copyEmail: t(locale, "detail.copyEmail"),
                          }}
                        />
                      </div>
                    );
                  })}
                </dd>
              </div>
            )}
            {company.kontak_lain && (
              <div>
                <dt>{t(locale, "detail.otherChannels")}</dt>
                <dd>
                  <LinkedText text={company.kontak_lain} />
                </dd>
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
              {company.batas_lamar && (
                <div>
                  <dt>{t(locale, "detail.deadline")}</dt>
                  <dd>
                    {formatDate(company.batas_lamar, locale) ||
                      company.batas_lamar}
                    {deadlineNote && (
                      <span className="ago"> · {deadlineNote}</span>
                    )}
                  </dd>
                </div>
              )}
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
                <dd>
                  {company.catatan ? (
                    <LinkedText text={company.catatan} />
                  ) : (
                    t(locale, "detail.noNotes")
                  )}
                </dd>
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
