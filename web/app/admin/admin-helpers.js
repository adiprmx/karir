/* Fungsi murni dan konstanta panel admin (FE-18, dipindah dari
 * page.js tanpa perubahan perilaku). Tidak ada JSX dan tidak ada
 * state di sini: agregasi pengunjung, validasi CSV, filter dan urut
 * perusahaan, ekspor CSV dan JSON, serta util tanggal. Karena murni,
 * fungsi-fungsi ini bisa dites langsung tanpa jaringan. */
import { STATUS_ORDER } from "@/lib/companies";

export const EMPTY = {
  no: "",
  perusahaan: "",
  kategori: "",
  link_karir: "",
  status: "Tidak ada lowongan",
  tanggal_cek: "",
  catatan: "",
  lokasi: "",
  posisi: "",
  batas_lamar: "",
};

/* Format CSV impor/ekspor panel: 13 kolom, sama dengan kolom repo
 * data/daftar-link-karir.csv (BE-06 + DATA-02 — format 9 kolom yang
 * lama membuat impor menimpa kanal melamar dan batas lamar dengan
 * setDoc tanpa merge). Impor masih menerima format 9 kolom lama
 * (CSV_HEADER_9); baris dari file lama tidak menyentuh kolom kanal
 * dan batas lamar yang sudah tersimpan (setDoc merge). */
export const CSV_HEADER = [
  "no",
  "perusahaan",
  "kategori",
  "link_karir",
  "status",
  "tanggal_cek",
  "catatan",
  "lokasi",
  "posisi",
  "email_hrd",
  "wa_hrd",
  "kontak_lain",
  "batas_lamar",
];

export const CSV_HEADER_9 = [
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

export const PAGE_SIZE = 20;
export const MAX_IMPORT = 100;
export const DAY_MS = 24 * 60 * 60 * 1000;
/* Batas baca seksi admin (FIN-04): diperkecil dari nilai lama
 * (pengunjung 1000 -> 300, profil 500 -> 100, jejak/laporan 20 -> 10)
 * supaya satu kali buka panel tidak menghabiskan ribuan baca. */
export const VISITOR_LIMIT = 300;
export const PROFILES_LIMIT = 100;
export const AUDIT_LIMIT = 10;
export const VISITOR_DAYS = 30;
/* Kuota baca harian Firestore paket Spark. */
export const QUOTA_DAILY_LIMIT = 50000;
export const TRACKER_ACTIONS = ["Ditandai", "Sudah dilamar", "Dipanggil", "Ditolak"];

/* Jeda antar pemeriksaan massal. Batas di server: 10 permintaan per
 * 60 detik per alamat IP. Jeda 6,5 detik menjaga laju di bawah
 * batas itu, berapa pun jumlah perusahaan yang diperiksa. */
export const BULK_CHECK_DELAY_MS = 6500;

/* Hari (YYYY-MM-DD) dari satu catatan pengunjung: pakai kolom `day`
 * bila ada, kalau tidak dari `ts`. `ts` bisa berupa Timestamp
 * Firestore (objek dengan toDate(), atau { seconds }) — String()
 * mentah pada objek itu menghasilkan sampah, jadi dikonversi ke
 * tanggal dulu (ADM-05). Terakhir, potong 10 huruf pertama dari
 * string ISO. */
export function eventDay(e) {
  if (typeof e.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.day)) {
    return e.day;
  }
  const ts = e.ts;
  let d = "";
  if (ts && typeof ts.toDate === "function") {
    const date = ts.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      d = dayString(date);
    }
  } else if (ts && typeof ts.seconds === "number") {
    const date = new Date(ts.seconds * 1000);
    if (!Number.isNaN(date.getTime())) d = dayString(date);
  } else {
    d = String(ts || "").slice(0, 10);
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

export function dayString(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${day}`;
}

export function formatDay(day) {
  const parts = day.split("-");
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function topCounts(map, keyName) {
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
  const portalClicks = new Map();
  const portalChannels = { portal: 0, wa: 0, email: 0 };
  const filters = new Map();
  const noResult = new Map();
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
      /* ANALITIK-03: pencarian tanpa hasil (results === 0). Event
       * search lama tanpa field results diabaikan di sini. */
      if (e.results === 0) {
        noResult.set(q, (noResult.get(q) || 0) + 1);
      }
    }
    if (e.type === "detail" && Number.isInteger(e.companyNo)) {
      opened.set(e.companyNo, (opened.get(e.companyNo) || 0) + 1);
    }
    /* ANALITIK-02: klik lamar per perusahaan + per kanal (portal,
     * wa, email dari field action). */
    if (e.type === "portal_click") {
      if (Number.isInteger(e.companyNo)) {
        portalClicks.set(
          e.companyNo,
          (portalClicks.get(e.companyNo) || 0) + 1,
        );
      }
      if (
        e.action === "portal" ||
        e.action === "wa" ||
        e.action === "email"
      ) {
        portalChannels[e.action]++;
      }
    }
    /* ANALITIK-02: nilai filter yang dipakai, format kontrak
     * "kategori:X|status:Y|kota:Z" — tiap token dihitung terpisah. */
    if (e.type === "filter" && typeof e.filter === "string") {
      for (const token of e.filter.split("|")) {
        const value = token.trim();
        if (value) filters.set(value, (filters.get(value) || 0) + 1);
      }
    }
    if (e.type === "tracker_mark" && TRACKER_ACTIONS.includes(e.action)) {
      tracker.set(e.action, tracker.get(e.action) + 1);
    }
    /* ANALITIK-06: kunci yang sama dengan hitungan harian (perDay)
     * — visitorHash diutamakan, visitor sebagai cadangan — supaya
     * penyebut "serius" sepopulasi dengan hitungan harian. Catatan
     * jujur: visitorHash berganti tiap hari (sengaja, demi
     * privasi), jadi penyebut ini adalah kunjungan unik harian,
     * bukan orang unik lintas hari. */
    const key = e.visitorHash || e.visitor;
    if (typeof key === "string" && key) {
      if (!kindsByVisitor.has(key)) kindsByVisitor.set(key, new Set());
      kindsByVisitor.get(key).add(e.type);
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
  /* Serius: mencari, membuka detail, lalu menandai lamaran ATAU
   * mengklik lamar (portal_click sebagai syarat alternatif —
   * pengunjung yang langsung melamar tanpa menandai tetap serius). */
  const serious = [...kindsByVisitor.values()].filter(
    (kinds) =>
      kinds.has("search") &&
      kinds.has("detail") &&
      (kinds.has("tracker_mark") || kinds.has("portal_click")),
  ).length;

  return {
    total: list.length,
    daily,
    topPaths: topCounts(paths, "path"),
    topSearches: topCounts(searches, "q"),
    noResultSearches: topCounts(noResult, "q"),
    topCompanies: topCounts(opened, "no").map((row) => ({
      no: row.no,
      name: names.get(row.no) || `No. ${row.no}`,
      count: row.count,
    })),
    topPortalClicks: topCounts(portalClicks, "no").map((row) => ({
      no: row.no,
      name: names.get(row.no) || `No. ${row.no}`,
      count: row.count,
    })),
    portalChannels,
    topFilters: topCounts(filters, "filter"),
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
 * "Butuh beneran": mencari peran spesifik, membuka detail, lalu
 * menandai lamaran atau mengklik lamar, sama seperti hitungan
 * serius di aggregateVisitors, hanya dipisah akun masuk vs tamu. */
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
    kinds.has("search") &&
    kinds.has("detail") &&
    (kinds.has("tracker_mark") || kinds.has("portal_click"));

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

export function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseDate(value) {
  if (!value) return null;
  const parts = String(value).trim().split("-");
  if (parts.length !== 3) return null;
  const t = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return Number.isNaN(t.getTime()) ? null : t;
}

/* Validasi tanggal kalender yang ketat: format YYYY-MM-DD dan tanggal
 * yang benar-benar ada. Konstruktor Date JavaScript diam-diam
 * menggeser tanggal yang tidak ada (2026-02-30 menjadi 2 Maret),
 * jadi komponen hasil parse wajib cocok lagi dengan masukannya.
 * Dipakai untuk batas_lamar (BE-06) di form dan impor CSV. */
export function isValidDateString(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function isStale(c) {
  const t = parseDate(c.tanggal_cek);
  if (!t) return true;
  return Date.now() - t.getTime() > 30 * DAY_MS;
}

export function hasNoLink(c) {
  return !(c.link_karir || "").trim();
}

export function hasNoLokasi(c) {
  return !(c.lokasi || "").trim();
}

/* Baca teks CSV jadi baris-baris sel, menghormati tanda kutip ganda
 * (termasuk koma dan baris baru di dalam kutipan). */
export function parseCsv(text) {
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

export function csvCell(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function formatTime(iso) {
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

/* Validasi isi CSV impor (dipindah dari handleCsvFile di page.js).
 * Mengembalikan valid, rejected, dan error: error terisi bila file
 * kosong atau baris pertamanya bukan header 13 kolom maupun 9 kolom
 * lama; bila tidak, valid berisi baris siap impor dan rejected
 * berisi nomor baris dan alasan tiap baris yang ditolak. */
export function validateCsvRows(rows) {
  if (rows.length === 0) {
    return { valid: [], rejected: [], error: "File kosong." };
  }
  const header = rows[0].map((h) => h.trim());
  const isFullHeader =
    header.length === CSV_HEADER.length &&
    CSV_HEADER.every((h, i) => header[i] === h);
  const isLegacyHeader =
    header.length === CSV_HEADER_9.length &&
    CSV_HEADER_9.every((h, i) => header[i] === h);
  if (!isFullHeader && !isLegacyHeader) {
    return {
      valid: [],
      rejected: [],
      error:
        "Baris pertama harus berisi 13 kolom (no, perusahaan, kategori, link_karir, status, tanggal_cek, catatan, lokasi, posisi, email_hrd, wa_hrd, kontak_lain, batas_lamar) atau 9 kolom lama tanpa 4 kolom terakhir.",
    };
  }
  const full = isFullHeader;
  const width = full ? CSV_HEADER.length : CSV_HEADER_9.length;
  const valid = [];
  const rejected = [];
  rows.slice(1).forEach((cells, idx) => {
    const lineNo = idx + 2;
    if (cells.length !== width) {
      rejected.push({
        line: lineNo,
        reason: `jumlah kolom ${cells.length}, harus ${width}.`,
      });
      return;
    }
    const [noRaw, perusahaan, kategori, link_karir, status, tanggal_cek, catatan, lokasi, posisi] =
      cells.slice(0, 9).map((c) => c.trim());
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
    const row = {
      no,
      perusahaan,
      kategori,
      link_karir,
      status,
      tanggal_cek,
      catatan,
      lokasi,
      posisi,
    };
    if (full) {
      const [email_hrd, wa_hrd, kontak_lain, batas_lamar] = cells
        .slice(9, 13)
        .map((c) => c.trim());
      if (batas_lamar && !isValidDateString(batas_lamar)) {
        rejected.push({
          line: lineNo,
          reason: `batas_lamar "${batas_lamar}" bukan tanggal YYYY-MM-DD yang valid.`,
        });
        return;
      }
      row.email_hrd = email_hrd;
      row.wa_hrd = wa_hrd;
      row.kontak_lain = kontak_lain;
      row.batas_lamar = batas_lamar;
    }
    valid.push(row);
  });
  return { valid, rejected, error: "" };
}

/* Data lengkap 13 field untuk simpan. Form tidak menampilkan kolom
 * kanal (email_hrd, wa_hrd, kontak_lain) — nilainya diambil dari
 * dokumen yang sedang diedit supaya simpan tidak menghapusnya
 * (setDoc tanpa merge menimpa seluruh dokumen; sebelum perbaikan
 * ini tiap simpan dari panel menghapus kanal melamar dan batas
 * lamar perusahaan itu dari Firestore). Perusahaan baru mendapat
 * kanal kosong. */
export function buildCompanyData(form, selected) {
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
    email_hrd: (selected && selected.email_hrd) || "",
    wa_hrd: (selected && selected.wa_hrd) || "",
    kontak_lain: (selected && selected.kontak_lain) || "",
    batas_lamar: form.batas_lamar.trim(),
  };
}

/* Filter dan urut daftar perusahaan untuk tabel panel (dipindah dari
 * page.js): cari nama atau nomor, filter status, filter kualitas,
 * lalu urut menurut nomor atau nama. */
export function filterAndSortCompanies(companies, filters) {
  const { filter, statusFilter, sortBy, qualityFilter } = filters;
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
  return shown;
}

/* Unduh berkas dari browser: dibuat sebagai Blob lalu diunduh lewat
 * tautan sementara. Dipakai ekspor CSV dan JSON. */
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

/* Ekspor daftar perusahaan ke CSV 13 kolom (dipindah dari page.js):
 * nama berkas memakai tanggal hari ini. */
export function exportCompaniesCsv(companies) {
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

/* Ekspor daftar perusahaan ke JSON (dipindah dari page.js): nama
 * berkas memakai tanggal hari ini. */
export function exportCompaniesJson(companies) {
  downloadFile(
    `karir-perusahaan-${todayStr()}.json`,
    JSON.stringify(companies, null, 2),
    "application/json;charset=utf-8",
  );
}
