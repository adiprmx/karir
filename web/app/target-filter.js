/* Daftar perusahaan yang ada lowongan dengan chip kelompok peran. Pemetaan dari teks
 * posisi dan kategori (huruf kecil, substring). Kartu bisa langsung
 * ditandai tanpa membuka halaman detail. */
"use client";

import { useEffect, useState } from "react";
import { CompanyCard } from "@/app/company-card";
import { useTracker } from "@/app/tracker";
import { isNewChange } from "@/lib/notify";

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
  /* Nomor perusahaan yang berubah dalam 48 jam terakhir menurut
   * /api/changes (sumber kebenaran: createdAt di koleksi changes).
   * Bila umpan tidak bisa dimuat, tidak ada chip "Baru" — daftar
   * target tetap tampil seperti biasa. */
  const [newNos, setNewNos] = useState(null);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    fetch("/api/changes", { signal: controller.signal })
      .then((res) => res.json())
      .then((body) => {
        if (!alive) return;
        const list = Array.isArray(body.changes) ? body.changes : [];
        setNewNos(
          new Set(
            list
              .filter((c) => isNewChange(c.createdAt))
              .map((c) => Number(c.companyNo)),
          ),
        );
      })
      .catch(() => {
        if (alive) setNewNos(new Set());
      })
      .finally(() => clearTimeout(timer));
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);
  const counts = {};
  for (const g of GROUPS) counts[g] = 0;
  for (const c of targets) counts[groupOf(c)] += 1;
  counts["Semua"] = targets.length;
  const shown =
    active === "Semua" ? targets : targets.filter((c) => groupOf(c) === active);
  return (
    <div>
      {/* AKSES-11: hitungan hasil diumumkan saat chip kelompok ditekan
        * (pola yang sama dengan hitungan /cari). */}
      <p className="sr-only" aria-live="polite">
        {(labels.shown || "Menampilkan {n} perusahaan").replace(
          "{n}",
          String(shown.length),
        )}
      </p>
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
            isNew={newNos ? newNos.has(Number(c.no)) : false}
            index={Math.min(i, 12)}
            labels={labels}
          />
        ))}
      </div>
    </div>
  );
}
