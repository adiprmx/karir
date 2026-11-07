import { getTargets } from "@/lib/companies";
import { getLocale, t } from "@/lib/i18n";
import { matchCity } from "@/lib/cities";
import MapClient from "@/app/map-client";

/* Data di-render saat request, bukan saat build. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Peta lowongan",
  description:
    "Lokasi perusahaan dengan lowongan target, dipetakan berdasarkan kota.",
};

export default async function Peta() {
  const [targets, locale] = await Promise.all([getTargets(), getLocale()]);
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
  const groups = [...byCity.values()]
    .map((g) => ({
      city: g.city,
      companies: g.companies.map((c) => ({
        no: c.no,
        perusahaan: c.perusahaan,
        link_karir: c.link_karir,
        posisi: c.posisi,
        lokasi: c.lokasi,
      })),
    }))
    .sort((a, b) => b.companies.length - a.companies.length);

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>{locale === "en" ? "Openings map" : "Peta lowongan"}</h1>
        <p className="lede">
          {t(locale, "landing.featureMapDesc", { n: targets.length })}
        </p>
      </div>
      <MapClient
        groups={groups}
        other={other.map((c) => ({
          no: c.no,
          perusahaan: c.perusahaan,
          link_karir: c.link_karir,
          lokasi: c.lokasi,
        }))}
      />
    </div>
  );
}
