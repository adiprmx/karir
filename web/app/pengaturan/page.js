"use client";

/* Pengaturan Karir: lihat dan hapus data lokal yang tersimpan di browser.
 * Tidak ada akun, tidak ada server. Tiga kunci localStorage:
 * "karir-onboarding" (pilihan domisili dan posisi),
 * "karir-lamaran" (lamaran yang dilacak),
 * "karir-recent-search" (pencarian terakhir). */
import Link from "next/link";
import { useEffect, useState } from "react";
import { clearOnboarding, useOnboarding } from "@/app/onboarding";
import { TRACKER_KEY, useTracker } from "@/app/tracker";
import { clearRecentSearch, loadRecentSearch } from "@/app/recent";

/* tracker.js tidak punya fungsi hapus semua, jadi tulis di sini:
 * tulis objek kosong ke kunci tracker lalu kirim eventnya. */
function clearAllTracked() {
  try {
    window.localStorage.setItem(TRACKER_KEY, JSON.stringify({}));
  } catch {
    return;
  }
  window.dispatchEvent(new Event("karir-tracker-change"));
}

export default function Pengaturan() {
  const {
    data: onboarding,
    loaded: onboardingLoaded,
    clear: clearChoices,
  } = useOnboarding();
  const { entries, loaded: trackerLoaded } = useTracker();
  const [recent, setRecent] = useState(null);
  const [recentReady, setRecentReady] = useState(false);

  useEffect(() => {
    setRecent(loadRecentSearch());
    setRecentReady(true);
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

  function wipeAll() {
    if (
      !window.confirm("Hapus semua data yang tersimpan di browser ini?")
    ) {
      return;
    }
    clearOnboarding();
    clearAllTracked();
    clearRecentSearch();
  }

  const recentParts = recent
    ? [recent.domisili, recent.posisi].filter((v) => v)
    : [];
  const recentHref = recent
    ? `/cari?${new URLSearchParams(
        Object.fromEntries(
          Object.entries({
            domisili: recent.domisili,
            posisi: recent.posisi,
          }).filter(([, v]) => v),
        ),
      ).toString()}`
    : "/cari";

  return (
    <div className="wrap">
      <section
        className="dash-section anim-fade-up"
        aria-label="Pengaturan"
      >
        <h1>Pengaturan</h1>
        <p className="lede">
          Yang tersimpan di browser ini, dan cara menghapusnya.
        </p>

        {!loaded ? (
          <div className="live-loading">
            <span className="shimmer" />
            <span className="shimmer" />
          </div>
        ) : (
          <>
            <div style={{ marginTop: 32 }}>
              <p className="section-label">Pilihanmu</p>
              {onboarding ? (
                <>
                  <p>Domisili: {onboarding.domisili}</p>
                  <p>Posisi: {onboarding.posisi}</p>
                  <p style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={clearChoices}
                    >
                      Hapus pilihanku
                    </button>
                  </p>
                </>
              ) : (
                <p>Belum ada pilihan tersimpan.</p>
              )}
            </div>

            <div style={{ marginTop: 32 }}>
              <p className="section-label">Lamaran yang dilacak</p>
              {trackedCount === 0 ? (
                <p>Belum ada lamaran yang dilacak.</p>
              ) : (
                <>
                  <p>
                    {trackedCount} lamaran dilacak.
                  </p>
                  <p style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={clearAllTracked}
                    >
                      Hapus semua lamaran
                    </button>
                  </p>
                </>
              )}
            </div>

            <div style={{ marginTop: 32 }}>
              <p className="section-label">Pencarian terakhir</p>
              {recent && recentParts.length > 0 ? (
                <>
                  <p>
                    Terakhir kamu cari:{" "}
                    <Link href={recentHref}>{recentParts.join(" + ")}</Link>
                  </p>
                  <p style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={clearRecentSearch}
                    >
                      Hapus pencarian terakhir
                    </button>
                  </p>
                </>
              ) : (
                <p>Belum ada pencarian tersimpan.</p>
              )}
            </div>

            <div style={{ marginTop: 32 }}>
              <p className="section-label">Hapus semua data</p>
              <p>
                <button type="button" className="btn" onClick={wipeAll}>
                  Hapus semua dataku
                </button>
              </p>
              <p className="fresh-note" style={{ marginTop: 16 }}>
                Semua data di atas hanya ada di browser ini. Menghapusnya
                tidak bisa dibatalkan.
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
