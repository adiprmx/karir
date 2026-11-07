/* Daftar lowongan target dengan chip kelompok peran. Pemetaan dari teks
 * posisi dan kategori (huruf kecil, substring). Kartu bisa langsung
 * ditandai tanpa membuka halaman detail. */
"use client";

import { useState } from "react";
import { CompanyCard } from "@/app/company-card";
import { useTracker } from "@/app/tracker";

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

export default function TargetFilter({ targets, labels }) {
  const [active, setActive] = useState("Semua");
  const { entries, toggle } = useTracker();
  const counts = {};
  for (const g of GROUPS) counts[g] = 0;
  for (const c of targets) counts[groupOf(c)] += 1;
  counts["Semua"] = targets.length;
  const shown =
    active === "Semua" ? targets : targets.filter((c) => groupOf(c) === active);
  return (
    <div>
      <div className="chips-scroll" role="group" aria-label={labels.filter}>
        {GROUPS.filter((g) => g === "Semua" || counts[g] > 0).map((g) => (
          <button
            key={g}
            type="button"
            className="chip-btn"
            aria-pressed={active === g}
            onClick={() => setActive(g)}
          >
            {g} <span className="chip-count num">{counts[g]}</span>
          </button>
        ))}
      </div>
      <div className="co-grid" key={active}>
        {shown.map((c, i) => (
          <CompanyCard
            key={c.no}
            company={c}
            tracked={entries[String(c.no)]}
            onToggle={toggle}
            index={Math.min(i, 12)}
            labels={labels}
          />
        ))}
      </div>
    </div>
  );
}
