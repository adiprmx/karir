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

/* Struktur panel (FE-18): halaman ini hanya merakit seksi-seksi di
 * web/app/admin/ — admin-gates.js untuk gerbang muat, masuk, dan
 * bukan admin; admin-quality.js, admin-quota.js, admin-companies.js,
 * admin-form.js, admin-bulk-check.js, admin-csv.js, admin-audit.js,
 * admin-reports.js, dan admin-visitors.js untuk seksi-seksi panel;
 * admin-helpers.js untuk fungsi murni dan konstanta. Semua state,
 * efek, dan handler tetap di sini supaya perilaku tidak berubah;
 * komponen seksi hanya menerima props dan menampilkan. */
import { useEffect, useRef, useState } from "react";
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
  startAfter,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { STATUS_ORDER } from "@/lib/companies";
import { sendPasswordReset } from "@/lib/account-data";
import { markSignOutIntended } from "@/app/tracker";
import {
  AUDIT_LIMIT,
  BULK_CHECK_DELAY_MS,
  CHECK_LINK_TIMEOUT_MS,
  COMPANIES_PAGE_SIZE,
  EMPTY,
  MAX_IMPORT,
  PAGE_SIZE,
  PROFILES_LIMIT,
  VISITOR_LIMIT,
  aggregateAccountActivity,
  aggregateBotSignals,
  aggregateVisitors,
  buildCompanyData,
  cancellableDelay,
  clearBulkSummary,
  exportCompaniesCsv,
  exportCompaniesJson,
  fetchWithTimeout,
  filterAndSortCompanies,
  hasNoLink,
  hasNoLokasi,
  isStale,
  isValidDateString,
  loadBulkSummary,
  parseCsv,
  saveBulkSummary,
  todayStr,
  validateCsvRows,
} from "./admin-helpers";
import { LoadingGate, LoginForm, NotAdmin } from "./admin-gates";
import QualitySection from "./admin-quality";
import QuotaSection from "./admin-quota";
import CompaniesPanel from "./admin-companies";
import CompanyForm from "./admin-form";
import BulkCheckSection from "./admin-bulk-check";
import CsvSection from "./admin-csv";
import AuditSection from "./admin-audit";
import ReportsSection from "./admin-reports";
import VisitorsSection from "./admin-visitors";

/* Tiga agregasi pengunjung tetap diekspor dari halaman ini (FE-18),
 * supaya permukaan modul tidak berubah bagi pengimpor yang ada. */
export { aggregateVisitors, aggregateAccountActivity, aggregateBotSignals };

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
  /* ADM-10: lupa kata sandi admin — pesan netral (sama untuk email
   * terdaftar maupun tidak) dan status kirim tautan reset. */
  const [resetBusy, setResetBusy] = useState(false);
  const [resetInfo, setResetInfo] = useState("");
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
  /* ADM-11: bulkCancelled = pemeriksaan terakhir dihentikan admin
   * sebelum selesai; bulkRestoredAt = waktu selesai ringkasan yang
   * dipulihkan dari perangkat (null bila hasil dari jalan saat ini).
   * Ketiga ref mengendalikan pembatalan: flag dibaca loop tiap
   * putaran, kontroler membatalkan permintaan yang sedang berjalan,
   * dan wake membangunkan jeda antar pemeriksaan lebih awal. */
  const [bulkCancelled, setBulkCancelled] = useState(false);
  const [bulkRestoredAt, setBulkRestoredAt] = useState(null);
  const bulkCancelRef = useRef(false);
  const bulkAbortRef = useRef(null);
  const bulkWakeRef = useRef(null);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvValid, setCsvValid] = useState([]);
  const [csvRejected, setCsvRejected] = useState([]);
  const [csvError, setCsvError] = useState("");
  const [csvMessage, setCsvMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditError, setAuditError] = useState("");
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

  /* ADM-12: perusahaan dimuat bertahap per 200 dokumen (kursor
   * startAfter), bukan sekaligus — tabel bisa dipakai begitu
   * halaman pertama tiba. Penggabungan memakai state lama sebagai
   * dasar: simpan/hapus yang terjadi selama muat berjalan tidak
   * tertimpa oleh halaman berikutnya. Gagal di tengah jalan
   * menyisakan halaman yang sudah dimuat, dengan pesan yang jelas. */
  async function loadCompanies() {
    setLoadingCompanies(true);
    setLoadError("");
    const all = [];
    let lastDoc = null;
    try {
      for (;;) {
        const constraints = [
          orderBy("no", "asc"),
          limit(COMPANIES_PAGE_SIZE),
        ];
        if (lastDoc) constraints.push(startAfter(lastDoc));
        const snap = await getDocs(
          query(collection(db, "companies"), ...constraints),
        );
        snap.docs.forEach((d) => all.push({ id: d.id, ...d.data() }));
        setCompanies((prev) => {
          const byId = new Map(prev.map((c) => [c.id, c]));
          all.forEach((c) => {
            if (!byId.has(c.id)) byId.set(c.id, c);
          });
          return [...byId.values()].sort((a, b) => a.no - b.no);
        });
        if (snap.size < COMPANIES_PAGE_SIZE) break;
        lastDoc = snap.docs[snap.docs.length - 1];
      }
    } catch {
      setLoadError(
        all.length === 0
          ? "Gagal memuat data perusahaan. Periksa koneksi lalu muat ulang halaman."
          : "Sebagian data perusahaan gagal dimuat. Muat ulang halaman untuk mencoba lagi.",
      );
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

  /* ADM-12: profil diurutkan dari yang terakhir diperbarui, supaya
   * bila akun melebihi batas, yang diambil adalah 100 akun terbaru
   * — bukan 100 akun sembarang tanpa urutan. */
  async function loadProfiles() {
    setProfilesError("");
    try {
      const snap = await getDocs(
        query(
          collection(db, "user_profiles"),
          orderBy("updatedAt", "desc"),
          limit(PROFILES_LIMIT),
        ),
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
      /* ADM-11: pulihkan ringkasan cek massal terakhir dari perangkat
       * ini, supaya hasil tidak hilang saat halaman dimuat ulang. */
      const saved = loadBulkSummary(window.localStorage);
      if (saved) {
        setBulkResults(saved.results);
        setBulkDone(saved.results.length);
        setBulkChanges(saved.changes);
        setBulkRestoredAt(saved.finishedAt);
      }
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

  /* ADM-10: lupa kata sandi admin — kirim tautan reset ke email
   * yang tertulis, memakai pengirim yang sama dengan panel akun.
   * Pesannya netral (sama untuk email terdaftar maupun tidak)
   * supaya keberadaan email tidak bocor. */
  async function handleForgotPassword() {
    const address = email.trim();
    if (!address) {
      setLoginError("Tulis email dulu di kolom di atas, baru minta tautan.");
      setResetInfo("");
      return;
    }
    setLoginError("");
    setResetInfo("");
    setResetBusy(true);
    const result = await sendPasswordReset(address);
    if (result.sent) {
      setResetInfo(result.message);
    } else {
      setLoginError(result.message);
    }
    setResetBusy(false);
  }

  /* Keluar yang disengaja (AKUN-10): tandai dulu supaya pelacak
   * tidak salah menafsirkan keluar ini sebagai sesi yang berakhir. */
  function handleSignOut() {
    markSignOutIntended();
    signOut(auth);
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
      batas_lamar: c.batas_lamar || "",
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
    if (form.batas_lamar.trim() && !isValidDateString(form.batas_lamar)) {
      setMessage(
        "Batas lamar harus berupa tanggal yang valid (YYYY-MM-DD), mis. 2026-11-30. Kosongkan bila tidak ada batas.",
      );
      setSaving(false);
      return;
    }
    try {
      const data = buildCompanyData(form, selected);
      /* merge: true sebagai jaring pengaman — field yang tidak ada di
       * data (mis. field baru yang ditambahkan belakangan) tidak ikut
       * terhapus saat simpan. */
      await setDoc(doc(db, "companies", String(no)), data, { merge: true });
      setCompanies((prev) => {
        const rest = prev.filter((c) => Number(c.no) !== no);
        return [...rest, { id: String(no), ...data }].sort(
          (a, b) => a.no - b.no,
        );
      });
      const auditOk = await writeAudit("save", no, data.perusahaan);
      /* Perubahan status dari panel dicatat ke umpan Yang berubah
       * (koleksi `changes`) — tanpa ini, write-back harian (yang
       * membaca `changes`) tidak pernah tahu status itu berubah dari
       * panel, dan CSV tertinggal dari data live. Hanya status yang
       * dicatat: skema entri changes hanya punya from/to status.
       * Gagal tulis tidak menggagalkan simpan. */
      if (selected && selected.status !== data.status) {
        await writeChange(selected, selected.status, data.status);
      }
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
      /* ADM-09: batas waktu 20 detik — stall jaringan tidak lagi
       * mengunci tombol "Memeriksa…" tanpa batas. */
      const res = await fetchWithTimeout(
        fetch,
        "/api/admin/check-link",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ no }),
        },
        CHECK_LINK_TIMEOUT_MS,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLinkCheck({
          ok: false,
          error: body.error || "Pemeriksaan gagal.",
        });
      } else {
        setLinkCheck(body);
      }
    } catch (err) {
      setLinkCheck({
        ok: false,
        error:
          err && err.name === "AbortError"
            ? "Pemeriksaan melewati batas waktu. Coba lagi."
            : "Tidak bisa menghubungi server.",
      });
    }
    setCheckingLink(false);
  }

  /* ADM-11: hentikan cek massal yang sedang berjalan. Flag dibaca
   * loop tiap putaran; permintaan yang sedang berjalan dibatalkan
   * dan jeda antar pemeriksaan dibangunkan lebih awal, supaya
   * berhenti seketika — hasil yang sudah didapat tetap disimpan. */
  function cancelBulkCheck() {
    if (!bulkRunning) return;
    bulkCancelRef.current = true;
    if (bulkAbortRef.current) bulkAbortRef.current.abort();
    if (bulkWakeRef.current) bulkWakeRef.current();
  }

  /* ADM-11: hapus ringkasan cek massal terakhir dari perangkat ini
   * beserta tampilannya. */
  function clearLastBulk() {
    clearBulkSummary(window.localStorage);
    setBulkResults([]);
    setBulkDone(0);
    setBulkChanges(0);
    setBulkCancelled(false);
    setBulkRestoredAt(null);
  }

  async function checkBulkTargets() {
    const targets = companies
      .filter((c) => c.status === "Ada lowongan")
      .sort((a, b) => a.no - b.no);
    if (targets.length === 0 || bulkRunning) return;
    setBulkRunning(true);
    setBulkResults([]);
    setBulkChanges(0);
    setBulkDone(0);
    setBulkCancelled(false);
    setBulkRestoredAt(null);
    bulkCancelRef.current = false;
    const done = [];
    let recorded = 0;
    for (let i = 0; i < targets.length; i++) {
      if (bulkCancelRef.current) break;
      if (i > 0) {
        await cancellableDelay(BULK_CHECK_DELAY_MS, bulkWakeRef);
        if (bulkCancelRef.current) break;
      }
      const c = targets[i];
      let entry;
      try {
        /* ADM-09: tiap pemeriksaan dibatasi 20 detik; ADM-11:
         * kontrolernya diserahkan supaya tombol Batal bisa
         * membatalkan permintaan yang sedang berjalan. */
        const res = await fetchWithTimeout(
          fetch,
          "/api/admin/check-link",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ no: Number(c.no) }),
          },
          CHECK_LINK_TIMEOUT_MS,
          bulkAbortRef,
        );
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
                  : body.detail || body.error || `kode ${body.status}`,
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
      } catch (err) {
        /* ADM-11: dibatalkan admin di tengah pemeriksaan — bukan
         * hasil pemeriksaan, jangan dicatat sebagai gagal. */
        if (bulkCancelRef.current) break;
        entry = {
          no: c.no,
          perusahaan: c.perusahaan,
          ok: false,
          status: null,
          error:
            err && err.name === "AbortError"
              ? "Pemeriksaan melewati batas waktu."
              : "Tidak bisa menghubungi server.",
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
    const cancelled = bulkCancelRef.current;
    setBulkCancelled(cancelled);
    setBulkChanges(recorded);
    setBulkRunning(false);
    /* ADM-11: simpan ringkasan hasil ke perangkat ini — termasuk
     * bila dibatalkan di tengah jalan — supaya bisa dilihat lagi
     * setelah halaman dimuat ulang. */
    if (done.length > 0) {
      saveBulkSummary(window.localStorage, {
        finishedAt: new Date().toISOString(),
        changes: recorded,
        results: done,
      });
    }
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
        const { valid, rejected, error } = validateCsvRows(rows);
        if (error) {
          setCsvError(error);
          return;
        }
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
          /* merge: true — baris dari file 9 kolom lama tidak menghapus
           * kanal melamar dan batas lamar yang sudah tersimpan. */
          setDoc(doc(db, "companies", String(row.no)), row, { merge: true }),
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
          /* Timpa hanya kolom yang ada di file; kolom lain (mis. kanal
           * dari file 9 kolom lama) dipertahankan dari data lama —
           * tanpa ini, simpan berikutnya dari form akan menimpa kanal
           * itu dengan kosong. */
          byNo.set(row.no, {
            ...byNo.get(row.no),
            id: String(row.no),
            ...row,
          }),
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

  function exportCsv() {
    exportCompaniesCsv(companies);
  }

  function exportJson() {
    exportCompaniesJson(companies);
  }

  if (!authChecked || (user && isAdmin === null)) {
    return <LoadingGate />;
  }

  if (!user) {
    return (
      <LoginForm
        email={email}
        password={password}
        loginError={loginError}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleLogin}
        onForgotPassword={handleForgotPassword}
        resetBusy={resetBusy}
        resetInfo={resetInfo}
      />
    );
  }

  /* Akun sudah masuk tetapi bukan admin: tampilkan pesan yang jelas,
   * bukan panel. Aturan Firestore juga menolak akses data admin untuk
   * akun seperti ini, jadi pesan ini hanya lapisan tampilan. */
  if (!isAdmin) {
    return (
      <NotAdmin
        adminCheckError={adminCheckError}
        onSignOut={handleSignOut}
      />
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

  const shown = filterAndSortCompanies(companies, {
    filter,
    statusFilter,
    sortBy,
    qualityFilter,
  });

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
            onClick={handleSignOut}
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

      <QualitySection
        qualityButtons={qualityButtons}
        qualityFilter={qualityFilter}
        onToggle={(key) =>
          setQualityFilter(qualityFilter === key ? null : key)
        }
      />
      <QuotaSection quota={quota} />

      <div className="cari-grid">
        <CompaniesPanel
          filter={filter}
          statusFilter={statusFilter}
          sortBy={sortBy}
          onFilterChange={setFilter}
          onStatusFilterChange={setStatusFilter}
          onSortByChange={setSortBy}
          onAddNew={addNew}
          loadError={loadError}
          loadingCompanies={loadingCompanies}
          loadedCount={companies.length}
          pageRows={pageRows}
          selected={selected}
          onPick={pick}
          safePage={safePage}
          totalPages={totalPages}
          shownCount={shown.length}
          onPrevPage={() => setPage(safePage - 1)}
          onNextPage={() => setPage(safePage + 1)}
        />
        <CompanyForm
          form={form}
          onField={(field, value) => setForm({ ...form, [field]: value })}
          selected={selected}
          message={message}
          saving={saving}
          linkCheck={linkCheck}
          checkingLink={checkingLink}
          onSave={save}
          onRemove={remove}
          onCheckLink={checkLink}
          onMarkCheckedToday={() =>
            setForm({ ...form, tanggal_cek: todayStr() })
          }
        />
      </div>

      <BulkCheckSection
        targetCompanies={targetCompanies}
        bulkRunning={bulkRunning}
        bulkDone={bulkDone}
        bulkResults={bulkResults}
        bulkChanges={bulkChanges}
        bulkCancelled={bulkCancelled}
        bulkRestoredAt={bulkRestoredAt}
        onCheck={checkBulkTargets}
        onCancel={cancelBulkCheck}
        onClearLast={clearLastBulk}
      />
      <CsvSection
        csvFileName={csvFileName}
        csvError={csvError}
        csvValid={csvValid}
        csvRejected={csvRejected}
        csvMessage={csvMessage}
        importing={importing}
        onFile={handleCsvFile}
        onImport={importCsv}
        onExportCsv={exportCsv}
        onExportJson={exportJson}
      />
      <AuditSection
        auditOpen={auditOpen}
        auditEntries={auditEntries}
        auditError={auditError}
        onOpen={() => {
          setAuditOpen(true);
          loadAudit();
        }}
      />
      <ReportsSection
        reportsOpen={reportsOpen}
        onOpen={() => setReportsOpen(true)}
        db={db}
      />
      <VisitorsSection
        visitorsOpen={visitorsOpen}
        visitorsError={visitorsError}
        loadingVisitors={loadingVisitors}
        visitorEvents={visitorEvents}
        visitorSummary={visitorSummary}
        accountActivity={accountActivity}
        botSignals={botSignals}
        profilesError={profilesError}
        visitorsCapped={visitorsCapped}
        onOpen={() => {
          setVisitorsOpen(true);
          loadVisitors();
          loadProfiles();
        }}
      />
    </div>
  );
}
