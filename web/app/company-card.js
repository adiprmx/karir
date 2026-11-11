"use client";

/* Baris register perusahaan: dipakai di Cari, daftar target, dan hasil.
 * Seluruh baris menaut ke halaman detail (tautan nama diperluas lewat
 * ::after); tombol tanda dan portal punya perilaku sendiri. Nomor urut di
 * lajur kiri adalah nomor asli di data (no), bukan hiasan. */
import Link from "next/link";
import { deadlineInfo, safeLink } from "@/app/components";
import { Highlight, Icon, StatusTag } from "@/app/visual";

export function CompanyRow({
  company: c,
  reasons = [],
  terms,
  tracked,
  onToggle,
  notice = false,
  noticeText,
  isNew = false,
  compact = false,
}) {
  const hasPortal = safeLink(c.link_karir) && c.status !== "Portal tidak bisa dibuka";
  const matches = reasons.filter((r) => r === "Posisi cocok" || r === "Lokasi cocok");
  const isOpen = c.status === "Ada lowongan target";
  const deadline = isOpen ? deadlineInfo(c.batas_lamar) : null;
  return (
    <article className={`reg${isOpen ? " is-open" : ""}`} data-no={c.no}>
      <div className="reg-no num" aria-hidden="true">
        {c.no}
      </div>
      <div className="reg-body">
        <h3 className="reg-name">
          <Link href={`/perusahaan/${c.no}`}>
            <span className="sr-only">Nomor {c.no}: </span>
            <Highlight text={c.perusahaan} terms={terms && terms.pos} />
          </Link>
        </h3>
        <p className="reg-meta">
          {c.kategori}
          {c.kategori && c.lokasi ? " · " : ""}
          {c.lokasi && <Highlight text={c.lokasi} terms={terms && terms.loc} />}
        </p>
        <div className="reg-line">
          <StatusTag status={c.status} />
          {isNew && <span className="tag baru">Baru</span>}
          {deadline && (
            <span className={`tag${deadline.urgent ? " deadline" : " none"}`}>
              {deadline.text}
            </span>
          )}
          {matches.map((r) => (
            <span key={r} className="match">
              <Icon name="check" size={14} />
              {r}
            </span>
          ))}
        </div>
        {!compact && c.posisi && (
          <p className="reg-pos">
            <Highlight text={c.posisi} terms={terms && terms.pos} />
          </p>
        )}
        {notice && (
          <p className="reg-note">
            <Icon name="info" size={16} />
            {noticeText}
          </p>
        )}
      </div>
      <div className="reg-act">
        {onToggle &&
          (tracked && tracked.status !== "Ditandai" ? (
            <Link
              className="icon-btn on"
              href={`/perusahaan/${c.no}#lamaran`}
              aria-label={`${tracked.status}: ${c.perusahaan}`}
              title={tracked.status}
            >
              <Icon name="check" size={22} />
            </Link>
          ) : (
            <button
              type="button"
              className={`icon-btn${tracked ? " pop" : ""}`}
              aria-pressed={Boolean(tracked)}
              aria-label={`${tracked ? "Lepas tanda" : "Tandai untuk dilamar"}: ${c.perusahaan}`}
              onClick={() => onToggle(c)}
            >
              <Icon name="flag" size={22} filled={Boolean(tracked)} />
            </button>
          ))}
        {hasPortal && (
          <a
            className="icon-btn"
            href={c.link_karir}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Buka portal karir resmi: ${c.perusahaan}`}
            title="Buka portal karir resmi"
          >
            <Icon name="ext" size={20} />
          </a>
        )}
      </div>
    </article>
  );
}

export function RowSkeletons({ n = 5 }) {
  return (
    <div className="reg-list" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div className="reg skel" key={i}>
          <span className="skeleton" style={{ height: 28, width: 36, justifySelf: "end" }} />
          <div className="reg-body">
            <span className="skeleton" style={{ width: "62%", height: 20 }} />
            <span className="skeleton" style={{ width: "42%", height: 14 }} />
            <span className="skeleton" style={{ width: "34%", height: 24 }} />
          </div>
          <span />
        </div>
      ))}
    </div>
  );
}
