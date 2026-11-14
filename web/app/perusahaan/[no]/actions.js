"use client";

/* Aksi di halaman detail perusahaan: bagikan tautan (menu bagikan bawaan
 * HP bila ada, kalau tidak salin) dan laporkan tautan mati. Label sudah
 * diterjemahkan di server (page.js) dan dikirim lewat props, supaya file
 * ini tidak mengimpor lib/i18n yang memakai next/headers.
 *
 * Berbagi yang berhasil tercatat sebagai event analitik "share"
 * (MKT-07); laporan dibatasi throttle per sesi (FIN-08/DET-07).
 *
 * Tombol salin kanal (CopyChannelButton) menerima label lewat props
 * dari page.js (server), sama seperti DetailActions — file ini tidak
 * mengimpor lib/i18n yang memakai next/headers. */
import { useState } from "react";
import { Icon, showToast } from "@/app/visual";
import { trackEvent } from "@/app/analytics-track";

/* ============ BLOK LOGIKA MURNI (FIN-08/DET-07) ============
 * Fungsi-fungsi di antara penanda __PURE_START__ dan __PURE_END__
 * diuji unit lewat ekstraksi sumber di lib/analytics.test.js:
 * berkas ini tidak bisa diimpor langsung oleh node:test karena
 * mengandung JSX. Blok ini WAJIB mandiri: hanya memakai global
 * standar (Number, Math, Date, Array), tanpa impor atau state lain.
 * Jangan menambah ketergantungan di dalam blok ini.
/* __PURE_START__ */

/* Throttle laporan tautan mati (FIN-08/DET-07): jeda minimum antar
 * kirim + batas jumlah kirim per sesi. Stempel waktu kirim yang
 * BERHASIL disimpan di sessionStorage — kirim gagal tidak
 * menghabiskan kuota, karena tidak ada tulis ke Firestore.
 * Throttle ini sengaja di sisi klien saja: bahasa Firestore rules
 * tidak bisa menghitung dokumen (tidak ada agregasi), jadi batas
 * laju tidak mungkin ditegakkan di rules; penjaga server sejati
 * butuh route API/Cloud Function tersendiri (di luar cakupan batch
 * ini — diputuskan koordinator/tim security bila diperlukan). */
export const REPORT_MIN_INTERVAL_MS = 60_000;
export const REPORT_MAX_PER_SESSION = 5;
export const REPORT_TIMESTAMPS_KEY = "karir-report-timestamps";

/* Periksa apakah laporan boleh dikirim sekarang. timestamps: daftar
 * stempel waktu (epoch ms) kirim berhasil di sesi ini — boleh tidak
 * terurut atau berisi nilai rusak, dibersihkan dulu. Kembalikan
 * { allowed: true } atau { allowed: false, reason, waitSeconds }
 * dengan reason "terlalu_cepat" (jeda belum 60 detik; waitSeconds =
 * sisa detik, dibulatkan ke atas) atau "batas_sesi" (sudah 5 laporan
 * di sesi ini). */
export function checkReportThrottle(timestamps, now = Date.now()) {
  const list = (Array.isArray(timestamps) ? timestamps : []).filter(
    (t) => Number.isInteger(t) && t > 0 && t <= now,
  );
  if (list.length >= REPORT_MAX_PER_SESSION) {
    return { allowed: false, reason: "batas_sesi", waitSeconds: 0 };
  }
  if (list.length > 0) {
    const last = Math.max(...list);
    const elapsed = now - last;
    if (elapsed < REPORT_MIN_INTERVAL_MS) {
      return {
        allowed: false,
        reason: "terlalu_cepat",
        waitSeconds: Math.ceil((REPORT_MIN_INTERVAL_MS - elapsed) / 1000),
      };
    }
  }
  return { allowed: true };
}

/* Tambah stempel waktu kirim berhasil ke daftar, dipangkas ke batas
 * sesi supaya penyimpanan tidak tumbuh tanpa batas. */
export function recordReportTimestamp(timestamps, now = Date.now()) {
  const list = (Array.isArray(timestamps) ? timestamps : []).filter(
    (t) => Number.isInteger(t) && t > 0 && t <= now,
  );
  list.push(now);
  return list.slice(-REPORT_MAX_PER_SESSION);
}

/* __PURE_END__ */
/* ============ AKHIR BLOK LOGIKA MURNI ============ */

/* Baca/tulis daftar stempel waktu throttle dari sessionStorage.
 * Gagal baca (data rusak, penyimpanan ditolak) berarti throttle
 * mulai dari kosong — kirim tetap jalan, tidak merusak formulir. */
function loadReportTimestamps() {
  try {
    if (typeof sessionStorage === "undefined") return [];
    const raw = sessionStorage.getItem(REPORT_TIMESTAMPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReportTimestamps(timestamps) {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(
      REPORT_TIMESTAMPS_KEY,
      JSON.stringify(timestamps),
    );
  } catch {
    /* Penyimpanan ditolak: throttle tidak bertahan antar muat
     * halaman, tapi kirim tetap jalan. */
  }
}

/* Tombol salin kecil untuk satu nilai kanal (alamat email atau nomor
 * WhatsApp) di halaman detail. Gaya sama dengan tombol bagikan
 * (btn ghost small). Event channel_copy dikirim hanya bila salin
 * berhasil; impor trackEvent dari @/app/analytics-track supaya
 * opt-out analitik berlaku. */
export function CopyChannelButton({ value, channel, companyNo, labels }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      showToast(labels.copied);
      trackEvent({
        type: "channel_copy",
        path: `/perusahaan/${companyNo}`,
        companyNo: Number(companyNo),
        action: channel,
      });
    } catch {
      showToast(labels.copyFailed);
    }
  }

  return (
    <button
      type="button"
      className="btn ghost small"
      style={{ marginLeft: 8 }}
      onClick={copy}
      aria-label={channel === "wa" ? labels.copyWa : labels.copyEmail}
    >
      {labels.copy}
    </button>
  );
}

export function DetailActions({ company, url, labels }) {
  const [alasan, setAlasan] = useState("");
  const [sent, setSent] = useState(false);
  const [reportError, setReportError] = useState(false);
  const [throttleMsg, setThrottleMsg] = useState("");
  const [sending, setSending] = useState(false);

  async function share() {
    const text = `${company.perusahaan} di Karir`;
    const path = `/perusahaan/${company.no}`;
    const companyNo = Number(company.no);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: text, text, url });
        /* Berhasil dibagikan (MKT-07): batal (AbortError) tidak
         * tercatat karena bukan berbagi. */
        trackEvent({ type: "share", path, companyNo, action: "detail" });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast(labels.copied);
      /* Salin tautan adalah jalur berbagi cadangan di perangkat tanpa
       * menu bagikan — tercatat sebagai share juga. */
      trackEvent({ type: "share", path, companyNo, action: "detail" });
    } catch {
      showToast("Tautan tidak bisa disalin otomatis. Salin alamat di bilah browser.");
    }
  }

  const waHref = `https://wa.me/?text=${encodeURIComponent(
    `${company.perusahaan} di Karir: ${url}`,
  )}`;

  async function submitReport(e) {
    e.preventDefault();
    const text = alasan.trim().slice(0, 500);
    if (!text) return;
    /* Throttle per sesi (FIN-08/DET-07): dicek SEBELUM tulis, dan
     * pesan dibatasi ditampilkan jelas ke pengguna — isi alasan
     * tidak dihapus supaya pengguna bisa mengirim lagi nanti. */
    const check = checkReportThrottle(loadReportTimestamps());
    if (!check.allowed) {
      setThrottleMsg(
        check.reason === "batas_sesi"
          ? "Batas laporan untuk sesi ini tercapai (5 laporan). Coba lagi nanti."
          : `Laporan baru saja dikirim. Tunggu ${check.waitSeconds} detik sebelum mengirim lagi.`,
      );
      return;
    }
    setSending(true);
    setReportError(false);
    setThrottleMsg("");
    try {
      /* Firebase dimuat hanya saat laporan dikirim, supaya halaman detail ringan. */
      const [{ addDoc, collection }, { db }] = await Promise.all([
        import("firebase/firestore"),
        import("@/lib/firebase"),
      ]);
      await addDoc(collection(db, "reports"), {
        no: Number(company.no),
        perusahaan: company.perusahaan,
        alasan: text,
        dibuat: new Date().toISOString(),
      });
      /* Hanya kirim BERHASIL yang dicatat ke throttle. */
      saveReportTimestamps(recordReportTimestamp(loadReportTimestamps()));
      /* Laporan berhasil terkirim: catat event report (hanya jenis
       * event + nomor perusahaan; isi alasan tidak ikut). */
      trackEvent({
        type: "report",
        path: `/perusahaan/${company.no}`,
        companyNo: Number(company.no),
        action: "tautan_mati",
      });
      setSent(true);
      setAlasan("");
    } catch {
      setReportError(true);
    }
    setSending(false);
  }

  return (
    <div className="d-actions">
      <div className="actions-row">
        <button className="btn ghost small" type="button" onClick={share}>
          <Icon name="share" size={16} />
          {labels.share}
        </button>
        <a
          className="btn ghost small"
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp
          {/* AKSES-13: beri tahu pembaca layar bahwa tautan membuka
            * tab baru. */}
          <span className="sr-only"> {labels.newTab}</span>
        </a>
      </div>

      <details className="report">
        <summary>{labels.reportHint}</summary>
        <form onSubmit={submitReport}>
          <div className="field">
            <label htmlFor="report-alasan">{labels.report}</label>
            <input
              id="report-alasan"
              type="text"
              value={alasan}
              onChange={(e) => {
                setAlasan(e.target.value.slice(0, 500));
                setThrottleMsg("");
              }}
              maxLength={500}
              required
              placeholder="Misal: halaman tidak bisa dibuka"
              autoComplete="off"
            />
          </div>
          {/* AKSES-05: hasil laporan diumumkan — terkirim sebagai
            * status, gagal sebagai alert. */}
          {sent && (
            <p className="note-line ok" role="status">
              {labels.reportSent}
            </p>
          )}
          {reportError && (
            <p className="note-line" role="alert">
              Laporan gagal terkirim. Periksa koneksi lalu coba lagi.
            </p>
          )}
          {throttleMsg && (
            <p className="note-line" role="alert">
              {throttleMsg}
            </p>
          )}
          <button className="btn small" type="submit" disabled={sending}>
            {sending ? labels.loading : labels.report}
          </button>
        </form>
      </details>
    </div>
  );
}
