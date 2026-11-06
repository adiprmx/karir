"use client";

/* Chip "Pencarian terakhir" di hero Beranda: muncul hanya bila ada
 * pencarian tersimpan, menaut ke hasil yang sama supaya pengguna
 * kembali bisa lanjut dengan satu ketukan. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { loadRecentSearch } from "@/app/recent";

export default function RecentChip({ label }) {
  const [recent, setRecent] = useState(null);

  useEffect(() => {
    const read = () => setRecent(loadRecentSearch());
    read();
    window.addEventListener("karir-recent-change", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("karir-recent-change", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  if (!recent) return null;
  const params = new URLSearchParams();
  if (recent.domisili) params.set("domisili", recent.domisili);
  if (recent.posisi) params.set("posisi", recent.posisi);
  const text = [recent.domisili, recent.posisi]
    .filter(Boolean)
    .join(" + ");
  return (
    <Link
      className="example-chip recent-chip"
      href={`/cari?${params.toString()}`}
    >
      {label || "Terakhir"}: {text}
    </Link>
  );
}
