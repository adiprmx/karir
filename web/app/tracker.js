"use client";

/* Pelacak lamaran Karir: 100% lokal, tanpa akun, tanpa server.
 * Semua tersimpan di localStorage browser pengguna saja, dengan kunci
 * "karir-lamaran". Bentuk data per perusahaan: {no, status, tanggal,
 * catatan}. Setiap tulis mengirim event "karir-tracker-change" supaya
 * komponen lain yang memakai useTracker ikut update. */
import { useCallback, useEffect, useState } from "react";

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
    return;
  }
  window.dispatchEvent(new Event("karir-tracker-change"));
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
    writeEntries(next);
  }, []);

  const remove = useCallback((no) => {
    const next = { ...readEntries() };
    delete next[String(no)];
    writeEntries(next);
  }, []);

  return { entries, loaded, save, remove };
}

function todayLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/* Kontrol pelacak di halaman detail perusahaan: 4 tombol status,
 * tanggal, catatan pendek, dan tombol simpan. Menyimpan hanya saat
 * pengguna menekan simpan. */
export function TrackerControl({ company }) {
  const { entries, loaded, save, remove } = useTracker();
  const entry = entries[String(company.no)];
  const [status, setStatus] = useState("Ditandai");
  const [tanggal, setTanggal] = useState(todayLocal());
  const [catatan, setCatatan] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    setStatus(entry ? entry.status : "Ditandai");
    setTanggal(entry && entry.tanggal ? entry.tanggal : todayLocal());
    setCatatan(entry && entry.catatan ? entry.catatan : "");
    setSaved(false);
  }, [loaded, company.no]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSave() {
    save(company.no, {
      status,
      tanggal: tanggal || todayLocal(),
      catatan: catatan.trim().slice(0, 200),
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  function onRemove() {
    remove(company.no);
  }

  const inputStyle = {
    width: "100%",
    border: "1px solid #e5e5e5",
    borderRadius: 8,
    padding: 12,
    font: "inherit",
    fontSize: 15,
    background: "#fff",
  };
  const labelStyle = {
    display: "block",
    fontSize: 13,
    fontWeight: 700,
    color: "#52525b",
    marginBottom: 8,
  };

  return (
    <section className="dash-section" aria-label="Lacak lamaran">
      <p className="section-label">Lamaran saya</p>
      {!loaded ? (
        <div className="live-loading">
          <span className="shimmer" />
          <span className="shimmer" />
        </div>
      ) : (
        <div>
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
            role="group"
            aria-label="Status lamaran"
          >
            {TRACKER_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className="example-chip"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                style={
                  status === s
                    ? {
                        background: "#0a0a0a",
                        color: "#fff",
                        borderColor: "#0a0a0a",
                      }
                    : undefined
                }
              >
                {s}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={labelStyle} htmlFor="tracker-tanggal">
              Tanggal
            </label>
            <input
              id="tracker-tanggal"
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={labelStyle} htmlFor="tracker-catatan">
              Catatan
            </label>
            <input
              id="tracker-catatan"
              type="text"
              value={catatan}
              maxLength={200}
              placeholder="Catatan untuk dirimu sendiri"
              autoComplete="off"
              onChange={(e) => setCatatan(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 16,
              alignItems: "center",
            }}
          >
            <button type="button" className="btn" onClick={onSave}>
              Simpan
            </button>
            {entry && (
              <button
                type="button"
                className="btn ghost"
                onClick={onRemove}
              >
                Hapus
              </button>
            )}
            {saved && <span className="fresh-note">Tersimpan.</span>}
          </div>
          <p className="fresh-note">
            Tersimpan di browser ini saja, tidak dikirim ke mana pun.
          </p>
        </div>
      )}
    </section>
  );
}
