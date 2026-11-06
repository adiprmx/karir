/* Daftar 22 target dengan chip filter kelompok peran. Pemetaan dari teks
 * posisi dan kategori (huruf kecil, substring). Baris hasil dua baris:
 * nomor + logo + nama + panah, lalu posisi dan lokasi di bawah nama. */
"use client";

import { useState } from "react";
import Link from "next/link";
import { CompanyLogo } from "@/lib/logos";

const GROUPS = ["Semua", "Gudang", "Cleaning", "Produksi", "Toko", "Lainnya"];

/* Kelompok ditentukan kata kunci yang muncul PALING AWAL di teks posisi
 * (peran pertama yang tertulis adalah peran utamanya), kategori dipakai
 * sebagai cadangan bila posisi tidak mengandung kata kunci. */
const GROUP_KEYWORDS = [
  ["Gudang", ["gudang", "warehouse", "helper"]],
  ["Cleaning", ["cleaning", "cleaner", "kebersihan"]],
  ["Produksi", ["produksi", "production", "operator"]],
  ["Toko", ["crew", "kasir", "cashier", "store", "toko", "barista"]],
];

function groupOf(c) {
  const hay = `${c.posisi || ""} ${c.kategori || ""}`.toLowerCase();
  let best = null;
  let bestIdx = Infinity;
  for (const [name, words] of GROUP_KEYWORDS) {
    for (const w of words) {
      const i = hay.indexOf(w);
      if (i !== -1 && i < bestIdx) {
        bestIdx = i;
        best = name;
      }
    }
  }
  return best || "Lainnya";
}

export default function TargetFilter({ targets, notListed }) {
  const [active, setActive] = useState("Semua");
  const counts = {};
  for (const g of GROUPS) counts[g] = 0;
  for (const c of targets) counts[groupOf(c)] += 1;
  counts["Semua"] = targets.length;
  const shown =
    active === "Semua"
      ? targets
      : targets.filter((c) => groupOf(c) === active);
  return (
    <div>
      <div
        className="target-filters"
        role="group"
        aria-label="Saring lowongan target"
      >
        {GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            className="filter-chip"
            aria-pressed={active === g}
            onClick={() => setActive(g)}
          >
            {g}{" "}
            <span className="filter-count num">{counts[g]}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="state">Tidak ada target di kelompok ini.</p>
      ) : (
        <ol className="index-list target-rows">
          {shown.map((c, i) => (
            <li key={c.no}>
              <Link href={`/perusahaan/${c.no}`}>
                <span className="target-row-main">
                  <span className="index-no">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="target-logo-slot">
                    <CompanyLogo
                      linkKarir={c.link_karir}
                      name={c.perusahaan}
                      size={32}
                    />
                  </span>
                  <span className="index-name">{c.perusahaan}</span>
                  <span className="index-arrow" aria-hidden="true">
                    →
                  </span>
                </span>
                <span className="target-row-sub">
                  {(c.posisi || "").split(",")[0]}
                  {" · "}
                  {c.lokasi || notListed || "Lokasi tidak dicantumkan"}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
