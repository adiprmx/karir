"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import { CompanyLogo } from "@/lib/logos";
import { Icon, reducedMotion } from "@/app/visual";
import { mapFlyDurationMs } from "@/lib/a11y";

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
            /* UX-14: penanda 40px (dulu 36px); CSS .karir-marker
             * disamakan. */
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          });
          const m = L.marker([g.city.lat, g.city.lng], {
            icon,
            title: `${g.city.name}: ${g.companies.length}`,
            keyboard: true,
          }).addTo(map);
          /* AKSES-14: atribut title tidak diumumkan secara andal
           * sebagai nama aksesibel — beri aria-label + peran tombol
           * pada elemen penanda (isi penanda hanya angka). */
          const node = m.getElement();
          if (node) {
            node.setAttribute("role", "button");
            node.setAttribute(
              "aria-label",
              `${g.city.name}, ${g.companies.length} perusahaan ada lowongan`,
            );
          }
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
    if (!map) return;
    /* AKSES-14: pengguna yang meminta reduced-motion tidak mendapat
     * animasi terbang — peta langsung pindah (setView). */
    const zoom = Math.max(map.getZoom(), 11);
    if (mapFlyDurationMs(reducedMotion()) === 0) {
      map.setView([g.city.lat, g.city.lng], zoom);
    } else {
      map.flyTo([g.city.lat, g.city.lng], zoom, { duration: 0.8 });
    }
  }

  const current = groups.find((g) => g.city.name === selected);

  return (
    /* AKSES-12: seluruh blok ini teks Indonesia kode-keras. */
    <div lang="id">
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

      {/* UX-14: role="application" mengalihkan mode pembaca layar
        * dan tidak disarankan untuk peta; role="region" + label
        * sudah cukup, apalagi chip kota adalah alternatif lengkap. */}
      <div
        ref={el}
        className="karir-map"
        role="region"
        aria-label="Peta perusahaan yang ada lowongan"
      />
      {failed && (
        <p className="note-line">
          <Icon name="info" size={16} />
          Peta tidak bisa dimuat. Pilih kota di atas untuk melihat daftarnya.
        </p>
      )}

      {current && (
        <section className="panel city-panel" key={current.city.name}>
          {/* AKSES-03: live region hanya judul + hitungan. Sebelumnya
            * aria-live membungkus seluruh daftar perusahaan, sehingga
            * tiap ganti kota pembaca layar membacakan puluhan nama. */}
          <h2 className="panel-title" aria-live="polite">
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
    </div>
  );
}
