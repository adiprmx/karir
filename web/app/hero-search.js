"use client";

/* Pencarian di layar pertama Beranda. Dua isian (domisili, posisi) dan
 * satu pertanyaan yang dijawab langsung oleh data: dari 406 kanal,
 * berapa yang cocok denganmu? Tiap kanal satu kotak; saat mengetik,
 * kotak yang cocok menyala dan sisanya meredup. Hasil teratas muncul
 * di bawahnya. Semua dihitung di browser dari indeks perusahaan. */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCompanyIndex, rank } from "@/app/company-index";
import { loadRecentSearch, saveRecentSearch } from "@/app/recent";
import { CompanyCard, CardSkeletons } from "@/app/company-card";
import { useTracker } from "@/app/tracker";
import { Icon } from "@/app/visual";

const COLS = 29; // 29 x 14 = 406 kotak

function fill(template, vars) {
  let s = template;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export default function HeroSearch({ labels, nos, targetMask, roles }) {
  const router = useRouter();
  const [domisili, setDomisili] = useState("");
  const [posisi, setPosisi] = useState("");
  const [recent, setRecent] = useState(null);
  const { index, state, start } = useCompanyIndex();
  const { entries, toggle } = useTracker();
  const formRef = useRef(null);

  useEffect(() => {
    const read = () => setRecent(loadRecentSearch());
    read();
    window.addEventListener("karir-recent-change", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("karir-recent-change", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const hasQuery = Boolean(domisili.trim() || posisi.trim());
  const q = useMemo(() => ({ domisili, posisi }), [domisili, posisi]);
  const dq = useDeferredValue(q);

  const ranked = useMemo(() => {
    if (!index || !(dq.domisili.trim() || dq.posisi.trim())) return null;
    return rank(index, { ...dq, urutan: "relevansi" });
  }, [index, dq]);

  const total = nos.length;
  const targets = useMemo(
    () => [...targetMask].filter((c) => c === "1").length,
    [targetMask],
  );

  const matchedCount = ranked ? ranked.matched.size : 0;
  const verifiedMatched = useMemo(() => {
    if (!ranked || !index) return 0;
    let n = 0;
    for (const c of index) {
      if (c.status === "Ada lowongan target" && ranked.matched.has(c.no)) n++;
    }
    return n;
  }, [ranked, index]);

  const cells = useMemo(
    () =>
      nos.map((no, i) => ({
        no,
        t: targetMask[i] === "1",
        d: (i % COLS) + Math.floor(i / COLS),
      })),
    [nos, targetMask],
  );

  function onType(setter) {
    return (e) => {
      setter(e.target.value);
      start();
    };
  }

  function go(d, p) {
    const params = new URLSearchParams();
    if (d.trim()) params.set("domisili", d.trim());
    if (p.trim()) params.set("posisi", p.trim());
    saveRecentSearch(d, p);
    const s = params.toString();
    router.push(s ? `/cari?${s}` : "/cari");
  }

  function pickRole(role) {
    setPosisi((cur) => (cur === role ? "" : role));
    start();
  }

  const seeAllQs = new URLSearchParams();
  if (domisili.trim()) seeAllQs.set("domisili", domisili.trim());
  if (posisi.trim()) seeAllQs.set("posisi", posisi.trim());

  const caption = !hasQuery
    ? fill(labels.vizIdle, { a: targets, b: total })
    : state === "error"
      ? labels.vizError
      : !ranked
        ? fill(labels.vizLoading, { n: total })
        : fill(labels.vizMatch, { a: matchedCount, b: total });

  const top = ranked ? ranked.results.slice(0, 5) : [];
  const anyStrict = ranked ? ranked.matched.size > 0 : false;

  return (
    <div className="hero-tool">
      <form
        ref={formRef}
        className="finder"
        method="get"
        action="/cari"
        onSubmit={(e) => {
          e.preventDefault();
          go(domisili, posisi);
        }}
      >
        <div className="field">
          <label htmlFor="hero-domisili">{labels.domisili}</label>
          <div className="input-wrap">
            <Icon name="pin" size={18} />
            <input
              id="hero-domisili"
              name="domisili"
              type="text"
              inputMode="text"
              enterKeyHint="search"
              placeholder={labels.domisiliPh}
              autoComplete="off"
              value={domisili}
              onChange={onType(setDomisili)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="hero-posisi">{labels.posisi}</label>
          <div className="input-wrap">
            <Icon name="search" size={18} />
            <input
              id="hero-posisi"
              name="posisi"
              type="text"
              enterKeyHint="search"
              placeholder={labels.posisiPh}
              autoComplete="off"
              value={posisi}
              onChange={onType(setPosisi)}
            />
          </div>
        </div>
        <button type="submit" className="btn finder-go">
          {labels.searchBtn}
          <Icon name="arrow" size={18} />
        </button>
      </form>

      <div className="roles" role="group" aria-label={labels.rolesLabel}>
        <span className="roles-label">{labels.rolesLabel}</span>
        <div className="roles-row">
          {roles.map((r) => (
            <button
              key={r.name}
              type="button"
              className="chip-btn"
              aria-pressed={posisi === r.name}
              onClick={() => pickRole(r.name)}
            >
              {r.name}
              {r.count > 0 && <span className="chip-count num">{r.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {recent && !hasQuery && (
        <button
          type="button"
          className="recent"
          onClick={() => {
            setDomisili(recent.domisili);
            setPosisi(recent.posisi);
            start();
          }}
        >
          <span>{labels.recent}</span>
          <strong>
            {[recent.domisili, recent.posisi].filter(Boolean).join(" + ")}
          </strong>
        </button>
      )}

      <section
        className={`viz${ranked ? " q" : ""}`}
        aria-labelledby="viz-q"
      >
        <h2 id="viz-q" className="viz-q">
          {fill(labels.vizQuestion, { n: total })}
        </h2>
        <div className="cells" aria-hidden="true">
          {cells.map((c) => (
            <span
              key={c.no}
              className={`cell${c.t ? " t" : ""}${ranked && ranked.matched.has(c.no) ? " m" : ""}`}
              style={{ "--d": c.d }}
            />
          ))}
        </div>
        <p className="viz-cap" aria-live="polite">
          <strong key={caption}>{caption}</strong>
          {ranked && verifiedMatched > 0 && (
            <> {fill(labels.vizVerified, { n: verifiedMatched })}</>
          )}
        </p>
        <ul className="legend">
          <li>
            <span className="sw t" /> {labels.legendTarget}
          </li>
          {ranked && (
            <li>
              <span className="sw m" /> {labels.legendMatch}
            </li>
          )}
          <li>
            <span className="sw" /> {labels.legendOther}
          </li>
        </ul>
      </section>

      {hasQuery && (
        <section className="hero-results" aria-label={labels.top}>
          {!ranked ? (
            state === "error" ? null : <CardSkeletons n={3} />
          ) : (
            <>
              {!anyStrict && (
                <p className="note-line">
                  <Icon name="info" size={16} />
                  {labels.noMatch}
                </p>
              )}
              <div className="co-list">
                {top.map((e, i) => (
                  <CompanyCard
                    key={e.company.no}
                    company={e.company}
                    reasons={e.reasons}
                    terms={ranked.terms}
                    tracked={entries[String(e.company.no)]}
                    onToggle={toggle}
                    index={i}
                    compact
                    labels={labels}
                  />
                ))}
              </div>
              <Link
                className="btn ghost see-all"
                href={`/cari?${seeAllQs.toString()}`}
                onClick={() => saveRecentSearch(domisili, posisi)}
              >
                {fill(labels.seeAll, {
                  n: anyStrict ? ranked.matched.size : ranked.results.length,
                })}
                <Icon name="arrow" size={18} />
              </Link>
            </>
          )}
        </section>
      )}
    </div>
  );
}
