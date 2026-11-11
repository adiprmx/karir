"use client";

/* Pencarian di layar pertama Beranda: dua isian dan satu tombol yang
 * membuka /cari dengan isian terbawa. Hasil yang berjalan langsung (urut
 * saat mengetik) ada di /cari, supaya Beranda tetap ringan di HP murah. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadRecentSearch, saveRecentSearch } from "@/app/recent";
import { trackEvent } from "@/app/analytics-track";
import { Icon } from "@/app/visual";

export default function Finder({ roles }) {
  const router = useRouter();
  const [domisili, setDomisili] = useState("");
  const [posisi, setPosisi] = useState("");
  const [recent, setRecent] = useState(null);

  useEffect(() => {
    const read = () => setRecent(loadRecentSearch());
    read();
    window.addEventListener("karir-recent-change", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("karir-recent-change", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  function go(e) {
    e.preventDefault();
    const d = domisili.trim();
    const p = posisi.trim();
    const params = new URLSearchParams();
    if (d) params.set("domisili", d);
    if (p) params.set("posisi", p);
    const q = [d, p].filter(Boolean).join(" ").slice(0, 200);
    if (q) trackEvent({ type: "search", path: "/cari", q });
    saveRecentSearch(d, p);
    const s = params.toString();
    router.push(s ? `/cari?${s}` : "/cari");
  }

  const hasQuery = Boolean(domisili.trim() || posisi.trim());

  return (
    <section className="finder" aria-labelledby="finder-h">
      <h1 id="finder-h">Cari lowongan di dekatmu</h1>
      <form onSubmit={go} className="finder-grid" role="search">
        <div className="field">
          <label htmlFor="f-domisili">Kota tempat tinggal</label>
          <div className="in-icon">
            <Icon name="pin" size={20} />
            <input id="f-domisili" name="domisili" type="text" enterKeyHint="search" placeholder="Bogor, Depok, Karawang" autoComplete="off" value={domisili} onChange={(e) => setDomisili(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="f-posisi">Posisi atau nama perusahaan</label>
          <div className="in-icon">
            <Icon name="search" size={20} />
            <input id="f-posisi" name="posisi" type="text" enterKeyHint="search" placeholder="Helper Gudang, Cleaning" autoComplete="off" value={posisi} onChange={(e) => setPosisi(e.target.value)} />
          </div>
        </div>
        <button type="submit" className="btn">
          {hasQuery ? "Tampilkan hasilnya" : "Lihat semua perusahaan"}
        </button>
      </form>

      <div className="roles">
        <p className="lbl" id="roles-l">
          Posisi yang sering dicari (jumlah = lowongan terverifikasi)
        </p>
        <div className="chips" role="group" aria-labelledby="roles-l">
          {roles.map((r) => (
            <Link key={r.name} className="chip" href={`/cari?posisi=${encodeURIComponent(r.name)}`}>
              {r.name}
              {r.count > 0 && <span className="n num">{r.count}</span>}
            </Link>
          ))}
        </div>
      </div>

      {recent && !hasQuery && (
        <button
          type="button"
          className="recent"
          onClick={() => {
            setDomisili(recent.domisili);
            setPosisi(recent.posisi);
          }}
        >
          <span>Terakhir kamu cari:</span>
          <strong>{[recent.domisili, recent.posisi].filter(Boolean).join(" + ")}</strong>
        </button>
      )}
    </section>
  );
}
