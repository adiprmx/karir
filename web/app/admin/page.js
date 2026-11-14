"use client";

/* Admin panel Karir, halaman /admin.
 * Login pakai Firebase Auth (Email/Password). Akun admin dibuat owner
 * di Firebase Console, bukan di sini, dan tidak ada pendaftaran mandiri.
 * Setelah masuk, klaim admin di token diperiksa (getIdTokenResult
 * dengan refresh paksa sekali): hanya akun dengan klaim admin yang
 * melihat panel. Akun biasa yang masuk melihat pesan penolakan, bukan
 * panel. Tulis hanya diizinkan untuk admin (aturan Firestore).
 *
 * Hemat kuota baca (FIN-04, arsitektur seed-first S3): seksi Jejak
 * perubahan, Laporan tautan mati, dan Pengunjung TIDAK dimuat saat
 * panel dibuka — masing-masing dimuat sekali saat admin membukanya
 * (tombol Tampilkan). Batas baca tiap seksi juga diperkecil.
 * Seksi Pemakaian kuota membaca satu dokumen marker meta/lastChange
 * (1 baca) dan menampilkan estimasi pemakaian kuota baca harian.
 * Setiap simpan/hapus/impor yang mengubah data perusahaan menaikkan
 * marker (bumpMarker) supaya instance web refill data live.
 */
import { useEffect, useState } from "react";
import {
  getIdTokenResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { STATUS_ORDER } from "@/lib/companies";

const EMPTY = {
  no: "",
  perusahaan: "",
  kategori: "",
  link_karir: "",
  status: "Tidak ada lowongan",
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
/* Batas baca seksi admin (FIN-04): diperkecil dari nilai lama
 * (pengunjung 1000 -> 300, profil 500 -> 100, jejak/laporan 20 -> 10)
 * supaya satu kali buka panel tidak menghabiskan ribuan baca. */
const VISITOR_LIMIT = 300;
const PROFILES_LIMIT = 100;
const AUDIT_LIMIT = 10;
const REPORTS_LIMIT = 10;
const VISITOR_DAYS = 30;
/* Kuota baca harian Firestore paket Spark. */
const QUOTA_DAILY_LIMIT = 50000;
const TRACKER_ACTIONS = ["Ditandai", "Sudah dilamar", "Dipanggil", "Ditolak"];

/* Hari (YYYY-MM-DD) dari satu catatan pengunjung: pakai kolom `day`
 * bila ada, kalau tidak potong 10 huruf pertama dari `ts`. */
function eventDay(e) {
  const d =
    typeof e.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.day)
      ? e.day
      : String(e.ts || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

function dayString(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${day}`;
}

function formatDay(day) {
  const parts = day.split("-");
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function topCounts(map, keyName) {
  return [...map.entries()]
    .map(([key, count]) => ({ [keyName]: key, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (typeof a[keyName] === "number" && typeof b[keyName] === "number")
        return a[keyName] - b[keyName];
      return String(a[keyName]).localeCompare(String(b[keyName]), "id");
    })
    .slice(0, 10);
}

/* Ringkasan pengunjung dari catatan mentah. Fungsi murni: tidak
 * menyentuh jaringan atau state, jadi bisa dites langsung. `today`
 * bisa diisi tanggal tertentu supaya tes deterministik. Yang dihitung
 * hanya agregat anonim: alamat pengunjung tidak pernah disimpan atau
 * ditampilkan. */
export function aggregateVisitors(events, companies, today = new Date()) {
  const list = Array.isArray(events) ? events : [];
  const names = new Map(
    (Array.isArray(companies) ? companies : []).map((c) => [
      Number(c.no),
      c.perusahaan ? String(c.perusahaan) : `No. ${c.no}`,
    ]),
  );

  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  start.setDate(start.getDate() - (VISITOR_DAYS - 1));
  const cutoffStr = dayString(start);

  const perDay = new Map();
  const paths = new Map();
  const searches = new Map();
  const opened = new Map();
  const tracker = new Map(TRACKER_ACTIONS.map((a) => [a, 0]));
  const kindsByVisitor = new Map();

  list.forEach((e) => {
    if (!e || typeof e !== "object") return;
    const who = e.visitorHash || e.visitor || "";
    const day = eventDay(e);
    if (who && day && day >= cutoffStr) {
      if (!perDay.has(day)) perDay.set(day, new Set());
      perDay.get(day).add(who);
    }
    if (e.type === "pageview" && typeof e.path === "string" && e.path.trim()) {
      paths.set(e.path, (paths.get(e.path) || 0) + 1);
    }
    if (e.type === "search" && typeof e.q === "string" && e.q.trim()) {
      const q = e.q.trim();
      searches.set(q, (searches.get(q) || 0) + 1);
    }
    if (e.type === "detail" && Number.isInteger(e.companyNo)) {
      opened.set(e.companyNo, (opened.get(e.companyNo) || 0) + 1);
    }
    if (e.type === "tracker_mark" && TRACKER_ACTIONS.includes(e.action)) {
      tracker.set(e.action, tracker.get(e.action) + 1);
    }
    if (typeof e.visitor === "string" && e.visitor) {
      if (!kindsByVisitor.has(e.visitor))
        kindsByVisitor.set(e.visitor, new Set());
      kindsByVisitor.get(e.visitor).add(e.type);
    }
  });

  const daily = [];
  for (let i = VISITOR_DAYS - 1; i >= 0; i--) {
    const d = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    d.setDate(d.getDate() - i);
    const key = dayString(d);
    daily.push({
      day: key,
      label: formatDay(key),
      count: perDay.get(key)?.size || 0,
    });
  }

  const totalVisitors = kindsByVisitor.size;
  const serious = [...kindsByVisitor.values()].filter(
    (kinds) =>
      kinds.has("search") && kinds.has("detail") && kinds.has("tracker_mark"),
  ).length;

  return {
    total: list.length,
    daily,
    topPaths: topCounts(paths, "path"),
    topSearches: topCounts(searches, "q"),
    topCompanies: topCounts(opened, "no").map((row) => ({
      no: row.no,
      name: names.get(row.no) || `No. ${row.no}`,
      count: row.count,
    })),
    tracker: TRACKER_ACTIONS.map((action) => ({
      action,
      count: tracker.get(action),
    })),
    serious: {
      count: serious,
      total: totalVisitors,
      percent:
        totalVisitors === 0 ? 0 : Math.round((serious / totalVisitors) * 100),
    },
  };
}

/* Aktivitas akun yang masuk, dipisah dari tamu. Fungsi murni.
 * `events` catatan pengunjung (boleh membawa `uid` bila ada pengguna
 * yang masuk), `profiles` daftar profil akun { id/uid, email,
 * displayName }. Tamu dihitung sebagai agregat tanpa identitas.
 * "Butuh beneran": mencari peran spesifik, membuka detail, dan
 * menandai lamaran, sama seperti hitungan serius di aggregateVisitors,
 * hanya dipisah akun masuk vs tamu. */
export function aggregateAccountActivity(events, profiles) {
  const list = Array.isArray(events) ? events : [];
  const profileByUid = new Map(
    (Array.isArray(profiles) ? profiles : []).map((p) => [
      String(p.id ?? p.uid ?? ""),
      p,
    ]),
  );
  const byUid = new Map();
  const guestKinds = new Map();
  const guests = { searches: 0, opened: 0, tracker: 0, total: 0 };

  list.forEach((e) => {
    if (!e || typeof e !== "object") return;
    const isSearch = e.type === "search";
    const isDetail = e.type === "detail";
    const isTracker = e.type === "tracker_mark";
    const uid =
      typeof e.uid === "string" && e.uid ? e.uid : "";
    if (uid) {
      if (!byUid.has(uid)) {
        byUid.set(uid, {
          uid,
          searches: 0,
          opened: 0,
          tracker: 0,
          total: 0,
          kinds: new Set(),
        });
      }
      const r = byUid.get(uid);
      r.total++;
      if (isSearch) r.searches++;
      if (isDetail) r.opened++;
      if (isTracker) r.tracker++;
      r.kinds.add(e.type);
    } else {
      const key = e.visitorHash || e.visitor || "tamu";
      if (!guestKinds.has(key)) guestKinds.set(key, new Set());
      guestKinds.get(key).add(e.type);
      guests.total++;
      if (isSearch) guests.searches++;
      if (isDetail) guests.opened++;
      if (isTracker) guests.tracker++;
    }
  });

  const isSerious = (kinds) =>
    kinds.has("search") && kinds.has("detail") && kinds.has("tracker_mark");

  const accounts = [...byUid.values()]
    .map((r) => {
      const p = profileByUid.get(r.uid);
      return {
        uid: r.uid,
        email: p && p.email ? String(p.email) : "",
        displayName: p && p.displayName ? String(p.displayName) : "",
        searches: r.searches,
        opened: r.opened,
        tracker: r.tracker,
        total: r.total,
        serious: isSerious(r.kinds),
      };
    })
    .sort(
      (a, b) =>
        b.total - a.total ||
        a.email.localeCompare(b.email, "id") ||
        a.uid.localeCompare(b.uid),
    )
    .slice(0, 10);

  return {
    accounts,
    totalLogin: byUid.size,
    seriousLogin: [...byUid.values()].filter((r) => isSerious(r.kinds))
      .length,
    guests: {
      ...guests,
      totalVisitors: guestKinds.size,
      serious: [...guestKinds.values()].filter((k) => isSerious(k)).length,
    },
  };
}

/* Sinyal kemungkinan bot, hanya untuk dilihat admin, bukan untuk
 * memblokir otomatis. Fungsi murni. `top`: pengunjung paling aktif
 * berdasarkan jumlah aktivitas. `noPageview`: pengunjung dengan
 * minimal 3 aktivitas dan nol pageview. `flagged`: jumlah aktivitas
 * bertanda uaFlag dari server; bila field itu belum ada di data,
 * hasFlagField false dan angkanya 0. */
export function aggregateBotSignals(events) {
  const list = Array.isArray(events) ? events : [];
  const byVisitor = new Map();
  let flagged = 0;
  let hasFlagField = false;
  list.forEach((e) => {
    if (!e || typeof e !== "object") return;
    if ("uaFlag" in e) hasFlagField = true;
    if (e.uaFlag === true) flagged++;
    const key = e.visitorHash || e.visitor || "";
    if (!key) return;
    if (!byVisitor.has(key)) {
      byVisitor.set(key, { key, count: 0, pageviews: 0 });
    }
    const r = byVisitor.get(key);
    r.count++;
    if (e.type === "pageview") r.pageviews++;
  });
  const all = [...byVisitor.values()];
  return {
    top: [...all]
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, 10),
    noPageview: all
      .filter((r) => r.count >= 3 && r.pageviews === 0)
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, 10),
    noPageviewTotal: all.filter((r) => r.count >= 3 && r.pageviews === 0)
      .length,
    flagged,
    hasFlagField,
  };
}

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
  /* isAdmin: null = klaim admin belum diperiksa, true/false = hasil
   * pemeriksaan klaim admin di token (getIdTokenResult). */
  const [isAdmin, setIsAdmin] = useState(null);
  const [adminCheckError, setAdminCheckError] = useState(false);
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
  const [visitorEvents, setVisitorEvents] = useState([]);
  const [loadingVisitors, setLoadingVisitors] = useState(false);
  const [visitorsError, setVisitorsError] = useState("");
  const [visitorsCapped, setVisitorsCapped] = useState(false);
  const [userProfiles, setUserProfiles] = useState([]);
  const [profilesError, setProfilesError] = useState("");
  /* Seksi malas (FIN-04): false = belum dibuka, datanya belum dibaca.
   * Sekali dibuka, datanya dimuat sekali dan dipakai ulang. */
  const [auditOpen, setAuditOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [visitorsOpen, setVisitorsOpen] = useState(false);
  /* Marker kesegaran meta/lastChange (1 baca saat panel dibuka):
   * null = belum dimuat, "missing" = dokumen belum ada,
   * "error" = tidak bisa dibaca, objek = isi marker. */
  const [quota, setQuota] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
      if (!u) {
        setIsAdmin(null);
        setAdminCheckError(false);
        return;
      }
      /* Periksa klaim admin di token, dengan refresh paksa sekali
       * supaya klaim yang baru dipasang langsung terbaca. Panel baru
       * tampil setelah pemeriksaan ini selesai. */
      setIsAdmin(null);
      setAdminCheckError(false);
      getIdTokenResult(u, true).then(
        (result) => {
          if (cancelled) return;
          setIsAdmin(result.claims.admin === true);
        },
        () => {
          if (cancelled) return;
          setIsAdmin(false);
          setAdminCheckError(true);
        },
      );
    });
    return () => {
      cancelled = true;
      unsub();
    };
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
        query(
          collection(db, "audit_logs"),
          orderBy("at", "desc"),
          limit(AUDIT_LIMIT),
        ),
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
        query(
          collection(db, "reports"),
          orderBy("dibuat", "desc"),
          limit(REPORTS_LIMIT),
        ),
      );
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      setReportsError("Laporan tautan mati tidak bisa dimuat.");
    }
  }

  /* Baca marker kesegaran (1 baca) untuk tampilan pemakaian kuota.
   * Gagal baca tidak menggagalkan panel: seksi kuota menampilkan
   * pesan "belum bisa dibaca" (mis. aturan marker belum terbit). */
  async function loadQuota() {
    try {
      const snap = await getDoc(doc(db, "meta", "lastChange"));
      if (!snap.exists()) {
        setQuota("missing");
        return;
      }
      setQuota(snap.data());
    } catch {
      setQuota("error");
    }
  }

  /* Naikkan marker kesegaran (rev+1) setelah data perusahaan berubah,
   * supaya instance web refill data live. Best-effort: tidak pernah
   * melempar, kegagalan ditelan (admin tetap melihat pesan simpan
   * yang benar; marker tertinggal hanya berarti data live tampil
   * terlambat sampai bump berikutnya). Bila dokumen belum ada,
   * dibuat lengkap dengan pencacah nol — hanya bila update gagal
   * karena dokumen tidak ditemukan, bukan karena alasan lain
   * (setDoc buta bisa me-reset rev yang sudah ada). */
  async function bumpMarker() {
    try {
      await updateDoc(doc(db, "meta", "lastChange"), {
        rev: increment(1),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (err && err.code === "not-found") {
        try {
          await setDoc(doc(db, "meta", "lastChange"), {
            rev: 1,
            updatedAt: new Date().toISOString(),
            counterDay: todayStr(),
            refillsToday: 0,
            readsEstimate: 0,
          });
        } catch {
          /* Best-effort. */
        }
      }
    }
  }

  async function loadVisitors() {
    setLoadingVisitors(true);
    setVisitorsError("");
    try {
      const snap = await getDocs(
        query(
          collection(db, "analytics_events"),
          orderBy("ts", "desc"),
          limit(VISITOR_LIMIT),
        ),
      );
      setVisitorEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setVisitorsCapped(snap.size >= VISITOR_LIMIT);
    } catch {
      setVisitorsError(
        "Data pengunjung belum bisa dibaca. Terbitkan dulu aturan analytics_events di Firebase Console.",
      );
    }
    setLoadingVisitors(false);
  }

  async function loadProfiles() {
    setProfilesError("");
    try {
      const snap = await getDocs(
        query(collection(db, "user_profiles"), limit(PROFILES_LIMIT)),
      );
      setUserProfiles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      setProfilesError("Profil akun tidak bisa dibaca.");
    }
  }

  useEffect(() => {
    if (!user || !isAdmin) return;
    /* Pemuat mengatur state awal (loading / reset error) secara sinkron,
     * jadi pemanggilannya dijadwalkan sebagai microtask: setState di
     * dalam callback, bukan sinkron di badan effect.
     * FIN-04: saat panel dibuka HANYA perusahaan + marker kuota yang
     * dimuat. Jejak, laporan, dan pengunjung dimuat saat admin
     * membuka seksinya (tombol Tampilkan di tiap seksi). */
    queueMicrotask(() => {
      loadCompanies();
      loadQuota();
    });
  }, [user, isAdmin]);

  /* Kembali ke halaman 1 begitu filter berubah. Penyesuaian state saat
   * render (pola resmi React untuk state yang mengikuti perubahan nilai
   * lain), bukan setState di dalam effect. */
  const [prevFilters, setPrevFilters] = useState([
    filter,
    statusFilter,
    sortBy,
    qualityFilter,
  ]);
  if (
    prevFilters[0] !== filter ||
    prevFilters[1] !== statusFilter ||
    prevFilters[2] !== sortBy ||
    prevFilters[3] !== qualityFilter
  ) {
    setPrevFilters([filter, statusFilter, sortBy, qualityFilter]);
    setPage(1);
  }

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
   * Dipanggil dari cek massal saat portal perusahaan yang ada
   * lowongannya ternyata tidak bisa dibuka. Gagal tulis tidak
   * menggagalkan pemeriksaan: pemanggil mengabaikan hasilnya. */
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
      status: c.status || "Tidak ada lowongan",
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
      /* Data berubah: naikkan marker supaya instance web refill. */
      await bumpMarker();
      if (auditOpen) loadAudit();
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
      /* Data berubah: naikkan marker supaya instance web refill. */
      await bumpMarker();
      if (auditOpen) loadAudit();
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
   * 60 detik per alamat IP. Jeda 6,5 detik menjaga laju di bawah
   * batas itu, berapa pun jumlah perusahaan yang diperiksa. */
  const BULK_CHECK_DELAY_MS = 6500;

  async function checkBulkTargets() {
    const targets = companies
      .filter((c) => c.status === "Ada lowongan")
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
      /* Portal perusahaan yang ada lowongannya yang ternyata tidak
       * bisa dibuka: status tersimpannya tidak lagi cocok dengan
       * hasil cek, jadi perubahannya dicatat ke umpan. Gagal tulis
       * (mis. aturan belum terbit) tidak menghentikan pemeriksaan. */
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
    /* Data berubah: naikkan marker supaya instance web refill. */
    if (okCount > 0) await bumpMarker();
    if (auditOpen) loadAudit();
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

  if (!authChecked || (user && isAdmin === null)) {
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

  /* Akun sudah masuk tetapi bukan admin: tampilkan pesan yang jelas,
   * bukan panel. Aturan Firestore juga menolak akses data admin untuk
   * akun seperti ini, jadi pesan ini hanya lapisan tampilan. */
  if (!isAdmin) {
    return (
      <div className="wrap">
        <div className="page-head">
          <h1>Admin</h1>
          <p className="lede">
            {adminCheckError
              ? "Akses akun belum bisa diperiksa. Coba muat ulang halaman ini."
              : "Akun ini bukan akun admin, jadi halaman ini tidak bisa dibuka. Masuk dengan akun admin untuk mengelola data Karir."}
          </p>
        </div>
        <button
          className="btn"
          type="button"
          onClick={() => signOut(auth)}
        >
          Keluar
        </button>
      </div>
    );
  }

  const qualityCounts = {
    noLink: companies.filter(hasNoLink).length,
    noLokasi: companies.filter(hasNoLokasi).length,
    stale: companies.filter(isStale).length,
  };

  const visitorSummary = aggregateVisitors(visitorEvents, companies);
  const accountActivity = aggregateAccountActivity(
    visitorEvents,
    userProfiles,
  );
  const botSignals = aggregateBotSignals(visitorEvents);

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
    .filter((c) => c.status === "Ada lowongan")
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

      <div className="filters" style={{ marginTop: 24 }}>
        <p className="section-label">Pemakaian kuota baca</p>
        <p className="section-note">
          Estimasi baca Firestore hari ini (paket Spark: 50.000 baca per
          hari, reset pukul 15:00 WIB). Dihitung dari pencacah refill di
          marker kesegaran; baca marker dan baca detail tidak ikut
          terhitung, jadi angka sebenarnya sedikit lebih besar.
        </p>
        {quota === null && (
          <p className="notice">Memuat data pemakaian…</p>
        )}
        {quota === "missing" && (
          <p className="notice">
            Belum ada data pemakaian (marker belum dibuat).
          </p>
        )}
        {quota === "error" && (
          <p className="notice">
            Data pemakaian belum bisa dibaca. Periksa aturan Firestore
            untuk dokumen meta/lastChange.
          </p>
        )}
        {quota && typeof quota === "object" && (
          <>
            <div className="stat-row">
              <span className="stat-num num">
                {(Number(quota.readsEstimate) || 0).toLocaleString("id-ID")}{" "}
                dari {QUOTA_DAILY_LIMIT.toLocaleString("id-ID")}
              </span>
              <span className="stat-label">
                baca hari ini (
                {Math.round(
                  ((Number(quota.readsEstimate) || 0) / QUOTA_DAILY_LIMIT) *
                    100,
                )}
                % kuota, {Number(quota.refillsToday) || 0} kali refill
                daftar).
              </span>
            </div>
            <p className="section-note">
              Revisi data: {Number(quota.rev) || 0} · Terakhir berubah:{" "}
              {quota.updatedAt
                ? formatTime(quota.updatedAt)
                : "tidak tercatat"}
              .
            </p>
          </>
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
        <p className="section-label">Cek massal tautan perusahaan yang ada lowongan</p>
        <p className="section-note">
          Memeriksa satu per satu tautan {targetCompanies.length} perusahaan
          yang ada lowongan. Tiap pemeriksaan dijeda beberapa
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
          10 perubahan terakhir yang dicatat panel ini. Dimuat hanya bila
          dibuka, supaya hemat kuota baca.
        </p>
        {!auditOpen ? (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setAuditOpen(true);
              loadAudit();
            }}
          >
            Tampilkan jejak perubahan
          </button>
        ) : (
          <>
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
          </>
        )}
      </div>

      <div className="filters" style={{ marginTop: 24 }}>
        <p className="section-label">Laporan tautan mati</p>
        <p className="section-note">
          10 laporan terakhir dari pengunjung yang menemukan tautan karir
          tidak bisa dibuka. Dimuat hanya bila dibuka, supaya hemat kuota
          baca.
        </p>
        {!reportsOpen ? (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setReportsOpen(true);
              loadReports();
            }}
          >
            Tampilkan laporan tautan mati
          </button>
        ) : (
          <>
            {reportsError && <p className="notice">{reportsError}</p>}
            {reports.length === 0 && !reportsError ? (
              <p className="notice">Belum ada laporan.</p>
            ) : (
              <ul className="recheck-list">
                {reports.map((r) => (
                  <li key={r.id}>
                    {formatTime(r.dibuat)} · {r.no}. {r.perusahaan} ·{" "}
                    {r.alasan}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="filters" style={{ marginTop: 24 }}>
        <p className="section-label">Pengunjung</p>
        <p className="section-note">
          Ringkasan kunjungan 30 hari terakhir. Angka dihitung dari catatan
          yang masuk, tanpa menyimpan alamat pengunjung. Dimuat hanya bila
          dibuka, supaya hemat kuota baca.
        </p>
        {!visitorsOpen ? (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setVisitorsOpen(true);
              loadVisitors();
              loadProfiles();
            }}
          >
            Tampilkan data pengunjung
          </button>
        ) : (
          <>
        {visitorsError && <p className="notice">{visitorsError}</p>}
        {loadingVisitors && (
          <div className="state">
            <strong>Memuat data pengunjung…</strong>
          </div>
        )}
        {!loadingVisitors &&
          !visitorsError &&
          visitorEvents.length === 0 && (
            <p className="notice">
              Belum ada data pengunjung. Pencatatan mulai berjalan setelah
              aturan pengunjung diterbitkan.
            </p>
          )}
        {!loadingVisitors &&
          !visitorsError &&
          visitorEvents.length > 0 && (
            <>
              <div className="stat-row">
                <span className="stat-num num">
                  {visitorSummary.serious.count} dari{" "}
                  {visitorSummary.serious.total}
                </span>
                <span className="stat-label">
                  pengunjung ({visitorSummary.serious.percent}%) mencari
                  peran spesifik, membuka detail, dan menandai lamaran.
                </span>
              </div>

              <p>
                <strong>Pengunjung per hari</strong>
              </p>
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Hari</th>
                    <th>Pengunjung</th>
                  </tr>
                </thead>
                <tbody>
                  {visitorSummary.daily.map((d) => (
                    <tr key={d.day}>
                      <td data-label="Hari">{d.label}</td>
                      <td data-label="Pengunjung" className="num">
                        {d.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p>
                <strong>Halaman paling sering dibuka</strong>
              </p>
              {visitorSummary.topPaths.length === 0 ? (
                <p className="section-note">
                  Belum ada halaman yang tercatat dibuka.
                </p>
              ) : (
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Halaman</th>
                      <th>Dibuka</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visitorSummary.topPaths.map((row) => (
                      <tr key={row.path}>
                        <td data-label="Halaman">{row.path}</td>
                        <td data-label="Dibuka" className="num">
                          {row.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <p>
                <strong>Kata yang paling sering dicari</strong>
              </p>
              {visitorSummary.topSearches.length === 0 ? (
                <p className="section-note">
                  Belum ada pencarian yang tercatat.
                </p>
              ) : (
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Kata yang dicari</th>
                      <th>Dicari</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visitorSummary.topSearches.map((row) => (
                      <tr key={row.q}>
                        <td data-label="Kata yang dicari">{row.q}</td>
                        <td data-label="Dicari" className="num">
                          {row.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <p>
                <strong>Perusahaan paling sering dibuka</strong>
              </p>
              {visitorSummary.topCompanies.length === 0 ? (
                <p className="section-note">
                  Belum ada detail perusahaan yang dibuka.
                </p>
              ) : (
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Perusahaan</th>
                      <th>Dibuka</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visitorSummary.topCompanies.map((row) => (
                      <tr key={row.no}>
                        <td data-label="Perusahaan">
                          {row.no}. {row.name}
                        </td>
                        <td data-label="Dibuka" className="num">
                          {row.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <p>
                <strong>Penanda lamaran</strong>
              </p>
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {visitorSummary.tracker.map((row) => (
                    <tr key={row.action}>
                      <td data-label="Status">{row.action}</td>
                      <td data-label="Jumlah" className="num">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p>
                <strong>Akun paling aktif</strong>
              </p>
              <p className="section-note">
                Akun yang masuk dan paling sering memakai situs. Tamu
                dihitung terpisah tanpa nama.
              </p>
              {profilesError && <p className="notice">{profilesError}</p>}
              <p className="notice">
                Yang butuh beneran: {accountActivity.seriousLogin} akun
                masuk dan {accountActivity.guests.serious} tamu dari{" "}
                {accountActivity.guests.totalVisitors} tamu, mencari peran
                spesifik, membuka detail, dan menandai lamaran.
              </p>
              {accountActivity.accounts.length === 0 ? (
                <p className="section-note">
                  Belum ada akun yang masuk dan tercatat aktif.
                </p>
              ) : (
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Akun</th>
                      <th>Pencarian</th>
                      <th>Dibuka</th>
                      <th>Ditandai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountActivity.accounts.map((row) => (
                      <tr key={row.uid}>
                        <td data-label="Akun">
                          {row.displayName ? `${row.displayName} · ` : ""}
                          {row.email ||
                            `Akun tanpa email tersimpan (${row.uid.slice(0, 8)})`}
                        </td>
                        <td data-label="Pencarian" className="num">
                          {row.searches}
                        </td>
                        <td data-label="Dibuka" className="num">
                          {row.opened}
                        </td>
                        <td data-label="Ditandai" className="num">
                          {row.tracker}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="section-note">
                Tamu: {accountActivity.guests.searches} pencarian,{" "}
                {accountActivity.guests.opened} detail dibuka,{" "}
                {accountActivity.guests.tracker} lamaran ditandai, dari{" "}
                {accountActivity.guests.total} aktivitas.
              </p>

              <p>
                <strong>Kemungkinan bot</strong>
              </p>
              <p className="section-note">
                Hanya untuk dilihat. Tidak ada yang diblokir otomatis
                dari sini.
              </p>
              <p className="notice">
                Aktivitas bertanda otomatis: {botSignals.flagged}.
                {!botSignals.hasFlagField &&
                  " Penanda dari server belum ada di data ini, jadi angkanya 0."}
              </p>
              <p>
                <strong>Pengunjung paling aktif</strong>
              </p>
              {botSignals.top.length === 0 ? (
                <p className="section-note">
                  Belum ada aktivitas pengunjung yang tercatat.
                </p>
              ) : (
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Pengunjung</th>
                      <th>Aktivitas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {botSignals.top.map((row) => (
                      <tr key={row.key}>
                        <td data-label="Pengunjung">
                          {row.key.slice(0, 12)}
                        </td>
                        <td data-label="Aktivitas" className="num">
                          {row.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p>
                <strong>Tanpa membuka halaman</strong>
              </p>
              <p className="section-note">
                Pengunjung dengan 3 aktivitas atau lebih dan nol halaman
                yang dibuka: {botSignals.noPageviewTotal}.
              </p>
              {botSignals.noPageview.length === 0 ? (
                <p className="section-note">
                  Tidak ada pengunjung dengan 3 aktivitas atau lebih tanpa
                  membuka halaman.
                </p>
              ) : (
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Pengunjung</th>
                      <th>Aktivitas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {botSignals.noPageview.map((row) => (
                      <tr key={row.key}>
                        <td data-label="Pengunjung">
                          {row.key.slice(0, 12)}
                        </td>
                        <td data-label="Aktivitas" className="num">
                          {row.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        {visitorsCapped && !visitorsError && (
          <p className="section-note">
            Angka di atas dihitung dari 300 aktivitas terakhir.
          </p>
        )}
          </>
        )}
      </div>
    </div>
  );
}
