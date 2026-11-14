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
import { formatDate } from "@/app/components";

/* LAND-05 / FE-05: satu fetch /api/changes dipakai bersama ChangesFeed
 * dan TargetFilter (keduanya mount di Beranda). Janji yang sama
 * dipakai ulang selama halaman hidup, jadi hanya ada satu request
 * jaringan; bila gagal, cache dibersihkan supaya muat berikutnya
 * mencoba lagi. Timeout 15 detik berada di dalam pemuat bersama,
 * bukan di komponen — membatalkan satu komponen tidak boleh
 * membatalkan request yang dipakai komponen lain. */
let changesPromise = null;

export function loadChanges() {
  if (!changesPromise) {
    changesPromise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch("/api/changes", { signal: controller.signal });
        const body = await res.json();
        return {
          changes: Array.isArray(body.changes) ? body.changes : [],
          degraded: body.degraded === true,
        };
      } finally {
        clearTimeout(timer);
      }
    })();
    changesPromise.catch(() => {
      changesPromise = null;
    });
  }
  return changesPromise;
}

/* Entri baru: dibuat dalam 48 jam terakhir, atau perubahannya menuju
 * "Ada lowongan". Sumber kebenaran adalah createdAt di koleksi
 * changes. Chip memakai pola chip yang sudah ada (.chip.match). */
function isNew(c) {
  return isNewChange(c.createdAt) || c.to === "Ada lowongan";
}

export default function ChangesFeed({ labels, locale }) {
  const [changes, setChanges] = useState(null);
  const [degraded, setDegraded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadChanges()
      .then((body) => {
        if (alive) {
          setChanges(body.changes);
          setDegraded(body.degraded);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (failed) return <p className="empty-line">{labels.error}</p>;
  if (changes === null) {
    /* AKSES-16: aria-label pada <div> generik diabaikan pembaca layar;
     * role="status" membuatnya diumumkan sebagai status muat. */
    return (
      <div
        className="skeleton"
        style={{ height: 72 }}
        role="status"
        aria-label={labels.loading}
      />
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
            {/* LAND-04 / UX-11: tanggal tampil dalam format Indonesia
              * ("14 Nov 2026"), bukan mentah ISO ("2026-11-14").
              * Bila nilainya bukan tanggal ISO yang valid, tampilkan
              * apa adanya daripada kosong. */}
            <span className="changes-date">
              {formatDate(c.checkedAt, locale) || c.checkedAt}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
