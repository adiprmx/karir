import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanyById, getRelated } from "@/lib/companies";
import { getLocale, t } from "@/lib/i18n";
import { StatusBadge, safeLink } from "@/app/components";
import { StatusDot, CategoryIcon } from "@/app/visual";
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

export async function generateMetadata({ params }) {
  const { no } = await params;
  const company = await getCompanyById(no);
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
    getCompanyById(no),
    getLocale(),
  ]);
  if (!company) notFound();
  const related = await getRelated(company);
  const hasLink = safeLink(company.link_karir);
  const url = `${SITE_URL}/perusahaan/${company.no}`;
  const description = shortDescription(company);

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
    <div className="wrap">
      <div className="page-head anim-fade-up">
        <p className="section-note">
          <Link href="/">{t(locale, "nav.home")}</Link>
          {" / "}
          <Link href="/cari">{t(locale, "nav.search")}</Link>
          {" / "}
          {company.perusahaan}
        </p>
        <h1 className="detail-title">
          <CompanyLogo
            linkKarir={company.link_karir}
            name={company.perusahaan}
            size={40}
          />
          {company.perusahaan}
        </h1>
        <p className="chip-row">
          <span className="chip">{company.kategori}</span>
          <span style={{ alignSelf: "center", display: "flex" }}>
            <StatusDot status={company.status} />
          </span>
          <StatusBadge status={company.status} />
        </p>
      </div>

      {hasLink ? (
        <p className="anim-fade-up-1">
          <a
            className="btn"
            href={company.link_karir}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t(locale, "detail.portalBtn")}
          </a>
        </p>
      ) : (
        <p className="notice anim-fade-up-1">
          Perusahaan ini tidak punya tautan karir yang ditemukan
        </p>
      )}

      <div className="anim-fade-up-1">
        <DetailActions
          company={company}
          url={url}
          labels={{
            share: t(locale, "detail.share"),
            copied: t(locale, "detail.copied"),
            report: t(locale, "detail.report"),
            reportSent: t(locale, "detail.reportSent"),
            loading: t(locale, "common.loading"),
          }}
        />
      </div>

      <div className="anim-fade-up-1">
        <TrackerControl company={company} />
      </div>

      <section className="dash-section anim-fade-up-2" aria-label="Detail perusahaan">
        <p className="section-label">{t(locale, "detail.location")}</p>
        <p>{company.lokasi || "Tidak tercantum"}</p>
        <p className="section-label">{t(locale, "detail.positions")}</p>
        <p>{company.posisi || "Tidak ada posisi terlihat"}</p>
        <p className="section-label">{t(locale, "detail.notes")}</p>
        <p>{company.catatan || "Tidak ada catatan."}</p>
        <p className="section-label">{t(locale, "detail.checked")}</p>
        <p>{company.tanggal_cek || "Belum ada tanggal cek."}</p>
      </section>

      <section className="dash-section">
        <h2>{t(locale, "detail.related")}</h2>
        {related.length > 0 ? (
          <ul className="recheck-list">
            {related.map((c) => (
              <li key={c.no}>
                <span
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <CategoryIcon kategori={c.kategori} />
                  <Link
                    href={`/perusahaan/${c.no}`}
                    style={{ minWidth: 0, overflowWrap: "anywhere" }}
                  >
                    {c.perusahaan}
                  </Link>
                  <StatusDot status={c.status} />
                </span>
                <span className="cell-sub">{c.kategori}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="section-note">
            Belum ada perusahaan sejenis dalam kategori ini.
          </p>
        )}
      </section>

      <p>
        <Link href="/cari">← {t(locale, "common.back")}</Link>
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}
