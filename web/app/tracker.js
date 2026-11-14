"use client";

/* Pelacak lamaran Karir: tersimpan di localStorage browser pengguna.
 * Tamu memakai kunci "karir-lamaran"; pengguna yang masuk memakai
 * kunci per akun "karir-lamaran:<uid>" (AKUN-06), supaya dua orang
 * yang memakai perangkat yang sama tidak saling mewarisi lamaran.
 * Bentuk data per perusahaan: {no, status, tanggal, catatan,
 * updatedAt}. Setiap tulis mengirim event "karir-tracker-change"
 * supaya komponen lain yang memakai useTracker ikut update.
 *
 * Masuk itu pilihan. Bila ada pengguna yang masuk, pelacak akunnya
 * digabung sekali dengan yang tersimpan di akun (lib/tracker-sync),
 * lalu setiap perubahan dikirim ke akun saat terjadi
 * (push-on-change, LAM-03). Gagal kirim tidak pernah menghapus
 * data lokal: status sinkron menjadi tertunda dan percobaan
 * diulang saat kembali online, saat halaman kembali fokus, atau
 * lewat tombol "Sinkronkan lagi" di /lamaran (LAM-04). */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, showToast } from "@/app/visual";
import { trackEvent } from "@/app/analytics-track";
import { TOMBSTONE_KEY, TRACKER_STATUSES } from "@/lib/tracker-sync";

export const TRACKER_KEY = "karir-lamaran";
export { TRACKER_STATUSES };

/* Kunci penyimpanan untuk satu akun; tamu memakai kunci dasar. */
function trackerKeyFor(uid) {
  return typeof uid === "string" && uid
    ? `${TRACKER_KEY}:${uid}`
    : TRACKER_KEY;
}

function readEntriesAt(key) {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
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

function writeEntriesAt(key, next) {
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event("karir-tracker-change"));
  return true;
}

/* Hapus SEMUA data pelacak di perangkat ini: kunci tamu, semua
 * kunci per akun, dan semua penanda hapus. Dipakai Pengaturan
 * ("Hapus semua data", AKUN-05, milik T4) supaya kunci per akun
 * tidak tertinggal setelah isolasi AKUN-06. Bukan untuk dipakai
 * di tempat lain. */
export function clearAllTrackerStorage() {
  if (typeof window === "undefined") return;
  try {
    const doomed = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (
        key === TRACKER_KEY ||
        key.startsWith(`${TRACKER_KEY}:`) ||
        key === TOMBSTONE_KEY ||
        key.startsWith(`${TOMBSTONE_KEY}:`)
      ) {
        doomed.push(key);
      }
    }
    doomed.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    /* Abaikan: penghapusan lokal gagal tidak boleh merusak halaman. */
  }
  window.dispatchEvent(new Event("karir-tracker-change"));
}

export function todayLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/* Ubah hasil gabung (bentuk akun: companyNo) ke bentuk lokal
 * (bentuk localStorage: no). Halaman lamaran memakai e.no untuk
 * urutan dan ubah status, jadi field ini wajib ada. updatedAt
 * dipertahankan supaya bentrok berikutnya bisa dibandingkan
 * (LAM-05). */
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
      ...(typeof e.updatedAt === "string" && e.updatedAt
        ? { updatedAt: e.updatedAt }
        : {}),
    };
  });
  return out;
}

/* Gabungkan perubahan lokal yang terjadi selama sinkron berjalan
 * ke hasil gabung akun: entri yang diubah/ditambah saat sinkron
 * menang atas hasil gabung, entri yang dihapus saat sinkron tetap
 * terhapus. Tanpa ini, hasil gabung yang ditulis kembali bisa
 * menimpa perubahan pengguna yang terjadi di tengah sinkron. */
function applyLocalDelta(merged, before, after) {
  const out = { ...(merged || {}) };
  const beforeMap = before || {};
  const afterMap = after || {};
  Object.keys(beforeMap).forEach((key) => {
    if (!(key in afterMap)) delete out[key];
  });
  Object.entries(afterMap).forEach(([key, entry]) => {
    const prev = beforeMap[key];
    if (!prev || JSON.stringify(prev) !== JSON.stringify(entry)) {
      out[key] = entry;
    }
  });
  return out;
}

/* Status sinkron (modul, dibagikan semua pemakai useTracker):
 * "tamu" (belum masuk), "sinkron" (terakhir berhasil),
 * "mengirim" (sinkron/kirim sedang jalan), "tertunda" (ada
 * perubahan yang belum terkirim atau upaya terakhir gagal).
 * Setiap perubahan mengirim event "karir-sync-change". */
let activeUid = null;
let syncedUid = null;
let syncRunning = null;
let syncState = "tamu";
let syncError = null;
let lastSyncedAt = null;
let lastAutoAttemptAt = 0;
let pushTimer = null;
const pendingPush = new Set();

function dispatchSync() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("karir-sync-change"));
  }
}

function markSyncing() {
  syncState = "mengirim";
  dispatchSync();
}

/* Setelah upaya berhasil: "sinkron" bila tidak ada lagi yang
 * antre, "tertunda" bila ada perubahan yang terjadi selama upaya
 * dan masih menunggu kirim. */
function markSyncedOrPending() {
  syncError = null;
  if (pendingPush.size === 0) {
    syncState = "sinkron";
    lastSyncedAt = new Date().toISOString();
  } else {
    syncState = "tertunda";
  }
  dispatchSync();
}

function markPending(error) {
  syncState = "tertunda";
  if (error) syncError = error;
  dispatchSync();
}

function markGuest() {
  syncState = "tamu";
  syncError = null;
  dispatchSync();
}

/* Kalimat status sinkron untuk antarmuka (tanpa istilah teknis;
 * yang ditekankan: data lokal tidak pernah hilang bila sinkron
 * gagal). Dipakai petunjuk TrackerControl dan spanduk /lamaran. */
export function syncStatusMessage(state, error) {
  if (state === "sinkron") return "Tersimpan di browser ini dan di akun.";
  if (state === "mengirim") return "Mengirim ke akun...";
  if (state === "tertunda") {
    if (!error) return "Ada perubahan yang belum terkirim ke akun.";
    if (error.code === "offline") {
      return "Tidak ada internet. Perubahan tersimpan di perangkat ini dan akan dikirim saat tersambung lagi.";
    }
    if (error.code === "sibuk") {
      return "Server sedang sibuk. Perubahan tersimpan di perangkat ini dan akan dikirim nanti.";
    }
    if (error.code === "sesi") {
      return "Sesi akun berakhir. Masuk lagi supaya lamaran tersimpan ke akun.";
    }
    if (error.code === "ditolak") {
      return "Akun tidak diizinkan menyimpan. Perubahan tersimpan di perangkat ini.";
    }
    return "Sinkron ke akun gagal. Perubahan tersimpan di perangkat ini.";
  }
  return "Tersimpan di browser ini saja. Masuk dari menu untuk menyimpan ke akun juga.";
}

/* Baca/tulis memakai kunci yang sedang aktif (akun yang masuk,
 * atau kunci tamu bila belum masuk). */
function readEntries() {
  return readEntriesAt(trackerKeyFor(activeUid));
}

function writeEntries(next) {
  return writeEntriesAt(trackerKeyFor(activeUid), next);
}

/* Setelah sinkron penuh berhasil: entri yang tidak berubah selama
 * sinkron sudah terkirim (sinkron menulis semua hasil gabung),
 * jadi keluarkan dari antrean kirim. Entri yang berubah selama
 * sinkron tetap antre dan dikirim lewat flush berikutnya. */
function pruneCoveredPushes(before, after) {
  Object.keys(before || {}).forEach((key) => {
    if (JSON.stringify(before[key]) === JSON.stringify((after || {})[key])) {
      pendingPush.delete(key);
    }
  });
  if (pendingPush.size > 0) {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(flushPushes, 800);
  }
}

/* Sinkron penuh: baca akun, gabung, terapkan penanda hapus, tulis
 * kembali. Dipakai saat masuk dan saat retry. Gagal sync tidak
 * mengubah data lokal maupun penanda hapus (jaminan
 * lib/tracker-sync). Retry otomatis dibatasi (paling cepat 1 menit
 * sekali; 5 menit setelah server sibuk/429) supaya tidak
 * membanjiri server saat terdegradasi; retry manual selalu
 * diizinkan. */
async function runFullSync(uid, { manual = false } = {}) {
  if (!uid || activeUid !== uid) return { ok: false };
  if (syncRunning) return syncRunning;
  const now = Date.now();
  if (!manual) {
    if (
      syncedUid === uid &&
      syncState === "sinkron" &&
      pendingPush.size === 0
    ) {
      return { ok: true };
    }
    const minGap =
      syncError && syncError.code === "sibuk" ? 5 * 60 * 1000 : 60 * 1000;
    if (now - lastAutoAttemptAt < minGap) return { ok: false };
  }
  lastAutoAttemptAt = now;
  markSyncing();
  syncRunning = (async () => {
    try {
      const before = readEntries();
      const { syncTrackers } = await import("@/lib/tracker-sync");
      const res = await syncTrackers(uid, before);
      if (res && res.ok) {
        syncedUid = uid;
        const after = readEntries();
        pruneCoveredPushes(before, after);
        markSyncedOrPending();
        if (res.merged) {
          writeEntries(
            toLocalEntries(applyLocalDelta(res.merged, before, after)),
          );
        }
        return res;
      }
      markPending({
        code: (res && res.code) || "gagal",
        at: new Date().toISOString(),
      });
      return res || { ok: false };
    } catch {
      markPending({ code: "gagal", at: new Date().toISOString() });
      return { ok: false };
    } finally {
      syncRunning = null;
    }
  })();
  return syncRunning;
}

/* Kirim antrean perubahan satu per satu (LAM-03). Entri dibaca
 * segar saat dikirim; entri yang sudah dihapus sesudahnya
 * dilewati (remove() yang mengurus penghapusannya). Gagal kirim
 * mengembalikan entri ke antrean dan menandai tertunda; tidak
 * ada data lokal yang berubah. */
async function flushPushes() {
  pushTimer = null;
  const uid = activeUid;
  if (!uid || pendingPush.size === 0) return;
  const nos = [...pendingPush];
  pendingPush.clear();
  markSyncing();
  try {
    const { pushTracker } = await import("@/lib/tracker-sync");
    let failed = null;
    for (const no of nos) {
      if (activeUid !== uid) return;
      const entry = readEntries()[no];
      if (!entry) continue;
      const res = await pushTracker(uid, entry);
      if (!res || !res.ok) {
        failed = res;
        pendingPush.add(no);
      }
    }
    if (failed) {
      markPending({
        code: (failed && failed.code) || "gagal",
        at: new Date().toISOString(),
      });
    } else {
      markSyncedOrPending();
    }
  } catch {
    nos.forEach((no) => pendingPush.add(no));
    markPending({ code: "gagal", at: new Date().toISOString() });
  }
}

/* Antrekan satu perubahan untuk dikirim ke akun (debounce 800 md
 * supaya ketukan berurutan tidak mengirim berkali-kali). Tanpa
 * akun yang masuk, tidak ada yang diantrekan. */
function schedulePush(no) {
  if (!activeUid) return;
  pendingPush.add(String(no));
  if (syncState === "sinkron") markPending(null);
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPushes, 800);
}

export function useTracker() {
  const [entries, setEntries] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [syncInfo, setSyncInfo] = useState(() => ({
    state: syncState,
    error: syncError,
    lastSyncedAt,
  }));
  const [guestCount, setGuestCount] = useState(0);

  useEffect(() => {
    /* Baca awal dijadwalkan sebagai microtask: setState di dalam
     * callback, bukan sinkron di badan effect. */
    queueMicrotask(() => {
      setEntries(readEntries());
      setGuestCount(
        activeUid ? Object.keys(readEntriesAt(TRACKER_KEY)).length : 0,
      );
      setLoaded(true);
    });
    const onChange = () => {
      setEntries(readEntries());
      setGuestCount(
        activeUid ? Object.keys(readEntriesAt(TRACKER_KEY)).length : 0,
      );
    };
    const onSync = () => {
      setSyncInfo({
        state: syncState,
        error: syncError,
        lastSyncedAt,
      });
    };
    window.addEventListener("karir-tracker-change", onChange);
    window.addEventListener("storage", onChange);
    window.addEventListener("karir-sync-change", onSync);
    return () => {
      window.removeEventListener("karir-tracker-change", onChange);
      window.removeEventListener("storage", onChange);
      window.removeEventListener("karir-sync-change", onSync);
    };
  }, []);

  /* Saat ada pengguna yang masuk, gabungkan pelacak akunnya
   * dengan yang tersimpan di akun, sekali saja per muat halaman.
   * Hasil gabungan ditulis ke akun dan kembali ke perangkat ini.
   * Saat keluar, pengiriman ke akun berhenti dan tampilan kembali
   * ke pelacak tamu (kunci per akunnya tetap tersimpan di
   * perangkat sebagai cache, tidak ditampilkan). Gagal sync tidak
   * mengganggu pelacak lokal; percobaan diulang otomatis saat
   * kembali online atau saat halaman kembali fokus (LAM-04). */
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
        const onOnline = () => {
          if (activeUid) runFullSync(activeUid);
        };
        const onVisible = () => {
          if (document.visibilityState === "visible" && activeUid) {
            runFullSync(activeUid);
          }
        };
        window.addEventListener("online", onOnline);
        document.addEventListener("visibilitychange", onVisible);
        const authUnsub = onAuthStateChanged(auth, (u) => {
          if (!u) {
            activeUid = null;
            syncedUid = null;
            pendingPush.clear();
            if (pushTimer) {
              clearTimeout(pushTimer);
              pushTimer = null;
            }
            markGuest();
            setEntries(readEntries());
            setGuestCount(0);
            return;
          }
          const switched = activeUid !== u.uid;
          activeUid = u.uid;
          if (switched) {
            setEntries(readEntries());
            setGuestCount(Object.keys(readEntriesAt(TRACKER_KEY)).length);
          }
          if (syncedUid === u.uid) return;
          runFullSync(u.uid);
        });
        unsub = () => {
          authUnsub();
          window.removeEventListener("online", onOnline);
          document.removeEventListener("visibilitychange", onVisible);
        };
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
    const next = {
      ...readEntries(),
      [String(no)]: {
        no,
        ...data,
        updatedAt: new Date().toISOString(),
      },
    };
    const ok = writeEntries(next);
    if (ok) schedulePush(no);
    return ok;
  }, []);

  /* Hapus lokal dulu (selalu berhasil, walau offline), lalu hapus
   * dari akun bila sedang masuk. Penanda hapus dicatat per akun
   * sebelum mencoba, supaya hapus yang gagal terkirim tetap
   * dihapus di sinkron berikutnya. Tamu: hapus lokal saja, tanpa
   * penanda akun (lamaran tamu bukan milik akun mana pun). */
  const remove = useCallback((no) => {
    const next = { ...readEntries() };
    delete next[String(no)];
    writeEntries(next);
    pendingPush.delete(String(no));
    const uid = activeUid;
    if (!uid) return;
    (async () => {
      try {
        const {
          recordTombstone,
          deleteTracker,
          pruneTombstones,
          readTombstones,
          writeTombstones,
        } = await import("@/lib/tracker-sync");
        recordTombstone(no, uid);
        const res = await deleteTracker(uid, no);
        if (res && res.ok) {
          writeTombstones(
            pruneTombstones(readTombstones(uid), [String(no)]),
            uid,
          );
        } else {
          markPending({
            code: (res && res.code) || "gagal",
            at: new Date().toISOString(),
          });
        }
      } catch {
        markPending({ code: "gagal", at: new Date().toISOString() });
      }
    })();
  }, []);

  /* Tombol tanda di kartu: tandai, atau lepas tanda bila belum ada
   * progres (status masih Ditandai dan tanpa catatan). Menandai
   * dan melepas tanda sama-sama diteruskan ke akun bila masuk. */
  const toggle = useCallback(
    (company) => {
      const cur = readEntries()[String(company.no)];
      if (!cur) {
        const ok = save(company.no, {
          status: "Ditandai",
          tanggal: todayLocal(),
          catatan: "",
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
        remove(company.no);
        showToast("Tanda dilepas.");
      }
    },
    [save, remove],
  );

  /* Sinkron manual (tombol "Sinkronkan lagi"): selalu mencoba,
   * tanpa batas retry otomatis. */
  const retrySync = useCallback(() => {
    if (!activeUid) return Promise.resolve({ ok: false });
    syncedUid = null;
    return runFullSync(activeUid, { manual: true });
  }, []);

  /* Gabungkan lamaran tamu di perangkat ini ke akun yang masuk
   * (AKUN-06): tamu yang melacak sebelum masuk bisa memilih
   * menggabungkan, bukan digabung diam-diam. Bentrok
   * diselesaikan dengan updatedAt seperti sinkron biasa. Bila
   * berhasil, kunci tamu dibersihkan supaya tawaran tidak muncul
   * lagi; bila gagal, data tamu tetap utuh. */
  const mergeGuest = useCallback(async () => {
    const uid = activeUid;
    if (!uid) return { ok: false };
    const guest = readEntriesAt(TRACKER_KEY);
    if (Object.keys(guest).length === 0) return { ok: true, merged: 0 };
    markSyncing();
    try {
      const { mergeTrackers, syncTrackers } = await import(
        "@/lib/tracker-sync"
      );
      const before = readEntries();
      const res = await syncTrackers(uid, mergeTrackers(before, guest));
      if (res && res.ok) {
        try {
          window.localStorage.removeItem(TRACKER_KEY);
        } catch {
          /* Kunci tamu gagal dibersihkan: tawaran gabung akan
           * muncul lagi, tetapi data tidak hilang. */
        }
        syncedUid = uid;
        const after = readEntries();
        pruneCoveredPushes(before, after);
        markSyncedOrPending();
        if (res.merged) {
          writeEntries(
            toLocalEntries(applyLocalDelta(res.merged, before, after)),
          );
        }
        setGuestCount(0);
        return { ok: true, merged: Object.keys(guest).length };
      }
      markPending({
        code: (res && res.code) || "gagal",
        at: new Date().toISOString(),
      });
      return { ok: false };
    } catch {
      markPending({ code: "gagal", at: new Date().toISOString() });
      return { ok: false };
    }
  }, []);

  return {
    entries,
    loaded,
    synced: syncInfo.state === "sinkron",
    syncState: syncInfo.state,
    syncError: syncInfo.error,
    lastSyncedAt: syncInfo.lastSyncedAt,
    guestCount,
    save,
    remove,
    toggle,
    retrySync,
    mergeGuest,
  };
}

/* Kontrol pelacak di halaman detail: pilih status satu ketukan (langsung
 * tersimpan), lalu tanggal dan catatan muncul. Menyentuh status adalah
 * niat melacak; hanya melihat halaman tidak menyimpan apa pun. */
export function TrackerControl({ company }) {
  const { entries, loaded, syncState, syncError, save, remove } = useTracker();
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
    /* Isi tanggal/catatan dijadwalkan sebagai microtask: setState di
     * dalam callback, bukan sinkron di badan effect. */
    queueMicrotask(() => {
      setTanggal(entry && entry.tanggal ? entry.tanggal : todayLocal());
      setCatatan(entry && entry.catatan ? entry.catatan : "");
    });
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
          <p className="hint">{syncStatusMessage(syncState, syncError)}</p>
        </>
      )}
    </section>
  );
}
