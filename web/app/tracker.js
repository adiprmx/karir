"use client";

/* Pelacak lamaran Karir: tersimpan di localStorage browser pengguna,
 * dengan kunci "karir-lamaran". Bentuk data per perusahaan: {no, status,
 * tanggal, catatan}. Setiap tulis mengirim event "karir-tracker-change"
 * supaya komponen lain yang memakai useTracker ikut update.
 *
 * Masuk itu pilihan. Bila ada pengguna yang masuk, pelacak lokalnya
 * digabung sekali dengan yang tersimpan di akun (lib/tracker-sync),
 * supaya lamaran tidak hilang bila ganti perangkat. Salinan lokal
 * tetap ada, dan saat keluar pengiriman ke akun berhenti. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, showToast } from "@/app/visual";
import { trackEvent } from "@/app/analytics-track";
import { TRACKER_STATUSES } from "@/lib/tracker-sync";

export const TRACKER_KEY = "karir-lamaran";
export { TRACKER_STATUSES };

function readEntries() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TRACKER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function writeEntries(next) {
  try {
    window.localStorage.setItem(TRACKER_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event("karir-tracker-change"));
  return true;
}

export function todayLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/* Ubah hasil gabung (bentuk akun: companyNo) ke bentuk lokal
 * (bentuk localStorage: no). Halaman lamaran memakai e.no untuk
 * urutan dan ubah status, jadi field ini wajib ada. */
function toLocalEntries(merged) {
  const out = {};
  Object.values(merged || {}).forEach((e) => {
    const no = Number(e.companyNo ?? e.no);
    if (!Number.isInteger(no) || no < 1) return;
    out[String(no)] = {
      no,
      status: e.status,
      tanggal: e.tanggal || "",
      catatan: e.catatan || "",
    };
  });
  return out;
}

/* Penjaga sync antar komponen: satu akun hanya disinkronkan sekali
 * per muat halaman, walau useTracker dipakai di beberapa tempat. */
let syncedUid = null;
let syncRunning = null;

export function useTracker() {
  const [entries, setEntries] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    setEntries(readEntries());
    setLoaded(true);
    const onChange = () => setEntries(readEntries());
    window.addEventListener("karir-tracker-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("karir-tracker-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  /* Saat ada pengguna yang masuk, gabungkan pelacak lokal dengan
   * yang tersimpan di akun, sekali saja. Hasil gabungan ditulis ke
   * akun dan kembali ke perangkat ini. Saat keluar, pengiriman ke
   * akun berhenti dan pelacak lokal tetap jalan. Gagal sync tidak
   * mengganggu pelacak lokal. */
  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    (async () => {
      try {
        const [{ onAuthStateChanged }, { auth }] = await Promise.all([
          import("firebase/auth"),
          import("@/lib/firebase"),
        ]);
        if (cancelled) return;
        unsub = onAuthStateChanged(auth, (u) => {
          if (!u) {
            syncedUid = null;
            setSynced(false);
            return;
          }
          if (syncedUid === u.uid) {
            setSynced(true);
            return;
          }
          if (syncRunning) return;
          syncRunning = (async () => {
            try {
              const { syncTrackers } = await import("@/lib/tracker-sync");
              const res = await syncTrackers(u.uid, readEntries());
              if (res && res.ok) {
                syncedUid = u.uid;
                setSynced(true);
                if (res.merged) writeEntries(toLocalEntries(res.merged));
              }
            } catch {
              /* Pelacak lokal tetap jalan. */
            }
          })().finally(() => {
            syncRunning = null;
          });
        });
      } catch {
        /* Auth tidak tersedia: pelacak lokal tetap jalan. */
      }
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const save = useCallback((no, data) => {
    const next = { ...readEntries(), [String(no)]: { no, ...data } };
    return writeEntries(next);
  }, []);

  const remove = useCallback((no) => {
    const next = { ...readEntries() };
    delete next[String(no)];
    writeEntries(next);
  }, []);

  /* Tombol tanda di kartu: tandai, atau lepas tanda bila belum ada
   * progres (status masih Ditandai dan tanpa catatan). */
  const toggle = useCallback((company) => {
    const cur = readEntries()[String(company.no)];
    if (!cur) {
      const ok = writeEntries({
        ...readEntries(),
        [String(company.no)]: {
          no: company.no,
          status: "Ditandai",
          tanggal: todayLocal(),
          catatan: "",
        },
      });
      /* Sekali saat menandai; melepas tanda tidak dikirim. */
      if (ok) {
        trackEvent({
          type: "tracker_mark",
          path:
            typeof window !== "undefined" ? window.location.pathname : "",
          companyNo: company.no,
          action: "Ditandai",
        });
      }
      if (ok) {
        showToast(`${company.perusahaan} ditandai.`, "/lamaran", "Lihat");
      } else {
        showToast("Browser menolak menyimpan. Coba keluar dari mode privat.");
      }
    } else if (cur.status === "Ditandai" && !cur.catatan) {
      const next = { ...readEntries() };
      delete next[String(company.no)];
      writeEntries(next);
      showToast("Tanda dilepas.");
    }
  }, []);

  return { entries, loaded, synced, save, remove, toggle };
}

/* Kontrol pelacak di halaman detail: pilih status satu ketukan (langsung
 * tersimpan), lalu tanggal dan catatan muncul. Menyentuh status adalah
 * niat melacak; hanya melihat halaman tidak menyimpan apa pun. */
export function TrackerControl({ company }) {
  const { entries, loaded, synced, save, remove } = useTracker();
  const entry = entries[String(company.no)];
  const [tanggal, setTanggal] = useState(todayLocal());
  const [catatan, setCatatan] = useState("");
  /* Detail dikirim sekali saat komponen mount. Ref penjaga supaya
   * StrictMode (mount ganda di dev) tidak mengirim dua kali. */
  const detailSent = useRef(false);
  useEffect(() => {
    if (detailSent.current) return;
    detailSent.current = true;
    trackEvent({
      type: "detail",
      path: `/perusahaan/${company.no}`,
      companyNo: company.no,
    });
  }, [company.no]);

  useEffect(() => {
    if (!loaded) return;
    setTanggal(entry && entry.tanggal ? entry.tanggal : todayLocal());
    setCatatan(entry && entry.catatan ? entry.catatan : "");
  }, [loaded, company.no]); // eslint-disable-line react-hooks/exhaustive-deps

  function commit(patch) {
    const base = entry || { status: "Ditandai" };
    const ok = save(company.no, {
      status: patch.status || base.status,
      tanggal: (patch.tanggal ?? tanggal) || todayLocal(),
      catatan: String(patch.catatan ?? catatan).trim().slice(0, 200),
    });
    /* Hanya saat status disimpan; ubah tanggal/catatan saja tidak
     * dikirim. */
    if (ok && patch.status) {
      trackEvent({
        type: "tracker_mark",
        path: `/perusahaan/${company.no}`,
        companyNo: company.no,
        action: patch.status,
      });
    }
    showToast(ok ? "Tersimpan di browser ini." : "Browser menolak menyimpan.");
  }

  const idx = entry ? TRACKER_STATUSES.indexOf(entry.status) : -1;

  return (
    <section className="panel" aria-labelledby="lamaran-h" id="lamaran">
      <h2 id="lamaran-h" className="panel-title">
        Lamaran saya
      </h2>
      {!loaded ? (
        <div className="skeleton" style={{ height: 52 }} />
      ) : (
        <>
          <div
            className={`seg${idx < 0 ? " seg-none" : ""}`}
            role="radiogroup"
            aria-label="Status lamaran"
            style={{ "--n": TRACKER_STATUSES.length, "--k": Math.max(0, idx) }}
          >
            <span className="seg-thumb" aria-hidden="true" />
            {TRACKER_STATUSES.map((s, i) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={i === idx}
                className="seg-opt"
                onClick={() => commit({ status: s })}
              >
                {s}
              </button>
            ))}
          </div>
          {entry ? (
            <div className="track-fields">
              <div className="field">
                <label htmlFor="tracker-tanggal">Tanggal</label>
                <input
                  id="tracker-tanggal"
                  type="date"
                  value={tanggal}
                  onChange={(e) => {
                    setTanggal(e.target.value);
                    if (e.target.value) commit({ tanggal: e.target.value });
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="tracker-catatan">Catatan</label>
                <input
                  id="tracker-catatan"
                  type="text"
                  value={catatan}
                  maxLength={200}
                  placeholder="Catatan untuk dirimu sendiri"
                  autoComplete="off"
                  onChange={(e) => setCatatan(e.target.value)}
                  onBlur={() => {
                    if (catatan.trim() !== (entry.catatan || "")) {
                      commit({ catatan });
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  remove(company.no);
                  showToast("Dihapus dari lamaran.");
                }}
              >
                <Icon name="trash" size={16} />
                Hapus dari lamaran
              </button>
            </div>
          ) : (
            <p className="hint">
              Ketuk satu status untuk mulai melacak perusahaan ini.
            </p>
          )}
          <p className="hint">
            {synced
              ? "Tersimpan di browser ini dan di akun."
              : "Tersimpan di browser ini saja. Masuk dari menu untuk menyimpan ke akun juga."}
          </p>
        </>
      )}
    </section>
  );
}

