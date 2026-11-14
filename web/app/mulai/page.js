"use client";

/* Halaman Mulai: onboarding 3 langkah (domisili, posisi, ringkasan).
 * Bukan pendaftaran: tidak perlu masuk akun untuk mengisinya. Di langkah
 * terakhir pengunjung langsung melihat berapa kanal yang cocok, lalu
 * diantar ke /cari dengan filter terisi. Jawaban tersimpan di browser
 * saja. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasOnboardingChoice, useOnboarding } from "@/app/onboarding";
import { useCompanyIndex, rank } from "@/app/company-index";
import { Icon } from "@/app/visual";

const CITY_CHIPS = [
  "Depok",
  "Bogor",
  "Bekasi",
  "Cikarang",
  "Karawang",
  "Tangerang",
  "Jakarta",
  "Cibinong",
  "Bandung",
  "Semarang",
  "Surabaya",
];
const ROLE_CHIPS = [
  "Helper Gudang",
  "Staff Gudang",
  "Cleaning Service",
  "Office Boy",
  "Packing",
  "Operator Produksi",
  "Crew Store",
];

export default function Mulai() {
  const router = useRouter();
  const { data, loaded, save, clear } = useOnboarding();
  const { index, state } = useCompanyIndex({ eager: true });
  const [domisili, setDomisili] = useState("");
  const [posisi, setPosisi] = useState("");
  const [step, setStep] = useState(1);
  const [editing, setEditing] = useState(false);

  /* Isi formulir dari data tersimpan begitu data selesai dibaca.
   * Penyesuaian state saat render (pola resmi React untuk state yang
   * mengikuti perubahan nilai lain), bukan setState di dalam effect. */
  const [prevLoaded, setPrevLoaded] = useState(loaded);
  if (loaded !== prevLoaded) {
    setPrevLoaded(loaded);
    if (data) {
      setDomisili(data.domisili || "");
      setPosisi(data.posisi || "");
    }
  }

  const preview = useMemo(() => {
    if (!index || !(domisili.trim() || posisi.trim())) return null;
    const r = rank(index, { domisili, posisi, urutan: "relevansi" });
    let verified = 0;
    for (const e of r.results) {
      if (r.matched.has(e.company.no) && e.company.status === "Ada lowongan") {
        verified++;
      }
    }
    return { matched: r.matched.size, verified, top: r.results.slice(0, 3) };
  }, [index, domisili, posisi]);

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
    setStep(1);
    setEditing(true);
  }

  function onClear() {
    clear();
    setDomisili("");
    setPosisi("");
    setStep(1);
    setEditing(false);
  }

  const showSummary = loaded && hasOnboardingChoice(data) && !editing;

  return (
    <div className="wrap narrow">
      <div className="page-head">
        <h1>Mulai</h1>
        <p className="lede">
          Karir mengumpulkan kanal lowongan resmi perusahaan. Jawab dua hal
          di bawah ini, lalu lihat kanal yang paling cocok denganmu.
        </p>
      </div>

      {showSummary ? (
        <section className="panel" aria-label="Pilihanmu saat ini">
          <p className="label">Pilihanmu saat ini</p>
          <dl className="facts">
            <div>
              <dt>Domisili</dt>
              <dd>{data.domisili || "Belum diisi"}</dd>
            </div>
            <div>
              <dt>Posisi</dt>
              <dd>{data.posisi || "Belum diisi"}</dd>
            </div>
          </dl>
          <div className="actions-row">
            <button type="button" className="btn" onClick={goToResults}>
              Lihat lowongan yang cocok
              <Icon name="arrow" size={18} />
            </button>
            <button type="button" className="btn ghost" onClick={onEdit}>
              Ubah pilihan
            </button>
            <button type="button" className="btn ghost" onClick={onClear}>
              Hapus pilihanku
            </button>
          </div>
          <p className="hint">
            Pilihanmu tersimpan di browser ini saja, tidak dikirim ke mana pun.
          </p>
        </section>
      ) : (
        <section className="panel wizard" aria-label="Tiga langkah singkat">
          <div className="wiz-steps" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= step ? "on" : ""} />
            ))}
          </div>
          <p className="label" aria-live="polite">
            Langkah {step} dari 3
          </p>

          <div className="wiz-body" key={step}>
            {step === 1 && (
              <>
                <div className="field">
                  <label htmlFor="mulai-domisili">Di mana kamu tinggal?</label>
                  <div className="input-wrap">
                    <Icon name="pin" size={18} />
                    <input
                      id="mulai-domisili"
                      type="text"
                      value={domisili}
                      placeholder="mis. Bogor, Depok, Cibinong"
                      autoComplete="off"
                      onChange={(e) => setDomisili(e.target.value)}
                    />
                  </div>
                </div>
                <div className="chips-wrap">
                  {CITY_CHIPS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="chip-btn"
                      aria-pressed={domisili === c}
                      onClick={() => setDomisili(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <div className="field">
                  <label htmlFor="mulai-posisi">Posisi apa yang kamu cari?</label>
                  <div className="input-wrap">
                    <Icon name="search" size={18} />
                    <input
                      id="mulai-posisi"
                      type="text"
                      value={posisi}
                      placeholder="mis. Helper Gudang, Cleaning Service"
                      autoComplete="off"
                      onChange={(e) => setPosisi(e.target.value)}
                    />
                  </div>
                </div>
                <div className="chips-wrap">
                  {ROLE_CHIPS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="chip-btn"
                      aria-pressed={posisi === r}
                      onClick={() => setPosisi(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <dl className="facts">
                  <div>
                    <dt>Domisili</dt>
                    <dd>{domisili.trim() || "Belum diisi"}</dd>
                  </div>
                  <div>
                    <dt>Posisi</dt>
                    <dd>{posisi.trim() || "Belum diisi"}</dd>
                  </div>
                </dl>
                <div className="wiz-result" aria-live="polite">
                  {preview ? (
                    <>
                      <p className="wiz-big">
                        <span className="num">{preview.matched}</span> kanal cocok
                      </p>
                      <p className="hint">
                        {preview.verified} di antaranya lowongan terverifikasi.
                      </p>
                    </>
                  ) : state === "error" ? (
                    <p className="hint">
                      Jumlah kanal belum bisa dihitung, tetapi tombol di bawah
                      tetap berfungsi.
                    </p>
                  ) : domisili.trim() || posisi.trim() ? (
                    <div className="skeleton" style={{ height: 44, width: 200 }} />
                  ) : (
                    <p className="hint">Isi salah satu untuk melihat jumlah kanal yang cocok.</p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="wiz-nav">
            {step > 1 ? (
              <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
                <Icon name="back" size={18} />
                Kembali
              </button>
            ) : (
              <Link className="btn ghost" href="/cari">
                Lewati
              </Link>
            )}
            {step < 3 ? (
              <button type="button" className="btn" onClick={() => setStep(step + 1)}>
                Lanjut
                <Icon name="arrow" size={18} />
              </button>
            ) : (
              <button type="button" className="btn" onClick={goToResults}>
                Lihat lowongan yang cocok
                <Icon name="arrow" size={18} />
              </button>
            )}
          </div>
          <p className="hint">
            Pilihanmu tersimpan di browser ini saja, tidak dikirim ke mana pun.
          </p>
        </section>
      )}
    </div>
  );
}
