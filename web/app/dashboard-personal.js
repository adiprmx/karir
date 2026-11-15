"use client";

/* Ruang kerja pribadi di Dasbor: apa yang dicari, langkah berikutnya,
 * dan ringkasan lamaran. Data dibaca dari browser (localStorage):
 * pilihan dibaca dari "karir-onboarding" dan lamaran dari
 * "karir-lamaran" lewat useTracker(). Lamaran yang dilacak tersinkron
 * ke akun bila pengunjung masuk; baris status di bawah "Lamaran saya"
 * menunjukkan keadaan itu (DASH-04), dengan kalimat yang sama seperti
 * di halaman detail. Pilihan SEBAGIAN (salah satu kolom terisi) diakui
 * sebagai pilihan tersimpan (ONB-02); langkah "Tentukan domisili dan
 * posisi" baru selesai bila kedua kolom terisi. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTracker, TRACKER_STATUSES } from "@/app/tracker";
import {
  hasOnboardingChoice,
  isOnboardingComplete,
  loadOnboarding,
} from "@/app/onboarding";
import { loadRecentSearch } from "@/app/recent";
import { CountUp, Icon, Reveal } from "@/app/visual";

const VISITED_METODE_KEY = "karir-visited-metode";

function readVisitedMetode() {
  try {
    return window.localStorage.getItem(VISITED_METODE_KEY) !== null;
  } catch {
    return false;
  }
}

/* W2a (DASH-03): label diteruskan halaman Dasbor (server) lewat
 * props; tanpa props, teks Indonesia di bawah dipakai sebagai
 * cadangan. Nama status pelacak (Ditandai, Sudah dilamar, ...) dan
 * nama status perusahaan adalah kosakata data dan sengaja tetap
 * Bahasa Indonesia di semua bahasa. */
const DASH_DEFAULTS = {
  title: "Dasbor saya",
  choiceBoth: "Lowongan {posisi} di {domisili}",
  choiceDomisili: "Lowongan di {domisili}",
  choicePosisi: "Lowongan {posisi}",
  noChoice: "Belum ada pilihan tersimpan.",
  viewMatches: "Lihat yang cocok",
  editChoices: "Ubah pilihan",
  start: "Mulai",
  lastSearch: "Terakhir kamu cari:",
  nextSteps: "Langkah berikutnya",
  stepChoice: "Tentukan domisili dan posisi",
  stepFirstMark: "Tandai lamaran pertama",
  stepReadMethod: "Baca cara data dicek sebelum melamar",
  done: "Selesai: ",
  trackerTitle: "Lamaran saya",
  emptyTitle: "Belum ada lamaran yang dilacak.",
  sync: {
    saved: "Tersimpan di browser ini dan di akun.",
    guest:
      "Tersimpan di browser ini saja. Masuk dari menu untuk menyimpan ke akun juga.",
  },
};

export default function DashboardPersonal({ labels: labelsProp }) {
  const labels = { ...DASH_DEFAULTS, ...(labelsProp || {}) };
  const { entries, loaded, synced } = useTracker();
  const [onboarding, setOnboarding] = useState(null);
  const [recent, setRecent] = useState(null);
  const [visitedMetode, setVisitedMetode] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () => {
      const o = loadOnboarding();
      setOnboarding(hasOnboardingChoice(o) ? o : null);
      setRecent(loadRecentSearch());
      setVisitedMetode(readVisitedMetode());
    };
    /* Baca awal dijadwalkan sebagai microtask: setState di dalam
     * callback, bukan sinkron di badan effect. */
    queueMicrotask(() => {
      read();
      setReady(true);
    });
    window.addEventListener("storage", read);
    window.addEventListener("karir-recent-change", read);
    window.addEventListener("karir-onboarding-change", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("karir-recent-change", read);
      window.removeEventListener("karir-onboarding-change", read);
    };
  }, []);

  if (!loaded || !ready) {
    return (
      /* AKSES-16: aria-busy memberi tahu pembaca layar bahwa seksi
       * ini sedang dimuat (pola yang sama dengan loading.js). */
      <section className="panel" aria-label={labels.title} aria-busy="true">
        <div className="skeleton" style={{ height: 28, width: "60%" }} />
        <div className="skeleton" style={{ height: 80, marginTop: 16 }} />
      </section>
    );
  }

  const counts = {};
  for (const s of TRACKER_STATUSES) counts[s] = 0;
  /* DASH-10: total hanya menghitung entri berstatus dikenal, sama
   * seperti ubin per status — total tidak boleh lebih besar dari
   * jumlah ubin. (Validasi baca LAM-08 sudah membuang entri
   * berstatus tak dikenal; penjaga ini menjaga konsistensi bila
   * ada entri lolos dari jalur lain.) */
  let total = 0;
  for (const e of Object.values(entries || {})) {
    if (e && counts[e.status] !== undefined) {
      counts[e.status] += 1;
      total += 1;
    }
  }

  const steps = [
    {
      text: labels.stepChoice,
      done: isOnboardingComplete(onboarding),
      href: "/mulai",
    },
    { text: labels.stepFirstMark, done: total > 0, href: "/cari" },
    { text: labels.stepReadMethod, done: visitedMetode, href: "/metode" },
  ];
  const doneN = steps.filter((s) => s.done).length;
  const searchHref = onboarding
    ? `/cari?${new URLSearchParams(
        Object.fromEntries(
          Object.entries({
            domisili: onboarding.domisili,
            posisi: onboarding.posisi,
          }).filter(([, v]) => v),
        ),
      ).toString()}`
    : "/cari";
  /* Judul menyesuaikan pilihan sebagian: kolom yang kosong tidak
   * dirender, supaya tidak muncul kata gantung seperti
   * "Lowongan Helper Gudang di" atau "Lowongan di". */
  const choiceHeading = onboarding
    ? onboarding.domisili && onboarding.posisi
      ? labels.choiceBoth
          .replace("{posisi}", onboarding.posisi)
          .replace("{domisili}", onboarding.domisili)
      : onboarding.domisili
        ? labels.choiceDomisili.replace("{domisili}", onboarding.domisili)
        : labels.choicePosisi.replace("{posisi}", onboarding.posisi)
    : null;
  const recentParts = recent
    ? [recent.domisili, recent.posisi].filter(Boolean)
    : [];
  const recentHref = recent
    ? `/cari?${new URLSearchParams(
        Object.fromEntries(
          Object.entries({ domisili: recent.domisili, posisi: recent.posisi }).filter(
            ([, v]) => v,
          ),
        ),
      ).toString()}`
    : "/cari";

  return (
    <Reveal className="panel mine" as="section">
      <div className="mine-top">
        <div>
          <p className="kicker">{labels.title}</p>
          {onboarding ? (
            <h2>{choiceHeading}</h2>
          ) : (
            <h2>{labels.noChoice}</h2>
          )}
        </div>
        <div className="actions-row">
          {onboarding ? (
            <>
              <Link href={searchHref} className="btn small">
                {labels.viewMatches}
                <Icon name="arrow" size={16} />
              </Link>
              <Link href="/mulai" className="btn ghost small">
                {labels.editChoices}
              </Link>
            </>
          ) : (
            <Link href="/mulai" className="btn small">
              {labels.start}
              <Icon name="arrow" size={16} />
            </Link>
          )}
        </div>
      </div>

      {recentParts.length > 0 && (
        <p className="hint">
          {labels.lastSearch}{" "}
          <Link href={recentHref}>{recentParts.join(" + ")}</Link>
        </p>
      )}

      <div className="mine-cols">
        <div>
          <p className="label">
            {labels.nextSteps} <span className="num">{doneN}/3</span>
          </p>
          <div className="progress" aria-hidden="true">
            <span style={{ width: `${(doneN / 3) * 100}%` }} />
          </div>
          <ol className="todo">
            {steps.map((s) => (
              <li key={s.text} className={s.done ? "done" : ""}>
                <span className="todo-box" aria-hidden="true">
                  {s.done && <Icon name="check" size={14} />}
                </span>
                {s.done ? (
                  <span>
                    <span className="sr-only">{labels.done}</span>
                    {s.text}
                  </span>
                ) : (
                  <Link href={s.href}>{s.text}</Link>
                )}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="label">{labels.trackerTitle}</p>
          <p className="hint">
            {synced ? labels.sync.saved : labels.sync.guest}
          </p>
          {total === 0 ? (
            <p className="hint">{labels.emptyTitle}</p>
          ) : (
            <div className="counts">
              {TRACKER_STATUSES.map((s) => (
                /* DASH-05: tiap ubin membuka /lamaran langsung di tab
                 * statusnya, bukan daftar polos. */
                <Link href={`/lamaran?status=${encodeURIComponent(s)}`} key={s}>
                  <span className="count-n num">
                    <CountUp value={counts[s]} duration={600} />
                  </span>
                  <span className="count-l">{s}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Reveal>
  );
}
