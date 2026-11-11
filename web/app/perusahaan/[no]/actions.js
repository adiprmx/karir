"use client";

/* Aksi di halaman detail: bagikan tautan (menu bagikan HP bila ada, kalau
 * tidak salin) dan laporkan tautan mati ke koleksi reports. */
import { useState } from "react";
import { Icon, showToast } from "@/app/visual";

export function DetailActions({ company, url }) {
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
      showToast("Tautan disalin.");
    } catch {
      showToast("Tautan tidak bisa disalin otomatis. Salin alamat di bilah browser.");
    }
  }

  const waHref = `https://wa.me/?text=${encodeURIComponent(`${company.perusahaan} di Karir: ${url}`)}`;

  async function submitReport(e) {
    e.preventDefault();
    const text = alasan.trim().slice(0, 500);
    if (!text) return;
    setSending(true);
    setReportError(false);
    try {
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
      setSent(true);
      setAlasan("");
    } catch {
      setReportError(true);
    }
    setSending(false);
  }

  return (
    <>
      <div className="actions">
        <button className="btn ghost small" type="button" onClick={share}>
          <Icon name="share" size={18} />
          Bagikan
        </button>
        <a className="btn ghost small" href={waHref} target="_blank" rel="noopener noreferrer">
          Kirim ke WhatsApp
        </a>
      </div>
      <details className="report" style={{ flexBasis: "100%" }}>
        <summary>Laporkan tautan mati atau data yang salah</summary>
        <form onSubmit={submitReport}>
          <div className="field">
            <label htmlFor="report-alasan">Apa yang salah?</label>
            <input id="report-alasan" type="text" value={alasan} onChange={(e) => setAlasan(e.target.value.slice(0, 500))} maxLength={500} required placeholder="Misalnya: halaman tidak bisa dibuka" autoComplete="off" />
          </div>
          {sent && (
            <p className="note ok" role="status">
              <Icon name="check" size={18} />
              Laporan terkirim. Terima kasih.
            </p>
          )}
          {reportError && (
            <p className="note" role="alert">
              <Icon name="alert" size={18} />
              Laporan gagal terkirim. Periksa koneksi lalu coba lagi.
            </p>
          )}
          <button className="btn small" type="submit" disabled={sending}>
            {sending ? "Mengirim..." : "Kirim laporan"}
          </button>
        </form>
      </details>
    </>
  );
}
