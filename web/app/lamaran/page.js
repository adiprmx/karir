"use client";

/* Halaman "Lamaran Saya": daftar perusahaan yang dilacak pengguna.
 * Data perusahaan diambil dari indeks (/api/index), data lacakannya dari
 * localStorage (lihat app/tracker.js). Bila pengguna masuk, lacakannya
 * juga tersinkron ke akun; menghapus lamaran menghapus salinan akunnya
 * juga (lihat lib/tracker-sync.js). Status bisa diganti langsung dari
 * kartu. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { TRACKER_STATUSES, useTracker } from "@/app/tracker";
import { useCompanyIndex } from "@/app/company-index";
import { Icon, Reveal, showToast } from "@/app/visual";
import { CompanyLogo } from "@/lib/logos";
import {
  deleteTracker,
  pruneTombstones,
  readTombstones,
  recordTombstone,
  writeTombstones,
} from "@/lib/tracker-sync";
import { safeLink } from "@/app/components";

export default function Lamaran() {
  const { entries, loaded, synced, save, remove } = useTracker();
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

  /* Hapus lamaran dari akun bila sedang masuk. Berjalan di latar
   * belakang; bila gagal (mis. offline), tombstone yang sudah
   * dicatat menjamin sinkron berikutnya menghapusnya. */
  async function deleteFromAccount(no) {
    try {
      const { auth } = await import("@/lib/firebase");
      const uid = auth && auth.currentUser ? auth.currentUser.uid : null;
      if (!uid) return;
      const res = await deleteTracker(uid, no);
      if (res && res.ok) {
        writeTombstones(pruneTombstones(readTombstones(), [String(no)]));
      }
    } catch {
      /* Tombstone menjamin sinkron berikutnya menghapusnya. */
    }
  }

  function handleDelete(no) {
    remove(no);
    recordTombstone(no);
    showToast("Dihapus dari lamaran.");
    deleteFromAccount(no);
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Lamaran Saya</h1>
        <p className="lede">
          Perusahaan yang kamu tandai dan lamar.{" "}
          {synced
            ? "Tersimpan di perangkat ini dan di akun kamu."
            : "Tersimpan di perangkat ini saja. Masuk dari menu untuk menyimpan ke akun juga."}
        </p>
      </div>

      <Reveal>
        <div className="tabs-scroll" role="tablist" aria-label="Saring lamaran">
          {["Semua", ...TRACKER_STATUSES].map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={tab === s}
              className="tab-pill"
              onClick={() => setTab(s)}
            >
              {s}
              <span className="chip-count num">
                {loaded ? (s === "Semua" ? tracked.length : count(s)) : 0}
              </span>
            </button>
          ))}
        </div>
      </Reveal>

      <section aria-label="Daftar lamaran" style={{ marginTop: 20 }}>
        {!loaded || (tracked.length > 0 && state === "loading") ? (
          <div className="co-list" aria-hidden="true">
            <div className="skeleton" style={{ height: 112 }} />
            <div className="skeleton" style={{ height: 112 }} />
          </div>
        ) : tracked.length === 0 ? (
          <div className="state">
            <strong>Belum ada lamaran yang dilacak.</strong>
            <p>
              Ketuk ikon tanda di kartu perusahaan, atau cari dulu perusahaan
              yang mau dilamar.
            </p>
            <Link className="btn" href="/cari">
              Cari perusahaan
              <Icon name="arrow" size={18} />
            </Link>
          </div>
        ) : shown.length === 0 ? (
          <div className="state">
            <strong>Tidak ada lamaran berstatus “{tab}”.</strong>
            <button type="button" className="btn ghost" onClick={() => setTab("Semua")}>
              Lihat semua
            </button>
          </div>
        ) : (
          <ul className="apps">
            {shown.map((e, i) => {
              const c = byNo.get(Number(e.no));
              return (
                <li className="app-card" key={e.no} style={{ "--i": Math.min(i, 8) }}>
                  <div className="app-top">
                    {c ? (
                      <CompanyLogo linkKarir={c.link_karir} name={c.perusahaan} size={44} />
                    ) : (
                      <span className="logo" style={{ width: 44, height: 44 }} />
                    )}
                    <div className="app-title">
                      <Link href={`/perusahaan/${e.no}`}>
                        {c ? c.perusahaan : `Perusahaan No. ${e.no}`}
                      </Link>
                      <span className="co-cat">
                        {[c && c.kategori, e.tanggal].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    {c && safeLink(c.link_karir) && c.status !== "Portal tidak bisa dibuka" && (
                      <a
                        className="icon-btn"
                        href={c.link_karir}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Buka portal karir ${c.perusahaan}`}
                      >
                        <Icon name="ext" size={18} />
                      </a>
                    )}
                  </div>
                  {e.catatan && <p className="app-note">{e.catatan}</p>}
                  {!c && state === "ok" && (
                    <p className="app-note">Perusahaan ini tidak lagi ada di data.</p>
                  )}
                  <div className="app-bottom">
                    <div className="field slim">
                      <label htmlFor={`st-${e.no}`}>Status</label>
                      <select
                        id={`st-${e.no}`}
                        value={e.status}
                        onChange={(ev) => changeStatus(e, ev.target.value)}
                      >
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
                      onClick={() => handleDelete(e.no)}
                    >
                      <Icon name="trash" size={16} />
                      Hapus
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {state === "error" && tracked.length > 0 && (
          <p className="note-line">
            <Icon name="info" size={16} />
            Nama perusahaan belum bisa dimuat.{" "}
            <button type="button" className="linkish" onClick={start}>
              Coba lagi
            </button>
          </p>
        )}
      </section>
    </div>
  );
}
