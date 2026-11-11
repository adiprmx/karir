"use client";

/* Daftar lowongan target dengan chip kelompok peran. Kelompok ditentukan
 * kata kunci yang muncul PALING AWAL di teks posisi (peran pertama yang
 * tertulis adalah peran utamanya), kategori jadi cadangan. Baris bisa
 * langsung ditandai tanpa membuka halaman detail. */
import { useState } from "react";
import { CompanyRow } from "@/app/company-card";
import { useTracker } from "@/app/tracker";
import { useChanges } from "@/app/use-changes";
import { isNewChange } from "@/lib/notify";

const GROUPS = ["Semua", "Gudang", "Cleaning", "Produksi", "Toko", "Lainnya"];
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

export default function TargetFilter({ targets }) {
  const [active, setActive] = useState("Semua");
  const { entries, toggle } = useTracker();
  /* Chip Baru: perusahaan yang berubah dalam 48 jam terakhir menurut
   * koleksi changes. Bila umpan gagal dimuat, tidak ada chip. */
  const { changes } = useChanges();
  const newNos = new Set(
    (changes || []).filter((c) => isNewChange(c.createdAt)).map((c) => Number(c.companyNo)),
  );
  const counts = Object.fromEntries(GROUPS.map((g) => [g, 0]));
  for (const c of targets) counts[groupOf(c)] += 1;
  counts.Semua = targets.length;
  const shown = active === "Semua" ? targets : targets.filter((c) => groupOf(c) === active);

  if (targets.length === 0) {
    return (
      <div className="state">
        <strong>Belum ada lowongan target yang terverifikasi.</strong>
        <p>Daftar ini terisi dari hasil pengecekan. Cek lagi setelah pengecekan berikutnya.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="chips scroll" role="group" aria-label="Saring menurut jenis pekerjaan">
        {GROUPS.filter((g) => g === "Semua" || counts[g] > 0).map((g) => (
          <button key={g} type="button" className="chip" aria-pressed={active === g} onClick={() => setActive(g)}>
            {g} <span className="n num">{counts[g]}</span>
          </button>
        ))}
      </div>
      <div className="reg-list" style={{ marginTop: 12 }}>
        {shown.map((c) => (
          <CompanyRow
            key={c.no}
            company={c}
            tracked={entries[String(c.no)]}
            onToggle={toggle}
            isNew={newNos.has(Number(c.no))}
          />
        ))}
      </div>
    </div>
  );
}
