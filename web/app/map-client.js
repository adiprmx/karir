"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Peta Leaflet: dimuat dinamis di browser saja, Leaflet tidak tahan SSR.
 * Marker berupa titik hitam berisi angka jumlah lowongan di kota itu.
 * Gaya peta tinggal di sini (blok <style>) supaya tidak menyentuh
 * globals.css. */
export default function MapClient({ groups }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const [failed, setFailed] = useState(false);

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
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });
          const rows = g.companies
            .map(
              (c) =>
                `<li><a href="/perusahaan/${c.no}">${escapeHtml(c.perusahaan)}</a></li>`,
            )
            .join("");
          const popup =
            `<strong>${escapeHtml(g.city.name)}</strong>` +
            ` · ${g.companies.length} lowongan` +
            `<ul>${rows}</ul>`;
          L.marker([g.city.lat, g.city.lng], { icon })
            .addTo(map)
            .bindPopup(popup, { maxWidth: 280, className: "karir-popup" });
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [groups]);

  return (
    <>
      <style>{`
        .karir-map { height: 420px; border: 1px solid #e5e5e5; border-radius: 10px; z-index: 0; }
        @media (max-width: 860px) { .karir-map { height: 320px; } }
        .karir-map.leaflet-container { font-family: inherit; }
        .karir-marker { background: transparent; border: 0; }
        .karir-marker span { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: #0a0a0a; color: #fff; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.35); }
        .karir-popup .leaflet-popup-content { margin: 12px 14px; font-size: 14px; line-height: 1.5; }
        .karir-popup .leaflet-popup-content strong { font-size: 15px; }
        .karir-popup .leaflet-popup-content ul { list-style: none; margin: 8px 0 0; padding: 8px 0 0; border-top: 1px solid #e5e5e5; display: grid; gap: 6px; }
      `}</style>
      <div
        ref={el}
        className="karir-map"
        role="application"
        aria-label="Peta lowongan target"
      />
      {failed && (
        <p style={{ marginTop: 12, color: "var(--muted)", fontSize: 14 }}>
          Peta tidak bisa dimuat. Daftar perusahaan ada di bawah.
        </p>
      )}
    </>
  );
}
