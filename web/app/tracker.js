"use client";

/* Pelacak lamaran Karir: 100% lokal, tanpa akun, tanpa server.
 * Semua tersimpan di localStorage browser pengguna saja, dengan kunci
 * "karir-lamaran". Bentuk data per perusahaan: {no, status, tanggal,
 * catatan}. Setiap tulis mengirim event "karir-tracker-change" supaya
 * komponen lain yang memakai useTracker ikut update. */
import { useCallback, useEffect, useState } from "react";
import { Icon, showToast } from "@/app/visual";

export const TRACKER_KEY = "karir-lamaran";
export const TRACKER_STATUSES = [
  "Ditandai",
  "Sudah dilamar",
  "Dipanggil",
  "Ditolak",
];

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

export function useTracker() {
  const [entries, setEntries] = useState({});
  const [loaded, setLoaded] = useState(false);

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

  return { entries, loaded, save, remove, toggle };
}

/* Kontrol pelacak di halaman detail: pilih status satu ketukan (langsung
 * tersimpan), lalu tanggal dan catatan muncul. Menyentuh status adalah
 * niat melacak; hanya melihat halaman tidak menyimpan apa pun. */
export function TrackerControl({ company }) {
  const { entries, loaded, save, remove } = useTracker();
  const entry = entries[String(company.no)];
  const [tanggal, setTanggal] = useState(todayLocal());
  const [catatan, setCatatan] = useState("");

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
            Tersimpan di browser ini saja, tidak dikirim ke mana pun.
          </p>
        </>
      )}
    </section>
  );
}

