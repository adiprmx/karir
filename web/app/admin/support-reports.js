/* Seksi "Laporan tautan mati" untuk panel admin (ADM-14, DUKUNG-01/02).
 *
 * WIRING (koordinator, setelah T15 merge): ganti blok laporan di
 * web/app/admin/page.js dengan komponen ini:
 *   - hapus state reports/reportsError (baris 462-463) dan loadReports
 *     (baris 530-541) beserta pemanggilannya (baris 583),
 *   - ganti blok render <div className="filters"> laporan (baris
 *     1590-1608) dengan <SupportReports db={db} />.
 * `db` adalah instance Firestore dari @/lib/firebase yang sudah
 * diimpor page.js; komponen ini sengaja tidak mengimpornya sendiri.
 *
 * ATURAN FIRESTORE (wajib diterbitkan supaya tombol status bekerja):
 * rules reports saat ini melarang update (allow update: if false),
 * jadi tombol "Tandai sudah ditangani" gagal sampai aturan di bawah
 * diterbitkan. Spesifikasi lengkap ada di docs/DUKUNGAN.md.
 *   allow update: if isAdmin()
 *     && request.resource.data.diff(resource.data).affectedKeys()
 *         .hasOnly(['status', 'ditanganiPada'])
 *     && request.resource.data.status in ['baru', 'ditangani'];
 *
 * KEPUTUSAN DESAIN:
 * - Tidak ada tombol hapus: laporan adalah jejak yang hanya dibaca,
 *   status "ditangani" adalah cara mengosongkan antrean.
 * - Ditulis tanpa JSX (React.createElement) dan tanpa impor @/ atau
 *   firebase di tingkat atas, supaya fungsi murni di file ini bisa
 *   diuji langsung dengan node --test (pola test repo). Firebase
 *   dimuat malas di dalam fungsi async, seperti actions.js.
 * - Panel admin hanya Bahasa Indonesia, jadi tidak ada kunci i18n. */
"use client";

import { useEffect, useState, createElement as h } from "react";

/* Cap waktu terakhir panel laporan dibuka, untuk menghitung laporan
 * yang masuk sejak kunjungan sebelumnya (DUKUNG-01: admin tahu ada
 * laporan baru tanpa menunggu notifikasi otomatis). */
const SEEN_KEY = "karir-admin-reports-seen";
const LIMIT = 20;

/* Status laporan: "baru" bila field status tidak ada atau tidak
 * dikenal (laporan lama sebelum field ini ada), "ditangani" bila
 * admin sudah menandainya. */
export function getReportStatus(report) {
  return report && report.status === "ditangani" ? "ditangani" : "baru";
}

export function filterReports(reports, filter) {
  if (filter === "baru")
    return reports.filter((r) => getReportStatus(r) === "baru");
  if (filter === "ditangani")
    return reports.filter((r) => getReportStatus(r) === "ditangani");
  return [...reports];
}

export function countNewReports(reports) {
  return reports.filter((r) => getReportStatus(r) === "baru").length;
}

/* Laporan yang dibuat setelah cap waktu `since` (ISO). Cap waktu atau
 * tanggal laporan yang tidak valid diabaikan (hasil 0 untuk `since`
 * yang tidak valid). */
export function countReportsSince(reports, since) {
  const sinceMs = Date.parse(since);
  if (Number.isNaN(sinceMs)) return 0;
  return reports.filter((r) => {
    const ms = Date.parse(r.dibuat);
    return !Number.isNaN(ms) && ms > sinceMs;
  }).length;
}

/* Waktu laporan dalam WIB. Masukan yang tidak valid dikembalikan
 * apa adanya, supaya tidak pernah tampil tanggal karangan. */
export function formatReportTime(iso) {
  if (typeof iso !== "string" || iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function SupportReports({ db }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [filter, setFilter] = useState("semua");
  const [sinceCount, setSinceCount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    /* setState di dalam callback async, bukan sinkron di badan effect
     * (pola yang sama dengan pemuat lain di admin/page.js). */
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const { collection, query, orderBy, limit, getDocs } = await import(
          "firebase/firestore"
        );
        const snap = await getDocs(
          query(
            collection(db, "reports"),
            orderBy("dibuat", "desc"),
            limit(LIMIT),
          ),
        );
        if (cancelled) return;
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setReports(list);
        let since = null;
        try {
          since = window.localStorage.getItem(SEEN_KEY);
          window.localStorage.setItem(SEEN_KEY, new Date().toISOString());
        } catch {
          /* Penyimpanan browser tidak tersedia: lewati penanda. */
        }
        setSinceCount(since ? countReportsSince(list, since) : 0);
      } catch {
        if (!cancelled)
          setLoadError("Laporan tautan mati tidak bisa dimuat.");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, reloadKey]);

  async function setStatus(report, next) {
    if (savingId || !db) return;
    const prev = reports;
    setSavingId(report.id);
    setSaveError("");
    setReports(
      prev.map((r) => (r.id === report.id ? { ...r, status: next } : r)),
    );
    try {
      const { doc, updateDoc, serverTimestamp, deleteField } = await import(
        "firebase/firestore"
      );
      await updateDoc(
        doc(db, "reports", report.id),
        next === "ditangani"
          ? { status: "ditangani", ditanganiPada: serverTimestamp() }
          : { status: "baru", ditanganiPada: deleteField() },
      );
    } catch {
      /* Gagal simpan hampir selalu berarti aturan laporan belum
       * diterbitkan (update masih ditolak). Kembalikan tampilan dan
       * beri tahu penyebabnya, jangan diam. */
      setReports(prev);
      setSaveError(
        "Status belum bisa disimpan. Aturan laporan di Firebase belum mengizinkan admin mengubah status.",
      );
    }
    setSavingId(null);
  }

  const newCount = countNewReports(reports);
  const handledCount = reports.length - newCount;
  const shown = filterReports(reports, filter);

  const filterButton = (value, label) =>
    h(
      "button",
      {
        key: value,
        className: "btn ghost small",
        type: "button",
        "aria-pressed": filter === value,
        disabled: loading,
        onClick: () => setFilter(value),
      },
      label,
    );

  return h(
    "div",
    { className: "filters", style: { marginTop: 24 } },
    h("p", { className: "section-label" }, "Laporan tautan mati"),
    h(
      "p",
      { className: "section-note" },
      "20 laporan terakhir dari pengunjung yang menemukan tautan karir tidak bisa dibuka." +
        (newCount > 0 ? ` ${newCount} belum ditangani.` : ""),
    ),
    sinceCount > 0 &&
      h(
        "p",
        { className: "section-note" },
        `${sinceCount} laporan masuk sejak terakhir kali panel ini dibuka.`,
      ),
    h(
      "div",
      { className: "actions-row", style: { marginBottom: 12 } },
      h(
        "button",
        {
          className: "btn ghost small",
          type: "button",
          disabled: loading,
          onClick: () => setReloadKey((k) => k + 1),
        },
        loading ? "Memuat…" : "Muat ulang",
      ),
      filterButton("semua", `Semua (${reports.length})`),
      filterButton("baru", `Baru (${newCount})`),
      filterButton("ditangani", `Sudah ditangani (${handledCount})`),
    ),
    loadError && h("p", { className: "notice" }, loadError),
    saveError && h("p", { className: "notice" }, saveError),
    loading &&
      h(
        "div",
        { className: "state" },
        h("strong", null, "Memuat laporan…"),
      ),
    !loading &&
      !loadError &&
      reports.length === 0 &&
      h("p", { className: "notice" }, "Belum ada laporan."),
    !loading &&
      !loadError &&
      reports.length > 0 &&
      shown.length === 0 &&
      h("p", { className: "notice" }, "Tidak ada laporan dalam filter ini."),
    !loading &&
      shown.length > 0 &&
      h(
        "ul",
        { className: "recheck-list" },
        shown.map((r) => {
          const status = getReportStatus(r);
          const handled = status === "ditangani";
          return h(
            "li",
            { key: r.id },
            `${formatReportTime(r.dibuat)} · ${r.no}. ${r.perusahaan} · ${r.alasan}`,
            !handled &&
              h(
                "span",
                { className: "chip match", style: { marginLeft: 8 } },
                "Baru",
              ),
            " ",
            h("a", { href: `/perusahaan/${r.no}` }, "Lihat perusahaan"),
            " ",
            h(
              "button",
              {
                className: "btn ghost small",
                type: "button",
                disabled: savingId === r.id,
                onClick: () =>
                  setStatus(r, handled ? "baru" : "ditangani"),
              },
              savingId === r.id
                ? "Menyimpan…"
                : handled
                  ? "Batalkan tanda"
                  : "Tandai sudah ditangani",
            ),
          );
        }),
      ),
  );
}
