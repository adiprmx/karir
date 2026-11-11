"use client";

/* Pengaturan: lihat dan hapus data lokal di browser. Tiga kunci
 * localStorage: "karir-onboarding" (kota dan posisi), "karir-lamaran"
 * (lamaran yang dilacak), "karir-recent-search" (pencarian terakhir).
 * Menghapus lamaran di sini tidak menghapus salinan di akun. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { clearOnboarding, useOnboarding } from "@/app/onboarding";
import { TRACKER_KEY, useTracker } from "@/app/tracker";
import { clearRecentSearch, loadRecentSearch } from "@/app/recent";
import { Icon, showToast } from "@/app/visual";

function clearAllTracked() {
  try {
    window.localStorage.setItem(TRACKER_KEY, JSON.stringify({}));
  } catch {
    return;
  }
  window.dispatchEvent(new Event("karir-tracker-change"));
}

function Row({ title, children, action }) {
  return (
    <div className="set-row">
      <div>
        <p className="lbl">{title}</p>
        {children}
      </div>
      {action}
    </div>
  );
}

export default function Pengaturan() {
  const { data: onboarding, loaded: onboardingLoaded, clear: clearChoices } = useOnboarding();
  const { entries, loaded: trackerLoaded } = useTracker();
  const [recent, setRecent] = useState(null);
  const [recentReady, setRecentReady] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setRecent(loadRecentSearch());
      setRecentReady(true);
    });
    const onChange = () => setRecent(loadRecentSearch());
    window.addEventListener("karir-recent-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("karir-recent-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const trackedCount = Object.keys(entries || {}).length;
  const loaded = onboardingLoaded && trackerLoaded && recentReady;
  const recentParts = recent ? [recent.domisili, recent.posisi].filter(Boolean) : [];
  const recentHref = recent
    ? `/cari?${new URLSearchParams(
        Object.fromEntries(Object.entries({ domisili: recent.domisili, posisi: recent.posisi }).filter(([, v]) => v)),
      ).toString()}`
    : "/cari";

  function wipeAll() {
    clearOnboarding();
    clearAllTracked();
    clearRecentSearch();
    setConfirmAll(false);
    showToast("Semua data di browser ini dihapus.");
  }

  return (
    <div className="wrap narrow">
      <div className="page-head">
        <h1>Pengaturan</h1>
        <p className="lede">Yang tersimpan di browser ini, dan cara menghapusnya.</p>
      </div>

      {!loaded ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : (
        <section className="panel" aria-label="Data di browser">
          <Row
            title="Pilihanmu (kota dan posisi)"
            action={
              onboarding && (
                <button type="button" className="btn ghost small" onClick={clearChoices}>
                  <Icon name="trash" size={18} />
                  Hapus
                </button>
              )
            }
          >
            {onboarding ? (
              <p>
                {onboarding.domisili} · {onboarding.posisi}
              </p>
            ) : (
              <p className="hint">Belum ada pilihan tersimpan.</p>
            )}
          </Row>
          <Row
            title="Lamaran yang dilacak"
            action={
              trackedCount > 0 && (
                <button type="button" className="btn ghost small" onClick={clearAllTracked}>
                  <Icon name="trash" size={18} />
                  Hapus semua
                </button>
              )
            }
          >
            {trackedCount === 0 ? <p className="hint">Belum ada lamaran yang dilacak.</p> : <p>{trackedCount} lamaran dilacak.</p>}
          </Row>
          <Row
            title="Pencarian terakhir"
            action={
              recent &&
              recentParts.length > 0 && (
                <button type="button" className="btn ghost small" onClick={clearRecentSearch}>
                  <Icon name="trash" size={18} />
                  Hapus
                </button>
              )
            }
          >
            {recent && recentParts.length > 0 ? (
              <p>
                <Link href={recentHref}>{recentParts.join(" + ")}</Link>
              </p>
            ) : (
              <p className="hint">Belum ada pencarian tersimpan.</p>
            )}
          </Row>
        </section>
      )}

      <section className="panel" style={{ marginTop: 16 }} aria-label="Hapus semua data">
        <h2 className="panel-title">Hapus semua data di browser ini</h2>
        <p className="hint">
          Menghapus tidak bisa dibatalkan. Kalau kamu masuk akun, salinan
          lamaran di akun tidak ikut terhapus dan akan kembali saat kamu masuk lagi.
        </p>
        {confirmAll ? (
          <div className="actions">
            <button type="button" className="btn" onClick={wipeAll}>
              Ya, hapus semuanya
            </button>
            <button type="button" className="btn ghost" onClick={() => setConfirmAll(false)}>
              Batal
            </button>
          </div>
        ) : (
          <button type="button" className="btn ghost" onClick={() => setConfirmAll(true)}>
            Hapus semua dataku
          </button>
        )}
      </section>
    </div>
  );
}
