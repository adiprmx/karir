/* Umpan perubahan status Karir: daftar perubahan terbaru yang dicatat
 * cron cek ulang harian. Tanpa props, baca /api/changes saat mount.
 * Memakai pola daftar .index-list yang sama dengan daftar target di
 * Beranda. Bila belum ada perubahan, tampilkan kalimat jujur, bukan
 * daftar contoh. */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ChangesFeed() {
  const [changes, setChanges] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    fetch("/api/changes", { signal: controller.signal })
      .then((res) => res.json())
      .then((body) => {
        if (alive) setChanges(Array.isArray(body.changes) ? body.changes : []);
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

  if (failed) {
    return <p>Umpan perubahan belum bisa dimuat.</p>;
  }
  if (changes === null) {
    return <p>Memuat perubahan...</p>;
  }
  if (changes.length === 0) {
    return <p>Belum ada perubahan tercatat.</p>;
  }
  return (
    <ol className="index-list">
      {changes.map((c, i) => (
        <li key={c.id || `${c.companyNo}-${c.createdAt || i}`}>
          <Link href={`/perusahaan/${c.companyNo}`}>
            <span className="index-no">{String(i + 1).padStart(2, "0")}</span>
            <span className="index-name">{c.perusahaan}</span>
            <span className="index-meta">
              {c.from} → {c.to}
              {" · "}
              {c.checkedAt}
            </span>
            <span className="index-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
