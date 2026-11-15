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
import { useLabels } from "@/app/labels-provider";

/* Label halaman (W2a, ONB-07): diteruskan layout rute lewat konteks;
 * nilai di bawah adalah cadangan Bahasa Indonesia bila halaman
 * dipakai di luar provider. */
const DEFAULT_LABELS = {
  title: "Mulai",
  lede: "Karir mengumpulkan kanal lowongan resmi perusahaan. Jawab dua hal di bawah ini, lalu lihat kanal yang paling cocok denganmu.",
  loadingChoices: "Memuat pilihan",
  currentChoices: "Pilihanmu saat ini",
  domisili: "Domisili",
  posisi: "Posisi",
  notFilled: "Belum diisi",
  viewMatches: "Lihat lowongan yang cocok",
  editChoices: "Ubah pilihan",
  clearChoices: "Hapus pilihanku",
  savedLocal:
    "Pilihanmu tersimpan di browser ini saja, tidak dikirim ke mana pun.",
  clearTitle: "Hapus pilihanmu?",
  clearMessage:
    "Domisili dan posisi yang tersimpan akan dihapus dari browser ini.",
  wizardLabel: "Tiga langkah singkat",
  stepOf: "Langkah {n} dari 3",
  whereLive: "Di mana kamu tinggal?",
  domisiliPh: "mis. Bogor, Depok, Cibinong",
  whatRole: "Posisi apa yang kamu cari?",
  posisiPh: "mis. Helper Gudang, Cleaning Service",
  matchedChannels: "kanal cocok",
  verifiedAmong: "{n} di antaranya lowongan terverifikasi.",
  topThree: "Tiga yang paling cocok",
  countError:
    "Jumlah kanal belum bisa dihitung, tetapi tombol di bawah tetap berfungsi.",
  fillOne: "Isi salah satu untuk melihat jumlah kanal yang cocok.",
  back: "Kembali",
  skip: "Lewati",
  next: "Lanjut",
  saveFailed: "Pilihan tidak bisa disimpan di browser ini.",
  clearFailed: "Pilihan tidak bisa dihapus. Coba lagi.",
  deleteConfirm: "Ya, hapus",
  cancel: "Batal",
  close: "Tutup",
};

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
  const labels = useLabels(DEFAULT_LABELS);
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
      showToast(labels.saveFailed);
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
      showToast(labels.clearFailed);
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
    <div className="wrap narrow">
      <div className="page-head">
        <h1>{labels.title}</h1>
        <p className="lede">{labels.lede}</p>
      </div>
      {/* AKSES-02: pesan jujur tanpa JavaScript — wizard ini membaca
        * data dari browser dan tidak bisa di-render server. Teks di
        * dalam noscript sengaja tetap Indonesia: tanpa JavaScript
        * konteks bahasa tidak bisa dibaca (W2a). */}
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
        <section className="panel" aria-label={labels.loadingChoices} aria-busy="true">
          <div className="skeleton" style={{ height: 28, width: "60%" }} />
          <div className="skeleton" style={{ height: 80, marginTop: 16 }} />
        </section>
      ) : showSummary ? (
        <section className="panel" aria-label={labels.currentChoices}>
          <p className="label">{labels.currentChoices}</p>
          <dl className="facts">
            <div>
              <dt>{labels.domisili}</dt>
              <dd>{data.domisili || labels.notFilled}</dd>
            </div>
            <div>
              <dt>{labels.posisi}</dt>
              <dd>{data.posisi || labels.notFilled}</dd>
            </div>
          </dl>
          <div className="actions-row">
            <button type="button" className="btn" onClick={goToResults}>
              {labels.viewMatches}
              <Icon name="arrow" size={18} />
            </button>
            <button type="button" className="btn ghost" onClick={onEdit}>
              {labels.editChoices}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setConfirmClear(true)}
            >
              {labels.clearChoices}
            </button>
          </div>
          <p className="hint">{labels.savedLocal}</p>
          <ConfirmDialog
            open={confirmClear}
            title={labels.clearTitle}
            message={labels.clearMessage}
            confirmLabel={labels.deleteConfirm}
            cancelLabel={labels.cancel}
            closeLabel={labels.close}
            onConfirm={onClear}
            onCancel={() => setConfirmClear(false)}
          />
        </section>
      ) : (
        <section className="panel wizard" aria-label={labels.wizardLabel}>
          <div className="wiz-steps" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= step ? "on" : ""} />
            ))}
          </div>
          <p className="label" aria-live="polite">
            {labels.stepOf.replace("{n}", String(step))}
          </p>

          {/* AKSES-10: langkah wizard di dalam <form> supaya Enter di
            * isian melanjutkan langkah (dulu tidak terjadi apa-apa). */}
          <form onSubmit={handleWizardSubmit}>
          <div className="wiz-body" key={step} ref={wizBodyRef} tabIndex={-1}>
            {step === 1 && (
              <>
                <div className="field">
                  <label htmlFor="mulai-domisili">{labels.whereLive}</label>
                  <div className="input-wrap">
                    <Icon name="pin" size={18} />
                    <input
                      id="mulai-domisili"
                      type="text"
                      value={domisili}
                      placeholder={labels.domisiliPh}
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
                {/* UR-08: titik bantuan di langkah 1 — sebelumnya
                  * /mulai tanpa tautan bantuan kontekstual apa pun. */}
                <p className="hint">
                  Bingung mulai dari mana?{" "}
                  <Link href="/faq">Lihat pertanyaan umum.</Link>
                </p>
              </>
            )}
            {step === 2 && (
              <>
                <div className="field">
                  <label htmlFor="mulai-posisi">{labels.whatRole}</label>
                  <div className="input-wrap">
                    <Icon name="search" size={18} />
                    <input
                      id="mulai-posisi"
                      type="text"
                      value={posisi}
                      placeholder={labels.posisiPh}
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
                    <dt>{labels.domisili}</dt>
                    <dd>{domisili.trim() || labels.notFilled}</dd>
                  </div>
                  <div>
                    <dt>{labels.posisi}</dt>
                    <dd>{posisi.trim() || labels.notFilled}</dd>
                  </div>
                </dl>
                <div className="wiz-result" aria-live="polite">
                  {preview ? (
                    <>
                      <p className="wiz-big">
                        <span className="num">{preview.matched}</span>{" "}
                        {labels.matchedChannels}
                      </p>
                      <p className="hint">
                        {(() => {
                          const kalimat = labels.verifiedAmong.replace(
                            "{n}",
                            String(preview.verified),
                          );
                          /* TS-04: kata "terverifikasi" menaut ke
                           * definisinya di halaman Metode — dipertahankan
                           * dari W2b dalam kalimat lokal W2a. Kata dicari
                           * di kalimatnya sendiri supaya berlaku di kedua
                           * bahasa; bila tidak ketemu, kalimat tampil polos. */
                          const kata = kalimat.includes("terverifikasi")
                            ? "terverifikasi"
                            : "verified";
                          const i = kalimat.indexOf(kata);
                          if (i < 0) return kalimat;
                          return (
                            <>
                              {kalimat.slice(0, i)}
                              <Link href="/metode">{kata}</Link>
                              {kalimat.slice(i + kata.length)}
                            </>
                          );
                        })()}
                      </p>
                      {/* ONB-10: tiga teratas akhirnya ditampilkan —
                        * sebelumnya dihitung tetapi tidak pernah
                        * dipakai. Tautan ke halaman perusahaan. */}
                      {preview.top.length > 0 && (
                        <>
                          <p className="label" style={{ marginTop: 16 }}>
                            {labels.topThree}
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
                    <p className="hint">{labels.countError}</p>
                  ) : domisili.trim() || posisi.trim() ? (
                    <div className="skeleton" style={{ height: 44, width: 200 }} />
                  ) : (
                    <p className="hint">{labels.fillOne}</p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="wiz-nav">
            {step > 1 ? (
              <button type="button" className="btn ghost" onClick={() => goToStep(step - 1)}>
                <Icon name="back" size={18} />
                {labels.back}
              </button>
            ) : (
              <Link className="btn ghost" href="/cari" onClick={skipOnboarding}>
                {labels.skip}
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
                {labels.skip}
              </Link>
            )}
            {step < 3 ? (
              <button type="submit" className="btn">
                {labels.next}
                <Icon name="arrow" size={18} />
              </button>
            ) : (
              <button type="submit" className="btn">
                {labels.viewMatches}
                <Icon name="arrow" size={18} />
              </button>
            )}
          </div>
          </form>
          <p className="hint">{labels.savedLocal}</p>
        </section>
      )}
    </div>
  );
}
