"use client";

/* Kartu perusahaan: dipakai di hasil Beranda, halaman Cari, daftar
 * target, dan Lamaran. Seluruh kartu menaut ke halaman detail; dua
 * tombol kecil di kanan (tandai, buka portal) punya perilaku sendiri. */
import Link from "next/link";
import { CompanyLogo } from "@/lib/logos";
import { safeLink } from "@/app/components";
import { Highlight, Icon, StatusStamp } from "@/app/visual";

export function CompanyCard({
  company: c,
  reasons = [],
  terms,
  tracked,
  onToggle,
  notice = false,
  noticeText,
  isNew = false,
  index = 0,
  compact = false,
  labels = {},
}) {
  const hasPortal = safeLink(c.link_karir) && c.status !== "Portal tidak bisa dibuka";
  const matchChips = reasons.filter(
    (r) => r === "Posisi cocok" || r === "Lokasi cocok",
  );
  return (
    <article
      className={`co${compact ? " compact" : ""}`}
      data-no={c.no}
      style={{ "--i": index }}
    >
      <CompanyLogo linkKarir={c.link_karir} name={c.perusahaan} size={44} />
      <div className="co-main">
        <h3 className="co-name">
          <Link href={`/perusahaan/${c.no}`}>
            <Highlight text={c.perusahaan} terms={terms && terms.pos} />
          </Link>
        </h3>
        <p className="co-meta">
          {c.kategori && <span className="co-cat">{c.kategori}</span>}
          {c.lokasi && (
            <span className="co-loc">
              <Highlight text={c.lokasi} terms={terms && terms.loc} />
            </span>
          )}
        </p>
        <StatusStamp status={c.status} index={index} />
        {!compact && c.posisi && (
          <p className="co-pos">
            <Highlight text={c.posisi} terms={terms && terms.pos} />
          </p>
        )}
        {(matchChips.length > 0 || isNew) && (
          <p className="co-chips">
            {isNew && <span className="chip match">Baru</span>}
            {matchChips.map((r) => (
              <span key={r} className="chip match">
                {r}
              </span>
            ))}
          </p>
        )}
        {notice && (
          <p className="co-note">
            <Icon name="info" size={14} />
            {noticeText}
          </p>
        )}
      </div>
      <div className="co-actions">
        {onToggle &&
          (tracked && tracked.status !== "Ditandai" ? (
            <Link
              className="icon-btn on"
              href={`/perusahaan/${c.no}#lamaran`}
              aria-label={`${tracked.status}: ${c.perusahaan}`}
              title={tracked.status}
            >
              <Icon name="check" size={18} />
            </Link>
          ) : (
            <button
              type="button"
              className={`icon-btn${tracked ? " on pop" : ""}`}
              aria-pressed={Boolean(tracked)}
              aria-label={`${tracked ? labels.unmark || "Lepas tanda" : labels.mark || "Tandai"}: ${c.perusahaan}`}
              onClick={() => onToggle(c)}
            >
              <Icon name="bookmark" size={18} filled={Boolean(tracked)} />
            </button>
          ))}
        {hasPortal && (
          <a
            className="icon-btn"
            href={c.link_karir}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${labels.open || "Buka portal"}: ${c.perusahaan}`}
            title={labels.open || "Buka portal"}
          >
            <Icon name="ext" size={18} />
          </a>
        )}
      </div>
    </article>
  );
}

export function CardSkeletons({ n = 5 }) {
  return (
    <div className="co-list" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div className="co skel" key={i}>
          <span className="skeleton" style={{ width: 44, height: 44 }} />
          <div className="co-main">
            <span className="skeleton" style={{ width: "60%", height: 18 }} />
            <span className="skeleton" style={{ width: "40%", height: 14 }} />
            <span className="skeleton" style={{ width: "30%", height: 22 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
