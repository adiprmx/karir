/* Logika pencarian Karir — fungsi murni, tanpa DOM.
 * Diport dari docs/app.js (versi statis, sudah terverifikasi).
 * Aturan yang sama berlaku di sini: pencocokan substring dengan
 * pengecualian kalimat penyangkalan, skor rekomendasi
 * posisi +50, domisili +30, lowongan terverifikasi +20,
 * tidak cocok +10, portal mati -20, tidak terverifikasi -10. */

export function normalizeText(value) {
  if (!value) return "";
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value) {
  return normalizeText(value).split(" ").filter((t) => t.length > 0);
}

export function fieldMatches(field, tokens) {
  const text = normalizeText(field);
  if (tokens.length === 0) return false;
  return tokens.every((t) => text.indexOf(t) !== -1);
}

const DENIAL_WORDS = ["tidak", "bukan", "belum", "tanpa", "kedaluwarsa", "kadaluwarsa"];
const DENIAL_WINDOW = 60;

function tokenHasAffirmativeOccurrence(text, token) {
  let idx = -1;
  while ((idx = text.indexOf(token, idx + 1)) !== -1) {
    const start = Math.max(0, idx - DENIAL_WINDOW);
    const end = Math.min(text.length, idx + token.length + DENIAL_WINDOW);
    const window = text.slice(start, end);
    if (!DENIAL_WORDS.some((w) => window.indexOf(w) !== -1)) return true;
  }
  return false;
}

export function fieldMatchesAffirmative(field, tokens) {
  if (tokens.length === 0) return false;
  const text = normalizeText(field);
  return tokens.every((t) => tokenHasAffirmativeOccurrence(text, t));
}

export function scoreCompany(company, query) {
  let score = 0;
  const reasons = [];
  let positionMatched = false;
  let nameMatched = false;

  if (query.posisiTokens.length > 0) {
    if (fieldMatches(company.perusahaan, query.posisiTokens)) {
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
