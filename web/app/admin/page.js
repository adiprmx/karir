"use client";

/* Admin panel Karir, halaman /admin.
 * Login pakai Firebase Auth (Email/Password). Akun admin dibuat owner
 * di Firebase Console, bukan di sini, dan tidak ada pendaftaran mandiri.
 * Setelah masuk: tabel perusahaan dengan cari, filter, urutan, dan
 * halaman; panel kualitas data; impor dan unduh CSV/JSON; jejak
 * perubahan; dan cek tautan karir. Tulis hanya diizinkan untuk
 * pengguna yang sudah login (aturan Firestore).
 */
import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { STATUS_ORDER } from "@/lib/companies";

const EMPTY = {
  no: "",
  perusahaan: "",
  kategori: "",
  link_karir: "",
  status: "Tidak ada lowongan target",
  tanggal_cek: "",
  catatan: "",
  lokasi: "",
  posisi: "",
};

const CSV_HEADER = [
  "no",
  "perusahaan",
  "kategori",
  "link_karir",
  "status",
  "tanggal_cek",
  "catatan",
  "lokasi",
  "posisi",
];

const PAGE_SIZE = 20;
const MAX_IMPORT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseDate(value) {
  if (!value) return null;
  const parts = String(value).trim().split("-");
  if (parts.length !== 3) return null;
  const t = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return Number.isNaN(t.getTime()) ? null : t;
}

function isStale(c) {
  const t = parseDate(c.tanggal_cek);
  if (!t) return true;
  return Date.now() - t.getTime() > 30 * DAY_MS;
}

function hasNoLink(c) {
  return !(c.link_karir || "").trim();
}

function hasNoLokasi(c) {
  return !(c.lokasi || "").trim();
}

/* Baca teks CSV jadi baris-baris sel, menghormati tanda kutip ganda
 * (termasuk koma dan baris baru di dalam kutipan). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const clean = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || "");
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Admin() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("no");
  const [qualityFilter, setQualityFilter] = useState(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [linkCheck, setLinkCheck] = useState(null);
  const [checkingLink, setCheckingLink] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkDone, setBulkDone] = useState(0);
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkChanges, setBulkChanges] = useState(0);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvValid, setCsvValid] = useState([]);
  const [csvRejected, setCsvRejected] = useState([]);
  const [csvError, setCsvError] = useState("");
  const [csvMessage, setCsvMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditError, setAuditError] = useState("");
  const [reports, setReports] = useState([]);
  const [reportsError, setReportsError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  async function loadCompanies() {
    setLoadingCompanies(true);
    setLoadError("");
    try {
      const snap = await getDocs(
        query(collection(db, "companies"), orderBy("no", "asc")),
      );
      setCompanies(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      setLoadError("Gagal memuat data perusahaan. Periksa koneksi lalu muat ulang halaman.");
    }
    setLoadingCompanies(false);
  }

  async function loadAudit() {
    setAuditError("");
    try {
      const snap = await getDocs(
        query(collection(db, "audit_logs"), orderBy("at", "desc"), limit(20)),
      );
      setAuditEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      setAuditError("Jejak perubahan tidak bisa dimuat.");
    }
  }

  async function loadReports() {
    setReportsError("");
    try {
      const snap = await getDocs(
        query(collection(db, "reports"), orderBy("dibuat", "desc"), limit(20)),
      );
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      setReportsError("Laporan tautan mati tidak bisa dimuat.");
    }
  }

  useEffect(() => {
    if (!user) return;
    loadCompanies();
    loadAudit();
    loadReports();
  }, [user]);

  useEffect(() => {
    setPage(1);
  }, [filter, statusFilter, sortBy, qualityFilter]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setLoginError("Email atau kata sandi salah.");
    }
  }

  async function writeAudit(action, no, perusahaan) {
    try {
      await addDoc(collection(db, "audit_logs"), {
        by: user.email,
        action,
        no,
        perusahaan,
        at: new Date().toISOString(),
      });
      return true;
    } catch {
      return false;
    }
  }

  /* Catat perubahan status ke umpan Yang berubah (koleksi `changes`).
   * Dipanggil dari cek massal saat portal target ternyata tidak bisa
   * dibuka. Gagal tulis tidak menggagalkan pemeriksaan: pemanggil
   * mengabaikan hasilnya. */
  async function writeChange(c, from, to) {
    try {
      await addDoc(collection(db, "changes"), {
        companyNo: Number(c.no),
        perusahaan: c.perusahaan,
        from,
        to,
        checkedAt: todayStr(),
        createdAt: new Date().toISOString(),
      });
      return true;
    } catch {
      return false;
    }
  }

  function pick(c) {
    setSelected(c);
    setForm({
      no: String(c.no),
      perusahaan: c.perusahaan || "",
      kategori: c.kategori || "",
      link_karir: c.link_karir || "",
      status: c.status || "Tidak ada lowongan target",
      tanggal_cek: c.tanggal_cek || "",
      catatan: c.catatan || "",
      lokasi: c.lokasi || "",
      posisi: c.posisi || "",
    });
    setMessage("");
    setLinkCheck(null);
  }

  function addNew() {
    const nextNo =
      companies.length > 0
        ? Math.max(...companies.map((c) => Number(c.no) || 0)) + 1
        : 1;
    setSelected(null);
    setForm({ ...EMPTY, no: String(nextNo) });
    setMessage("");
    setLinkCheck(null);
  }

  function buildData() {
    return {
      no: Number(form.no),
      perusahaan: form.perusahaan.trim(),
      kategori: form.kategori.trim(),
      link_karir: form.link_karir.trim(),
      status: form.status,
      tanggal_cek: form.tanggal_cek.trim(),
      catatan: form.catatan.trim(),
      lokasi: form.lokasi.trim(),
      posisi: form.posisi.trim(),
    };
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    const no = Number(form.no);
    if (!no || !form.perusahaan.trim()) {
      setMessage("Nomor dan nama perusahaan wajib diisi.");
      setSaving(false);
      return;
    }
    if (form.perusahaan.trim().length >= 200) {
      setMessage("Nama perusahaan terlalu panjang, maksimal 199 huruf.");
      setSaving(false);
      return;
    }
    if (!STATUS_ORDER.includes(form.status)) {
      setMessage("Status tidak dikenal. Pilih salah satu dari daftar.");
      setSaving(false);
      return;
    }
    try {
      const data = buildData();
      await setDoc(doc(db, "companies", String(no)), data);
      setCompanies((prev) => {
        const rest = prev.filter((c) => Number(c.no) !== no);
        return [...rest, { id: String(no), ...data }].sort(
          (a, b) => a.no - b.no,
        );
      });
      const auditOk = await writeAudit("save", no, data.perusahaan);
      setMessage(
        auditOk
          ? `Tersimpan: ${data.perusahaan}.`
          : `Tersimpan: ${data.perusahaan}. Tapi jejak perubahannya gagal ditulis.`,
      );
      loadAudit();
    } catch {
      setMessage("Gagal menyimpan. Periksa aturan Firestore dan koneksi.");
    }
    setSaving(false);
  }

  async function remove() {
    if (!selected) return;
    if (!window.confirm(`Hapus ${selected.perusahaan}?`)) return;
    try {
      await deleteDoc(doc(db, "companies", String(selected.no)));
      setCompanies((prev) =>
        prev.filter((c) => Number(c.no) !== Number(selected.no)),
      );
      const auditOk = await writeAudit(
        "delete",
        Number(selected.no),
        selected.perusahaan,
      );
      setSelected(null);
      setForm(EMPTY);
      setLinkCheck(null);
      setMessage(
        auditOk
          ? "Dihapus."
          : "Dihapus. Tapi jejak perubahannya gagal ditulis.",
      );
      loadAudit();
    } catch {
      setMessage("Gagal menghapus. Periksa aturan Firestore dan koneksi.");
    }
  }

  async function checkLink() {
    const no = Number(form.no);
    if (!no) {
      setLinkCheck({ ok: false, error: "Isi nomor perusahaan dulu." });
      return;
    }
    setCheckingLink(true);
    setLinkCheck(null);
    try {
      const res = await fetch("/api/admin/check-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ no }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLinkCheck({
          ok: false,
          error: body.error || "Pemeriksaan gagal.",
        });
      } else {
        setLinkCheck(body);
      }
    } catch {
      setLinkCheck({ ok: false, error: "Tidak bisa menghubungi server." });
    }
    setCheckingLink(false);
  }

  /* Jeda antar pemeriksaan massal. Batas di server: 10 permintaan per
   * 60 detik per alamat IP. Jeda 6,5 detik membuat 22 pemeriksaan
   * selesai dalam sekitar 2,5 menit tanpa kena batas itu. */
  const BULK_CHECK_DELAY_MS = 6500;

  async function checkBulkTargets() {
    const targets = companies
      .filter((c) => c.status === "Ada lowongan target")
      .sort((a, b) => a.no - b.no);
    if (targets.length === 0 || bulkRunning) return;
    setBulkRunning(true);
    setBulkResults([]);
    setBulkChanges(0);
    setBulkDone(0);
    const done = [];
    let recorded = 0;
    for (let i = 0; i < targets.length; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, BULK_CHECK_DELAY_MS));
      }
      const c = targets[i];
      let entry;
      try {
        const res = await fetch("/api/admin/check-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ no: Number(c.no) }),
        });
        const body = await res.json().catch(() => ({}));
        /* API mengembalikan 200 walau portalnya sendiri gagal dibuka,
         * jadi `ok` di sini wajib mengikuti hasil ceknya (body.ok),
         * bukan sekadar respons API. Tanpa ini portal mati terbaca
         * sebagai "bisa dibuka" dan tidak ada perubahan yang tercatat. */
        entry = res.ok
          ? {
              no: c.no,
              perusahaan: c.perusahaan,
              ok: body.ok === true,
              status: body.status,
              error:
                body.ok === true
                  ? undefined
                  : body.error || `kode ${body.status}`,
              checkedAt: new Date().toISOString(),
            }
          : {
              no: c.no,
              perusahaan: c.perusahaan,
              ok: false,
              status: null,
              error: body.error || "Pemeriksaan gagal.",
              checkedAt: new Date().toISOString(),
            };
      } catch {
        entry = {
          no: c.no,
          perusahaan: c.perusahaan,
          ok: false,
          status: null,
          error: "Tidak bisa menghubungi server.",
          checkedAt: new Date().toISOString(),
        };
      }
      done.push(entry);
      setBulkResults([...done]);
      setBulkDone(i + 1);
      /* Portal target yang ternyata tidak bisa dibuka: status
       * tersimpannya tidak lagi cocok dengan hasil cek, jadi
       * perubahannya dicatat ke umpan. Gagal tulis (mis. aturan
       * belum terbit) tidak menghentikan pemeriksaan. */
      if (!entry.ok && typeof entry.status === "number") {
        const recordedOk = await writeChange(
          c,
          c.status,
          "Portal tidak bisa dibuka",
        );
        if (recordedOk) recorded++;
      }
    }
    setBulkChanges(recorded);
    setBulkRunning(false);
  }

  function handleCsvFile(file) {
    setCsvFileName(file ? file.name : "");
    setCsvValid([]);
    setCsvRejected([]);
    setCsvError("");
    setCsvMessage("");
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result || ""));
        if (rows.length === 0) {
          setCsvError("File kosong.");
          return;
        }
        const header = rows[0].map((h) => h.trim());
        const headerOk =
          header.length === CSV_HEADER.length &&
          CSV_HEADER.every((h, i) => header[i] === h);
        if (!headerOk) {
          setCsvError(
            "Baris pertama harus berisi: no, perusahaan, kategori, link_karir, status, tanggal_cek, catatan, lokasi, posisi.",
          );
          return;
        }
        const valid = [];
        const rejected = [];
        rows.slice(1).forEach((cells, idx) => {
          const lineNo = idx + 2;
          if (cells.length !== CSV_HEADER.length) {
            rejected.push({
              line: lineNo,
              reason: `jumlah kolom ${cells.length}, harus ${CSV_HEADER.length}.`,
            });
            return;
          }
          const [noRaw, perusahaan, kategori, link_karir, status, tanggal_cek, catatan, lokasi, posisi] =
            cells.map((c) => c.trim());
          const no = Number(noRaw);
          if (!noRaw || !Number.isInteger(no) || no <= 0) {
            rejected.push({ line: lineNo, reason: "nomor tidak valid." });
            return;
          }
          if (!perusahaan) {
            rejected.push({ line: lineNo, reason: "nama perusahaan kosong." });
            return;
          }
          if (perusahaan.length >= 200) {
            rejected.push({
              line: lineNo,
              reason: "nama perusahaan terlalu panjang.",
            });
            return;
          }
          if (!STATUS_ORDER.includes(status)) {
            rejected.push({
              line: lineNo,
              reason: `status "${status}" tidak dikenal.`,
            });
            return;
          }
          valid.push({
            no,
            perusahaan,
            kategori,
            link_karir,
            status,
            tanggal_cek,
            catatan,
            lokasi,
            posisi,
          });
        });
        setCsvValid(valid);
        setCsvRejected(rejected);
      } catch {
        setCsvError("File tidak bisa dibaca. Pastikan formatnya CSV.");
      }
    };
    reader.onerror = () => {
      setCsvError("File tidak bisa dibaca.");
    };
    reader.readAsText(file);
  }

  async function importCsv() {
    if (csvValid.length === 0) {
      setCsvMessage("Tidak ada baris valid untuk diimpor.");
      return;
    }
    if (csvValid.length > MAX_IMPORT) {
      setCsvMessage(
        `Terlalu banyak: ${csvValid.length} baris. Maksimal ${MAX_IMPORT} baris per impor. Bagi file jadi beberapa bagian.`,
      );
      return;
    }
    setImporting(true);
    setCsvMessage("");
    let okCount = 0;
    let failCount = 0;
    let firstFail = "";
    for (let i = 0; i < csvValid.length; i += 10) {
      const chunk = csvValid.slice(i, i + 10);
      const results = await Promise.allSettled(
        chunk.map((row) =>
          setDoc(doc(db, "companies", String(row.no)), row),
        ),
      );
      results.forEach((r, j) => {
        if (r.status === "fulfilled") {
          okCount++;
        } else {
          failCount++;
          if (!firstFail) firstFail = `nomor ${chunk[j].no}`;
        }
      });
    }
    if (okCount > 0) {
      const okRows = csvValid.slice(0, okCount);
      await Promise.allSettled(
        okRows.map((row) => writeAudit("save", row.no, row.perusahaan)),
      );
      setCompanies((prev) => {
        const byNo = new Map(prev.map((c) => [Number(c.no), c]));
        okRows.forEach((row) =>
          byNo.set(row.no, { id: String(row.no), ...row }),
        );
        return [...byNo.values()].sort((a, b) => a.no - b.no);
      });
    }
    setCsvMessage(
      failCount === 0
        ? `Impor selesai: ${okCount} baris masuk.`
        : `Impor selesai sebagian: ${okCount} baris masuk, ${failCount} baris gagal${firstFail ? `, pertama di ${firstFail}` : ""}. Periksa koneksi lalu coba lagi untuk yang gagal.`,
    );
    setCsvValid([]);
    setCsvRejected([]);
    setCsvFileName("");
    loadAudit();
    setImporting(false);
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const lines = [CSV_HEADER.join(",")];
    companies.forEach((c) => {
      lines.push(
        CSV_HEADER.map((k) => csvCell(k === "no" ? c.no : c[k] || "")).join(
          ",",
        ),
      );
    });
    downloadFile(
      `karir-perusahaan-${todayStr()}.csv`,
      lines.join("\n"),
      "text/csv;charset=utf-8",
    );
  }

  function exportJson() {
    downloadFile(
      `karir-perusahaan-${todayStr()}.json`,
      JSON.stringify(companies, null, 2),
      "application/json;charset=utf-8",
    );
  }

  if (!authChecked) {
    return (
      <div className="wrap">
        <div className="state">
          <strong>Memuat…</strong>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="wrap">
        <div className="page-head">
          <h1>Admin</h1>
          <p className="lede">
            Masuk dengan akun admin yang dibuat di Firebase Console.
          </p>
        </div>
        <form
          className="filters"
          style={{ maxWidth: 360 }}
          onSubmit={handleLogin}
        >
          <fieldset>
            <legend>Email</legend>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </fieldset>
          <fieldset>
            <legend>Kata sandi</legend>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </fieldset>
          {loginError && <p className="notice">{loginError}</p>}
          <button className="btn" type="submit">
            Masuk
          </button>
        </form>
      </div>
    );
  }

  const qualityCounts = {
    noLink: companies.filter(hasNoLink).length,
    noLokasi: companies.filter(hasNoLokasi).length,
    stale: companies.filter(isStale).length,
  };

  let shown = companies.filter((c) => {
    const q = filter.trim().toLowerCase();
    if (q && !`${c.perusahaan} ${c.no}`.toLowerCase().includes(q)) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    if (qualityFilter === "noLink" && !hasNoLink(c)) return false;
    if (qualityFilter === "noLokasi" && !hasNoLokasi(c)) return false;
    if (qualityFilter === "stale" && !isStale(c)) return false;
    return true;
  });
  shown = [...shown].sort((a, b) =>
    sortBy === "nama"
      ? a.perusahaan.localeCompare(b.perusahaan, "id")
      : a.no - b.no,
  );

  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = shown.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const qualityButtons = [
    { key: "noLink", label: "Tanpa tautan karir", count: qualityCounts.noLink },
    { key: "noLokasi", label: "Tanpa lokasi", count: qualityCounts.noLokasi },
    { key: "stale", label: "Sudah lama tidak dicek", count: qualityCounts.stale },
  ];

  const targetCompanies = companies
    .filter((c) => c.status === "Ada lowongan target")
    .sort((a, b) => a.no - b.no);

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Admin</h1>
        <p className="lede">
          Masuk sebagai {user.email} · {companies.length} perusahaan ·{" "}
          <button
            type="button"
            onClick={() => signOut(auth)}
            style={{
              background: "none",
              border: 0,
              padding: 0,
              font: "inherit",
              color: "inherit",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Keluar
          </button>
        </p>
      </div>

      <div className="filters">
        <p className="section-label">Kualitas data</p>
        <p className="section-note">
          Ketuk salah satu angka untuk melihat baris yang bermasalah. Ketuk
          lagi untuk kembali ke semua data.
        </p>
        <div className="chip-row">
          {qualityButtons.map((b) => (
            <button
              key={b.key}
              type="button"
              className="btn ghost"
              aria-pressed={qualityFilter === b.key}
              onClick={() =>
                setQualityFilter(qualityFilter === b.key ? null : b.key)
              }
              style={
                qualityFilter === b.key
                  ? { background: "#0a0a0a", color: "#fff" }
                  : undefined
              }
            >
              <span className="num">{b.count}</span> {b.label}
            </button>
          ))}
        </div>
        {qualityFilter && (
          <p className="notice">
            Menampilkan baris yang bermasalah saja. Ketuk angka yang sama
            untuk melihat semua data lagi.
          </p>
        )}
      </div>

      <div className="cari-grid">
        <div>
          <div className="filters" style={{ position: "static" }}>
            <fieldset>
              <legend>Cari perusahaan</legend>
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Nama atau nomor"
                autoComplete="off"
              />
            </fieldset>
            <fieldset>
              <legend>Status</legend>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Semua status</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </fieldset>
            <fieldset>
              <legend>Urutan</legend>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="no">Nomor</option>
                <option value="nama">Nama A sampai Z</option>
              </select>
            </fieldset>
            <button className="btn" type="button" onClick={addNew}>
              Tambah perusahaan
            </button>
          </div>

          {loadError && <p className="notice">{loadError}</p>}
          {loadingCompanies && (
            <div className="state">
              <strong>Memuat data perusahaan…</strong>
            </div>
          )}

          <table className="results-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Perusahaan</th>
                <th>Status</th>
                <th>Tanggal cek</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => (
                <tr
                  key={c.no}
                  onClick={() => pick(c)}
                  style={{
                    cursor: "pointer",
                    background:
                      selected && Number(selected.no) === Number(c.no)
                        ? "#f4f4f5"
                        : undefined,
                  }}
                >
                  <td data-label="No">{c.no}</td>
                  <td data-label="Perusahaan">{c.perusahaan}</td>
                  <td data-label="Status">{c.status}</td>
                  <td data-label="Tanggal cek">{c.tanggal_cek || "-"}</td>
                </tr>
              ))}
              {pageRows.length === 0 && !loadingCompanies && (
                <tr>
                  <td colSpan={4}>Tidak ada perusahaan yang cocok.</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="filter-actions" style={{ marginTop: 16 }}>
            <button
              className="btn ghost"
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              Sebelumnya
            </button>
            <span className="result-count">
              Halaman {safePage} dari {totalPages} · {shown.length} perusahaan
            </span>
            <button
              className="btn ghost"
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              Berikutnya
            </button>
          </div>
        </div>

        <form className="filters" style={{ position: "static" }} onSubmit={save}>
          <fieldset>
            <legend>Nomor</legend>
            <input
              type="number"
              value={form.no}
              onChange={(e) => setForm({ ...form, no: e.target.value })}
              required
            />
          </fieldset>
          <fieldset>
            <legend>Perusahaan</legend>
            <input
              type="text"
              value={form.perusahaan}
              onChange={(e) => setForm({ ...form, perusahaan: e.target.value })}
              required
            />
          </fieldset>
          <fieldset>
            <legend>Kategori</legend>
            <input
              type="text"
              value={form.kategori}
              onChange={(e) => setForm({ ...form, kategori: e.target.value })}
            />
          </fieldset>
          <fieldset>
            <legend>Link karir</legend>
            <input
              type="url"
              value={form.link_karir}
              onChange={(e) => setForm({ ...form, link_karir: e.target.value })}
              placeholder="https://…"
            />
          </fieldset>
          <div className="filter-actions">
            <button
              className="btn ghost"
              type="button"
              onClick={checkLink}
              disabled={checkingLink || !Number(form.no)}
            >
              {checkingLink ? "Memeriksa…" : "Cek tautan"}
            </button>
            {linkCheck && linkCheck.ok && (
              <button
                className="btn ghost"
                type="button"
                onClick={() => setForm({ ...form, tanggal_cek: todayStr() })}
              >
                Perbarui tanggal cek ke hari ini
              </button>
            )}
          </div>
          {linkCheck && (
            <p className="notice">
              {linkCheck.ok
                ? `Tautan bisa dibuka, kode ${linkCheck.status}.`
                : `Tautan tidak bisa dibuka: ${linkCheck.error || "tidak diketahui."}`}
            </p>
          )}
          <fieldset>
            <legend>Status</legend>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </fieldset>
          <fieldset>
            <legend>Tanggal cek (YYYY-MM-DD)</legend>
            <input
              type="text"
              value={form.tanggal_cek}
              onChange={(e) => setForm({ ...form, tanggal_cek: e.target.value })}
              placeholder="2026-11-06"
            />
          </fieldset>
          <fieldset>
            <legend>Lokasi</legend>
            <input
              type="text"
              value={form.lokasi}
              onChange={(e) => setForm({ ...form, lokasi: e.target.value })}
            />
          </fieldset>
          <fieldset>
            <legend>Posisi tercatat</legend>
            <input
              type="text"
              value={form.posisi}
              onChange={(e) => setForm({ ...form, posisi: e.target.value })}
            />
          </fieldset>
          <fieldset>
            <legend>Catatan</legend>
            <input
              type="text"
              value={form.catatan}
              onChange={(e) => setForm({ ...form, catatan: e.target.value })}
            />
          </fieldset>
          {message && <p className="notice">{message}</p>}
          <div className="filter-actions">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </button>
            {selected && (
              <button
                className="btn ghost"
                type="button"
                onClick={remove}
                disabled={saving}
              >
                Hapus
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="filters" style={{ marginTop: 24 }}>
        <p className="section-label">Cek massal tautan target</p>
        <p className="section-note">
          Memeriksa satu per satu tautan {targetCompanies.length} perusahaan
          yang punya lowongan target. Tiap pemeriksaan dijeda beberapa
          detik supaya tidak melewati batas server. Tombol tidak bisa
          ditekan selama pemeriksaan berjalan.
        </p>
        <div className="filter-actions">
          <button
            className="btn"
            type="button"
            onClick={checkBulkTargets}
            disabled={bulkRunning || targetCompanies.length === 0}
          >
            {bulkRunning
              ? `Memeriksa ${bulkDone} dari ${targetCompanies.length}…`
              : `Cek ${targetCompanies.length} tautan target`}
          </button>
        </div>
        {bulkDone > 0 && (
          <p className="notice">
            {bulkRunning
              ? `${bulkDone} dari ${targetCompanies.length} sudah diperiksa.`
              : `Selesai: ${bulkResults.filter((r) => r.ok).length} bisa dibuka, ${bulkResults.filter((r) => !r.ok).length} gagal, dari ${targetCompanies.length} tautan.`}
          </p>
        )}
        {bulkResults.length > 0 && (
          <ul className="recheck-list">
            {bulkResults.map((r) => (
              <li key={r.no}>
                {formatTime(r.checkedAt)} · {r.no}. {r.perusahaan} ·{" "}
                {r.ok
                  ? `bisa dibuka, kode ${r.status}`
                  : `gagal: ${r.error}`}
              </li>
            ))}
          </ul>
        )}
        {bulkChanges > 0 && (
          <p className="notice">Perubahan dicatat di umpan Yang berubah.</p>
        )}
      </div>

      <div className="filters" style={{ marginTop: 24 }}>
        <p className="section-label">Impor dan unduh data</p>
        <p className="section-note">
          Impor menerima file CSV dengan baris pertama: no, perusahaan,
          kategori, link_karir, status, tanggal_cek, catatan, lokasi,
          posisi. Maksimal 100 baris per impor.
        </p>
        <fieldset>
          <legend>Pilih file CSV</legend>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleCsvFile(e.target.files?.[0] || null)}
          />
        </fieldset>
        {csvFileName && <p className="notice">File: {csvFileName}</p>}
        {csvError && <p className="notice">{csvError}</p>}
        {(csvValid.length > 0 || csvRejected.length > 0) && (
          <p className="notice">
            {csvValid.length} baris valid, {csvRejected.length} baris
            ditolak
            {csvRejected.length > 0
              ? `. Pertama yang ditolak: baris ${csvRejected[0].line}, ${csvRejected[0].reason}`
              : "."}
          </p>
        )}
        {csvValid.length > MAX_IMPORT && (
          <p className="notice">
            Terlalu banyak: {csvValid.length} baris valid. Maksimal{" "}
            {MAX_IMPORT} baris per impor. Bagi file jadi beberapa bagian.
          </p>
        )}
        <div className="filter-actions">
          <button
            className="btn"
            type="button"
            onClick={importCsv}
            disabled={
              importing ||
              csvValid.length === 0 ||
              csvValid.length > MAX_IMPORT
            }
          >
            {importing ? "Mengimpor…" : `Impor ${csvValid.length} baris`}
          </button>
          <button className="btn ghost" type="button" onClick={exportCsv}>
            Unduh CSV
          </button>
          <button className="btn ghost" type="button" onClick={exportJson}>
            Unduh JSON
          </button>
        </div>
        {csvMessage && <p className="notice">{csvMessage}</p>}
      </div>

      <div className="filters" style={{ marginTop: 24 }}>
        <p className="section-label">Jejak perubahan</p>
        <p className="section-note">
          20 perubahan terakhir yang dicatat panel ini.
        </p>
        {auditError && <p className="notice">{auditError}</p>}
        {auditEntries.length === 0 && !auditError ? (
          <p className="notice">Belum ada perubahan yang tercatat.</p>
        ) : (
          <ul className="recheck-list">
            {auditEntries.map((a) => (
              <li key={a.id}>
                {formatTime(a.at)} · {a.by} ·{" "}
                {a.action === "delete" ? "Hapus" : "Simpan"} · {a.no}.{" "}
                {a.perusahaan}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="filters" style={{ marginTop: 24 }}>
        <p className="section-label">Laporan tautan mati</p>
        <p className="section-note">
          20 laporan terakhir dari pengunjung yang menemukan tautan karir
          tidak bisa dibuka.
        </p>
        {reportsError && <p className="notice">{reportsError}</p>}
        {reports.length === 0 && !reportsError ? (
          <p className="notice">Belum ada laporan.</p>
        ) : (
          <ul className="recheck-list">
            {reports.map((r) => (
              <li key={r.id}>
                {formatTime(r.dibuat)} · {r.no}. {r.perusahaan} · {r.alasan}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
