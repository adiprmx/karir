"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import { Icon } from "@/app/visual";

/* Peta Leaflet + daftar kota. Memilih kota (ketuk titik di peta atau chip
 * kota) menggeser peta ke sana dan menampilkan perusahaannya di bawah.
 * Leaflet dimuat dinamis di browser saja (tidak tahan SSR). Bila peta
 * gagal dimuat, chip kota dan daftar tetap berfungsi. */
export default function MapClient({ groups, other }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(groups[0] ? groups[0].city.name : null);

  useEffect(() => {
    let cancelled = false;
    /* Salinan lokal: ref ke penanda bisa berubah saat cleanup berjalan. */
    const markers = new Map();
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !el.current || mapRef.current) return;
        const map = L.map(el.current, { center: [-6.5, 106.9], zoom: 8, scrollWheelZoom: false });
        mapRef.current = map;
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
            title: `${g.city.name}: ${g.companies.length} perusahaan`,
            keyboard: true,
          }).addTo(map);
          m.on("click", () => setSelected(g.city.name));
          markers.set(g.city.name, m);
          /* Kota pertama terpilih sejak awal, tandai penandanya. */
          if (groups[0] && g.city.name === groups[0].city.name) {
            const node = m.getElement();
            if (node) node.classList.add("sel");
          }
        }
        mapRef.current._karirMarkers = markers;
        if (groups.length > 1) {
          map.fitBounds(groups.map((g) => [g.city.lat, g.city.lng]), { padding: [40, 40], maxZoom: 10 });
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      markers.clear();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [groups]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map._karirMarkers) return;
    map._karirMarkers.forEach((m, name) => {
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

  if (groups.length === 0 && other.length === 0) {
    return (
      <div className="state">
        <strong>Belum ada lowongan target untuk dipetakan.</strong>
        <p>Peta terisi dari hasil pengecekan. Cek lagi setelah pengecekan berikutnya.</p>
      </div>
    );
  }

  return (
    <>
      {groups.length > 0 && (
        <div className="chips scroll" role="group" aria-label="Pilih kota">
          {groups.map((g) => (
            <button key={g.city.name} type="button" className="chip" aria-pressed={g.city.name === selected} onClick={() => choose(g)}>
              {g.city.name}
              <span className="n num">{g.companies.length}</span>
            </button>
          ))}
        </div>
      )}

      <div ref={el} className="karir-map" role="application" aria-label="Peta lowongan target" style={{ marginTop: 12 }} />
      {failed && (
        <p className="note" style={{ marginTop: 12 }} role="alert">
          <Icon name="info" size={18} />
          Peta tidak bisa dimuat. Pilih kota di atas untuk melihat daftarnya.
        </p>
      )}

      {current && (
        <section className="sec" key={current.city.name} aria-live="polite" aria-labelledby="kota-h">
          <div className="sec-head">
            <h2 id="kota-h">
              {current.city.name} <span className="num">({current.companies.length})</span>
            </h2>
          </div>
          <ul className="mini-list">
            {current.companies.map((c) => (
              <li key={c.no}>
                <Link href={`/perusahaan/${c.no}`}>
                  <span className="mini-name">
                    {c.no}. {c.perusahaan}
                  </span>
                  <span className="mini-sub">{(c.posisi || "").split(",")[0]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {other.length > 0 && (
        <details className="fold" style={{ marginTop: 24 }}>
          <summary>
            <span className="grow">Lokasi lain (tidak cocok dengan kota di peta)</span>
            <span className="num">{other.length}</span>
            <Icon name="chevron" size={20} />
          </summary>
          <ul className="mini-list">
            {other.map((c) => (
              <li key={c.no}>
                <Link href={`/perusahaan/${c.no}`}>
                  <span className="mini-name">
                    {c.no}. {c.perusahaan}
                  </span>
                  <span className="mini-sub">{c.lokasi || ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
