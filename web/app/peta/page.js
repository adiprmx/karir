import Link from "next/link";
import { getTargets } from "@/lib/companies";
import { matchCity } from "@/lib/cities";
import MapClient from "@/app/map-client";

/* Data di-render saat request, bukan saat build. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Peta lowongan",
  description:
    "Lokasi perusahaan dengan lowongan target, dipetakan berdasarkan kota.",
};

function shortText(text, max) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

export default async function Peta() {
  const targets = await getTargets();
  const byCity = new Map();
  const other = [];
  for (const c of targets) {
    const city = matchCity(c.lokasi);
    if (!city) {
      other.push(c);
      continue;
    }
    if (!byCity.has(city.name)) byCity.set(city.name, { city, companies: [] });
    byCity.get(city.name).companies.push(c);
  }
  const groups = [...byCity.values()];

  return (
    <div className="wrap">
      <div className="page-head anim-fade-up">
        <h1>Peta lowongan</h1>
        <p className="lede">
          {targets.length} perusahaan dengan lowongan target, dipetakan
          berdasarkan lokasi.
        </p>
      </div>

      <div className="anim-fade-up-1">
        <MapClient groups={groups} />
      </div>

      <div style={{ marginTop: 40 }} className="anim-fade-up-2">
        {groups.map((g) => (
          <section
            className="dash-section"
            aria-label={g.city.name}
            key={g.city.name}
          >
            <h2>
              {g.city.name} ({g.companies.length})
            </h2>
            <ul className="recheck-list">
              {g.companies.map((c) => (
                <li key={c.no}>
                  <Link href={`/perusahaan/${c.no}`}>{c.perusahaan}</Link>
                  <span className="cell-sub">
                    {shortText(c.posisi || c.lokasi || "", 120)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {other.length > 0 && (
          <section className="dash-section" aria-label="Lokasi lain">
            <h2>Lokasi lain ({other.length})</h2>
            <p>
              {other.length} perusahaan lokasinya tidak cocok dengan kota di
              peta.
            </p>
            <ul className="recheck-list">
              {other.map((c) => (
                <li key={c.no}>
                  <Link href={`/perusahaan/${c.no}`}>{c.perusahaan}</Link>
                  <span className="cell-sub">{c.lokasi || ""}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
