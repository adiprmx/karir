"use client";

/* Seksi Pemakaian kuota baca panel admin (FE-18, dipindah dari
 * page.js): estimasi baca Firestore hari ini dari marker kesegaran,
 * beserta revisi data dan waktu terakhir berubah. */

import { QUOTA_DAILY_LIMIT, formatTime } from "./admin-helpers";

export default function QuotaSection({ quota }) {
  return (
    <div className="filters" style={{ marginTop: 24 }}>
      <p className="section-label">Pemakaian kuota baca</p>
      <p className="section-note">
        Estimasi baca Firestore hari ini (paket Spark: 50.000 baca per
        hari, reset pukul 15:00 WIB). Dihitung dari pencacah refill di
        marker kesegaran; baca marker dan baca detail tidak ikut
        terhitung, jadi angka sebenarnya sedikit lebih besar.
      </p>
      {quota === null && (
        <p className="notice">Memuat data pemakaian…</p>
      )}
      {quota === "missing" && (
        <p className="notice">
          Belum ada data pemakaian (marker belum dibuat).
        </p>
      )}
      {quota === "error" && (
        <p className="notice">
          Data pemakaian belum bisa dibaca. Periksa aturan Firestore
          untuk dokumen meta/lastChange.
        </p>
      )}
      {quota && typeof quota === "object" && (
        <>
          <div className="stat-row">
            <span className="stat-num num">
              {(Number(quota.readsEstimate) || 0).toLocaleString("id-ID")}{" "}
              dari {QUOTA_DAILY_LIMIT.toLocaleString("id-ID")}
            </span>
            <span className="stat-label">
              baca hari ini (
              {Math.round(
                ((Number(quota.readsEstimate) || 0) / QUOTA_DAILY_LIMIT) *
                  100,
              )}
              % kuota, {Number(quota.refillsToday) || 0} kali refill
              daftar).
            </span>
          </div>
          <p className="section-note">
            Revisi data: {Number(quota.rev) || 0} · Terakhir berubah:{" "}
            {quota.updatedAt
              ? formatTime(quota.updatedAt)
              : "tidak tercatat"}
            .
          </p>
        </>
      )}
    </div>
  );
}
