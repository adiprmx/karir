/* Logika pencarian Karir, fungsi murni, tanpa DOM.
 * Diport dari docs/app.js (versi statis, sudah terverifikasi).
 * Aturan yang sama berlaku di sini: pencocokan substring dengan
 * pengecualian kalimat penyangkalan, skor rekomendasi
 * posisi +50, domisili +30, lowongan terverifikasi +20,
 * tidak cocok +10, portal mati -20, tidak terverifikasi -10.
 * Sinonim peran: tokenize() memperluas tiap kata kunci dengan
 * padanannya (mis. cleaner juga cocok dengan cleaning dan
 * kebersihan), jadi pencari tidak harus menebak kata yang persis
 * tertulis di data. */

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

  if (company.status === "Ada lowongan target") {
    score += 20;
    reasons.push("Lowongan terverifikasi");
  } else if (company.status === "Ada lowongan target (tidak cocok)") {
    score += 10;
    reasons.push("Lowongan terverifikasi, syarat tidak cocok");
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
 * nameMatched } yang sudah diurutkan, plus mode ("semua" / "perusahaan"). */
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

  let mode = "semua";
  if (q.posisiTokens.length > 0) {
    const nameMatches = scored.filter((e) => e.nameMatched);
    if (nameMatches.length > 0) {
      scored = nameMatches;
      mode = "perusahaan";
    }
  }

  if (query.urutan === "nama") scored.sort(compareByName);
  else scored.sort(compareByScore);

  return { results: scored, mode, query: q };
}
