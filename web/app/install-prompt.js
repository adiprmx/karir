"use client";

/* Ajakan pasang aplikasi (MKT-08/FE-08): kartu kecil di /pengaturan
 * yang hanya muncul bila browser menawarkan pemasangan
 * (beforeinstallprompt). Tanpa pop-up, tanpa paksaan: pengguna yang
 * menutup kartu tidak ditawari lagi di browser itu.
 *
 * Event beforeinstallprompt hanya menyala sekali per muat halaman,
 * dan biasanya menyala sebelum pengguna membuka /pengaturan. Karena
 * itu event ditangkap di tingkat aplikasi (InstallPromptListener,
 * dipasang di layout akar) dan disimpan di window; kartu membaca
 * simpanan yang sama saat dipasang. Kartu tetap tersembunyi sampai
 * kriteria pasang terpenuhi — termasuk service worker, yang berada
 * di luar cakupan batch ini — jadi ini sengaja belum tampil sebelum
 * prasyarat itu ada. */
import { useEffect, useState } from "react";

const DISMISSED_KEY = "karir-install-dismissed";
const READY_EVENT = "karir-install-ready";

/* Penangkap event di tingkat aplikasi: tidak menampilkan apa pun,
 * hanya menyimpan event pemasangan untuk dipakai kartu. */
export function InstallPromptListener() {
  useEffect(() => {
    function onPrompt(e) {
      /* Cegah banner bawaan browser: ajakannya tampil sebagai
       * kartu di /pengaturan saja. */
      e.preventDefault();
      window.__karirInstallPrompt = e;
      window.dispatchEvent(new Event(READY_EVENT));
    }
    function onInstalled() {
      window.__karirInstallPrompt = null;
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

export default function InstallPrompt() {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    /* Baca awal dijadwalkan sebagai microtask: setState di dalam
     * callback, bukan sinkron di badan effect (pola yang sama dengan
     * halaman Pengaturan). */
    queueMicrotask(() => {
      /* Sudah terpasang sebagai aplikasi, atau sudah pernah ditutup:
       * jangan tawarkan lagi. */
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;
      let dismissed = standalone;
      try {
        dismissed =
          dismissed || window.localStorage.getItem(DISMISSED_KEY) === "1";
      } catch {
        /* localStorage tidak bisa dibaca: anggap belum ditutup. */
      }
      if (dismissed) return;
      setHidden(false);
      /* Event mungkin sudah ditangkap listener sebelum kartu dipasang. */
      if (window.__karirInstallPrompt) setReady(true);
    });
    function onReady() {
      setReady(true);
    }
    function onInstalled() {
      setReady(false);
    }
    window.addEventListener(READY_EVENT, onReady);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener(READY_EVENT, onReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    const prompt = window.__karirInstallPrompt;
    if (!prompt) return;
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      /* Event hanya bisa dipakai sekali; bersihkan setelah dipakai. */
      window.__karirInstallPrompt = null;
      if (choice && choice.outcome === "accepted") setReady(false);
    } catch {
      /* Dialog batal: biarkan kartu tetap ada untuk coba lain kali. */
    }
    setBusy(false);
  }

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* localStorage tidak bisa ditulis: sembunyikan untuk sesi ini. */
    }
    setHidden(true);
  }

  if (hidden || !ready) return null;

  return (
    <section className="panel" aria-label="Pasang aplikasi">
      <p className="label">Pasang aplikasi</p>
      <p className="hint">
        Buka Karir langsung dari layar utama, tanpa membuka browser dulu.
        Ukurannya kecil dan tidak mengubah apa pun di data yang tersimpan.
      </p>
      <div className="actions-row">
        <button
          type="button"
          className="btn"
          onClick={install}
          disabled={busy}
        >
          {busy ? "Memasang…" : "Pasang aplikasi"}
        </button>
        <button type="button" className="btn ghost" onClick={dismiss}>
          Nanti saja
        </button>
      </div>
    </section>
  );
}
