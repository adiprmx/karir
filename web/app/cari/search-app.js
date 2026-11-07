"use client";

/* Halaman Cari. Hasil diurutkan di browser dari indeks 406 perusahaan
 * (lib/search.js, aturan skor yang sama dengan server), jadi mengetik
 * langsung menggeser urutan. Kartu yang sudah ada meluncur ke posisi
 * barunya; kartu baru masuk. Alamat halaman ikut berubah supaya hasil
 * bisa dibagikan. Di HP, filter lanjutan ada di panel bawah. */
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCompanyIndex, rank } from "@/app/company-index";
import { saveRecentSearch } from "@/app/recent";
import { trackEvent } from "@/app/analytics-track";
import { CompanyCard, CardSkeletons } from "@/app/company-card";
import { useTracker } from "@/app/tracker";
import { Icon, Sheet, reducedMotion } from "@/app/visual";

const PAGE_SIZE = 20;

function fill(template, vars) {
  let s = template;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

function FilterControls({ idp, state, set, categories, statuses, labels }) {
  return (
    <div className="filter-controls">
      <div className="field">
        <label htmlFor={`${idp}-kategori`}>{labels.category}</label>
        <select
          id={`${idp}-kategori`}
          value={state.kategori}
          onChange={(e) => set({ kategori: e.target.value })}
        >
          <option value="">{labels.allCategories}</option>
          {categories.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="field">
        <legend>{labels.status}</legend>
        <div className="chips-wrap">
          <button
            type="button"
            className="chip-btn"
            aria-pressed={!state.status}
            onClick={() => set({ status: "" })}
          >
            {labels.allStatuses}
          </button>
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              className="chip-btn"
              aria-pressed={state.status === s}
              onClick={() => set({ status: state.status === s ? "" : s })}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>{labels.order}</legend>
        <div className="chips-wrap">
          {[
            ["relevansi", labels.orderRelevance],
            ["nama", labels.orderName],
          ].map(([v, text]) => (
            <button
              key={v}
              type="button"
              className="chip-btn"
              aria-pressed={state.urutan === v}
              onClick={() => set({ urutan: v })}
            >
              {text}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export default function SearchApp({ initial, categories, statuses, labels }) {
  const [state, setState] = useState(initial);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [sheet, setSheet] = useState(false);
  const { index, state: loadState, start } = useCompanyIndex({ eager: true });
  const { entries, toggle } = useTracker();
  const listRef = useRef(null);
  const prevTops = useRef(new Map());
  /* Tanda pencarian/filter terakhir yang sudah dikirim, supaya satu
   * penerapan yang sama tidak terkirim dua kali. */
  const lastSentSig = useRef(null);
  const firstApplied = useRef(true);

  const set = useCallback((patch) => {
    setState((s) => ({ ...s, ...patch }));
    setLimit(PAGE_SIZE);
  }, []);

  const dq = useDeferredValue(state);
  const r = useMemo(
    () => (index ? rank(index, dq) : null),
    [index, dq],
  );

  /* Alamat ikut berubah (tanpa menumpuk riwayat) dan pencarian terakhir
   * disimpan, keduanya setelah pengguna berhenti mengetik. Titik yang
   * sama dipakai untuk mengirim satu event pencarian/filter: hanya
   * bila state benar-benar diterapkan (sesudah debounce 600 mdtk),
   * bukan per ketukan. */
  useEffect(() => {
    const id = setTimeout(() => {
      const qs = new URLSearchParams();
      if (state.domisili.trim()) qs.set("domisili", state.domisili.trim());
      if (state.posisi.trim()) qs.set("posisi", state.posisi.trim());
      if (state.kategori) qs.set("kategori", state.kategori);
      if (state.status) qs.set("status", state.status);
      if (state.urutan !== "relevansi") qs.set("urutan", state.urutan);
      const s = qs.toString();
      window.history.replaceState(null, "", s ? `/cari?${s}` : "/cari");
      saveRecentSearch(state.domisili, state.posisi);
      /* Lewati kiriman pertama: itu isi awal dari alamat halaman,
       * bukan perubahan yang dibuat pengguna di halaman ini. */
      if (firstApplied.current) {
        firstApplied.current = false;
        lastSentSig.current = [
          state.domisili.trim(),
          state.posisi.trim(),
          state.kategori,
          state.status,
        ].join("|");
        return;
      }
      const sig = [
        state.domisili.trim(),
        state.posisi.trim(),
        state.kategori,
        state.status,
      ].join("|");
      if (sig === lastSentSig.current) return;
      lastSentSig.current = sig;
      const keyword = [state.domisili.trim(), state.posisi.trim()]
        .filter(Boolean)
        .join(" ")
        .slice(0, 200);
      if (keyword) {
        trackEvent({ type: "search", path: "/cari", q: keyword });
      } else if (state.kategori || state.status) {
        trackEvent({ type: "filter", path: "/cari" });
      }
    }, 600);
    return () => clearTimeout(id);
  }, [state]);

  const shown = r ? r.results.slice(0, limit) : [];

  /* FLIP: ukur posisi kartu sebelum dan sesudah urutan berubah, lalu
   * animasikan selisihnya. Hanya 30 kartu pertama. */
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nodes = Array.from(el.querySelectorAll("[data-no]")).slice(0, 30);
    const next = new Map();
    for (const n of nodes) {
      const top = n.offsetTop;
      next.set(n.dataset.no, top);
      const before = prevTops.current.get(n.dataset.no);
      if (
        before !== undefined &&
        before !== top &&
        !reducedMotion() &&
        n.animate
      ) {
        n.animate(
          [{ transform: `translateY(${before - top}px)` }, { transform: "none" }],
          { duration: 340, easing: "cubic-bezier(.2,.7,.2,1)" },
        );
      }
    }
    prevTops.current = next;
  }, [shown.length, r]);

  const activeFilters = [];
  if (state.kategori)
    activeFilters.push({ key: "kategori", text: state.kategori });
  if (state.status) activeFilters.push({ key: "status", text: state.status });
  const filterCount =
    activeFilters.length + (state.urutan !== "relevansi" ? 1 : 0);

  const queryHasPosisi = r ? r.hasP : false;
  const anyPositionMatch =
    r && (r.mode === "perusahaan" || r.results.some((e) => e.positionMatched));
  const reset = () => {
    setState({
      domisili: "",
      posisi: "",
      kategori: "",
      status: "",
      urutan: "relevansi",
    });
    setLimit(PAGE_SIZE);
  };

  return (
    <div className="wrap cari">
      <div className="page-head">
        <h1>{labels.title}</h1>
        <p className="lede">{labels.sortNote}</p>
      </div>

      <div className="cari-grid">
        <aside className="cari-side" aria-label={labels.filters}>
          <div className="cari-side-in">
            <FilterControls
              idp="d"
              state={state}
              set={set}
              categories={categories}
              statuses={statuses}
              labels={labels}
            />
            <button type="button" className="btn ghost small" onClick={reset}>
              {labels.reset}
            </button>
          </div>
        </aside>

        <div className="cari-main">
          <form
            className="searchrow"
            role="search"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="field">
              <label htmlFor="cari-domisili">{labels.domisili}</label>
              <div className="input-wrap">
                <Icon name="pin" size={18} />
                <input
                  id="cari-domisili"
                  type="text"
                  enterKeyHint="search"
                  value={state.domisili}
                  placeholder={labels.domisiliPh}
                  autoComplete="off"
                  onChange={(e) => set({ domisili: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="cari-posisi">{labels.posisi}</label>
              <div className="input-wrap">
                <Icon name="search" size={18} />
                <input
                  id="cari-posisi"
                  type="text"
                  enterKeyHint="search"
                  value={state.posisi}
                  placeholder={labels.posisiPh}
                  autoComplete="off"
                  onChange={(e) => set({ posisi: e.target.value })}
                />
              </div>
            </div>
            <button
              type="button"
              className="btn ghost filter-btn"
              onClick={() => setSheet(true)}
              aria-haspopup="dialog"
            >
              <Icon name="sliders" size={18} />
              <span>{labels.filters}</span>
              {filterCount > 0 && <span className="badge-n num">{filterCount}</span>}
            </button>
          </form>

          {activeFilters.length > 0 && (
            <div className="chips-wrap active-filters">
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="chip-btn on"
                  onClick={() => set({ [f.key]: "" })}
                  aria-label={`${labels.reset}: ${f.text}`}
                >
                  {f.text}
                  <Icon name="x" size={14} />
                </button>
              ))}
            </div>
          )}

          <section aria-label={labels.resultsLabel}>
            {loadState === "error" ? (
              <div className="state">
                <strong>{labels.error}</strong>
                <button type="button" className="btn" onClick={start}>
                  {labels.retry}
                </button>
              </div>
            ) : !r ? (
              <>
                <p className="result-count">{labels.loading}</p>
                <CardSkeletons n={6} />
              </>
            ) : (
              <>
                <p className="result-count" aria-live="polite">
                  {fill(labels.showing, {
                    a: shown.length,
                    b: r.results.length,
                  })}
                  {r.matched.size > 0 && (
                    <> {fill(labels.matchCount, { m: r.matched.size })}</>
                  )}
                </p>
                {queryHasPosisi && r.mode !== "perusahaan" && !anyPositionMatch && (
                  <p className="note-line">
                    <Icon name="info" size={16} />
                    {labels.noPositionMatch}
                  </p>
                )}
                {r.results.length === 0 ? (
                  <div className="state">
                    <strong>{labels.empty}</strong>
                    <p>{labels.emptyHint}</p>
                    <button type="button" className="btn" onClick={reset}>
                      {labels.reset}
                    </button>
                  </div>
                ) : (
                  <div className="co-list" ref={listRef}>
                    {shown.map((e, i) => (
                      <CompanyCard
                        key={e.company.no}
                        company={e.company}
                        reasons={e.reasons}
                        terms={r.terms}
                        tracked={entries[String(e.company.no)]}
                        onToggle={toggle}
                        index={Math.min(i, 8)}
                        notice={
                          queryHasPosisi &&
                          !e.positionMatched &&
                          !e.nameMatched
                        }
                        noticeText={labels.verifyNote}
                        labels={labels}
                      />
                    ))}
                  </div>
                )}
                {r.results.length > limit && (
                  <div className="load-more">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setLimit((n) => n + PAGE_SIZE)}
                    >
                      {labels.loadMore}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title={labels.filters}>
        <FilterControls
          idp="m"
          state={state}
          set={set}
          categories={categories}
          statuses={statuses}
          labels={labels}
        />
        <div className="sheet-foot">
          <button type="button" className="btn ghost" onClick={reset}>
            {labels.reset}
          </button>
          <button type="button" className="btn" onClick={() => setSheet(false)}>
            {labels.apply}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
