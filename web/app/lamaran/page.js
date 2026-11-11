"use client";

/* Halaman "Lamaran saya": perusahaan yang dilacak pengguna. Data
 * perusahaan dari indeks (/api/index), data lacakan dari localStorage
 * (app/tracker.js) dan, bila masuk akun, disinkronkan ke akun. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { TRACKER_STATUSES, useTracker } from "@/app/tracker";
import { useCompanyIndex } from "@/app/company-index";
import { Icon, showToast } from "@/app/visual";
import { safeLink } from "@/app/components";

export default function Lamaran() {
  const { entries, loaded, save, remove } = useTracker();
  const { index, state, start } = useCompanyIndex({ eager: true });
  const [tab, setTab] = useState("Semua");

  const byNo = useMemo(() => {
    const m = new Map();
    for (const c of index || []) m.set(c.no, c);
    return m;
  }, [index]);

  const tracked = Object.values(entries).sort((a, b) => {
    const d = String(b.tanggal || "").localeCompare(String(a.tanggal || ""));
    if (d !== 0) return d;
    return Number(a.no) - Number(b.no);
  });
  const count = (s) => tracked.filter((e) => e.status === s).length;
  const shown = tab === "Semua" ? tracked : tracked.filter((e) => e.status === tab);

  function changeStatus(e, status) {
    save(e.no, { status, tanggal: e.tanggal, catatan: e.catatan || "" });
  }

  return (
    <div className="wrap narrow">
      <div className="page-head">
        <h1>Lamaran saya</h1>
        <p className="lede">
          Perusahaan yang kamu tandai dan lamar. Tersimpan di browser ini, dan
          di akunmu bila kamu masuk.
        </p>
      </div>

      <div className="chips scroll" role="tablist" aria-label="Saring lamaran menurut status">
        {["Semua", ...TRACKER_STATUSES].map((s) => (
          <button key={s} type="button" role="tab" aria-selected={tab === s} className="chip" onClick={() => setTab(s)}>
            {s}
            <span className="n num">{loaded ? (s === "Semua" ? tracked.length : count(s)) : 0}</span>
          </button>
        ))}
      </div>

      <section aria-label="Daftar lamaran" style={{ marginTop: 16 }}>
        {!loaded || (tracked.length > 0 && state === "loading") ? (
          <div style={{ display: "grid", gap: 12 }} aria-hidden="true">
            <div className="skeleton" style={{ height: 110 }} />
            <div className="skeleton" style={{ height: 110 }} />
          </div>
        ) : tracked.length === 0 ? (
          <div className="state">
            <strong>Belum ada lamaran yang dilacak.</strong>
            <p>Ketuk ikon bendera di baris perusahaan untuk menandainya, lalu ubah statusnya di sini.</p>
            <Link className="btn" href="/cari">
              Cari perusahaan
            </Link>
          </div>
        ) : shown.length === 0 ? (
          <div className="state">
            <strong>Tidak ada lamaran berstatus &ldquo;{tab}&rdquo;.</strong>
            <button type="button" className="btn ghost" onClick={() => setTab("Semua")}>
              Lihat semua lamaran
            </button>
          </div>
        ) : (
          <ul className="apps">
            {shown.map((e) => {
              const c = byNo.get(Number(e.no));
              return (
                <li key={e.no}>
                  <div className="app-top">
                    <span className="app-no num" aria-hidden="true">
                      {e.no}
                    </span>
                    <div className="app-title">
                      <Link href={`/perusahaan/${e.no}`}>{c ? c.perusahaan : `Perusahaan nomor ${e.no}`}</Link>
                      <span className="hint">{[c && c.kategori, e.tanggal].filter(Boolean).join(" · ")}</span>
                    </div>
                    {c && safeLink(c.link_karir) && c.status !== "Portal tidak bisa dibuka" && (
                      <a className="icon-btn" href={c.link_karir} target="_blank" rel="noopener noreferrer" aria-label={`Buka portal karir resmi: ${c.perusahaan}`}>
                        <Icon name="ext" size={20} />
                      </a>
                    )}
                  </div>
                  {e.catatan && <p className="app-note">{e.catatan}</p>}
                  {!c && state === "ok" && <p className="app-note">Perusahaan ini tidak lagi ada di data.</p>}
                  <div className="app-bottom">
                    <div className="field">
                      <label htmlFor={`st-${e.no}`}>Status</label>
                      <select id={`st-${e.no}`} value={e.status} onChange={(ev) => changeStatus(e, ev.target.value)}>
                        {TRACKER_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => {
                        remove(e.no);
                        showToast("Dihapus dari lamaran.");
                      }}
                    >
                      <Icon name="trash" size={18} />
                      Hapus
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {state === "error" && tracked.length > 0 && (
          <p className="note" style={{ marginTop: 12 }} role="alert">
            <Icon name="info" size={18} />
            <span>
              Nama perusahaan belum bisa dimuat.{" "}
              <button type="button" className="linkish" onClick={start}>
                Coba lagi
              </button>
            </span>
          </p>
        )}
      </section>
    </div>
  );
}
