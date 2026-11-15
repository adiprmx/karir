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
import { ConfirmDialog, Icon, showToast } from "@/app/visual";
import { trackEvent } from "@/app/analytics-track";
import { useLabels } from "@/app/labels-provider";
import {
  TOMBSTONE_KEY,
  TRACKER_STATUSES,
  normalizeLocalEntries,
} from "@/lib/tracker-sync";
import { rovingIndex } from "@/lib/a11y";

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
    /* LAM-08: tiap entri divalidasi saat dibaca (status, no,
     * tanggal, catatan) lewat normalizeLocalEntries — aturan yang
     * sama dengan jalur sinkron akun. Entri tidak sah dibuang. */
    return normalizeLocalEntries(parsed);
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

/* ============ BLOK LOGIKA MURNI (AKUN-10) ============
 * Fungsi-fungsi di antara penanda __PURE_START__ dan __PURE_END__
 * diuji unit lewat ekstraksi sumber di app/w2c-admin.test.js:
 * berkas ini tidak bisa diimpor langsung oleh node:test karena
 * JSX dan impor Next. Blok ini WAJIB mandiri: hanya memakai
 * global standar (Date) dan penyimpanan yang disuntik, tanpa
 * impor atau state lain. Jangan menambah ketergantungan di dalam
 * blok ini.
/* __PURE_START__ */

/* Kunci localStorage untuk membedakan "keluar sengaja" dari "sesi
 * berakhir" (AKUN-10). Keluar yang disengaja menandai
 * SIGNOUT_INTENDED_KEY sebelum memanggil signOut; sesi yang mati
 * sendiri (token refresh gagal — akun dinonaktifkan atau dihapus)
 * tidak meninggalkan tanda itu. Penanda sesi berakhir dibaca
 * panel akun sekali, lalu dihapus. */
export const SIGNOUT_INTENDED_KEY = "karir-keluar-sengaja";
export const SESSION_ENDED_KEY = "karir-sesi-berakhir";
/* Tanda keluar hanya berlaku 60 detik: signOut Firebase menyebar
 * ke semua tab dalam hitungan detik, jadi tanda yang lebih tua
 * dari ini adalah sisa yang tidak terpakai. */
export const SIGNOUT_INTENDED_MAX_AGE_MS = 60 * 1000;
/* Pemberitahuan sesi berakhir hanya relevan satu jam sesudahnya;
 * sesudah itu, panel masuk biasa sudah cukup menjelaskan. */
export const SESSION_ENDED_MAX_AGE_MS = 60 * 60 * 1000;

function storageOf(storage) {
  if (storage) return storage;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    /* Tanpa penyimpanan, tidak ada tanda yang dibaca. */
  }
  return null;
}

function readFreshTimestamp(storage, key, maxAgeMs, now) {
  const store = storageOf(storage);
  if (!store) return false;
  let raw = null;
  try {
    raw = store.getItem(key);
    store.removeItem(key);
  } catch {
    return false;
  }
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  return age >= 0 && age <= maxAgeMs;
}

function writeTimestamp(storage, key, now) {
  const store = storageOf(storage);
  if (!store) return false;
  try {
    store.setItem(key, String(now));
    return true;
  } catch {
    return false;
  }
}

/* Tandai bahwa keluar berikutnya disengaja (dipanggil sebelum
 * signOut). Argumen `storage` dan `now` hanya untuk tes. */
export function markSignOutIntended(storage, now = Date.now()) {
  return writeTimestamp(storage, SIGNOUT_INTENDED_KEY, now);
}

/* Baca sekaligus hapus tanda keluar sengaja: true bila ada tanda
 * yang masih segar. Dipanggil saat status masuk menjadi null. */
export function consumeSignOutIntended(storage, now = Date.now()) {
  return readFreshTimestamp(
    storage,
    SIGNOUT_INTENDED_KEY,
    SIGNOUT_INTENDED_MAX_AGE_MS,
    now,
  );
}

/* Tandai bahwa sesi berakhir sendiri (dipanggil saat status masuk
 * menjadi null tanpa tanda keluar sengaja). */
export function markSessionEnded(storage, now = Date.now()) {
  return writeTimestamp(storage, SESSION_ENDED_KEY, now);
}

/* Baca sekaligus hapus penanda sesi berakhir: true bila ada
 * penanda yang masih segar. Dipanggil panel akun saat tampil. */
export function consumeSessionEnded(storage, now = Date.now()) {
  return readFreshTimestamp(
    storage,
    SESSION_ENDED_KEY,
    SESSION_ENDED_MAX_AGE_MS,
    now,
  );
}

/* __PURE_END__ */
/* ============ AKHIR BLOK LOGIKA MURNI ============ */

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

/* Potret status sinkron saat ini untuk komponen dan penunggu.
 * accountMerged true hanya bila sinkron penuh sudah berhasil
 * menggabungkan pelacak akun di sesi ini (syncedUid) — berbeda
 * dari state "sinkron", yang juga bisa tercapai lewat kirim
 * perubahan saja (flushPushes) tanpa pernah menggabung akun. */
function currentSyncInfo() {
  return {
    state: syncState,
    error: syncError,
    lastSyncedAt,
    accountMerged: Boolean(activeUid) && syncedUid === activeUid,
  };
}

/* Kalimat status sinkron untuk antarmuka (tanpa istilah teknis;
 * yang ditekankan: data lokal tidak pernah hilang bila sinkron
 * gagal). Dipakai petunjuk TrackerControl dan spanduk /lamaran.
 * W2a (UX-08): argumen ketiga opsional berisi terjemahan (kunci
 * sync.* dari i18n); tanpa itu kalimat Indonesia di bawah dipakai. */
const SYNC_MESSAGES_ID = {
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
};

export function syncStatusMessage(state, error, messages) {
  const m = { ...SYNC_MESSAGES_ID, ...(messages || {}) };
  if (state === "sinkron") return m.saved;
  if (state === "mengirim") return m.sending;
  if (state === "tertunda") {
    if (!error) return m.pending;
    if (error.code === "offline") {
      return m.offline;
    }
    if (error.code === "sibuk") {
      return m.busy;
    }
    if (error.code === "sesi") {
      return m.session;
    }
    if (error.code === "ditolak") {
      return m.denied;
    }
    return m.failed;
  }
  return m.guest;
}

/* Toast dari toggle() (W2a, KONTEN-04/UX-08): dibaca dari konteks
 * label layout akar supaya ikut bahasa aktif di Beranda, /cari, dan
 * halaman detail. Di luar provider (mis. navigasi) teks Indonesia
 * di bawah yang dipakai. */
const TRACKER_TOAST_DEFAULTS = {
  trackerMarked: "{name} ditandai.",
  trackerView: "Lihat",
  trackerSaveRefused:
    "Browser menolak menyimpan. Coba keluar dari mode privat.",
  trackerUnmarked: "Tanda dilepas.",
  trackerInProgress:
    "Lamaran ini sudah berprogres. Ubah dari halaman Lamaran.",
};

/* Baca/tulis memakai kunci yang sedang aktif (akun yang masuk,
 * atau kunci tamu bila belum masuk). */
function readEntries() {
  return readEntriesAt(trackerKeyFor(activeUid));
}

/* Baca entri pelacak segar dari penyimpanan (S8/C-06): dipakai
 * ekspor data sesudah menunggu sinkron, supaya entri yang baru
 * tergabung dari akun ikut — state React di closure penangan
 * unduh bisa basi sesudah await. */
export function readTrackerEntries() {
  return readEntries();
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

/* Tunggu sinkron pelacak akun selesai (S8/C-06): dipakai ekspor
 * data di /pengaturan supaya berkas tidak dibuat sebelum entri
 * akun tergabung. Bila tidak ada sinkron berjalan dan akun belum
 * pernah tergabung di sesi ini, satu upaya sinkron manual dipicu
 * (melewati jeda retry otomatis) — perangkat baru yang sinkron
 * pertamanya gagal tidak perlu menunggu retry otomatis. Selesai
 * bila akun tergabung, bila tidak ada sinkron berjalan dan
 * statusnya menetap (sinkron/tertunda), atau bila timeout
 * tercapai. Kembalikan potret status saat ini; tidak pernah
 * melempar dan tidak pernah menunggu lebih dari timeoutMs. Di
 * luar browser (SSR/tes), langsung kembalikan potret saat ini. */
export function waitForAccountSync(timeoutMs = 15_000) {
  if (typeof window === "undefined") return Promise.resolve(currentSyncInfo());
  if (activeUid && !syncRunning && syncedUid !== activeUid) {
    runFullSync(activeUid, { manual: true }).catch(() => {});
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("karir-sync-change", onChange);
      resolve(currentSyncInfo());
    };
    const timer = setTimeout(finish, timeoutMs);
    const onChange = () => {
      const info = currentSyncInfo();
      if (info.accountMerged) return finish();
      /* "mengirim" (sinkron jalan) atau "tamu" (sinkron akan
       * segera mulai dari listener auth): terus menunggu. */
      if (
        !syncRunning &&
        info.state !== "mengirim" &&
        info.state !== "tamu"
      ) {
        return finish();
      }
      /* Sinkron yang sedang jalan tidak selalu diakhiri event
       * (janjinya selesai tanpa dispatch bila gagal): cek lagi
       * saat janjinya selesai. */
      if (syncRunning) syncRunning.then(onChange, onChange);
    };
    window.addEventListener("karir-sync-change", onChange);
    onChange();
  });
}

export function useTracker() {
  const [entries, setEntries] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [syncInfo, setSyncInfo] = useState(() => currentSyncInfo());
  const [guestCount, setGuestCount] = useState(0);
  const toastLabels = useLabels(TRACKER_TOAST_DEFAULTS);

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
      setSyncInfo(currentSyncInfo());
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
            /* AKUN-10: sesi yang mati sendiri (pernah masuk, lalu
             * null tanpa keluar sengaja) diberitahukan lewat toast
             * dan penanda untuk panel akun — bukan diam-diam
             * menjadi tamu. Keluar dari tombol Keluar menandai
             * dulu, jadi tidak memicu pemberitahuan ini. */
            const wasSignedIn = Boolean(activeUid);
            const intended = consumeSignOutIntended();
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
            if (wasSignedIn && !intended) {
              markSessionEnded();
              showToast(
                "Sesi akun berakhir. Masuk lagi supaya lamaran tersimpan ke akun.",
              );
            }
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
          showToast(
            toastLabels.trackerMarked.replace("{name}", company.perusahaan),
            "/lamaran",
            toastLabels.trackerView,
          );
        } else {
          showToast(toastLabels.trackerSaveRefused);
        }
      } else if (cur.status === "Ditandai" && !cur.catatan) {
        remove(company.no);
        showToast(toastLabels.trackerUnmarked);
      } else {
        /* LAM-11: lamaran yang sudah berprogres tidak bisa dilepas
         * dari tanda — ketukan tetap memberi respons: petunjuk ke
         * halaman Lamaran, tempat statusnya bisa diubah/dihapus. */
        showToast(
          toastLabels.trackerInProgress,
          "/lamaran",
          toastLabels.trackerView,
        );
      }
    },
    [save, remove, toastLabels],
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
    /* S8/C-06: true bila pelacak akun sudah tergabung di sesi
     * ini — dipakai peringatan ekspor di /pengaturan. */
    accountMerged: syncInfo.accountMerged === true,
    waitForSync: waitForAccountSync,
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
 * niat melacak; hanya melihat halaman tidak menyimpan apa pun.
 *
 * W2a (UX-08): label diteruskan halaman detail (server) lewat props;
 * tanpa props, teks Indonesia di bawah dipakai sebagai cadangan. Nama
 * status (Ditandai, Sudah dilamar, ...) adalah kosakata data dan
 * sengaja tetap Bahasa Indonesia, sama seperti nama status perusahaan
 * di seluruh situs. */
const TRACKER_CONTROL_DEFAULTS = {
  title: "Lamaran saya",
  loading: "Memuat pelacak lamaran",
  statusLabel: "Status lamaran",
  dateLabel: "Tanggal",
  noteLabel: "Catatan",
  notePlaceholder: "Catatan untuk dirimu sendiri",
  remove: "Hapus dari lamaran",
  deleteTitle: "Hapus lamaran ini?",
  deleteMessage: "Lamaran ke {name} akan dihapus dari daftar.",
  deleteConfirm: "Ya, hapus",
  cancel: "Batal",
  close: "Tutup",
  saved: "Tersimpan di browser ini.",
  saveFailed: "Browser menolak menyimpan.",
  deleted: "Dihapus dari lamaran.",
  hint: "Ketuk satu status untuk mulai melacak perusahaan ini.",
  sync: SYNC_MESSAGES_ID,
};

export function TrackerControl({ company, labels: labelsProp }) {
  const labels = { ...TRACKER_CONTROL_DEFAULTS, ...(labelsProp || {}) };
  const { entries, loaded, syncState, syncError, save, remove } = useTracker();
  const entry = entries[String(company.no)];
  const [tanggal, setTanggal] = useState(todayLocal());
  const [catatan, setCatatan] = useState("");
  /* LAM-07: hapus butuh konfirmasi (dialog di bawah); tanpa ini
   * satu ketukan langsung menghapus lamaran tanpa jalan kembali. */
  const [confirmDelete, setConfirmDelete] = useState(false);
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
    showToast(ok ? labels.saved : labels.saveFailed);
  }

  const idx = entry ? TRACKER_STATUSES.indexOf(entry.status) : -1;
  /* UX-15: navigasi panah di radiogroup (pola ARIA radio lengkap:
   * panah memindah pilihan + fokus sekaligus — aktivasi otomatis,
   * sama dengan klik — dan roving tabindex menjaga satu tab stop). */
  const radioGroupRef = useRef(null);
  function onRadioKeyDown(e) {
    const next = rovingIndex(
      idx < 0 ? 0 : idx,
      TRACKER_STATUSES.length,
      e.key,
    );
    if (next === null) return;
    e.preventDefault();
    commit({ status: TRACKER_STATUSES[next] });
    radioGroupRef.current
      ?.querySelectorAll('[role="radio"]')[next]
      ?.focus();
  }

  return (
    <section className="panel" aria-labelledby="lamaran-h" id="lamaran">
      <h2 id="lamaran-h" className="panel-title">
        {labels.title}
      </h2>
      {!loaded ? (
        /* AKSES-16: status muat diumumkan ke pembaca layar. */
        <div
          className="skeleton"
          style={{ height: 52 }}
          role="status"
          aria-label={labels.loading}
        />
      ) : (
        <>
          <div
            className={`seg${idx < 0 ? " seg-none" : ""}`}
            role="radiogroup"
            aria-label={labels.statusLabel}
            ref={radioGroupRef}
            onKeyDown={onRadioKeyDown}
            style={{ "--n": TRACKER_STATUSES.length, "--k": Math.max(0, idx) }}
          >
            <span className="seg-thumb" aria-hidden="true" />
            {TRACKER_STATUSES.map((s, i) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={i === idx}
                tabIndex={i === (idx < 0 ? 0 : idx) ? 0 : -1}
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
                <label htmlFor="tracker-tanggal">{labels.dateLabel}</label>
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
                <label htmlFor="tracker-catatan">{labels.noteLabel}</label>
                <input
                  id="tracker-catatan"
                  type="text"
                  value={catatan}
                  maxLength={200}
                  placeholder={labels.notePlaceholder}
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
                onClick={() => setConfirmDelete(true)}
              >
                <Icon name="trash" size={16} />
                {labels.remove}
              </button>
              <ConfirmDialog
                open={confirmDelete}
                title={labels.deleteTitle}
                message={labels.deleteMessage.replace(
                  "{name}",
                  company.perusahaan,
                )}
                confirmLabel={labels.deleteConfirm}
                cancelLabel={labels.cancel}
                closeLabel={labels.close}
                onConfirm={() => {
                  setConfirmDelete(false);
                  remove(company.no);
                  showToast(labels.deleted);
                }}
                onCancel={() => setConfirmDelete(false)}
              />
            </div>
          ) : (
            <p className="hint">{labels.hint}</p>
          )}
          <p className="hint">
            {syncStatusMessage(syncState, syncError, labels.sync)}
          </p>
        </>
      )}
    </section>
  );
}
