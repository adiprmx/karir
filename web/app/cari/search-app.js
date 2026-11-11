"use client";

/* Halaman Cari. Hasil diurutkan di browser dari indeks perusahaan
 * (lib/search.js, skor yang sama dengan server), jadi mengetik langsung
 * menggeser urutan; baris yang sudah ada meluncur ke posisi barunya.
 * Alamat halaman ikut berubah supaya hasil bisa dibagikan. Di HP, filter
 * lanjutan ada di panel bawah; di layar lebar di kolom kiri. */
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
import { CompanyRow, RowSkeletons } from "@/app/company-card";
import { useTracker } from "@/app/tracker";
import { Icon, Sheet, reducedMotion } from "@/app/visual";

const PAGE_SIZE = 20;
const NO_POSITION_NOTE = "Tidak ada kata kunci posisi yang cocok. Hasil di bawah diurutkan dari lokasi dan status.";

function FilterControls({ idp, state, set, categories, statuses }) {
  return (
    <div className="filter-group">
      <div className="field">
        <label htmlFor={`${idp}-kategori`}>Kategori industri</label>
        <select id={`${idp}-kategori`} value={state.kategori} onChange={(e) => set({ kategori: e.target.value })}>
          <option value="">Semua kategori</option>
          {categories.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="field">
        <legend>Status lowongan</legend>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={!state.status} onClick={() => set({ status: "" })}>
            Semua status
          </button>
          {statuses.map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={state.status === s} onClick={() => set({ status: state.status === s ? "" : s })}>
              {s}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>Urutan</legend>
        <div className="chips">
          {[
            ["relevansi", "Paling cocok"],
            ["nama", "Nama A-Z"],
          ].map(([v, text]) => (
            <button key={v} type="button" className="chip" aria-pressed={state.urutan === v} onClick={() => set({ urutan: v })}>
              {text}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export default function SearchApp({ initial, categories, statuses }) {
  const [state, setState] = useState(initial);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [sheet, setSheet] = useState(false);
  const { index, state: loadState, start } = useCompanyIndex({ eager: true });
  const { entries, toggle } = useTracker();
  const listRef = useRef(null);
  const prevTops = useRef(new Map());
  const lastSentSig = useRef(null);
  const firstApplied = useRef(true);

  const set = useCallback((patch) => {
    setState((s) => ({ ...s, ...patch }));
    setLimit(PAGE_SIZE);
  }, []);

  const dq = useDeferredValue(state);
  const r = useMemo(() => (index ? rank(index, dq) : null), [index, dq]);

  /* Alamat ikut berubah dan pencarian terakhir disimpan setelah pengguna
   * berhenti mengetik; titik yang sama mengirim satu event pencarian. */
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
      const sig = [state.domisili.trim(), state.posisi.trim(), state.kategori, state.status].join("|");
      /* Kiriman pertama adalah isi awal dari alamat, bukan perubahan pengguna. */
      if (firstApplied.current) {
        firstApplied.current = false;
        lastSentSig.current = sig;
        return;
      }
      if (sig === lastSentSig.current) return;
      lastSentSig.current = sig;
      const keyword = [state.domisili.trim(), state.posisi.trim()].filter(Boolean).join(" ").slice(0, 200);
      if (keyword) trackEvent({ type: "search", path: "/cari", q: keyword });
      else if (state.kategori || state.status) trackEvent({ type: "filter", path: "/cari" });
    }, 600);
    return () => clearTimeout(id);
  }, [state]);

  const shown = r ? r.results.slice(0, limit) : [];

  /* FLIP: ukur posisi baris sebelum dan sesudah urutan berubah, lalu
   * animasikan selisihnya (menjelaskan kenapa urutan bergeser). 30 baris pertama. */
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nodes = Array.from(el.querySelectorAll("[data-no]")).slice(0, 30);
    const next = new Map();
    for (const n of nodes) {
      const top = n.offsetTop;
      next.set(n.dataset.no, top);
      const before = prevTops.current.get(n.dataset.no);
      if (before !== undefined && before !== top && !reducedMotion() && n.animate) {
        n.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], {
          duration: 320,
          easing: "cubic-bezier(.2,.7,.2,1)",
        });
      }
    }
    prevTops.current = next;
  }, [shown.length, r]);

  const activeFilters = [];
  if (state.kategori) activeFilters.push({ key: "kategori", text: state.kategori });
  if (state.status) activeFilters.push({ key: "status", text: state.status });
  const filterCount = activeFilters.length + (state.urutan !== "relevansi" ? 1 : 0);

  const queryHasPosisi = r ? r.hasP : false;
  const anyPositionMatch = r && (r.mode === "perusahaan" || r.results.some((e) => e.positionMatched));
  const reset = () => {
    setState({ domisili: "", posisi: "", kategori: "", status: "", urutan: "relevansi" });
    setLimit(PAGE_SIZE);
  };

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Cari perusahaan</h1>
        <p className="lede">
          Hasil diurutkan dari kecocokan posisi, kota, dan status lowongan.
          Urutan ini bukan janji lowongan masih ada.
        </p>
      </div>

      <div className="cari-grid">
        <aside className="cari-side" aria-label="Filter">
          <FilterControls idp="d" state={state} set={set} categories={categories} statuses={statuses} />
          <button type="button" className="btn ghost small" onClick={reset} style={{ marginTop: 16 }}>
            Hapus semua isian
          </button>
        </aside>

        <div>
          <form className="searchbar" role="search" onSubmit={(e) => e.preventDefault()}>
            <div className="searchbar-row">
              <div className="field">
                <label htmlFor="cari-domisili">Kota tempat tinggal</label>
                <div className="in-icon">
                  <Icon name="pin" size={20} />
                  <input id="cari-domisili" type="text" enterKeyHint="search" value={state.domisili} placeholder="Bogor, Depok, Karawang" autoComplete="off" onChange={(e) => set({ domisili: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="cari-posisi">Posisi atau nama perusahaan</label>
                <div className="in-icon">
                  <Icon name="search" size={20} />
                  <input id="cari-posisi" type="text" enterKeyHint="search" value={state.posisi} placeholder="Helper Gudang, Cleaning" autoComplete="off" onChange={(e) => set({ posisi: e.target.value })} />
                </div>
              </div>
            </div>
            <button type="button" className="btn ghost filter-btn" onClick={() => setSheet(true)} aria-haspopup="dialog">
              <Icon name="sliders" size={20} />
              Filter kategori dan status
              {filterCount > 0 && <span className="count num">{filterCount}</span>}
            </button>
          </form>

          {activeFilters.length > 0 && (
            <div className="chips" style={{ paddingTop: 12 }}>
              {activeFilters.map((f) => (
                <button key={f.key} type="button" className="chip on" onClick={() => set({ [f.key]: "" })} aria-label={`Hapus filter: ${f.text}`}>
                  {f.text}
                  <Icon name="x" size={14} />
                </button>
              ))}
            </div>
          )}

          <section aria-label="Hasil pencarian">
            {loadState === "error" ? (
              <div className="state" style={{ marginTop: 16 }} role="alert">
                <strong>Daftar perusahaan belum bisa dimuat.</strong>
                <p>Periksa koneksi, lalu coba lagi. Datanya sendiri tidak hilang.</p>
                <button type="button" className="btn" onClick={start}>
                  Coba lagi
                </button>
              </div>
            ) : !r ? (
              <>
                <p className="result-count">Memuat daftar perusahaan...</p>
                <RowSkeletons n={6} />
              </>
            ) : (
              <>
                <p className="result-count" aria-live="polite">
                  Menampilkan {shown.length} dari {r.results.length} perusahaan
                  {r.matched.size > 0 && `, ${r.matched.size} cocok dengan isianmu`}
                </p>
                {queryHasPosisi && r.mode !== "perusahaan" && !anyPositionMatch && (
                  <p className="note" style={{ marginBottom: 12 }}>
                    <Icon name="info" size={18} />
                    {NO_POSITION_NOTE}
                  </p>
                )}
                {r.results.length === 0 ? (
                  <div className="state">
                    <strong>Tidak ada perusahaan yang cocok.</strong>
                    <p>Coba kata yang lebih pendek (misalnya &ldquo;gudang&rdquo;), atau hapus filter kategori dan status.</p>
                    <button type="button" className="btn" onClick={reset}>
                      Hapus semua isian
                    </button>
                  </div>
                ) : (
                  <div className="reg-list" ref={listRef}>
                    {shown.map((e) => (
                      <CompanyRow
                        key={e.company.no}
                        company={e.company}
                        reasons={e.reasons}
                        terms={r.terms}
                        tracked={entries[String(e.company.no)]}
                        onToggle={toggle}
                        notice={queryHasPosisi && !e.positionMatched && !e.nameMatched}
                        noticeText="Posisimu belum terlihat di data perusahaan ini. Cek portal resminya."
                      />
                    ))}
                  </div>
                )}
                {r.results.length > limit && (
                  <div className="load-more">
                    <button type="button" className="btn ghost" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                      Tampilkan {Math.min(PAGE_SIZE, r.results.length - limit)} perusahaan lagi
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Filter">
        <FilterControls idp="m" state={state} set={set} categories={categories} statuses={statuses} />
        <div className="sheet-foot">
          <button type="button" className="btn ghost" onClick={reset}>
            Hapus semua isian
          </button>
          <button type="button" className="btn" onClick={() => setSheet(false)}>
            Lihat hasil
          </button>
        </div>
      </Sheet>
    </div>
  );
}
