"use client";

/* Halaman galat rute (KONTEN-08/UX-17): judul dan pesan umum — galat
 * di halaman mana pun tidak lagi disebut sebagai kegagalan memuat
 * data. Komponen klien ini dirender di dalam <main> sebagai pengganti
 * children, jadi berada di dalam provider label layout akar; label
 * dibaca dari konteks dengan cadangan Indonesia. */
import { useLabels } from "@/app/labels-provider";

const ERROR_DEFAULTS = {
  errorTitle: "Ada yang tidak beres.",
  errorMessage: "Halaman ini tidak bisa dimuat. Periksa koneksi lalu coba lagi.",
  retry: "Coba lagi",
};

export default function Error({ error, reset }) {
  const labels = useLabels(ERROR_DEFAULTS);
  return (
    <div className="wrap narrow">
      <div className="page-head">
        <h1>{labels.errorTitle}</h1>
        <p className="lede">{labels.errorMessage}</p>
      </div>
      <div className="actions-row">
        <button className="btn" onClick={() => reset()}>
          {labels.retry}
        </button>
      </div>
    </div>
  );
}
