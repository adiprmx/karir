"use client";

/* Halaman Mulai: onboarding 3 langkah (domisili, posisi, ringkasan).
 * Bukan pendaftaran: tidak perlu masuk akun untuk mengisinya. Di langkah
 * terakhir pengunjung langsung melihat berapa kanal yang cocok, lalu
 * diantar ke /cari dengan filter terisi. Jawaban tersimpan di browser
 * saja. */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasOnboardingChoice, useOnboarding } from "@/app/onboarding";
import { useCompanyIndex, rank } from "@/app/company-index";
import { trackEvent } from "@/app/analytics-track";
import { ConfirmDialog, Icon, showToast } from "@/app/visual";

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
  /* ONB-11: "Hapus pilihanku" menunggu konfirmasi dialog. */
  const [confirmClear, setConfirmClear] = useState(false);
  /* AKSES-10: target fokus saat langkah berganti (id isian langkah
   * 1/2, atau wiz-body untuk ringkasan langkah 3). Hanya diisi oleh
   * aksi pengguna (Lanjut/Kembali/Enter) — bukan saat muat pertama. */
  const stepFocusTarget = useRef(null);
  const wizBodyRef = useRef(null);

  useEffect(() => {
    if (!stepFocusTarget.current) return;
    const id = stepFocusTarget.current;
    stepFocusTarget.current = null;
    const el =
      id === "wiz-body"
        ? wizBodyRef.current
        : document.getElementById(id);
    el?.focus();
  }, [step]);

  function goToStep(next) {
    stepFocusTarget.current =
      next === 1 ? "mulai-domisili" : next === 2 ? "mulai-posisi" : "wiz-body";
    setStep(next);
  }

  /* AKSES-10: Enter di isian mengirim formulir — sama dengan menekan
   * Lanjut (langkah 1-2) atau tombol hasil (langkah 3). */
  function handleWizardSubmit(e) {
    e.preventDefault();
    if (step < 3) goToStep(step + 1);
    else finishOnboarding();
  }

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
    /* ONB-10: tiga teratas HANYA dari yang benar-benar cocok
     * (matched) — hasil peringkat di luar matched tidak boleh
     * tampil sebagai "paling cocok" bila tidak ada yang cocok. */
    return {
      matched: r.matched.size,
      verified,
      top: r.results
        .filter((e) => r.matched.has(e.company.no))
        .slice(0, 3),
    };
  }, [index, domisili, posisi]);

  function goToResults() {
    const params = new URLSearchParams();
    const d = domisili.trim();
    const p = posisi.trim();
    if (d) params.set("domisili", d);
    if (p) params.set("posisi", p);
    /* ONB-09: gagal simpan diberi tahu lewat toast (ToastHost ada
     * di layout, jadi toast bertahan melewati navigasi); hasil
     * pencarian tetap dibuka karena filternya ada di URL. */
    if ((d || p) && !save({ domisili: d, posisi: p })) {
      showToast("Pilihan tidak bisa disimpan di browser ini.");
    }
    const query = params.toString();
    router.push(query ? `/cari?${query}` : "/cari");
  }

  /* Onboarding selesai (langkah 3): catat event, lalu ke hasil.
   * Hanya dari wizard — tombol yang sama di ringkasan (pilihan yang
   * sudah tersimpan) tidak mengirim event selesai lagi. Yang dikirim
   * hanya jenis eventnya; jawaban domisili/posisi tidak ikut. */
  function finishOnboarding() {
    trackEvent({ type: "onboarding", path: "/mulai", action: "selesai" });
    goToResults();
  }

  function skipOnboarding() {
    trackEvent({ type: "onboarding", path: "/mulai", action: "dilewati" });
  }

  function onEdit() {
    setDomisili(data ? data.domisili || "" : "");
    setPosisi(data ? data.posisi || "" : "");
    setStep(1);
    setEditing(true);
    /* Tombol yang ditekan ikut hilang bersama ringkasan — pindahkan
     * fokus ke isian pertama supaya tidak jatuh ke <body>. */
    requestAnimationFrame(() =>
      document.getElementById("mulai-domisili")?.focus(),
    );
  }

  /* ONB-11: hapus hanya jalan setelah dialog konfirmasi. Bila
   * hapus gagal (ONB-09), pilihan tetap tampil dan pengguna diberi
   * tahu — state tidak di-reset seolah sudah terhapus. */
  function onClear() {
    setConfirmClear(false);
    if (!clear()) {
      showToast("Pilihan tidak bisa dihapus. Coba lagi.");
      return;
    }
    setDomisili("");
    setPosisi("");
    setStep(1);
    setEditing(false);
    requestAnimationFrame(() =>
      document.getElementById("mulai-domisili")?.focus(),
    );
  }

  const showSummary = loaded && hasOnboardingChoice(data) && !editing;

  return (
    /* AKSES-12: seluruh halaman ini teks Indonesia kode-keras. */
    <div className="wrap narrow" lang="id">
      <div className="page-head">
        <h1>Mulai</h1>
        <p className="lede">
          Karir mengumpulkan kanal lowongan resmi perusahaan. Jawab dua hal
          di bawah ini, lalu lihat kanal yang paling cocok denganmu.
        </p>
      </div>
      {/* AKSES-02: pesan jujur tanpa JavaScript — wizard ini membaca
        * data dari browser dan tidak bisa di-render server. */}
      <noscript>
        <p className="note-line">
          <Icon name="info" size={16} />
          Halaman ini butuh JavaScript untuk menampilkan langkah-langkahnya.
          Aktifkan JavaScript, lalu muat ulang halaman ini.
        </p>
      </noscript>

      {/* ONB-04: sebelum data selesai dibaca, tampilkan penahan —
        * pengguna lama tidak lagi sempat melihat wizard kosong
        * sebelum ringkasannya muncul. */}
      {!loaded ? (
        <section className="panel" aria-label="Memuat pilihan" aria-busy="true">
          <div className="skeleton" style={{ height: 28, width: "60%" }} />
          <div className="skeleton" style={{ height: 80, marginTop: 16 }} />
        </section>
      ) : showSummary ? (
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
            <button
              type="button"
              className="btn ghost"
              onClick={() => setConfirmClear(true)}
            >
              Hapus pilihanku
            </button>
          </div>
          <p className="hint">
            Pilihanmu tersimpan di browser ini saja, tidak dikirim ke mana pun.
          </p>
          <ConfirmDialog
            open={confirmClear}
            title="Hapus pilihanmu?"
            message="Domisili dan posisi yang tersimpan akan dihapus dari browser ini."
            confirmLabel="Ya, hapus"
            onConfirm={onClear}
            onCancel={() => setConfirmClear(false)}
          />
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

          {/* AKSES-10: langkah wizard di dalam <form> supaya Enter di
            * isian melanjutkan langkah (dulu tidak terjadi apa-apa). */}
          <form onSubmit={handleWizardSubmit}>
          <div className="wiz-body" key={step} ref={wizBodyRef} tabIndex={-1}>
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
                      enterKeyHint="next"
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
                      enterKeyHint="next"
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
                      {/* ONB-10: tiga teratas akhirnya ditampilkan —
                        * sebelumnya dihitung tetapi tidak pernah
                        * dipakai. Tautan ke halaman perusahaan. */}
                      {preview.top.length > 0 && (
                        <>
                          <p className="label" style={{ marginTop: 16 }}>
                            Tiga yang paling cocok
                          </p>
                          <ul className="mini-list">
                            {preview.top.map((e) => (
                              <li key={e.company.no}>
                                <Link href={`/perusahaan/${e.company.no}`}>
                                  <span className="mini-name">
                                    {e.company.perusahaan}
                                    <span className="mini-sub">
                                      {(e.company.posisi || "").split(",")[0]}
                                      {e.company.lokasi
                                        ? ` · ${e.company.lokasi}`
                                        : ""}
                                    </span>
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
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
              <button type="button" className="btn ghost" onClick={() => goToStep(step - 1)}>
                <Icon name="back" size={18} />
                Kembali
              </button>
            ) : (
              <Link className="btn ghost" href="/cari" onClick={skipOnboarding}>
                Lewati
              </Link>
            )}
            {/* ONB-08: "Lewati" tersedia di semua langkah, bukan
              * hanya langkah 1 — di langkah 2-3 ia duduk di tengah
              * baris navigasi sebagai tautan. */}
            {step > 1 && (
              <Link
                className="linkish"
                href="/cari"
                onClick={skipOnboarding}
                style={{ alignSelf: "center" }}
              >
                Lewati
              </Link>
            )}
            {step < 3 ? (
              <button type="submit" className="btn">
                Lanjut
                <Icon name="arrow" size={18} />
              </button>
            ) : (
              <button type="submit" className="btn">
                Lihat lowongan yang cocok
                <Icon name="arrow" size={18} />
              </button>
            )}
          </div>
          </form>
          <p className="hint">
            Pilihanmu tersimpan di browser ini saja, tidak dikirim ke mana pun.
          </p>
        </section>
      )}
    </div>
  );
}
