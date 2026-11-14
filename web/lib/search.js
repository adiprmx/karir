/* Logika pencarian Karir, fungsi murni, tanpa DOM.
 * Diport dari docs/app.js (versi statis, sudah terverifikasi).
 * Aturan yang sama berlaku di sini: pencocokan substring dengan
 * pengecualian kalimat penyangkalan, skor rekomendasi
 * posisi +50, domisili +30, lowongan terverifikasi +20,
 * portal mati -20, tidak terverifikasi -10.
 * Sinonim peran: tokenize() memperluas tiap kata kunci dengan
 * padanannya (mis. cleaner juga cocok dengan cleaning dan
 * kebersihan), jadi pencari tidak harus menebak kata yang persis
 * tertulis di data.
 * Mode nama (keputusan S5, CARI-01): kata kunci yang seluruhnya kata
 * peran umum (ada di daftar sinonim, mis. "gudang") TIDAK PERNAH
 * memicu mode nama, kecocokan nama tidak boleh membajak kata peran.
 * Kata kunci nama asli (mis. "Novell") menampilkan KEDUA kelompok:
 * "Perusahaan" (cocok nama) dulu, lalu "Lowongan" (cocok peran).
 * Filter kota (CARI-03) memakai matchCity dari lib/cities.js, aturan
 * yang sama dengan peta. */

import { matchCity } from "./cities.js";

/* Jumlah hasil per halaman /cari (T13, AKSES-02): server mengirim
 * potongan pertama ini sebagai hasil awal, klien memakai angka yang
 * sama untuk limit awal — satu konstanta supaya tidak menyimpang. */
export const SEARCH_PAGE_SIZE = 20;

export function normalizeText(value) {
  if (!value) return "";
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* Kelompok kata yang artinya sama. Tiap kelompok berisi kata kunci
 * yang bisa diketik pengguna (words) dan bentuk yang dicari di data
 * (match). Satu kata kunci selalu cocok dengan dirinya sendiri. */
const SYNONYM_GROUPS = [
  { words: ["cleaning", "cleaner", "kebersihan"], match: ["cleaning", "cleaner", "kebersihan"] },
  { words: ["gudang", "warehouse"], match: ["gudang", "warehouse"] },
  { words: ["helper", "pembantu"], match: ["helper", "pembantu"] },
  { words: ["produksi", "production", "operator"], match: ["produksi", "production", "operator"] },
  { words: ["packing", "packer", "kemas"], match: ["packing", "packer", "kemas"] },
  { words: ["kasir", "cashier"], match: ["kasir", "cashier"] },
  { words: ["security", "satpam"], match: ["security", "satpam"] },
  { words: ["driver", "sopir", "pengemudi"], match: ["driver", "sopir", "pengemudi"] },
  { words: ["office", "boy", "girl", "ob", "og"], match: ["office boy", "office girl", "ob", "og"] },
  { words: ["admin", "administrasi"], match: ["admin", "administrasi"] },
  { words: ["crew", "kru"], match: ["crew", "kru"] },
  { words: ["store", "toko"], match: ["store", "toko"] },
  { words: ["barista"], match: ["barista"] },
  { words: ["baker"], match: ["baker"] },
  /* Kata peran umum satu kata (CARI-01): kelompok ini tidak mengubah
   * pencocokan (tiap kata hanya cocok dengan dirinya sendiri), tapi
   * menandai kata itu sebagai kata peran sehingga isRoleKeyword()
   * melindunginya dari pembajakan mode nama. Dipilih dari kata peran
   * yang paling sering muncul di kolom posisi data (staff 135x, sales
   * 80x, manager 144x, engineer 98x, supervisor 94x, officer 69x,
   * marketing 42x, specialist 38x, service 36x, analyst 33x,
   * finance 33x, business 33x, development 40x, teknisi 23x,
   * 5x, dihitung dari seed 610 baris, 15 Nov 2026). "service"
   * dan "staff" juga menutup chip beranda "Cleaning Service" dan
   * "Staff Gudang" supaya hitungannya tidak pernah dibajak nama. */
  { words: ["staff"], match: ["staff"] },
  { words: ["sales"], match: ["sales"] },
  { words: ["marketing"], match: ["marketing"] },
  { words: ["teknisi"], match: ["teknisi"] },
  { words: ["kurir"], match: ["kurir"] },
  { words: ["manager"], match: ["manager"] },
  { words: ["engineer"], match: ["engineer"] },
  { words: ["supervisor"], match: ["supervisor"] },
  { words: ["officer"], match: ["officer"] },
  { words: ["specialist"], match: ["specialist"] },
  { words: ["service"], match: ["service"] },
  { words: ["analyst"], match: ["analyst"] },
  { words: ["finance"], match: ["finance"] },
  { words: ["business"], match: ["business"] },
  { words: ["development"], match: ["development"] },
];

const SYNONYM_LOOKUP = new Map();
for (const group of SYNONYM_GROUPS) {
  for (const word of group.words) {
    SYNONYM_LOOKUP.set(word, [word, ...group.match.filter((m) => m !== word)]);
  }
}

/* Perluas satu kata kunci dengan sinonimnya. */
export function expandToken(token) {
  return SYNONYM_LOOKUP.get(token) || [token];
}

/* Pecah kata kunci jadi kelompok token. Tiap kelompok berisi satu
 * kata kunci beserta sinonimnya; pencocokan lolos bila salah satu
 * anggota kelompok muncul di teks. */
export function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .filter((t) => t.length > 0)
    .map(expandToken);
}

/* Pecah kata kunci TANPA perluasan sinonim, untuk pencocokan nama
 * perusahaan: sinonim tidak boleh memicu mode nama (mis. "warehouse"
 * tidak boleh hanya menampilkan perusahaan bernama GudangAda). */
export function tokenizeRaw(value) {
  return normalizeText(value)
    .split(" ")
    .filter((t) => t.length > 0);
}

/* Apakah kata kunci seluruhnya kata peran umum, yaitu setiap katanya
 * ada di daftar sinonim? Kata seperti itu tidak boleh memicu mode nama
 * (CARI-01, keputusan S5): "gudang" adalah peran, bukan pencarian
 * perusahaan bernama GudangAda. Kata kunci kosong bukan kata peran. */
export function isRoleKeyword(value) {
  const tokens = tokenizeRaw(value);
  return (
    tokens.length > 0 && tokens.every((t) => SYNONYM_LOOKUP.has(t))
  );
}

/* Kata kunci pendek (1-2 huruf, mis. "ob" dan "og" dari sinonim office
 * boy/girl) hanya cocok sebagai kata utuh. Tanpa ini "og" ikut cocok di
 * "logistik" dan "ob" di "robot", dan hasil Office Boy membengkak. */
function indexOfToken(text, token, from) {
  let i = text.indexOf(token, from);
  if (token.length > 2) return i;
  const isWord = (ch) => ch !== undefined && /[a-z0-9]/.test(ch);
  while (i !== -1) {
    if (!isWord(text[i - 1]) && !isWord(text[i + token.length])) return i;
    i = text.indexOf(token, i + 1);
  }
  return -1;
}

export function fieldMatches(field, tokenGroups) {
  const text = normalizeText(field);
  if (tokenGroups.length === 0) return false;
  return tokenGroups.every((group) =>
    group.some((t) => indexOfToken(text, t, 0) !== -1),
  );
}

const DENIAL_WORDS = ["tidak", "bukan", "belum", "tanpa", "kedaluwarsa", "kadaluwarsa"];
const DENIAL_WINDOW = 60;

function tokenHasAffirmativeOccurrence(text, token) {
  let idx = -1;
  while ((idx = indexOfToken(text, token, idx + 1)) !== -1) {
    const start = Math.max(0, idx - DENIAL_WINDOW);
    const end = Math.min(text.length, idx + token.length + DENIAL_WINDOW);
    const window = text.slice(start, end);
    if (!DENIAL_WORDS.some((w) => window.indexOf(w) !== -1)) return true;
  }
  return false;
}

export function fieldMatchesAffirmative(field, tokenGroups) {
  if (tokenGroups.length === 0) return false;
  const text = normalizeText(field);
  return tokenGroups.every((group) =>
    group.some((t) => tokenHasAffirmativeOccurrence(text, t)),
  );
}

/* Cek pencarian bebas per field (untuk /api/companies?q=, CARI-05):
 * tiap field dicek afirmasinya sendiri lalu digabung dengan OR, supaya
 * kata penyangkal di satu field tidak membatalkan kecocokan asli di
 * field lain. Cara lama (satu string gabungan) menghilangkan GudangAda
 * dan Bank Danamon dari hasil "gudang": "tidak" di posisi/catatan
 * tetangga membatalkan kecocokan nama/catatan. Nama perusahaan dicek
 * dengan token mentah (tanpa sinonim), sama seperti scoreCompany;
 * field lain dengan token bersinonim. Catatan: kata kunci multi-kata
 * harus cocok seluruhnya di SATU field; kecocokan yang tersebar
 * lintas field tidak dihitung, sama seperti jalur halaman. */
export function matchesFreeText(company, q) {
  const tokenGroups = tokenize(q);
  if (tokenGroups.length === 0) return false;
  const rawGroups = tokenizeRaw(q).map((t) => [t]);
  if (fieldMatches(company.perusahaan || "", rawGroups)) return true;
  return ["posisi", "lokasi", "catatan"].some((field) =>
    fieldMatchesAffirmative(company[field] || "", tokenGroups),
  );
}

export function scoreCompany(company, query) {
  let score = 0;
  const reasons = [];
  let positionMatched = false;
  let nameMatched = false;

  if (query.posisiTokens.length > 0) {
    if (
      fieldMatches(
        company.perusahaan,
        query.rawPosisiTokens.map((t) => [t]),
      )
    ) {
      nameMatched = true;
    } else if (
      fieldMatchesAffirmative(company.posisi, query.posisiTokens) ||
      fieldMatchesAffirmative(company.catatan, query.posisiTokens)
    ) {
      score += 50;
      reasons.push("Posisi cocok");
      positionMatched = true;
    }
  }

  if (
    query.domisiliTokens.length > 0 &&
    fieldMatchesAffirmative(company.lokasi, query.domisiliTokens)
  ) {
    score += 30;
    reasons.push("Lokasi cocok");
  }

  if (company.status === "Ada lowongan") {
    score += 20;
    reasons.push("Lowongan terverifikasi");
  } else if (company.status === "Portal tidak bisa dibuka") {
    score -= 20;
  } else if (company.status === "Tidak dapat diverifikasi") {
    score -= 10;
  }

  if (company.link_karir && company.status !== "Portal tidak bisa dibuka") {
    reasons.push("Portal terbuka");
  }

  return { score, reasons, positionMatched, nameMatched };
}

export function compareByScore(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  return a.company.perusahaan.localeCompare(b.company.perusahaan, "id");
}

export function compareByName(a, b) {
  return a.company.perusahaan.localeCompare(b.company.perusahaan, "id");
}

/* Nomor perusahaan yang memenuhi SEMUA isian yang diketik (posisi
 * DAN domisili) — dipakai rank() klien (company-index.js) dan hasil
 * awal server /cari (cari/page.js, AKSES-02) supaya hitungan
 * "cocok" sama di kedua jalur. `scored` adalah hasil runSearch,
 * `query` adalah objek query yang dikembalikannya. */
export function matchedCompanyNos(scored, query) {
  const hasD = query.domisiliTokens.length > 0;
  const hasP = query.posisiTokens.length > 0;
  if (!hasD && !hasP) return [];
  const out = [];
  for (const e of scored) {
    const okP = !hasP || e.positionMatched || e.nameMatched;
    const okD = !hasD || e.reasons.includes("Lokasi cocok");
    if (okP && okD) out.push(e.company.no);
  }
  return out;
}

export function countBy(list, key) {
  const out = {};
  list.forEach((item) => {
    const k = item[key] || "Tidak tercatat";
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

export function topEntries(counts, n) {
  return Object.keys(counts)
    .map((k) => ({ label: k, count: counts[k] }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "id"))
    .slice(0, n);
}

/* Jalankan satu pencarian penuh atas daftar perusahaan.
 * Mengembalikan entri { company, score, reasons, positionMatched,
 * nameMatched } yang sudah diurutkan, plus mode ("semua" /
 * "perusahaan") dan groups (null kecuali mode "perusahaan", berisi
 * { companies, roles } dalam urutan tampil).
 * Mode "perusahaan" (keputusan S5): hanya bila kata kunci BUKAN kata
 * peran umum dan ada nama yang cocok. Hasilnya dua kelompok berlabel:
 * kecocokan nama dulu, lalu kecocokan peran. Keduanya terlihat,
 * tidak ada yang dibuang. Kata peran umum ("gudang", "toko", "crew")
 * selalu mode "semua": seluruh daftar tampil terurut skor, kecocokan
 * peran di atas.
 * Filter: kategori, status (cocok persis), kota (kota dari
 * matchCity atas kolom lokasi; lokasi tanpa kota yang dikenali tidak
 * lolos bila filter kota aktif). */
export function runSearch(companies, query) {
  const q = {
    domisiliTokens: tokenize(query.domisili || ""),
    posisiTokens: tokenize(query.posisi || ""),
    rawPosisiTokens: tokenizeRaw(query.posisi || ""),
  };
  let scored = companies.map((c) => {
    const s = scoreCompany(c, q);
    return {
      company: c,
      score: s.score,
      reasons: s.reasons,
      positionMatched: s.positionMatched,
      nameMatched: s.nameMatched,
    };
  });

  if (query.kategori) {
    scored = scored.filter((e) => e.company.kategori === query.kategori);
  }
  if (query.status) {
    scored = scored.filter((e) => e.company.status === query.status);
  }
  if (query.kota) {
    scored = scored.filter(
      (e) => matchCity(e.company.lokasi)?.name === query.kota,
    );
  }

  let mode = "semua";
  if (q.posisiTokens.length > 0) {
    const nameMatches = scored.filter((e) => e.nameMatched);
    if (nameMatches.length > 0 && !isRoleKeyword(query.posisi || "")) {
      /* Kelompok nama dulu, lalu kelompok peran; perusahaan yang tidak
       * cocok keduanya tidak tampil di mode ini, supaya label kelompok
       * jujur (bukan daftar 610 baris dengan dua judul). */
      scored = [
        ...nameMatches,
        ...scored.filter((e) => !e.nameMatched && e.positionMatched),
      ];
      mode = "perusahaan";
    }
  }

  /* Dalam mode perusahaan, kelompok nama selalu di atas kelompok
   * peran; di dalam tiap kelompok, urutan normal berlaku. */
  const byGroupThen = (cmp) => (a, b) => {
    if (mode === "perusahaan") {
      const ga = a.nameMatched ? 0 : 1;
      const gb = b.nameMatched ? 0 : 1;
      if (ga !== gb) return ga - gb;
    }
    return cmp(a, b);
  };
  if (query.urutan === "nama") scored.sort(byGroupThen(compareByName));
  else scored.sort(byGroupThen(compareByScore));

  const groups =
    mode === "perusahaan"
      ? {
          companies: scored.filter((e) => e.nameMatched),
          roles: scored.filter((e) => !e.nameMatched),
        }
      : null;

  return { results: scored, mode, groups, query: q };
}
