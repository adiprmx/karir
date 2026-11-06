"use client";

/* Aksi di halaman detail perusahaan: bagikan tautan dan laporkan
 * tautan mati. Label sudah diterjemahkan di server (page.js) dan
 * dikirim lewat props, supaya file ini tidak mengimpor lib/i18n
 * yang memakai next/headers (khusus server). */
import { useEffect, useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function DetailActions({ company, url, labels }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [sent, setSent] = useState(false);
  const [reportError, setReportError] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(id);
  }, [copied]);

  async function copyLink() {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopyFailed(true);
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
      await addDoc(collection(db, "reports"), {
        no: Number(company.no),
        perusahaan: company.perusahaan,
        alasan: text,
        dibuat: new Date().toISOString(),
      });
      setSent(true);
      setAlasan("");
    } catch {
      setReportError(true);
    }
    setSending(false);
  }

  return (
    <div>
      <div className="filter-actions">
        <button className="btn ghost" type="button" onClick={copyLink}>
          {labels.share}
        </button>
        <a
          className="btn ghost"
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp
        </a>
      </div>
      {copied && <p className="notice">{labels.copied}</p>}
      {copyFailed && (
        <p className="notice">
          Tautan tidak bisa disalin otomatis. Salin alamat di bilah browser.
        </p>
      )}

      <form className="filters" onSubmit={submitReport}>
        <fieldset>
          <legend>{labels.report}</legend>
          <input
            type="text"
            value={alasan}
            onChange={(e) => setAlasan(e.target.value.slice(0, 500))}
            maxLength={500}
            required
            placeholder="Misal: halaman tidak bisa dibuka"
            autoComplete="off"
          />
        </fieldset>
        {sent && <p className="notice">{labels.reportSent}</p>}
        {reportError && (
          <p className="notice">
            Laporan gagal terkirim. Periksa koneksi lalu coba lagi.
          </p>
        )}
        <div className="filter-actions">
          <button className="btn" type="submit" disabled={sending}>
            {sending ? labels.loading : labels.report}
          </button>
        </div>
      </form>
    </div>
  );
}
