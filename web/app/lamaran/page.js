"use client";

/* Halaman "Lamaran Saya": daftar perusahaan yang dilacak pengguna.
 * Data perusahaan diambil dari API, data lacakannya dari localStorage
 * (lihat app/tracker.js). Tidak ada akun, tidak ada data yang dikirim
 * ke server. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { TRACKER_STATUSES, useTracker } from "@/app/tracker";
import { CountUp, Reveal } from "@/app/visual";

const STATUS_BADGE = {
  Dipanggil: "badge ok",
  Ditolak: "badge warn",
};

export default function Lamaran() {
  const { entries, loaded, remove } = useTracker();
  const [companies, setCompanies] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 10000);
    async function load() {
      try {
        // API membatasi limit 400 per panggilan, total perusahaan 406:
        // dua panggilan paralel supaya tidak ada yang terlewat.
        const [a, b] = await Promise.all([
          fetch("/api/companies?limit=400&offset=0", {
            signal: ctrl.signal,
          }).then((r) => {
            if (!r.ok) throw new Error("gagal");
            return r.json();
          }),
          fetch("/api/companies?limit=400&offset=400", {
            signal: ctrl.signal,
          }).then((r) => {
            if (!r.ok) throw new Error("gagal");
            return r.json();
          }),
        ]);
        if (cancelled) return;
        const map = new Map();
        for (const e of [...(a.results || []), ...(b.results || [])]) {
          map.set(e.company.no, e.company);
        }
        setCompanies(map);
        setLoadState("ok");
      } catch {
        if (!cancelled) setLoadState("error");
      } finally {
        window.clearTimeout(timer);
      }
    }
    load();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [attempt]);

  const tracked = Object.values(entries).sort((a, b) => {
    const d = String(b.tanggal || "").localeCompare(String(a.tanggal || ""));
    if (d !== 0) return d;
    return String(a.no).localeCompare(String(b.no));
  });
  const countByStatus = (s) =>
    tracked.filter((e) => e.status === s).length;

  return (
    <div className="wrap">
      <Reveal>
      <div className="page-head">
        <h1>Lamaran Saya</h1>
        <p className="lede">
          Perusahaan yang kamu tandai dan lamar. Semua tersimpan di browser
          ini saja.
        </p>
      </div>
      </Reveal>

      <Reveal delay={80}>
      <section className="dash-section" aria-label="Ringkasan">
        <div className="stat-stack">
          <div className="stat-row">
            <span className="stat-num num">
              <CountUp value={loaded ? tracked.length : 0} />
            </span>
            <span className="stat-label">Total dilacak</span>
          </div>
          {TRACKER_STATUSES.map((s) => (
            <div className="stat-row" key={s}>
              <span
                className={
                  s === "Dipanggil"
                    ? "stat-num ok num"
                    : s === "Ditolak"
                      ? "stat-num warn num"
                      : "stat-num num"
                }
              >
                <CountUp value={loaded ? countByStatus(s) : 0} />
              </span>
              <span className="stat-label">{s}</span>
            </div>
          ))}
        </div>
      </section>
      </Reveal>

      <Reveal delay={120}>
      <section aria-label="Daftar lamaran">
        {!loaded || loadState === "loading" ? (
          <div className="live-loading">
            <span className="shimmer" />
            <span className="shimmer" />
            <span className="shimmer" />
          </div>
        ) : loadState === "error" ? (
          <div className="state">
            <strong>Data perusahaan tidak bisa dimuat.</strong>
            <p>Periksa koneksimu, lalu coba lagi.</p>
            <p style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setLoadState("loading");
                  setAttempt((n) => n + 1);
                }}
              >
                Coba lagi
              </button>
            </p>
          </div>
        ) : tracked.length === 0 ? (
          <div className="state">
            <strong>Belum ada lamaran yang dilacak.</strong>
            <p>
              Tandai perusahaan dari halaman detailnya, atau cari dulu
              perusahaan yang mau dilamar.
            </p>
            <p style={{ marginTop: 16 }}>
              <Link className="btn" href="/cari">
                Cari perusahaan
              </Link>
            </p>
          </div>
        ) : (
          <ul className="recheck-list">
            {tracked.map((e) => {
              const c = companies ? companies.get(Number(e.no)) : null;
              const name = c ? c.perusahaan : `Perusahaan No. ${e.no}`;
              const meta = c
                ? [c.kategori, e.tanggal].filter(Boolean).join(" · ")
                : e.tanggal || "";
              return (
                <li
                  key={e.no}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <Link
                        href={`/perusahaan/${e.no}`}
                        style={{ overflowWrap: "anywhere" }}
                      >
                        {name}
                      </Link>
                      <span className={STATUS_BADGE[e.status] || "badge"}>
                        {e.status}
                      </span>
                    </span>
                    {meta && <span className="cell-sub">{meta}</span>}
                    {e.catatan && (
                      <span className="cell-sub">{e.catatan}</span>
                    )}
                    {!c && (
                      <span className="cell-sub">
                        Perusahaan ini tidak lagi ada di data.
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ padding: "8px 14px", flexShrink: 0 }}
                    onClick={() => remove(e.no)}
                  >
                    Hapus
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </Reveal>
    </div>
  );
}
