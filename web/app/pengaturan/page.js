"use client";

/* Pengaturan Karir: lihat dan hapus data lokal yang tersimpan di browser,
 * lihat ringkasan akun, unduh salinan data, dan hapus semua data.
 * Masuk akun itu pilihan: yang masuk bisa menyimpan tanda lamaran di
 * akun, yang tidak masuk tetap memakai semua fitur dengan data di
 * browser saja. Enam kunci localStorage:
 * "karir-onboarding" (pilihan domisili dan posisi),
 * "karir-lamaran" (lamaran yang dilacak),
 * "karir-recent-search" (pencarian terakhir),
 * "karir-visitor" (nomor acak pengunjung),
 * "karir-theme" (pilihan tema terang atau gelap),
 * "karir-visited-metode" (sudah pernah membuka halaman Metode).
 * "Hapus semua data" menghapus keenamnya, dan bila sedang masuk ikut
 * menghapus tanda lamaran di akun. Akunnya sendiri tidak ikut
 * terhapus; menutup akun diminta lewat Issues di repo GitHub.
 * Kunci ketujuh, "karir-tanpa-analitik" (pilihan menolak pencatatan
 * kunjungan), SENGAJA tidak ikut dihapus "Hapus semua data":
 * menghapusnya berarti diam-diam mengaktifkan lagi pencatatan yang
 * sudah ditolak pemilik browser. Pilihan itu diubah lewat toggle
 * di halaman ini. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { clearOnboarding, useOnboarding } from "@/app/onboarding";
import {
  clearAllTrackerStorage,
  readTrackerEntries,
  todayLocal,
  useTracker,
} from "@/app/tracker";
import { clearRecentSearch, loadRecentSearch } from "@/app/recent";
import { Icon, showToast } from "@/app/visual";
import InstallPrompt from "@/app/install-prompt";
import { useLabels } from "@/app/labels-provider";
import { useAuthUser } from "@/app/auth-panel";
import {
  isAnalyticsOptedOut,
  setAnalyticsOptOut,
} from "@/app/analytics-track";
import {
  getPushStatus,
  resubscribePush,
  subscribePush,
  unsubscribePush,
} from "@/app/push-client";
import {
  VISITOR_KEY,
  buildAccountExport,
  clearLocalData,
  exportSyncNote,
  sendVerificationEmail,
} from "@/lib/account-data";
import {
  deleteTracker,
  pruneTombstones,
  readTombstones,
  recordTombstone,
  writeTombstones,
} from "@/lib/tracker-sync";

/* Hapus semua kunci pelacak (tamu + semua akun) memakai fungsi dari
 * tracker.js (T3, AKUN-06): kunci per akun tidak akan tertinggal.
 * Tombstone sengaja TIDAK dipertahankan di sini. Antrean hapus
 * dicatat ulang di bawah, setelah kunci dibersihkan, supaya tidak
 * ikut terhapus. */

function readStored(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function Row({ title, children, action }) {
  return (
    <div className="set-row">
      <div>
        <p className="label">{title}</p>
        {children}
      </div>
      {action}
    </div>
  );
}

/* Label halaman (W2a, UX-08): diteruskan layout rute lewat konteks;
 * nilai di bawah adalah cadangan Bahasa Indonesia bila halaman
 * dipakai di luar provider. Kunci invalidEmail..verifySent adalah
 * pesan lib/account-data.js untuk sendVerificationEmail. */
const DEFAULT_LABELS = {
  title: "Pengaturan",
  lede: "Yang tersimpan di browser ini, dan cara menghapusnya.",
  loading: "Memuat pengaturan",
  browserData: "Data di browser",
  choices: "Pilihanmu",
  noChoices: "Belum ada pilihan tersimpan.",
  deleteChoices: "Hapus pilihan domisili dan posisi",
  delete: "Hapus",
  tracked: "Lamaran yang dilacak",
  noTracked: "Belum ada lamaran yang dilacak.",
  trackedCount: "{n} lamaran dilacak.",
  deleteAllTracked: "Hapus semua lamaran yang dilacak",
  deleteAll: "Hapus semua",
  recentSearch: "Pencarian terakhir",
  noRecent: "Belum ada pencarian tersimpan.",
  deleteRecent: "Hapus pencarian terakhir",
  visitorNo: "Nomor pengunjung",
  visitorHint:
    "Nomor acak yang dibuat browser ini untuk menghitung pengunjung tanpa nama. Nomor ini ikut terkirim bersama catatan kunjungan, tanpa nama dan tanpa alamat email. Menghapusnya membuat nomor baru saat kamu berkunjung lagi.",
  noVisitor: "Belum ada nomor pengunjung.",
  deleteVisitor: "Hapus nomor pengunjung",
  visitRecords: "Catatan kunjungan",
  optOut: "Jangan catat kunjungan saya",
  optOutHint:
    "Bila dicentang, kunjunganmu tidak dicatat sama sekali: halaman yang dibuka, kata yang dicari, dan klik lamar tidak terkirim. Pilihan ini hanya berlaku di browser ini. Catatan yang sudah terkirim sebelumnya tidak ikut terhapus, dan terhapus sendiri setelah 90 hari. Yang dicatat dan yang tidak dicatat ada di halaman ",
  optOutHintAfter: ".",
  privacyPolicy: "Kebijakan Privasi",
  account: "Akun",
  signedInAs: "Masuk sebagai",
  emailVerified: "Email sudah terverifikasi.",
  emailNotVerified:
    "Email belum terverifikasi. Ketuk tautan di email verifikasi supaya akun ini dikenali sebagai milikmu.",
  verifyEmail: "Verifikasi email",
  verifyHint:
    "Email verifikasi dikirim saat daftar. Bila tidak sampai, kirim ulang dari sini.",
  sending: "Mengirim…",
  resendEmail: "Kirim ulang email",
  checkAgain: "Periksa lagi",
  verifyStillNot:
    "Email masih belum terverifikasi. Ketuk tautan di email yang dikirim, lalu periksa lagi.",
  verifyCheckFailed:
    "Status verifikasi belum bisa diperiksa. Coba lagi sebentar lagi.",
  closeAccount: "Tutup akun",
  askOnGithub: "Minta di GitHub",
  newTab: "(membuka tab baru)",
  closeHint:
    "Menutup akun belum bisa dari situs. Minta lewat Issues di repo GitHub, pengelola akan menghapus akun dan datanya.",
  notSignedIn:
    "Kamu belum masuk. Masuk itu pilihan, semua fitur tetap bisa dipakai tanpa masuk. Buka menu untuk masuk atau daftar.",
  downloadData: "Unduh data",
  downloadMine: "Unduh dataku",
  downloadHint:
    "Salinan datamu dalam satu berkas JSON: profil akun, tanda lamaran, catatan kunjungan bila kamu masuk, dan pengaturan di browser ini. Berkas dibuat di perangkatmu, tidak dikirim ke mana pun.",
  downloadJson: "Unduh data (JSON)",
  downloadSyncWaiting:
    "Sinkron dengan akun belum selesai. Unduhan menunggu sinkron sebentar supaya semua tanda lamaran ikut.",
  downloading: "Menyiapkan…",
  wipeAll: "Hapus semua data",
  wipeHint:
    "Menghapus semua data di atas dari browser ini. Bila kamu masuk, tanda lamaran di akun ikut dihapus. Akunnya sendiri tetap ada. Menghapus tidak bisa dibatalkan.",
  confirmWipeAll: "Ya, hapus semuanya",
  wipeAllBtn: "Hapus semua dataku",
  toastTrackedDeleted: "Semua lamaran dihapus.",
  toastVisitorDeleted: "Nomor pengunjung dihapus.",
  toastChoicesDeleted: "Pilihan dihapus.",
  toastRecentDeleted: "Pencarian terakhir dihapus.",
  toastOptOutOn: "Kunjunganmu tidak dicatat lagi.",
  toastOptOutOff: "Kunjunganmu dicatat lagi.",
  toastDownloaded: "Data sudah diunduh.",
  toastWiped: "Semua data di browser ini dihapus.",
  toastWipedAccount:
    "Semua data di browser ini dihapus, dan tanda lamaran di akun ikut dihapus.",
  /* T10 (notifikasi web push). */
  pushTitle: "Notifikasi",
  pushHint:
    "Kabari saya saat ada lowongan baru, langsung di perangkat ini. Paling banyak satu pesan sehari, dan hanya saat ada yang baru.",
  pushEnable: "Aktifkan notifikasi",
  pushDisable: "Matikan notifikasi",
  pushActive: "Notifikasi aktif di browser ini.",
  pushStaleKey:
    "Notifikasi perlu diaktifkan ulang supaya lowongan baru tetap sampai ke perangkat ini.",
  pushReEnable: "Aktifkan ulang notifikasi",
  pushNeedSignIn: "Masuk dulu untuk mengaktifkan notifikasi.",
  pushUnsupported: "Browser ini tidak mendukung notifikasi.",
  pushDenied:
    "Izin notifikasi ditolak di browser ini. Aktifkan lagi dari pengaturan browser, lalu kembali ke sini.",
  pushBusy: "Memproses…",
  pushEnabled: "Notifikasi diaktifkan.",
  pushDisabled: "Notifikasi dimatikan.",
  pushFailed: "Notifikasi belum bisa diaktifkan. Coba lagi sebentar lagi.",
  pushUnsubFailed:
    "Notifikasi belum bisa dimatikan. Coba lagi sebentar lagi.",
  deleteConfirm: "Ya, hapus",
  cancel: "Batal",
  close: "Tutup",
  install: {
    title: "Pasang aplikasi",
    hint: "Buka Karir langsung dari layar utama, tanpa membuka browser dulu. Ukurannya kecil dan tidak mengubah apa pun di data yang tersimpan.",
    installing: "Memasang…",
    install: "Pasang aplikasi",
    later: "Nanti saja",
  },
  invalidEmail: "Alamat email tidak dikenal. Periksa lagi tulisannya.",
  wrongCredentials: "Email atau kata sandi salah.",
  cannotRegister: "Tidak bisa mendaftar sekarang. Coba lagi sebentar lagi.",
  weakPassword: "Kata sandi terlalu pendek, minimal 6 huruf.",
  tooManyRequests: "Terlalu sering mencoba. Tunggu sebentar lalu coba lagi.",
  noConnection: "Tidak ada koneksi. Periksa internet lalu coba lagi.",
  cannotSignIn: "Tidak bisa masuk sekarang. Coba lagi sebentar lagi.",
  resetSent:
    "Tautan untuk membuat kata sandi baru sudah dikirim ke email itu. Periksa kotak masuk, lalu ikuti tautannya.",
  cannotSendReset:
    "Tidak bisa mengirim tautan sekarang. Coba lagi sebentar lagi.",
  noAccount: "Tidak ada akun yang masuk.",
  verifySent:
    "Email verifikasi sudah dikirim. Buka email itu, ketuk tautannya, lalu tekan Periksa lagi.",
};

export default function Pengaturan() {
  const labels = useLabels(DEFAULT_LABELS);
  const {
    data: onboarding,
    loaded: onboardingLoaded,
    clear: clearChoices,
  } = useOnboarding();
  const {
    entries,
    loaded: trackerLoaded,
    accountMerged,
    waitForSync,
  } = useTracker();
  const user = useAuthUser();
  const [recent, setRecent] = useState(null);
  const [recentReady, setRecentReady] = useState(false);
  const [visitorId, setVisitorId] = useState(null);
  const [optedOut, setOptedOut] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  /* AKSES-04: konfirmasi dua langkah per baris (null = tidak ada yang
   * dikonfirmasi) — pola yang sama dengan "Hapus semua data". */
  const [confirmKey, setConfirmKey] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [accountMsg, setAccountMsg] = useState("");
  const [, setVerifyChecked] = useState(0);
  /* T10 (notifikasi web push): "memuat" | "unsupported" | "denied" |
   * "active" | "stale-key" | "inactive" (lihat app/push-client.js
   * getPushStatus; "stale-key" = kunci server sudah berganti dan
   * langganan ini perlu diaktifkan ulang — P-07/K5). */
  const [pushStatus, setPushStatus] = useState("memuat");
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    /* Baca awal dijadwalkan sebagai microtask: setState di dalam
     * callback, bukan sinkron di badan effect. */
    queueMicrotask(() => {
      setRecent(loadRecentSearch());
      setRecentReady(true);
      setVisitorId(readStored(VISITOR_KEY));
      setOptedOut(isAnalyticsOptedOut());
    });
    const onChange = () => {
      setRecent(loadRecentSearch());
      setVisitorId(readStored(VISITOR_KEY));
    };
    window.addEventListener("karir-recent-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("karir-recent-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  /* T10: baca status langganan push saat halaman dimuat dan saat
   * akun berubah. Hanya membaca — tidak mendaftarkan service
   * worker dan tidak meminta izin (itu hanya dari ketukan tombol). */
  useEffect(() => {
    let cancelled = false;
    getPushStatus()
      .then((status) => {
        if (!cancelled) setPushStatus(status);
      })
      .catch(() => {
        if (!cancelled) setPushStatus("inactive");
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const trackedCount = Object.keys(entries || {}).length;
  const loaded = onboardingLoaded && trackerLoaded && recentReady;
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

  /* Hapus lamaran dari akun bila sedang masuk. Berjalan di latar
   * belakang; bila gagal (mis. offline), tombstone yang sudah
   * dicatat menjamin sinkron berikutnya menghapusnya. Pola yang
   * sama dengan halaman Lamaran. */
  async function deleteTrackedFromAccount(nos) {
    if (!nos.length) return;
    try {
      const { auth } = await import("@/lib/firebase");
      const uid = auth && auth.currentUser ? auth.currentUser.uid : null;
      if (!uid) return;
      const results = await Promise.allSettled(
        nos.map((no) => deleteTracker(uid, no)),
      );
      const succeeded = nos.filter(
        (_, i) =>
          results[i].status === "fulfilled" &&
          results[i].value &&
          results[i].value.ok,
      );
      if (succeeded.length) {
        writeTombstones(
          pruneTombstones(readTombstones(uid), succeeded.map(String)),
          uid,
        );
      }
    } catch {
      /* Tombstone menjamin sinkron berikutnya menghapusnya. */
    }
  }

  function clearAllTrackedEverywhere() {
    const nos = Object.keys(entries || {});
    const uid = user ? user.uid : null;
    /* Urutan penting (integrasi T3/T4): bersihkan dulu semua kunci
     * pelacak, baru catat tombstone per akun. Bila dibalik,
     * pembersihan ikut menghapus antrean hapusnya. */
    clearAllTrackerStorage();
    nos.forEach((no) => recordTombstone(no, uid));
    deleteTrackedFromAccount(nos);
    showToast(labels.toastTrackedDeleted);
  }

  function clearVisitor() {
    try {
      window.localStorage.removeItem(VISITOR_KEY);
    } catch {
      /* Abaikan. */
    }
    setVisitorId(null);
    showToast(labels.toastVisitorDeleted);
  }

  /* AKSES-04 + AKSES-05: aksi hapus yang dikonfirmasi (dipanggil
   * tombol "Ya, hapus" di tiap baris). Dua aksi yang sebelumnya
   * diam — hapus pilihan dan hapus pencarian — ikut diumumkan
   * lewat toast, seperti dua aksi lainnya. */
  function clearChoicesConfirmed() {
    clearChoices();
    setConfirmKey(null);
    showToast(labels.toastChoicesDeleted);
  }

  function clearRecentConfirmed() {
    clearRecentSearch();
    setConfirmKey(null);
    showToast(labels.toastRecentDeleted);
  }

  function clearTrackedConfirmed() {
    clearAllTrackedEverywhere();
    setConfirmKey(null);
  }

  function clearVisitorConfirmed() {
    clearVisitor();
    setConfirmKey(null);
  }

  /* Toggle opt-out analitik (ANALITIK-11): bila aktif, tidak ada
   * event kunjungan apa pun yang dikirim dari browser ini. Pilihan
   * ini hanya berlaku di browser ini dan tidak menghapus catatan
   * kunjungan yang sudah terkirim sebelumnya. */
  function toggleOptOut() {
    const next = !optedOut;
    setAnalyticsOptOut(next);
    setOptedOut(next);
    showToast(next ? labels.toastOptOutOn : labels.toastOptOutOff);
  }

  /* Unduh salinan data sebagai berkas JSON. Berkas dibuat di
   * perangkat ini, tidak dikirim ke mana pun.
   *
   * S8/C-06: bila masuk akun, tunggu dulu sinkron pelacak akun
   * selesai (maks 15 detik) supaya entri dari akun ikut — di
   * perangkat baru, unduh sebelum sinkron selesai akan
   * kehilangan entri yang hanya ada di akun. Bila sinkron
   * tetap belum selesai, ekspor tetap jalan dengan catatan di
   * dalam berkas. Entri dibaca segar sesudah menunggu (bukan
   * dari state React yang bisa basi sesudah await).
   *
   * S8/C-05: bila masuk akun, catatan kunjungan milik akun ini
   * ikut diambil dari /api/akun/export dan digabung ke berkas.
   * Bila pengambilan gagal (offline, token kedaluwarsa, server
   * sibuk), ekspor tetap jalan tanpa catatan kunjungan, dengan
   * catatan di dalam berkas. */
  async function exportData() {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      let syncInfo = null;
      if (user) {
        try {
          syncInfo = await waitForSync(15_000);
        } catch {
          syncInfo = null;
        }
      }
      let analyticsEvents = null;
      let analyticsFailed = false;
      if (user) {
        try {
          const idToken = await user.getIdToken();
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15_000);
          try {
            const res = await fetch("/api/akun/export", {
              headers: { Authorization: `Bearer ${idToken}` },
              signal: controller.signal,
            });
            if (res.ok) {
              const body = await res.json();
              analyticsEvents = Array.isArray(body.events)
                ? body.events
                : [];
            } else {
              analyticsFailed = true;
            }
          } finally {
            clearTimeout(timer);
          }
        } catch {
          analyticsFailed = true;
        }
      }
      const notes = [];
      const syncNote = exportSyncNote({
        signedIn: Boolean(user),
        accountMerged: syncInfo
          ? syncInfo.accountMerged === true
          : accountMerged,
      });
      if (syncNote) notes.push(syncNote);
      if (analyticsFailed) {
        notes.push(
          "Catatan kunjungan tidak bisa diambil saat ini, jadi " +
            "tidak ikut dalam berkas ini. Coba unduh lagi nanti.",
        );
      }
      const data = buildAccountExport({
        profile: user
          ? {
              email: user.email,
              displayName: user.displayName,
              emailVerified: user.emailVerified,
            }
          : null,
        trackers: readTrackerEntries(),
        onboarding: onboarding || null,
        recentSearch: recent || null,
        theme: readStored("karir-theme"),
        visitorId: readStored(VISITOR_KEY),
        analyticsEvents,
        catatanEkspor: notes.length ? notes.join(" ") : null,
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `karir-data-saya-${todayLocal()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast(labels.toastDownloaded);
    } finally {
      setExportBusy(false);
    }
  }

  async function resendVerification() {
    if (!user) return;
    setAccountMsg("");
    setVerifyBusy(true);
    const result = await sendVerificationEmail(user, labels);
    setAccountMsg(result.message);
    setVerifyBusy(false);
  }

  async function recheckVerification() {
    if (!user) return;
    setAccountMsg("");
    setVerifyBusy(true);
    try {
      await user.reload();
      setVerifyChecked((n) => n + 1);
      setAccountMsg(
        user.emailVerified ? labels.emailVerified : labels.verifyStillNot,
      );
    } catch {
      setAccountMsg(labels.verifyCheckFailed);
    }
    setVerifyBusy(false);
  }

  /* T10: aktifkan / matikan notifikasi push. Status dibaca ulang
   * sesudah tiap aksi supaya yang tampil selalu jujur (tidak
   * pura-pura aktif bila subscribe gagal). Bila izin ditolak,
   * panel sendiri yang menjelaskan (baris pushDenied) — tidak
   * ada toast tambahan. */
  async function enablePush() {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const result = await subscribePush();
      const status = await getPushStatus().catch(() => "inactive");
      setPushStatus(status);
      if (result.ok) {
        showToast(labels.pushEnabled);
      } else if (result.code !== "ditolak") {
        showToast(labels.pushFailed);
      }
    } finally {
      setPushBusy(false);
    }
  }

  /* P-07/K5: aktifkan ulang sesudah kunci server berganti
   * (status "stale-key") — pola yang sama dengan enablePush,
   * memakai resubscribePush (batalkan langganan lama lalu
   * subscribe baru dengan kunci saat ini). */
  async function enablePushAgain() {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const result = await resubscribePush();
      const status = await getPushStatus().catch(() => "inactive");
      setPushStatus(status);
      if (result.ok) {
        showToast(labels.pushEnabled);
      } else if (result.code !== "ditolak") {
        showToast(labels.pushFailed);
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const result = await unsubscribePush();
      const status = await getPushStatus().catch(() => "inactive");
      setPushStatus(status);
      showToast(result.ok ? labels.pushDisabled : labels.pushUnsubFailed);
    } finally {
      setPushBusy(false);
    }
  }

  function wipeAll() {
    const nos = Object.keys(entries || {});
    const uid = user ? user.uid : null;
    const hadAccountTrackers = Boolean(user) && nos.length > 0;
    /* Urutan penting (integrasi T3/T4): bersihkan dulu semua kunci
     * pelacak (tamu + semua akun), baru catat tombstone per akun.
     * bila dibalik, pembersihan ikut menghapus antrean hapusnya.
     * Tombstone yang dicatat di sini dipertahankan supaya sinkron
     * berikutnya tetap menghapus tanda di akun bila hapus gagal. */
    clearAllTrackerStorage();
    nos.forEach((no) => recordTombstone(no, uid));
    clearOnboarding();
    clearRecentSearch();
    /* clearLocalData menghapus keenam kunci, termasuk tiga kunci
     * yang tidak punya tombol hapus sendiri (nomor pengunjung,
     * tema, sudah-baca-metode). Kunci pelacak sudah dibersihkan
     * di atas, jadi bagiannya di sini tidak berpengaruh. */
    clearLocalData(window.localStorage);
    setVisitorId(null);
    deleteTrackedFromAccount(nos);
    setConfirmAll(false);
    showToast(
      hadAccountTrackers ? labels.toastWipedAccount : labels.toastWiped,
    );
  }

  return (
    <div className="wrap narrow">
      <div className="page-head">
        <h1>{labels.title}</h1>
        <p className="lede">{labels.lede}</p>
      </div>
      {/* AKSES-02: pesan jujur tanpa JavaScript — halaman ini membaca
        * dan menghapus data dari browser, jadi tidak bisa jalan
        * tanpa JavaScript. Teks di dalam noscript sengaja tetap
        * Indonesia: tanpa JavaScript konteks bahasa tidak bisa
        * dibaca (W2a). */}
      <noscript>
        <p className="note-line">
          <Icon name="info" size={16} />
          Halaman ini butuh JavaScript untuk menampilkan dan mengelola
          pengaturanmu. Aktifkan JavaScript, lalu muat ulang halaman ini.
        </p>
      </noscript>

      {!loaded ? (
        /* AKSES-16: status muat diumumkan ke pembaca layar. */
        <div
          className="skeleton"
          style={{ height: 200 }}
          role="status"
          aria-label={labels.loading}
        />
      ) : (
        <section className="panel settings" aria-label={labels.browserData}>
          <Row
            title={labels.choices}
            action={
              onboarding &&
              (confirmKey === "pilihan" ? (
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn small warn-btn"
                    onClick={clearChoicesConfirmed}
                  >
                    {labels.deleteConfirm}
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => setConfirmKey(null)}
                  >
                    {labels.cancel}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn ghost small"
                  aria-label={labels.deleteChoices}
                  onClick={() => setConfirmKey("pilihan")}
                >
                  <Icon name="trash" size={16} />
                  {labels.delete}
                </button>
              ))
            }
          >
            {onboarding ? (
              <p>
                {onboarding.domisili} · {onboarding.posisi}
              </p>
            ) : (
              <p className="hint">{labels.noChoices}</p>
            )}
          </Row>
          <Row
            title={labels.tracked}
            action={
              trackedCount > 0 &&
              (confirmKey === "lamaran" ? (
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn small warn-btn"
                    onClick={clearTrackedConfirmed}
                  >
                    {labels.deleteConfirm}
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => setConfirmKey(null)}
                  >
                    {labels.cancel}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn ghost small"
                  aria-label={labels.deleteAllTracked}
                  onClick={() => setConfirmKey("lamaran")}
                >
                  <Icon name="trash" size={16} />
                  {labels.deleteAll}
                </button>
              ))
            }
          >
            {trackedCount === 0 ? (
              <p className="hint">{labels.noTracked}</p>
            ) : (
              <p>{labels.trackedCount.replace("{n}", String(trackedCount))}</p>
            )}
          </Row>
          <Row
            title={labels.recentSearch}
            action={
              recent &&
              recentParts.length > 0 &&
              (confirmKey === "pencarian" ? (
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn small warn-btn"
                    onClick={clearRecentConfirmed}
                  >
                    {labels.deleteConfirm}
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => setConfirmKey(null)}
                  >
                    {labels.cancel}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn ghost small"
                  aria-label={labels.deleteRecent}
                  onClick={() => setConfirmKey("pencarian")}
                >
                  <Icon name="trash" size={16} />
                  {labels.delete}
                </button>
              ))
            }
          >
            {recent && recentParts.length > 0 ? (
              <p>
                <Link href={recentHref}>{recentParts.join(" + ")}</Link>
              </p>
            ) : (
              <p className="hint">{labels.noRecent}</p>
            )}
          </Row>
          <Row
            title={labels.visitorNo}
            action={
              visitorId &&
              (confirmKey === "pengunjung" ? (
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn small warn-btn"
                    onClick={clearVisitorConfirmed}
                  >
                    {labels.deleteConfirm}
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => setConfirmKey(null)}
                  >
                    {labels.cancel}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn ghost small"
                  aria-label={labels.deleteVisitor}
                  onClick={() => setConfirmKey("pengunjung")}
                >
                  <Icon name="trash" size={16} />
                  {labels.delete}
                </button>
              ))
            }
          >
            {visitorId ? (
              <p className="hint">{labels.visitorHint}</p>
            ) : (
              <p className="hint">{labels.noVisitor}</p>
            )}
          </Row>
          <Row title={labels.visitRecords}>
            <label
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={optedOut}
                onChange={toggleOptOut}
              />
              {labels.optOut}
            </label>
            <p className="hint">
              {labels.optOutHint}
              <Link href="/privasi">{labels.privacyPolicy}</Link>
              {labels.optOutHintAfter}
            </p>
          </Row>
        </section>
      )}

      <section className="panel settings" aria-label={labels.account}>
        {user ? (
          <>
            <Row title={labels.account}>
              <p>
                {labels.signedInAs} <strong>{user.email}</strong>
                {user.displayName ? ` (${user.displayName})` : ""}
              </p>
              {user.emailVerified ? (
                <p className="hint">{labels.emailVerified}</p>
              ) : (
                <p className="hint">{labels.emailNotVerified}</p>
              )}
            </Row>
            {!user.emailVerified && (
              <Row title={labels.verifyEmail}>
                <p className="hint">{labels.verifyHint}</p>
                <div className="actions-row">
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={resendVerification}
                    disabled={verifyBusy}
                  >
                    {verifyBusy ? labels.sending : labels.resendEmail}
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={recheckVerification}
                    disabled={verifyBusy}
                  >
                    {labels.checkAgain}
                  </button>
                </div>
              </Row>
            )}
            {/* AKSES-16: hasil kirim ulang/periksa verifikasi diumumkan. */}
            {accountMsg && (
              <p className="notice" role="status">
                {accountMsg}
              </p>
            )}
            <Row
              title={labels.closeAccount}
              action={
                <a
                  className="btn ghost small"
                  href="https://github.com/adiprmx/karir/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {labels.askOnGithub}
                  {/* AKSES-13: beri tahu pembaca layar bahwa tautan
                    * membuka tab baru. */}
                  <span className="sr-only"> {labels.newTab}</span>
                </a>
              }
            >
              <p className="hint">{labels.closeHint}</p>
            </Row>
          </>
        ) : (
          <Row title={labels.account}>
            <p className="hint">{labels.notSignedIn}</p>
          </Row>
        )}
      </section>

      {/* T10: notifikasi web push. Langganan terikat akun, jadi
        * tamu hanya melihat petunjuk masuk. Izin hanya diminta
        * dari ketukan tombol "Aktifkan notifikasi" — tidak ada
        * auto-prompt saat halaman dibuka. */}
      <section className="panel settings" aria-label={labels.pushTitle}>
        <Row
          title={labels.pushTitle}
          action={
            user && pushStatus === "active" ? (
              <button
                type="button"
                className="btn ghost small"
                onClick={disablePush}
                disabled={pushBusy}
              >
                {pushBusy ? labels.pushBusy : labels.pushDisable}
              </button>
            ) : user && pushStatus === "stale-key" ? (
              <button
                type="button"
                className="btn small"
                onClick={enablePushAgain}
                disabled={pushBusy}
              >
                {pushBusy ? labels.pushBusy : labels.pushReEnable}
              </button>
            ) : user && pushStatus === "inactive" ? (
              <button
                type="button"
                className="btn small"
                onClick={enablePush}
                disabled={pushBusy}
              >
                {pushBusy ? labels.pushBusy : labels.pushEnable}
              </button>
            ) : null
          }
        >
          {pushStatus === "memuat" ? (
            <p className="hint">{labels.pushHint}</p>
          ) : !user ? (
            <p className="hint">{labels.pushNeedSignIn}</p>
          ) : pushStatus === "unsupported" ? (
            <p className="hint">{labels.pushUnsupported}</p>
          ) : pushStatus === "denied" ? (
            <p className="hint">{labels.pushDenied}</p>
          ) : pushStatus === "active" ? (
            <p>{labels.pushActive}</p>
          ) : pushStatus === "stale-key" ? (
            <p>{labels.pushStaleKey}</p>
          ) : (
            <p className="hint">{labels.pushHint}</p>
          )}
        </Row>
      </section>

      {/* MKT-08: kartu pasang aplikasi — hanya tampil bila browser
        * menawarkan pemasangan dan belum pernah ditutup. */}
      <InstallPrompt labels={labels.install} />

      <section className="panel" aria-label={labels.downloadData}>
        <p className="label">{labels.downloadMine}</p>
        <p className="hint">{labels.downloadHint}</p>
        {user && !accountMerged ? (
          <p className="hint">{labels.downloadSyncWaiting}</p>
        ) : null}
        <div className="actions-row">
          <button
            type="button"
            className="btn"
            onClick={exportData}
            disabled={exportBusy}
          >
            {exportBusy ? labels.downloading : labels.downloadJson}
          </button>
        </div>
      </section>

      <section className="panel danger" aria-label={labels.wipeAll}>
        <p className="label">{labels.wipeAll}</p>
        <p className="hint">{labels.wipeHint}</p>
        {confirmAll ? (
          <div className="actions-row">
            <button type="button" className="btn warn-btn" onClick={wipeAll}>
              {labels.confirmWipeAll}
            </button>
            <button type="button" className="btn ghost" onClick={() => setConfirmAll(false)}>
              {labels.cancel}
            </button>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirmAll(true)}>
            {labels.wipeAllBtn}
          </button>
        )}
      </section>
    </div>
  );
}
