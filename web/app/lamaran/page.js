"use client";

/* Halaman "Lamaran Saya": daftar perusahaan yang dilacak pengguna.
 * Data perusahaan diambil dari indeks (/api/index), data lacakannya dari
 * localStorage (lihat app/tracker.js). Bila pengguna masuk, lacakannya
 * juga tersinkron ke akun (kunci per akun; perubahan dikirim saat
 * terjadi, bukan hanya saat masuk); menghapus lamaran menghapus
 * salinan akunnya juga (lihat lib/tracker-sync.js). Status bisa
 * diganti langsung dari kartu. */
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  TRACKER_STATUSES,
  syncStatusMessage,
  useTracker,
} from "@/app/tracker";
import { rovingIndex } from "@/lib/a11y";
import { useCompanyIndex } from "@/app/company-index";
import { Icon, Reveal, showToast } from "@/app/visual";
import { CompanyLogo } from "@/lib/logos";
import { safeLink } from "@/app/components";

/* Format waktu sinkron terakhir untuk label jujur (AKUN-02),
 * mis. "15 Nov, 00.26". Gagal format: kembalikan string kosong
 * (label tidak ditampilkan). */
function formatSyncTime(iso) {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function Lamaran() {
  const {
    entries,
    loaded,
    syncState,
    syncError,
    lastSyncedAt,
    guestCount,
    save,
    remove,
    retrySync,
    mergeGuest,
  } = useTracker();
  const { index, state, start } = useCompanyIndex({ eager: true });
  const [tab, setTab] = useState("Semua");
  const [guestDismissed, setGuestDismissed] = useState(false);

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

  /* UX-15: navigasi panah di tablist (pola ARIA tab lengkap: panah
   * memindah pilihan + fokus, roving tabindex, tabpanel di bawah). */
  const tablistRef = useRef(null);
  const tabs = ["Semua", ...TRACKER_STATUSES];
  function onTabKeyDown(e) {
    const next = rovingIndex(tabs.indexOf(tab), tabs.length, e.key);
    if (next === null) return;
    e.preventDefault();
    setTab(tabs[next]);
    tablistRef.current?.querySelectorAll('[role="tab"]')[next]?.focus();
  }

  function changeStatus(e, status) {
    save(e.no, { status, tanggal: e.tanggal, catatan: e.catatan || "" });
    /* AKSES-05: ganti status diumumkan lewat toast (pola yang sama
     * dengan halaman detail) — sebelumnya menyimpan diam-diam. */
    const c = byNo.get(Number(e.no));
    showToast(
      c
        ? `Status ${c.perusahaan} diubah menjadi ${status}.`
        : `Status lamaran diubah menjadi ${status}.`,
    );
  }

  /* Hapus lamaran: remove() di app/tracker.js sudah mengurus
   * penghapusan dari akun (penanda hapus + deleteTracker) bila
   * sedang masuk; halaman ini cukup menampilkan toast. */
  function handleDelete(no) {
    remove(no);
    showToast("Dihapus dari lamaran.");
  }

  /* Sinkron manual (LAM-04): tombol di spanduk status. */
  async function handleRetry() {
    const res = await retrySync();
    showToast(
      res && res.ok
        ? "Lamaran sudah sinkron dengan akun."
        : "Belum bisa sinkron. Coba lagi nanti.",
    );
  }

  /* Gabungkan lamaran tamu ke akun (AKUN-06), atas pilihan
   * pengguna. Bila gagal, data tamu tetap utuh. */
  async function handleMergeGuest() {
    const res = await mergeGuest();
    showToast(
      res && res.ok
        ? "Lamaran digabungkan ke akun."
        : "Gabungkan gagal. Coba lagi nanti.",
    );
  }

  const lastSynced = lastSyncedAt ? formatSyncTime(lastSyncedAt) : "";

  return (
    /* AKSES-12: seluruh halaman ini teks Indonesia kode-keras. */
    <div className="wrap" lang="id">
      <div className="page-head">
        <h1>Lamaran Saya</h1>
        <p className="lede">
          Perusahaan yang kamu tandai dan lamar.{" "}
          {syncState !== "tamu"
            ? "Tersimpan di perangkat ini dan di akun kamu."
            : "Tersimpan di perangkat ini saja. Masuk dari menu untuk menyimpan ke akun juga."}
        </p>
      </div>
      {/* AKSES-02: pesan jujur tanpa JavaScript — halaman ini membaca
        * data dari browser, jadi tidak bisa di-render server. */}
      <noscript>
        <p className="note-line">
          <Icon name="info" size={16} />
          Halaman ini butuh JavaScript untuk menampilkan lamaranmu.
          Aktifkan JavaScript, lalu muat ulang halaman ini.
        </p>
      </noscript>

      {syncState === "tertunda" && (
        <p className="note-line">
          <Icon name="info" size={16} />
          {syncStatusMessage(syncState, syncError)}{" "}
          <button type="button" className="linkish" onClick={handleRetry}>
            Sinkronkan lagi
          </button>
        </p>
      )}
      {syncState === "mengirim" && (
        <p className="note-line">
          <Icon name="info" size={16} />
          {syncStatusMessage(syncState, syncError)}
        </p>
      )}
      {syncState === "sinkron" && lastSynced && (
        <p className="note-line">
          <Icon name="info" size={16} />
          Terakhir disinkronkan {lastSynced}.
        </p>
      )}
      {syncState !== "tamu" && guestCount > 0 && !guestDismissed && (
        <p className="note-line">
          <Icon name="info" size={16} />
          Perangkat ini punya {guestCount} lamaran yang belum masuk akun.{" "}
          <button type="button" className="linkish" onClick={handleMergeGuest}>
            Gabungkan ke akun
          </button>{" "}
          atau{" "}
          <button
            type="button"
            className="linkish"
            onClick={() => setGuestDismissed(true)}
          >
            biarkan saja
          </button>
        </p>
      )}

      <Reveal>
        <div
          className="tabs-scroll"
          role="tablist"
          aria-label="Saring lamaran"
          ref={tablistRef}
          onKeyDown={onTabKeyDown}
        >
          {/* id tab memakai indeks, bukan nama status — nama seperti
            * "Sudah dilamar" mengandung spasi dan tidak sah sebagai id. */}
          {tabs.map((s, i) => (
            <button
              key={s}
              type="button"
              role="tab"
              id={`lamaran-tab-${i}`}
              aria-selected={tab === s}
              aria-controls="lamaran-panel"
              tabIndex={tab === s ? 0 : -1}
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

      <section
        role="tabpanel"
        id="lamaran-panel"
        aria-labelledby={`lamaran-tab-${tabs.indexOf(tab)}`}
        style={{ marginTop: 20 }}
      >
        {!loaded || (tracked.length > 0 && state === "loading") ? (
          <>
            {/* AKSES-16: status muat diumumkan; skeleton-nya sendiri
              * tetap aria-hidden karena hanya hiasan. */}
            <p className="sr-only" role="status">Memuat lamaran…</p>
            <div className="co-list" aria-hidden="true">
              <div className="skeleton" style={{ height: 112 }} />
              <div className="skeleton" style={{ height: 112 }} />
            </div>
          </>
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
                        aria-label={`Buka portal karir ${c.perusahaan} (membuka tab baru)`}
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
