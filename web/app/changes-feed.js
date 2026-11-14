/* Umpan perubahan status Karir: daftar perubahan terbaru yang dicatat
 * cron cek ulang harian. Baca /api/changes saat mount. Bila belum ada
 * perubahan, tampilkan kalimat jujur, bukan daftar contoh. Bila API
 * menandai `degraded: true`, umpan sedang tidak bisa dimuat dari
 * sumbernya — tampilkan state rusak, BUKAN state kosong, supaya
 * pengunjung tidak salah mengira tidak ada perubahan (BE-14). */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusStamp } from "@/app/visual";
import { isNewChange } from "@/lib/notify";

/* Entri baru: dibuat dalam 48 jam terakhir, atau perubahannya menuju
 * "Ada lowongan". Sumber kebenaran adalah createdAt di koleksi
 * changes. Chip memakai pola chip yang sudah ada (.chip.match). */
function isNew(c) {
  return isNewChange(c.createdAt) || c.to === "Ada lowongan";
}

export default function ChangesFeed({ labels }) {
  const [changes, setChanges] = useState(null);
  const [degraded, setDegraded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    fetch("/api/changes", { signal: controller.signal })
      .then((res) => res.json())
      .then((body) => {
        if (alive) {
          setChanges(Array.isArray(body.changes) ? body.changes : []);
          setDegraded(body.degraded === true);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => clearTimeout(timer));
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  if (failed) return <p className="empty-line">{labels.error}</p>;
  if (changes === null) {
    return (
      <div className="skeleton" style={{ height: 72 }} aria-label={labels.loading} />
    );
  }
  /* Umpan rusak (API 200 + daftar kosong + degraded): bedakan dari
   * "belum ada perubahan". `labels.degraded` opsional — bila halaman
   * belum meneruskannya, pakai teks error yang maknanya sama
   * ("umpan belum bisa dimuat"). */
  if (degraded && changes.length === 0) {
    return <p className="empty-line">{labels.degraded || labels.error}</p>;
  }
  if (changes.length === 0) return <p className="empty-line">{labels.empty}</p>;
  return (
    <ol className="changes">
      {changes.map((c, i) => (
        <li key={c.id || `${c.companyNo}-${c.createdAt || i}`}>
          <Link href={`/perusahaan/${c.companyNo}`}>
            <span className="changes-name">
              {c.perusahaan}
              {isNew(c) && (
                <span className="chip match" style={{ marginLeft: 8 }}>
                  Baru
                </span>
              )}
            </span>
            <span className="changes-flow">
              <StatusStamp status={c.from} />
              <span aria-hidden="true">→</span>
              <StatusStamp status={c.to} />
            </span>
            <span className="changes-date">{c.checkedAt}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
