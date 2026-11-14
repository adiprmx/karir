"use client";

/* Seksi Jejak perubahan panel admin (FE-18, dipindah dari page.js):
 * 10 perubahan terakhir yang dicatat panel. Dimuat hanya bila
 * dibuka, supaya hemat kuota baca. */

import { formatTime } from "./admin-helpers";

export default function AuditSection({ auditOpen, auditEntries, auditError, onOpen }) {
  return (
    <div className="filters" style={{ marginTop: 24 }}>
      <p className="section-label">Jejak perubahan</p>
      <p className="section-note">
        10 perubahan terakhir yang dicatat panel ini. Dimuat hanya bila
        dibuka, supaya hemat kuota baca.
      </p>
      {!auditOpen ? (
        <button
          type="button"
          className="btn ghost"
          onClick={onOpen}
        >
          Tampilkan jejak perubahan
        </button>
      ) : (
        <>
          {auditError && <p className="notice">{auditError}</p>}
          {auditEntries.length === 0 && !auditError ? (
            <p className="notice">Belum ada perubahan yang tercatat.</p>
          ) : (
            <ul className="recheck-list">
              {auditEntries.map((a) => (
                <li key={a.id}>
                  {formatTime(a.at)} · {a.by} ·{" "}
                  {a.action === "delete" ? "Hapus" : "Simpan"} · {a.no}.{" "}
                  {a.perusahaan}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
