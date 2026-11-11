import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanyByIdOrSeed, getRelatedOrSeed } from "@/lib/companies";
import { STATUS_EXPLAIN, daysSince, deadlineInfo, formatDate, safeLink } from "@/app/components";
import { Icon, StatusTag } from "@/app/visual";
import { TrackerControl } from "@/app/tracker";
import { DetailActions } from "./actions";
import { CompanyLogo } from "@/lib/logos";

const SITE_URL = "https://karir-adiprmx.vercel.app";

function shortDescription(company) {
  const base = [company.perusahaan, company.kategori, company.status].filter(Boolean).join(", ");
  const withLocation = company.lokasi ? `${base}. Lokasi: ${company.lokasi}` : base;
  return withLocation.slice(0, 160);
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
  const company = await getCompanyByIdOrSeed(no);
  if (!company) notFound();
  const related = await getRelatedOrSeed(company, 4);
  const hasLink = safeLink(company.link_karir);
  const url = `${SITE_URL}/perusahaan/${company.no}`;
  const description = shortDescription(company);
  const days = daysSince(company.tanggal_cek);
  const ago = days === null ? null : days === 0 ? "hari ini" : `${days} hari lalu`;
  const isOpen = company.status === "Ada lowongan target";
  const deadline = isOpen ? deadlineInfo(company.batas_lamar) : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: company.perusahaan, ...(hasLink ? { url: company.link_karir } : {}) },
      { "@type": "WebPage", name: `${company.perusahaan} | Karir`, url, description, inLanguage: "id" },
    ],
  };

  return (
    <div className="wrap">
      <Link className="crumb" href="/cari">
        <Icon name="back" size={18} />
        Kembali ke Cari
      </Link>

      <header className="d-head">
        <div className="d-no">
          <b className="num" aria-hidden="true">
            {company.no}
          </b>
          <span>
            Nomor urut di daftar
            {company.kategori ? `, kategori ${company.kategori}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <CompanyLogo linkKarir={company.link_karir} name={company.perusahaan} size={56} />
          <h1>
            <span className="sr-only">Nomor {company.no}: </span>
            {company.perusahaan}
          </h1>
        </div>
        <div className="reg-line">
          <StatusTag status={company.status} />
          {deadline && (
            <span className={`tag${deadline.urgent ? " deadline" : " none"}`}>{deadline.text}</span>
          )}
        </div>
        <p className="lede">{STATUS_EXPLAIN[company.status] || ""}</p>
      </header>

      <div className="d-cta">
        {hasLink ? (
          <a className={`btn${isOpen ? " hi" : ""}`} href={company.link_karir} target="_blank" rel="noopener noreferrer">
            Buka portal karir resmi
            <Icon name="ext" size={18} />
          </a>
        ) : (
          <p className="note">
            <Icon name="info" size={18} />
            Perusahaan ini belum punya tautan karir yang tercatat.
          </p>
        )}
        <DetailActions company={company} url={url} />
      </div>

      <div className="d-grid" style={{ marginTop: 16 }}>
        <section className="panel" aria-labelledby="hasil-h">
          <h2 id="hasil-h" className="panel-title">
            Hasil pengecekan
          </h2>
          <dl className="facts">
            <div>
              <dt>Terakhir dicek</dt>
              <dd>
                {formatDate(company.tanggal_cek) || "Belum ada tanggal cek."}
                {ago && ` (${ago})`}
              </dd>
            </div>
            {company.batas_lamar && (
              <div>
                <dt>Batas lamar tercatat</dt>
                <dd>{formatDate(company.batas_lamar) || company.batas_lamar}</dd>
              </div>
            )}
            <div>
              <dt>Lokasi</dt>
              <dd>{company.lokasi || "Tidak tercantum"}</dd>
            </div>
            <div>
              <dt>Posisi yang terlihat</dt>
              <dd>{company.posisi || "Belum ada posisi yang tercatat."}</dd>
            </div>
            <div>
              <dt>Catatan</dt>
              <dd>{company.catatan || "Belum ada catatan."}</dd>
            </div>
          </dl>
        </section>
        <TrackerControl company={company} />
      </div>

      <section className="sec" aria-labelledby="related-h">
        <div className="sec-head">
          <h2 id="related-h">Perusahaan sekategori</h2>
        </div>
        {related.length > 0 ? (
          <ul className="mini-list">
            {related.map((c) => (
              <li key={c.no}>
                <Link href={`/perusahaan/${c.no}`}>
                  <span className="mini-name">
                    {c.no}. {c.perusahaan}
                  </span>
                  <span>
                    <StatusTag status={c.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="state">
            <strong>Belum ada perusahaan lain di kategori ini.</strong>
          </div>
        )}
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </div>
  );
}
