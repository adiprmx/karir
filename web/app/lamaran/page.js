"use client";

/* Halaman "Lamaran Saya": daftar perusahaan yang dilacak pengguna.
 * Data perusahaan diambil dari indeks (/api/index), data lacakannya dari
 * localStorage (lihat app/tracker.js). Bila pengguna masuk, lacakannya
 * juga tersinkron ke akun (kunci per akun; perubahan dikirim saat
 * terjadi, bukan hanya saat masuk); menghapus lamaran menghapus
 * salinan akunnya juga (lihat lib/tracker-sync.js). Status bisa
 * diganti langsung dari kartu. */
import { Suspense, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  TRACKER_STATUSES,
  syncStatusMessage,
  useTracker,
} from "@/app/tracker";
import { rovingIndex } from "@/lib/a11y";
import { useCompanyIndex } from "@/app/company-index";
import { ConfirmDialog, Icon, Reveal, showToast } from "@/app/visual";
import { CompanyLogo } from "@/lib/logos";
import { safeLink } from "@/app/components";
import { useLabels, useLocale } from "@/app/labels-provider";

/* Label halaman (W2a, UX-08): diteruskan layout rute lewat konteks;
 * nilai di bawah adalah cadangan Bahasa Indonesia bila halaman
 * dipakai di luar provider. */
const DEFAULT_LABELS = {
  title: "Lamaran Saya",
  lede: "Perusahaan yang kamu tandai dan lamar.",
  ledeAccount: "Tersimpan di perangkat ini dan di akun kamu.",
  ledeGuest:
    "Tersimpan di perangkat ini saja. Masuk dari menu untuk menyimpan ke akun juga.",
  loading: "Memuat lamaran…",
  retrySync: "Sinkronkan lagi",
  lastSynced: "Terakhir disinkronkan {time}.",
  guestBanner: "Perangkat ini punya {n} lamaran yang belum masuk akun.",
  mergeGuest: "Gabungkan ke akun",
  or: "atau",
  leaveAlone: "biarkan saja",
  filterLabel: "Saring lamaran",
  emptyTitle: "Belum ada lamaran yang dilacak.",
  emptyHint:
    "Ketuk ikon tanda di kartu perusahaan, atau cari dulu perusahaan yang mau dilamar.",
  searchCompanies: "Cari perusahaan",
  noStatus: "Tidak ada lamaran berstatus “{status}”.",
  viewAll: "Lihat semua",
  companyNo: "Perusahaan No. {n}",
  openPortal: "Buka portal karir {name} (membuka tab baru)",
  notInData: "Perusahaan ini tidak lagi ada di data.",
  statusLabel: "Status",
  namesFailed: "Nama perusahaan belum bisa dimuat.",
  retry: "Coba lagi",
  statusChanged: "Status {name} diubah menjadi {status}.",
  statusChangedUnknown: "Status lamaran diubah menjadi {status}.",
  syncOk: "Lamaran sudah sinkron dengan akun.",
  syncFail: "Belum bisa sinkron. Coba lagi nanti.",
  mergeOk: "Lamaran digabungkan ke akun.",
  mergeFail: "Gabungkan gagal. Coba lagi nanti.",
  deleted: "Dihapus dari lamaran.",
  deleteTitle: "Hapus lamaran ini?",
  deleteMessage: "Lamaran ke {name} akan dihapus dari daftar.",
  deleteConfirm: "Ya, hapus",
  cancel: "Batal",
  close: "Tutup",
  delete: "Hapus",
  all: "Semua",
  sync: {
    saved: "Tersimpan di browser ini dan di akun.",
    sending: "Mengirim ke akun...",
    pending: "Ada perubahan yang belum terkirim ke akun.",
    offline:
      "Tidak ada internet. Perubahan tersimpan di perangkat ini dan akan dikirim saat tersambung lagi.",
    busy: "Server sedang sibuk. Perubahan tersimpan di perangkat ini dan akan dikirim nanti.",
    session:
      "Sesi akun berakhir. Masuk lagi supaya lamaran tersimpan ke akun.",
    denied:
      "Akun tidak diizinkan menyimpan. Perubahan tersimpan di perangkat ini.",
    failed: "Sinkron ke akun gagal. Perubahan tersimpan di perangkat ini.",
    guest:
      "Tersimpan di browser ini saja. Masuk dari menu untuk menyimpan ke akun juga.",
  },
};

/* Format waktu sinkron terakhir untuk label jujur (AKUN-02),
 * mis. "15 Nov, 00.26". Gagal format: kembalikan string kosong
 * (label tidak ditampilkan). */
function formatSyncTime(iso, locale) {
  try {
    return new Date(iso).toLocaleString(
      locale === "en" ? "en-GB" : "id-ID",
      {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      },
    );
  } catch {
    return "";
  }
}

export default function Lamaran() {
  const labels = useLabels(DEFAULT_LABELS);
  /* DASH-05: useSearchParams wajib di dalam Suspense supaya
   * prerender tidak gagal (Next). Fallback-nya kerangka halaman
   * yang sama seperti saat lamaran dimuat. */
  return (
    <Suspense
      fallback={
        <div className="wrap">
          <div className="page-head">
            <h1>{labels.title}</h1>
          </div>
          <p className="sr-only" role="status">
            {labels.loading}
          </p>
          <div className="co-list" aria-hidden="true">
            <div className="skeleton" style={{ height: 112 }} />
            <div className="skeleton" style={{ height: 112 }} />
          </div>
        </div>
      }
    >
      <LamaranContent />
    </Suspense>
  );
}

function LamaranContent() {
  const labels = useLabels(DEFAULT_LABELS);
  const locale = useLocale();
  const searchParams = useSearchParams();
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
  /* DASH-05: tab awal dari ?status= (ditaut ubin Dasbor). Nilai di
   * luar kosakata status jatuh ke "Semua". */
  const [tab, setTab] = useState(() => {
    const s = searchParams.get("status");
    return TRACKER_STATUSES.includes(s) ? s : "Semua";
  });
  const [guestDismissed, setGuestDismissed] = useState(false);
  /* LAM-07: entri yang menunggu konfirmasi hapus (null = tidak ada
   * dialog). Dialog konfirmasi dipakai sebagai pengganti tombol
   * urungkan di toast: toast yang ada hanya mendukung tautan,
   * bukan aksi. */
  const [pendingDelete, setPendingDelete] = useState(null);

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
        ? labels.statusChanged
            .replace("{name}", c.perusahaan)
            .replace("{status}", status)
        : labels.statusChangedUnknown.replace("{status}", status),
    );
  }

  /* Hapus lamaran: remove() di app/tracker.js sudah mengurus
   * penghapusan dari akun (penanda hapus + deleteTracker) bila
   * sedang masuk; halaman ini cukup menampilkan toast. Penghapusan
   * hanya jalan setelah dialog konfirmasi (LAM-07). */
  function handleDelete(no) {
    setPendingDelete(null);
    remove(no);
    showToast(labels.deleted);
  }

  /* Sinkron manual (LAM-04): tombol di spanduk status. */
  async function handleRetry() {
    const res = await retrySync();
    showToast(res && res.ok ? labels.syncOk : labels.syncFail);
  }

  /* Gabungkan lamaran tamu ke akun (AKUN-06), atas pilihan
   * pengguna. Bila gagal, data tamu tetap utuh. */
  async function handleMergeGuest() {
    const res = await mergeGuest();
    showToast(res && res.ok ? labels.mergeOk : labels.mergeFail);
  }

  const lastSynced = lastSyncedAt
    ? formatSyncTime(lastSyncedAt, locale)
    : "";

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>{labels.title}</h1>
        <p className="lede">
          {labels.lede}{" "}
          {syncState !== "tamu" ? labels.ledeAccount : labels.ledeGuest}
        </p>
      </div>
      {/* AKSES-02: pesan jujur tanpa JavaScript — halaman ini membaca
        * data dari browser, jadi tidak bisa di-render server. Teks di
        * dalam noscript sengaja tetap Indonesia: tanpa JavaScript
        * konteks bahasa tidak bisa dibaca (W2a). */}
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
          {syncStatusMessage(syncState, syncError, labels.sync)}{" "}
          <button type="button" className="linkish" onClick={handleRetry}>
            {labels.retrySync}
          </button>
        </p>
      )}
      {syncState === "mengirim" && (
        <p className="note-line">
          <Icon name="info" size={16} />
          {syncStatusMessage(syncState, syncError, labels.sync)}
        </p>
      )}
      {syncState === "sinkron" && lastSynced && (
        <p className="note-line">
          <Icon name="info" size={16} />
          {labels.lastSynced.replace("{time}", lastSynced)}
        </p>
      )}
      {syncState !== "tamu" && guestCount > 0 && !guestDismissed && (
        <p className="note-line">
          <Icon name="info" size={16} />
          {labels.guestBanner.replace("{n}", String(guestCount))}{" "}
          <button type="button" className="linkish" onClick={handleMergeGuest}>
            {labels.mergeGuest}
          </button>{" "}
          {labels.or}{" "}
          <button
            type="button"
            className="linkish"
            onClick={() => setGuestDismissed(true)}
          >
            {labels.leaveAlone}
          </button>
        </p>
      )}

      <Reveal>
        <div
          className="tabs-scroll"
          role="tablist"
          aria-label={labels.filterLabel}
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
              {s === "Semua" ? labels.all : s}
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
            <p className="sr-only" role="status">{labels.loading}</p>
            <div className="co-list" aria-hidden="true">
              <div className="skeleton" style={{ height: 112 }} />
              <div className="skeleton" style={{ height: 112 }} />
            </div>
          </>
        ) : tracked.length === 0 ? (
          <div className="state">
            <strong>{labels.emptyTitle}</strong>
            <p>{labels.emptyHint}</p>
            <Link className="btn" href="/cari">
              {labels.searchCompanies}
              <Icon name="arrow" size={18} />
            </Link>
          </div>
        ) : shown.length === 0 ? (
          <div className="state">
            <strong>{labels.noStatus.replace("{status}", tab)}</strong>
            <button type="button" className="btn ghost" onClick={() => setTab("Semua")}>
              {labels.viewAll}
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
                        {c
                          ? c.perusahaan
                          : labels.companyNo.replace("{n}", String(e.no))}
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
                        aria-label={labels.openPortal.replace(
                          "{name}",
                          c.perusahaan,
                        )}
                      >
                        <Icon name="ext" size={18} />
                      </a>
                    )}
                  </div>
                  {e.catatan && <p className="app-note">{e.catatan}</p>}
                  {!c && state === "ok" && (
                    <p className="app-note">{labels.notInData}</p>
                  )}
                  <div className="app-bottom">
                    <div className="field slim">
                      <label htmlFor={`st-${e.no}`}>{labels.statusLabel}</label>
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
                      onClick={() => setPendingDelete(e)}
                    >
                      <Icon name="trash" size={16} />
                      {labels.delete}
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
            {labels.namesFailed}{" "}
            <button type="button" className="linkish" onClick={start}>
              {labels.retry}
            </button>
          </p>
        )}
        <ConfirmDialog
          open={pendingDelete !== null}
          title={labels.deleteTitle}
          message={
            pendingDelete
              ? labels.deleteMessage.replace(
                  "{name}",
                  byNo.get(Number(pendingDelete.no))?.perusahaan ||
                    labels.companyNo.replace("{n}", String(pendingDelete.no)),
                )
              : ""
          }
          confirmLabel={labels.deleteConfirm}
          cancelLabel={labels.cancel}
          closeLabel={labels.close}
          onConfirm={() => pendingDelete && handleDelete(pendingDelete.no)}
          onCancel={() => setPendingDelete(null)}
        />
      </section>
    </div>
  );
}
