import { getCompanies, getStats, STATUS_ORDER, getTargets } from "@/lib/companies";
import { countBy, topEntries } from "@/lib/search";
import { safeLink } from "@/app/components";

export const metadata = { title: "Dasbor — Karir" };

function BarRow({ label, count, total, tone }) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
  return (
    <div className="bar-row">
      <div className="bar-head">
        <span className="bar-label">{label}</span>
        <span className="bar-count num">{count}</span>
      </div>
      <div className="bar-track">
        <span
          className={tone ? `bar-fill ${tone}` : "bar-fill"}
          style={{ display: "block", width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function shortText(text, max) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

function RecheckList({ title, count, list }) {
  return (
    <section className="dash-section" aria-label={title}>
      <p className="section-label">
        {title} ({count})
      </p>
      <h2>{title}</h2>
      <ul className="recheck-list">
        {list.slice(0, 10).map((c) => (
          <li key={c.no}>
            {safeLink(c.link_karir) ? (
              <a href={c.link_karir} target="_blank" rel="noopener noreferrer">
                {c.perusahaan}
              </a>
            ) : (
              c.perusahaan
            )}
          </li>
        ))}
        {list.length > 10 && (
          <li className="plain-more">
            dan {list.length - 10} lainnya di data perusahaan.
          </li>
        )}
      </ul>
    </section>
  );
}

export default async function Dasbor() {
  const companies = await getCompanies();
  const stats = await getStats();
  const total = stats.total;
  const targets = await getTargets();
  const topCats = topEntries(countBy(companies, "kategori"), 8);
  const portalDead = companies
    .filter((c) => c.status === "Portal tidak bisa dibuka")
    .sort((a, b) => a.perusahaan.localeCompare(b.perusahaan, "id"));
  const unverified = companies
    .filter((c) => c.status === "Tidak dapat diverifikasi")
    .sort((a, b) => a.perusahaan.localeCompare(b.perusahaan, "id"));
  const d4 = stats.byDate["2026-11-04"] || 0;
  const d5 = stats.byDate["2026-11-05"] || 0;

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Dasbor</h1>
        <p className="lede">
          Semua angka dihitung langsung dari data {total} perusahaan. Tidak ada
          angka contoh.
        </p>
      </div>

      <div className="dash-grid">
        <div>
          <section className="dash-section" aria-label="Sebaran status">
            <p className="section-label">Sebaran status</p>
            <h2>Status {total} perusahaan</h2>
            {STATUS_ORDER.map((s) => (
              <BarRow
                key={s}
                label={s}
                count={stats.byStatus[s] || 0}
                total={total}
                tone={
                  s === "Ada lowongan target"
                    ? "ok"
                    : s === "Ada lowongan target (tidak cocok)"
                      ? "warn"
                      : undefined
                }
              />
            ))}
          </section>

          <section className="dash-section" aria-label="Kategori terbanyak">
            <p className="section-label">Kategori terbanyak</p>
            <h2>8 kategori teratas</h2>
            {topCats.map((e) => (
              <BarRow key={e.label} label={e.label} count={e.count} total={total} />
            ))}
          </section>
        </div>

        <div>
          <section className="dash-section" aria-label="Lowongan target">
            <p className="section-label">
              Lowongan target ({targets.length})
            </p>
            <h2>Perusahaan dengan lowongan target</h2>
            <ul className="recheck-list">
              {targets.map((c) => (
                <li key={c.no}>
                  {safeLink(c.link_karir) ? (
                    <a
                      href={c.link_karir}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {c.perusahaan}
                    </a>
                  ) : (
                    c.perusahaan
                  )}
                  <span className="cell-sub">
                    {shortText(
                      `${c.posisi || ""} · ${c.lokasi || "Tidak tercantum"}`,
                      140,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <RecheckList
            title="Portal tidak bisa dibuka"
            count={portalDead.length}
            list={portalDead}
          />
          <RecheckList
            title="Tidak dapat diverifikasi"
            count={unverified.length}
            list={unverified}
          />

          <section className="dash-section" aria-label="Kesegaran data">
            <p className="section-label">Kesegaran data</p>
            <h2>Kapan dicek</h2>
            <p className="fresh-note" style={{ marginTop: 0 }}>
              {d4} perusahaan dicek 4 November 2026, {d5} perusahaan dicek 5
              November 2026. Lowongan bisa berubah setelah tanggal cek.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
