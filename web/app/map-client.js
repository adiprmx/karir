"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import { CompanyLogo } from "@/lib/logos";
import { Icon } from "@/app/visual";

/* Peta Leaflet + daftar kota. Memilih kota (ketuk titik di peta atau chip
 * kota) menggeser peta ke sana dan menampilkan perusahaannya di bawah.
 * Leaflet dimuat dinamis di browser saja (tidak tahan SSR). Bila peta
 * gagal dimuat, chip kota dan daftar tetap berfungsi. */
export default function MapClient({ groups, other }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const markers = useRef(new Map());
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(groups[0] ? groups[0].city.name : null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !el.current || mapRef.current) return;
        const map = L.map(el.current, {
          center: [-6.5, 106.9],
          zoom: 8,
          scrollWheelZoom: false,
        });
        mapRef.current = map;
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        for (const g of groups) {
          const icon = L.divIcon({
            className: "karir-marker",
            html: `<span>${g.companies.length}</span>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });
          const m = L.marker([g.city.lat, g.city.lng], {
            icon,
            title: `${g.city.name}: ${g.companies.length}`,
            keyboard: true,
          }).addTo(map);
          m.on("click", () => setSelected(g.city.name));
          markers.current.set(g.city.name, m);
        }
        if (groups.length > 1) {
          map.fitBounds(
            groups.map((g) => [g.city.lat, g.city.lng]),
            { padding: [40, 40], maxZoom: 10 },
          );
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      markers.current.clear();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [groups]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((m, name) => {
      const node = m.getElement();
      if (node) node.classList.toggle("sel", name === selected);
    });
  }, [selected, failed]);

  function choose(g) {
    setSelected(g.city.name);
    const map = mapRef.current;
    if (map) map.flyTo([g.city.lat, g.city.lng], Math.max(map.getZoom(), 11), { duration: 0.8 });
  }

  const current = groups.find((g) => g.city.name === selected);

  return (
    <>
      <div className="chips-scroll" role="group" aria-label="Pilih kota">
        {groups.map((g) => (
          <button
            key={g.city.name}
            type="button"
            className="chip-btn"
            aria-pressed={g.city.name === selected}
            onClick={() => choose(g)}
          >
            {g.city.name}
            <span className="chip-count num">{g.companies.length}</span>
          </button>
        ))}
      </div>

      <div
        ref={el}
        className="karir-map"
        role="application"
        aria-label="Peta lowongan target"
      />
      {failed && (
        <p className="note-line">
          <Icon name="info" size={16} />
          Peta tidak bisa dimuat. Pilih kota di atas untuk melihat daftarnya.
        </p>
      )}

      {current && (
        <section className="panel city-panel" key={current.city.name} aria-live="polite">
          <h2 className="panel-title">
            {current.city.name}{" "}
            <span className="num sub">({current.companies.length})</span>
          </h2>
          <ul className="mini-list">
            {current.companies.map((c) => (
              <li key={c.no}>
                <Link href={`/perusahaan/${c.no}`}>
                  <CompanyLogo linkKarir={c.link_karir} name={c.perusahaan} size={36} />
                  <span className="mini-name">
                    {c.perusahaan}
                    <span className="mini-sub">{(c.posisi || "").split(",")[0]}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {other.length > 0 && (
        <details className="fold" style={{ marginTop: 16 }}>
          <summary>
            <span>Lokasi lain (tidak cocok dengan kota di peta)</span>
            <span className="num fold-n">{other.length}</span>
            <Icon name="chevron" size={18} className="fold-ic" />
          </summary>
          <ul className="mini-list">
            {other.map((c) => (
              <li key={c.no}>
                <Link href={`/perusahaan/${c.no}`}>
                  <CompanyLogo linkKarir={c.link_karir} name={c.perusahaan} size={36} />
                  <span className="mini-name">
                    {c.perusahaan}
                    <span className="mini-sub">{c.lokasi || ""}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
