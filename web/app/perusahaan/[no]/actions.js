"use client";

/* Aksi di halaman detail perusahaan: bagikan tautan (menu bagikan bawaan
 * HP bila ada, kalau tidak salin) dan laporkan tautan mati. Label sudah
 * diterjemahkan di server (page.js) dan dikirim lewat props, supaya file
 * ini tidak mengimpor lib/i18n yang memakai next/headers.
 *
 * Tombol salin kanal (CopyChannelButton) menerima label lewat props
 * dari page.js (server), sama seperti DetailActions — file ini tidak
 * mengimpor lib/i18n yang memakai next/headers. */
import { useState } from "react";
import { Icon, showToast } from "@/app/visual";
import { trackEvent } from "@/app/analytics-track";

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
  const [sending, setSending] = useState(false);

  async function share() {
    const text = `${company.perusahaan} di Karir`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: text, text, url });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast(labels.copied);
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
    setSending(true);
    setReportError(false);
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
              onChange={(e) => setAlasan(e.target.value.slice(0, 500))}
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
          <button className="btn small" type="submit" disabled={sending}>
            {sending ? labels.loading : labels.report}
          </button>
        </form>
      </details>
    </div>
  );
}
