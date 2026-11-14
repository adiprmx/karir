import { getTargetsOrSeed } from "@/lib/companies";
import { getLocale, t } from "@/lib/i18n";
import { matchCities } from "@/lib/cities";
import MapClient from "@/app/map-client";

/* Data di-render saat request, bukan saat build. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Peta lowongan",
  description:
    "Lokasi perusahaan yang ada lowongan, dipetakan berdasarkan kota.",
};

export default async function Peta() {
  const [targets, locale] = await Promise.all([getTargetsOrSeed(), getLocale()]);
  const byCity = new Map();
  const other = [];
  /* PETA-02: perusahaan multi-kota muncul di TIAP kota yang tercantum
   * di lokasinya (matchCities), bukan hanya di satu kota. Angka di
   * tiap penanda adalah jumlah perusahaan yang ada lowongan di kota
   * itu — jumlah seluruh penanda bisa melebihi jumlah target karena
   * satu perusahaan bisa muncul di beberapa kota. */
  for (const c of targets) {
    const cities = matchCities(c.lokasi);
    if (cities.length === 0) {
      other.push(c);
      continue;
    }
    for (const city of cities) {
      if (!byCity.has(city.name))
        byCity.set(city.name, { city, companies: [] });
      byCity.get(city.name).companies.push(c);
    }
  }
  /* Jumlah di lede adalah perusahaan yang benar-benar terpetakan
   * (PETA-08): sisanya hanya ada di lipatan "Lokasi lain", jadi
   * memakai jumlah semua target akan melebih-lebihkan isi peta. */
  const mappedCount = targets.length - other.length;
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
          {t(locale, "landing.featureMapDesc", { n: mappedCount })}
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
