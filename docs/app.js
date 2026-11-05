"use strict";

/*
 * Karir — logika pencarian dan rekomendasi.
 *
 * Data: companies.json (405 perusahaan). Satu-satunya request jaringan
 * adalah fetch file itu dari origin yang sama. Tidak ada data pribadi
 * yang dikumpulkan, disimpan, atau dikirim ke mana pun.
 *
 * KEJUJURAN DATA — aturan terpenting di file ini:
 * Pengecekan lowongan di data ini dulu difokuskan ke peran gudang,
 * produksi, cleaning, office boy, packing, dan crew store. Aplikasi
 * TIDAK BOLEH mengklaim ada lowongan untuk peran lain kalau data tidak
 * mencatatnya. Karena itu:
 * - Kata kunci posisi cocok dengan kolom posisi/catatan -> kecocokan
 *   terverifikasi (chip "Posisi cocok").
 * - Kata kunci posisi TIDAK cocok -> perusahaan tetap tampil sebagai
 *   rekomendasi kanal, dengan label jelas "Peran ini belum terverifikasi
 *   di data kami — cek langsung di portalnya". Jangan pernah mengarang
 *   lowongan.
 *
 * Mode pencarian:
 * - Kalau kata kunci cocok dengan NAMA perusahaan mana pun, pencarian
 *   dianggap pencarian perusahaan: hanya perusahaan yang namanya cocok
 *   yang tampil (misal mengetik "PGN" mencari perusahaan bernama PGN).
 * - Kalau tidak ada nama yang cocok, pencarian dianggap pencarian
 *   posisi: semua perusahaan dirangking berdasarkan skor di bawah.
 *   Yang cocok tampil di atas, yang tidak cocok tetap tampil di bawah
 *   sebagai rekomendasi kanal dengan label di atas.
 */

var PAGE_SIZE = 20;

/* ---------- Fungsi murni (tanpa akses DOM, bisa diuji di Node) ---------- */

/* Huruf kecil, spasi dirapikan. Dipakai agar "Depok" cocok dengan "depok". */
function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/* Pecah kata kunci menjadi token. Semua token harus cocok (AND). */
function tokenize(query) {
  return normalizeText(query).split(" ").filter(function (t) { return t.length > 0; });
}

/* True kalau semua token muncul di dalam field (pencocokan substring). */
function fieldMatches(field, tokens) {
  var text = normalizeText(field);
  if (tokens.length === 0) { return false; }
  return tokens.every(function (t) { return text.indexOf(t) !== -1; });
}

/*
 * Kata penyangkalan. Satu kemunculan kata kunci TIDAK dihitung kalau di
 * dekatnya (60 karakter sebelum/sesudah) ada kata penyangkalan.
 * Contoh nyata dari data: lokasi Fore Coffee berbunyi "tidak ada
 * penyebutan Bogor/Depok" — kata "Depok" ada di sana, tapi kalimat itu
 * justru menyangkal, bukan menyatakan lokasi. Lokasi Shopee berbunyi
 * "Bogor hanya muncul pada lowongan yang sudah kedaluwarsa" — "Bogor"
 * ada, tapi lowongannya sudah kedaluwarsa. Tanpa aturan ini aplikasi
 * merekomendasikan perusahaan yang salah.
 * Jendela 60 karakter dipilih agar "bukan persis" di catatan Roti O
 * ("...bukan persis: Pelaksana Gudang ... setara Staff Gudang/Helper
 * Gudang") tidak ikut mematikan kecocokan "Helper Gudang" yang sah —
 * kata "bukan" itu lebih dari 60 karakter sebelum "Helper".
 */
var DENIAL_WORDS = ["tidak", "bukan", "belum", "tanpa", "kedaluwarsa", "kadaluwarsa"];
var DENIAL_WINDOW = 60;

/* True kalau token punya minimal satu kemunculan yang tidak disangkal. */
function tokenHasAffirmativeOccurrence(text, token) {
  var idx = -1;
  while ((idx = text.indexOf(token, idx + 1)) !== -1) {
    var start = Math.max(0, idx - DENIAL_WINDOW);
    var end = Math.min(text.length, idx + token.length + DENIAL_WINDOW);
    var window = text.slice(start, end);
    if (!DENIAL_WORDS.some(function (w) { return window.indexOf(w) !== -1; })) { return true; }
  }
  return false;
}

/* Seperti fieldMatches, tapi kemunculan yang disangkal tidak dihitung. */
function fieldMatchesAffirmative(field, tokens) {
  if (tokens.length === 0) { return false; }
  var text = normalizeText(field);
  return tokens.every(function (t) { return tokenHasAffirmativeOccurrence(text, t); });
}

/*
 * Skor rekomendasi satu perusahaan terhadap kata kunci.
 * query = { domisiliTokens: [], posisiTokens: [] }
 * Mengembalikan { score, reasons, positionMatched, nameMatched }.
 */
function scoreCompany(company, query) {
  var score = 0;
  var reasons = [];
  var positionMatched = false;
  var nameMatched = false;

  if (query.posisiTokens.length > 0) {
    /*
     * Cek nama perusahaan dulu: kalau kata kunci cocok dengan nama
     * perusahaan, ini pencarian perusahaan, bukan posisi. Kecocokan
     * posisi tidak dihitung dari kata itu — contoh: mengetik "PGN"
     * tidak boleh memberi chip "Posisi cocok" hanya karena catatan
     * menyebut pgn.co.id.
     */
    if (fieldMatches(company.perusahaan, query.posisiTokens)) {
      nameMatched = true;
    } else if (fieldMatchesAffirmative(company.posisi, query.posisiTokens) ||
        fieldMatchesAffirmative(company.catatan, query.posisiTokens)) {
      score += 50;
      reasons.push("Posisi cocok");
      positionMatched = true;
    }
  }

  if (query.domisiliTokens.length > 0 &&
      fieldMatchesAffirmative(company.lokasi, query.domisiliTokens)) {
    score += 30;
    reasons.push("Lokasi cocok");
  }

  if (company.status === "Ada lowongan target") {
    score += 20;
    reasons.push("Lowongan terverifikasi");
  } else if (company.status === "Ada lowongan target (tidak cocok)") {
    score += 10;
  } else if (company.status === "Portal tidak bisa dibuka") {
    score -= 20;
  } else if (company.status === "Tidak dapat diverifikasi") {
    score -= 10;
  }

  if (company.link_karir && company.status !== "Portal tidak bisa dibuka") {
    reasons.push("Portal terbuka");
  }

  return { score: score, reasons: reasons, positionMatched: positionMatched, nameMatched: nameMatched };
}

/* Urutkan: skor tertinggi dulu, lalu nama A-Z. */
function compareByScore(a, b) {
  if (b.score !== a.score) { return b.score - a.score; }
  return a.company.perusahaan.localeCompare(b.company.perusahaan, "id");
}

function compareByName(a, b) {
  return a.company.perusahaan.localeCompare(b.company.perusahaan, "id");
}

/* Diekspos agar logika ini bisa diuji langsung dari Node tanpa browser. */
if (typeof window !== "undefined") {
  window.KarirSearch = {
    normalizeText: normalizeText,
    tokenize: tokenize,
    fieldMatches: fieldMatches,
    fieldMatchesAffirmative: fieldMatchesAffirmative,
    scoreCompany: scoreCompany,
    compareByScore: compareByScore,
    compareByName: compareByName
  };
}

/* ---------- Aplikasi (DOM) — hanya jalan di browser ---------- */

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("search-form");
    var domisiliInput = document.getElementById("domisili");
    var posisiInput = document.getElementById("posisi");
    var kategoriSelect = document.getElementById("kategori");
    var statusSelect = document.getElementById("status");
    var urutanSelect = document.getElementById("urutan");
    var resetButton = document.getElementById("reset");
    var resultsEl = document.getElementById("results");
    var countEl = document.getElementById("result-count");
    var noteEl = document.getElementById("search-note");
    var loadMoreButton = document.getElementById("load-more");
    var statTotal = document.getElementById("stat-total");
    var statTarget = document.getElementById("stat-target");

    var companies = [];
    var current = []; /* daftar hasil {company, score, reasons, positionMatched, nameMatched} */
    var shown = 0;
    var lastQuery = { domisiliTokens: [], posisiTokens: [] };

    /* Semua teks dari data dirender dengan textContent / createElement.
       Tidak pernah innerHTML dengan data atau input pengguna. */
    function el(tag, text, className) {
      var node = document.createElement(tag);
      if (className) { node.className = className; }
      if (text !== undefined && text !== null) { node.textContent = text; }
      return node;
    }

    function statusBadgeClass(status) {
      if (status === "Ada lowongan target") { return "badge badge-ok"; }
      if (status === "Ada lowongan target (tidak cocok)") { return "badge badge-warn"; }
      return "badge badge-muted";
    }

    /* Hanya tautan http/https yang dirender sebagai link. */
    function safeLink(url) {
      if (typeof url !== "string") { return ""; }
      var trimmed = url.trim();
      if (/^https?:\/\//i.test(trimmed)) { return trimmed; }
      return "";
    }

    function buildCard(entry, showUnverifiedNotice) {
      var c = entry.company;
      var card = el("article", null, "card");

      card.appendChild(el("h2", c.perusahaan));

      var chips = el("div", null, "chips");
      chips.appendChild(el("span", c.kategori, "chip"));
      chips.appendChild(el("span", c.status, statusBadgeClass(c.status)));
      /* Alasan kecocokan: chip hijau hanya untuk lowongan terverifikasi.
         Chip lain hanya tampil saat ada kata kunci yang memicunya. */
      entry.reasons.forEach(function (reason) {
        var cls = reason === "Lowongan terverifikasi" ? "chip chip-match" : "chip";
        if (reason === "Portal terbuka" &&
            lastQuery.domisiliTokens.length === 0 && lastQuery.posisiTokens.length === 0) {
          return; /* tanpa kata kunci, "Portal terbuka" tidak menambah info */
        }
        chips.appendChild(el("span", reason, cls));
      });
      card.appendChild(chips);

      var dl = el("dl");
      dl.appendChild(el("dt", "Lokasi"));
      dl.appendChild(el("dd", c.lokasi || "-"));
      dl.appendChild(el("dt", "Posisi tercatat"));
      dl.appendChild(el("dd", c.posisi || "-"));
      dl.appendChild(el("dt", "Tanggal cek"));
      dl.appendChild(el("dd", c.tanggal_cek || "-"));
      card.appendChild(dl);

      if (c.catatan) {
        var note = c.catatan.length > 220 ? c.catatan.slice(0, 220).replace(/\s+\S*$/, "") + "…" : c.catatan;
        card.appendChild(el("p", note, "catatan"));
      }

      /* Label kejujuran: posisi dicari tapi tidak ada di data perusahaan ini. */
      if (showUnverifiedNotice) {
        card.appendChild(el("p", "Peran ini belum terverifikasi di data kami — cek langsung di portalnya.", "notice"));
      }

      var href = safeLink(c.link_karir);
      if (href) {
        var a = el("a", "Buka kanal karir", "card-link");
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        card.appendChild(a);
      } else {
        card.appendChild(el("p", "Tidak ada kanal resmi yang ditemukan untuk perusahaan ini.", "no-link"));
      }
      return card;
    }

    function renderState(title, text) {
      var div = el("div", null, "state");
      div.appendChild(el("strong", title));
      div.appendChild(el("p", text));
      return div;
    }

    function render() {
      while (resultsEl.firstChild) { resultsEl.removeChild(resultsEl.firstChild); }
      var total = current.length;
      var toShow = Math.min(shown, total);
      var hasPositionQuery = lastQuery.posisiTokens.length > 0;

      if (total === 0) {
        resultsEl.appendChild(renderState(
          "Tidak ada perusahaan yang cocok.",
          "Coba kata kunci lain, atau kosongkan filter kategori dan status."
        ));
        countEl.textContent = "Menampilkan 0 dari 0 perusahaan";
        loadMoreButton.hidden = true;
        return;
      }

      for (var i = 0; i < toShow; i++) {
        var entry = current[i];
        /* Label "belum terverifikasi" hanya untuk kartu yang posisi
           kuncinya tidak cocok dengan data perusahaan itu. */
        var showNotice = hasPositionQuery && !entry.positionMatched && !entry.nameMatched;
        resultsEl.appendChild(buildCard(entry, showNotice));
      }

      countEl.textContent = "Menampilkan " + toShow + " dari " + total + " perusahaan";
      loadMoreButton.hidden = toShow >= total;
    }

    function runSearch() {
      var query = {
        domisiliTokens: tokenize(domisiliInput.value),
        posisiTokens: tokenize(posisiInput.value)
      };
      lastQuery = query;
      var kategori = kategoriSelect.value;
      var status = statusSelect.value;
      var urutan = urutanSelect.value;

      /* Filter keras: kategori dan status. */
      var pool = companies.filter(function (c) {
        if (kategori && c.kategori !== kategori) { return false; }
        if (status && c.status !== status) { return false; }
        return true;
      });

      var scored = pool.map(function (c) {
        var r = scoreCompany(c, query);
        return { company: c, score: r.score, reasons: r.reasons, positionMatched: r.positionMatched, nameMatched: r.nameMatched };
      });

      var mode = "rekomendasi";
      if (query.posisiTokens.length > 0) {
        var nameMatches = scored.filter(function (e) { return e.nameMatched; });
        if (nameMatches.length > 0) {
          /* Kata kunci cocok dengan nama perusahaan: tampilkan hanya
             perusahaan itu (pencarian perusahaan, bukan posisi). */
          scored = nameMatches;
          mode = "perusahaan";
        }
      }

      if (urutan === "nama") {
        scored.sort(compareByName);
      } else {
        scored.sort(compareByScore);
      }

      current = scored;
      shown = PAGE_SIZE;

      /* Catatan jujur di atas hasil. */
      noteEl.hidden = true;
      noteEl.textContent = "";
      if (mode === "rekomendasi" && query.posisiTokens.length > 0) {
        var anyMatch = scored.some(function (e) { return e.positionMatched; });
        if (!anyMatch) {
          noteEl.textContent = "Tidak ada catatan posisi \"" + posisiInput.value.trim() +
            "\" di data kami. Di bawah ini rekomendasi kanal berdasarkan domisili dan status portal — periksa langsung di portalnya.";
          noteEl.hidden = false;
        }
      }
      if (mode === "rekomendasi" && query.posisiTokens.length === 0 && query.domisiliTokens.length === 0) {
        noteEl.textContent = "Menampilkan semua perusahaan. Yang ada lowongan target tampil di atas.";
        noteEl.hidden = false;
      }

      render();
    }

    function fillCategories() {
      var seen = {};
      companies.forEach(function (c) { seen[c.kategori] = true; });
      Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, "id"); }).forEach(function (cat) {
        var opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        kategoriSelect.appendChild(opt);
      });
    }

    function init() {
      countEl.textContent = "Memuat data…";
      fetch("companies.json")
        .then(function (res) {
          if (!res.ok) { throw new Error("HTTP " + res.status); }
          return res.json();
        })
        .then(function (data) {
          if (!Array.isArray(data)) { throw new Error("format data tidak dikenal"); }
          companies = data;
          fillCategories();
          var targetCount = companies.filter(function (c) { return c.status === "Ada lowongan target"; }).length;
          statTotal.textContent = String(companies.length);
          statTarget.textContent = String(targetCount);
          runSearch();
        })
        .catch(function () {
          countEl.textContent = "Data tidak bisa dimuat.";
          while (resultsEl.firstChild) { resultsEl.removeChild(resultsEl.firstChild); }
          resultsEl.appendChild(renderState(
            "Data tidak bisa dimuat.",
            "Periksa koneksi internet, lalu muat ulang halaman ini."
          ));
          loadMoreButton.hidden = true;
        });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault(); /* tidak ada form yang dikirim ke mana pun */
      runSearch();
    });
    kategoriSelect.addEventListener("change", runSearch);
    statusSelect.addEventListener("change", runSearch);
    urutanSelect.addEventListener("change", runSearch);
    loadMoreButton.addEventListener("click", function () {
      shown += PAGE_SIZE;
      render();
    });
    resetButton.addEventListener("click", function () {
      domisiliInput.value = "";
      posisiInput.value = "";
      kategoriSelect.value = "";
      statusSelect.value = "";
      urutanSelect.value = "relevansi";
      runSearch();
      domisiliInput.focus();
    });

    init();
  });
}
