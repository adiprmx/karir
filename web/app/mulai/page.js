"use client";

/* Halaman Mulai: onboarding 3 langkah dalam satu halaman. Bukan
 * pendaftaran, tidak ada akun. Pengunjung menjawab domisili dan posisi,
 * melihat ringkasannya, lalu diantar ke /cari dengan filter yang sudah
 * terisi. Jawaban tersimpan di browser saja. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOnboarding } from "@/app/onboarding";

const inputStyle = {
  width: "100%",
  border: "1px solid #e5e5e5",
  borderRadius: 8,
  padding: 12,
  font: "inherit",
  fontSize: 15,
  background: "#fff",
};
const labelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
  color: "#52525b",
  marginBottom: 8,
};

export default function Mulai() {
  const router = useRouter();
  const { data, loaded, save, clear } = useOnboarding();
  const [domisili, setDomisili] = useState("");
  const [posisi, setPosisi] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    if (data) {
      setDomisili(data.domisili || "");
      setPosisi(data.posisi || "");
    }
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  function goToResults() {
    const params = new URLSearchParams();
    const d = domisili.trim();
    const p = posisi.trim();
    if (d) params.set("domisili", d);
    if (p) params.set("posisi", p);
    if (d || p) save({ domisili: d, posisi: p });
    const query = params.toString();
    router.push(query ? `/cari?${query}` : "/cari");
  }

  function onEdit() {
    setDomisili(data ? data.domisili || "" : "");
    setPosisi(data ? data.posisi || "" : "");
    setEditing(true);
  }

  function onClear() {
    clear();
    setDomisili("");
    setPosisi("");
    setEditing(false);
  }

  const showSummary = loaded && data && !editing;

  return (
    <div className="wrap">
      <section className="hero anim-fade-up">
        <h1>Mulai</h1>
        <p className="lede">
          Jawab dua hal ini, kami tunjukkan kanal lowongan yang paling cocok.
        </p>
      </section>

      {showSummary ? (
        <section className="anim-fade-in-1" aria-label="Pilihanmu saat ini">
          <p className="section-label">Pilihanmu saat ini</p>
          <p>
            Domisili: {data.domisili || "Belum diisi"}
            <br />
            Posisi: {data.posisi || "Belum diisi"}
          </p>
          <p className="fresh-note">
            Pilihanmu tersimpan di browser ini saja, tidak dikirim ke mana
            pun.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="btn" onClick={onEdit}>
              Ubah pilihan
            </button>
            <button type="button" className="btn ghost" onClick={onClear}>
              Hapus pilihanku
            </button>
            <button type="button" className="btn ghost" onClick={goToResults}>
              Lihat lowongan yang cocok
            </button>
          </div>
        </section>
      ) : (
        <section className="anim-fade-in-1" aria-label="Tiga langkah singkat">
          <ol className="steps">
            <li>
              <label style={labelStyle} htmlFor="mulai-domisili">
                Di mana kamu tinggal?
              </label>
              <input
                id="mulai-domisili"
                type="text"
                value={domisili}
                placeholder="mis. Bogor, Depok, Cibinong"
                autoComplete="off"
                onChange={(e) => setDomisili(e.target.value)}
                style={inputStyle}
              />
            </li>
            <li>
              <label style={labelStyle} htmlFor="mulai-posisi">
                Posisi apa yang kamu cari?
              </label>
              <input
                id="mulai-posisi"
                type="text"
                value={posisi}
                placeholder="mis. Helper Gudang, Cleaning Service"
                autoComplete="off"
                onChange={(e) => setPosisi(e.target.value)}
                style={inputStyle}
              />
            </li>
            <li>
              <p style={{ margin: "0 0 8px" }}>Ini pilihanmu.</p>
              <p style={{ margin: "0 0 16px" }}>
                Domisili: {domisili.trim() || "Belum diisi"}
                <br />
                Posisi: {posisi.trim() || "Belum diisi"}
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <button type="button" className="btn" onClick={goToResults}>
                  Lihat lowongan yang cocok
                </button>
                <Link href="/cari">Lewati, lihat semua kanal</Link>
              </div>
            </li>
          </ol>
          <p className="fresh-note">
            Pilihanmu tersimpan di browser ini saja, tidak dikirim ke mana
            pun.
          </p>
        </section>
      )}
    </div>
  );
}
