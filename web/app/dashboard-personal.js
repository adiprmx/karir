"use client";

/* Dasbor pribadi Karir: sapaan, langkah berikutnya, dan ringkasan
 * lamaran. Semua data lokal (localStorage), tanpa akun, tanpa server:
 * pilihan dibaca dari "karir-onboarding" ({domisili, posisi, selesai})
 * dan lamaran dari "karir-lamaran" lewat useTracker(). */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTracker, TRACKER_STATUSES } from "@/app/tracker";
import { CountUp } from "@/app/visual";

const ONBOARDING_KEY = "karir-onboarding";

function readOnboarding() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const domisili =
      typeof parsed.domisili === "string" ? parsed.domisili.trim() : "";
    const posisi =
      typeof parsed.posisi === "string" ? parsed.posisi.trim() : "";
    if (!parsed.selesai || !domisili || !posisi) return null;
    return { domisili, posisi };
  } catch {
    return null;
  }
}

export default function DashboardPersonal() {
  const { entries, loaded } = useTracker();
  const [onboarding, setOnboarding] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOnboarding(readOnboarding());
    setReady(true);
    const onChange = () => setOnboarding(readOnboarding());
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);

  const counts = {};
  for (const s of TRACKER_STATUSES) counts[s] = 0;
  let total = 0;
  for (const e of Object.values(entries || {})) {
    total += 1;
    if (e && counts[e.status] !== undefined) counts[e.status] += 1;
  }

  const steps = [
    {
      text: "Tentukan domisili dan posisi",
      done: onboarding !== null,
      href: "/mulai",
    },
    {
      text: "Tandai lamaran pertama",
      done: total > 0,
      href: "/cari",
    },
    {
      text: "Periksa portal resmi sebelum melamar",
      done: false,
      href: "/metode",
    },
  ];

  if (!loaded || !ready) {
    return (
      <section className="dash-section anim-fade-up" aria-label="Dasbor saya">
        <p className="section-label">Dasbor saya</p>
        <div className="live-loading">
          <span className="shimmer" />
          <span className="shimmer" />
        </div>
      </section>
    );
  }

  const searchHref =
    onboarding !== null
      ? `/cari?domisili=${encodeURIComponent(onboarding.domisili)}&posisi=${encodeURIComponent(onboarding.posisi)}`
      : "/cari";

  return (
    <section className="dash-section anim-fade-up" aria-label="Dasbor saya">
      <p className="section-label">Dasbor saya</p>
      {onboarding ? (
        <>
          <h2>
            Lowongan untuk {onboarding.posisi} di {onboarding.domisili}.
          </h2>
          <p
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              marginTop: 16,
            }}
          >
            <Link href={searchHref} className="btn">
              Lihat yang cocok
            </Link>
            <Link href="/mulai">Ubah pilihan</Link>
          </p>
        </>
      ) : (
        <>
          <h2>Belum ada pilihan tersimpan.</h2>
          <p style={{ marginTop: 16 }}>
            <Link href="/mulai" className="btn">
              Mulai
            </Link>
          </p>
        </>
      )}

      <div style={{ marginTop: 32 }}>
        <p className="section-label">Langkah berikutnya</p>
        <ol className="recheck-list" aria-label="Langkah berikutnya">
          {steps.map((s) => (
            <li key={s.text}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  aria-hidden="true"
                  style={{
                    color: s.done ? "var(--ok)" : "#a1a1aa",
                    fontWeight: 700,
                  }}
                >
                  {s.done ? "✓" : "○"}
                </span>
                {s.done ? (
                  <span>{s.text}</span>
                ) : (
                  <Link href={s.href}>{s.text}</Link>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div style={{ marginTop: 32 }}>
        <p className="section-label">Lamaran saya</p>
        {total === 0 ? (
          <p>Belum ada lamaran yang dilacak.</p>
        ) : (
          <div className="stat-stack">
            {TRACKER_STATUSES.map((s) => (
              <div className="stat-row" key={s}>
                <span className="stat-num num">
                  <CountUp value={counts[s]} />
                </span>
                <span className="stat-label">{s}</span>
              </div>
            ))}
          </div>
        )}
        <p style={{ marginTop: 16 }}>
          <Link href="/lamaran">Buka Lamaran Saya</Link>
        </p>
      </div>
    </section>
  );
}
