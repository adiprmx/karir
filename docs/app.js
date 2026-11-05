"use strict";

/* ============================================================
 * Karir — aplikasi web statis.
 * Semua data berasal dari companies.json di situs yang sama.
 * Tidak ada akun, tidak ada data pribadi, tidak ada layanan
 * pihak ketiga. Satu-satunya request adalah fetch data ini.
 * ============================================================ */

var DATA_URL = "companies.json";
var PAGE_SIZE = 20;

/* ---------- Normalisasi dan pencocokan ---------- */

/* Huruf kecil, tanpa diakritik, spasi dirapikan. */
function normalizeText(value) {
  if (!value) { return ""; }
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* Pecah kata kunci menjadi token. Semua token harus cocok (AND). */
function tokenize(value) {
  return normalizeText(value).split(" ").filter(function (t) { return t.length > 0; });
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

/* ---------- Skor rekomendasi ---------- */

/*
 * Skor: posisi cocok +50, domisili cocok +30,
 * "Ada lowongan target" +20, "(tidak cocok)" +10,
 * "Portal tidak bisa dibuka" -20, "Tidak dapat diverifikasi" -10.
 * Angka ini hanya urutan rekomendasi, bukan janji lowongan.
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
    reasons.push("Lowongan terverifikasi, syarat tidak cocok");
  } else if (company.status === "Portal tidak bisa dibuka") {
    score -= 20;
  } else if (company.status === "Tidak dapat diverifikasi") {
    score -= 10;
  }

  if (company.link_karir && company.status !== "Portal tidak bisa dibuka") {
    reasons.push("Portal terbuka");
  }

  return {
    score: score,
    reasons: reasons,
    positionMatched: positionMatched,
    nameMatched: nameMatched
  };
}

function compareByScore(a, b) {
  if (b.score !== a.score) { return b.score - a.score; }
  return a.company.perusahaan.localeCompare(b.company.perusahaan, "id");
}

function compareByName(a, b) {
  return a.company.perusahaan.localeCompare(b.company.perusahaan, "id");
}

/* ---------- Hitung dari data (dipakai Dasbor) ---------- */

function countBy(list, key) {
  var out = {};
  list.forEach(function (item) {
    var k = item[key] || "Tidak tercatat";
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

function topEntries(counts, n) {
  return Object.keys(counts)
    .map(function (k) { return { label: k, count: counts[k] }; })
    .sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label, "id"); })
    .slice(0, n);
}

if (typeof window !== "undefined") {
  window.KarirSearch = {
    normalizeText: normalizeText,
    tokenize: tokenize,
    fieldMatches: fieldMatches,
    fieldMatchesAffirmative: fieldMatchesAffirmative,
    scoreCompany: scoreCompany,
    compareByScore: compareByScore,
    compareByName: compareByName,
    countBy: countBy,
    topEntries: topEntries
  };
}

/* ---------- DOM ---------- */

if (typeof document !== "undefined") {
  (function () {
    var DATA = [];
    var currentResults = [];
    var currentQuery = { domisiliTokens: [], posisiTokens: [] };
    var currentMode = "semua";
    var visibleCount = PAGE_SIZE;
    var dataFailed = false;

    var $ = function (id) { return document.getElementById(id); };

    /* ----- Router tiga tampilan ----- */
    var VIEWS = ["beranda", "cari", "dasbor"];

    function showView(name, focusTitle) {
      if (VIEWS.indexOf(name) === -1) { name = "beranda"; }
      VIEWS.forEach(function (v) {
        var el = $("view-" + v);
        if (el) { el.hidden = (v !== name); }
        var link = document.querySelector('[data-view-link="' + v + '"]');
        if (link) {
          if (v === name) { link.setAttribute("aria-current", "page"); }
          else { link.removeAttribute("aria-current"); }
        }
      });
      if (focusTitle) {
        var title = document.querySelector("#view-" + name + " .page-title");
        if (title) { title.focus(); }
      }
      window.scrollTo(0, 0);
    }

    function viewFromHash() {
      var hash = (window.location.hash || "").replace(/^#\/?/, "");
      return VIEWS.indexOf(hash) !== -1 ? hash : "beranda";
    }

    window.addEventListener("hashchange", function () {
      showView(viewFromHash(), false);
    });

    /* ----- Util DOM ----- */
    function el(tag, cls, text) {
      var node = document.createElement(tag);
      if (cls) { node.className = cls; }
      if (text !== undefined && text !== null) { node.textContent = text; }
      return node;
    }

    function safeLink(url) {
      return typeof url === "string" && /^https?:\/\//.test(url);
    }

    function statusBadge(status) {
      var badge = el("span", "badge");
      if (status === "Ada lowongan target") {
        badge.className += " badge-ok";
      } else if (status === "Ada lowongan target (tidak cocok)") {
        badge.className += " badge-warn";
      } else {
        badge.className += " badge-muted";
      }
      badge.textContent = status;
      return badge;
    }

    /* ----- Kartu hasil pencarian ----- */
    function createCard(company, scored) {
      var card = el("article", "card");
      var title = el("h2", null, company.perusahaan);
      card.appendChild(title);

      var chips = el("div", "chips");
      chips.appendChild(el("span", "chip", company.kategori));
      chips.appendChild(statusBadge(company.status));
      (scored.reasons || []).forEach(function (reason) {
        var cls = "chip";
        if (reason === "Posisi cocok" || reason === "Lokasi cocok") { cls += " chip-match"; }
        chips.appendChild(el("span", cls, reason));
      });
      card.appendChild(chips);

      var dl = el("dl");
      dl.appendChild(el("dt", null, "Lokasi"));
      dl.appendChild(el("dd", null, company.lokasi || "Tidak tercantum"));
      dl.appendChild(el("dt", null, "Posisi tercatat"));
      dl.appendChild(el("dd", null, company.posisi || "Tidak ada posisi terlihat"));
      dl.appendChild(el("dt", null, "Tanggal cek"));
      dl.appendChild(el("dd", null, company.tanggal_cek || "-"));
      card.appendChild(dl);

      if (company.catatan) {
        card.appendChild(el("p", "catatan", company.catatan));
      }

      if (currentQuery.posisiTokens.length > 0 && !scored.positionMatched &&
          !scored.nameMatched && currentMode !== "perusahaan") {
        var notice = el("p", "notice",
          "Peran ini belum terverifikasi di data kami — cek langsung di portalnya.");
        card.appendChild(notice);
      }

      if (safeLink(company.link_karir)) {
        var link = el("a", "card-link", "Buka kanal karir");
        link.href = company.link_karir;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        card.appendChild(link);
      } else {
        card.appendChild(el("p", "no-link", "Tidak ditemukan kanal karir resmi."));
      }

      return card;
    }

    function renderResults() {
      var box = $("results");
      box.textContent = "";
      var shown = currentResults.slice(0, visibleCount);
      shown.forEach(function (entry) {
        box.appendChild(createCard(entry.company, entry));
      });
      if (currentResults.length === 0) {
        var state = el("div", "state");
        state.appendChild(el("strong", null, "Tidak ada perusahaan yang cocok."));
        state.appendChild(document.createTextNode(
          "Coba kata kunci lain, atau kosongkan kolom dan tekan Cari untuk melihat semua perusahaan."));
        box.appendChild(state);
      }
      var count = $("result-count");
      count.textContent = "Menampilkan " + shown.length + " dari " + currentResults.length + " perusahaan";
      var more = $("load-more");
      more.hidden = currentResults.length <= visibleCount;
    }

    function readQuery(form) {
      return {
        domisiliTokens: tokenize(form.domisili.value),
        posisiTokens: tokenize(form.posisi.value),
        kategori: form.kategori ? form.kategori.value : "",
        status: form.status ? form.status.value : "",
        urutan: form.urutan ? form.urutan.value : "relevansi"
      };
    }

    function runSearch(query) {
      currentQuery = { domisiliTokens: query.domisiliTokens, posisiTokens: query.posisiTokens };
      visibleCount = PAGE_SIZE;
      var scored = DATA.map(function (c) {
        var s = scoreCompany(c, currentQuery);
        return { company: c, score: s.score, reasons: s.reasons,
                 positionMatched: s.positionMatched, nameMatched: s.nameMatched };
      });

      if (query.kategori) {
        scored = scored.filter(function (e) { return e.company.kategori === query.kategori; });
      }
      if (query.status) {
        scored = scored.filter(function (e) { return e.company.status === query.status; });
      }

      currentMode = "semua";
      if (currentQuery.posisiTokens.length > 0) {
        var nameMatches = scored.filter(function (e) { return e.nameMatched; });
        if (nameMatches.length > 0) {
          scored = nameMatches;
          currentMode = "perusahaan";
        }
      }

      if (query.urutan === "nama") { scored.sort(compareByName); }
      else { scored.sort(compareByScore); }

      currentResults = scored;

      var note = $("search-note");
      if (currentQuery.posisiTokens.length > 0 && currentMode !== "perusahaan") {
        var anyMatch = scored.some(function (e) { return e.positionMatched; });
        if (!anyMatch) {
          note.textContent = "Tidak ada kecocokan posisi di data kami. Hasil di bawah ini adalah rekomendasi kanal berdasarkan domisili dan status, bukan lowongan yang terverifikasi.";
          note.hidden = false;
        } else {
          note.hidden = true;
        }
      } else {
        note.hidden = true;
      }

      renderResults();
    }

    /* ----- Beranda: rel lowongan target ----- */
    function renderVacancyRail() {
      var rail = $("vacancy-rail");
      if (!rail) { return; }
      rail.textContent = "";
      var targets = DATA.filter(function (c) { return c.status === "Ada lowongan target"; });
      targets.sort(function (a, b) { return a.perusahaan.localeCompare(b.perusahaan, "id"); });
      targets.forEach(function (c) {
        var card = el("article", "vacancy-card");
        card.appendChild(el("h3", null, c.perusahaan));
        card.appendChild(el("p", "vacancy-role", (c.posisi || "").split(",")[0]));
        card.appendChild(el("p", "vacancy-loc", c.lokasi || "Tidak tercantum"));
        if (safeLink(c.link_karir)) {
          var link = el("a", "vacancy-link", "Buka kanal karir");
          link.href = c.link_karir;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          card.appendChild(link);
        }
        rail.appendChild(card);
      });
    }

    /* ----- Dasbor ----- */
    function barRow(label, count, total, barClass) {
      var row = el("div", "bar-row");
      row.appendChild(el("span", "bar-label", label));
      var track = el("div", "bar-track");
      var fill = el("div", "bar-fill" + (barClass ? " " + barClass : ""));
      fill.style.width = (total > 0 ? (count / total * 100).toFixed(1) : 0) + "%";
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el("span", "bar-count", String(count)));
      return row;
    }

    function renderDashboard() {
      var total = DATA.length;

      var statusBox = $("dash-status");
      if (statusBox) {
        statusBox.textContent = "";
        var order = ["Ada lowongan target", "Ada lowongan target (tidak cocok)",
          "Tidak ada lowongan target", "Tidak ada lowongan terlihat",
          "Tidak dapat diverifikasi", "Portal tidak bisa dibuka"];
        var counts = countBy(DATA, "status");
        order.forEach(function (s) {
          var cls = s === "Ada lowongan target" ? "bar-ok"
            : s === "Ada lowongan target (tidak cocok)" ? "bar-warn" : "";
          statusBox.appendChild(barRow(s, counts[s] || 0, total, cls));
        });
      }

      var catBox = $("dash-categories");
      if (catBox) {
        catBox.textContent = "";
        topEntries(countBy(DATA, "kategori"), 8).forEach(function (e) {
          catBox.appendChild(barRow(e.label, e.count, total, ""));
        });
      }

      var targetBox = $("dash-targets");
      if (targetBox) {
        targetBox.textContent = "";
        var targets = DATA.filter(function (c) { return c.status === "Ada lowongan target"; });
        targets.sort(function (a, b) { return a.perusahaan.localeCompare(b.perusahaan, "id"); });
        targets.forEach(function (c) {
          var row = el("div", "target-row");
          var name = safeLink(c.link_karir) ? el("a", null, c.perusahaan) : el("span", null, c.perusahaan);
          if (safeLink(c.link_karir)) {
            name.href = c.link_karir;
            name.target = "_blank";
            name.rel = "noopener noreferrer";
          }
          row.appendChild(name);
          row.appendChild(el("span", "target-role", c.posisi || ""));
          row.appendChild(el("span", "target-loc", c.lokasi || "Tidak tercantum"));
          targetBox.appendChild(row);
        });
      }

      function fillRecheck(id, countId, status) {
        var box = $(id);
        var countEl = $(countId);
        var list = DATA.filter(function (c) { return c.status === status; });
        list.sort(function (a, b) { return a.perusahaan.localeCompare(b.perusahaan, "id"); });
        if (countEl) { countEl.textContent = "(" + list.length + ")"; }
        if (!box) { return; }
        box.textContent = "";
        list.slice(0, 10).forEach(function (c) {
          var li = el("li");
          if (safeLink(c.link_karir)) {
            var a = el("a", null, c.perusahaan);
            a.href = c.link_karir;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            li.appendChild(a);
          } else {
            li.appendChild(document.createTextNode(c.perusahaan));
          }
          box.appendChild(li);
        });
        if (list.length > 10) {
          var more = el("li", "plain-more", "dan " + (list.length - 10) + " lainnya di companies.json.");
          box.appendChild(more);
        }
      }
      fillRecheck("dash-portal", "dash-portal-count", "Portal tidak bisa dibuka");
      fillRecheck("dash-unverified", "dash-unverified-count", "Tidak dapat diverifikasi");

      var fresh = $("dash-freshness");
      if (fresh) {
        var byDate = countBy(DATA, "tanggal_cek");
        var d4 = byDate["2026-11-04"] || 0;
        var d5 = byDate["2026-11-05"] || 0;
        fresh.textContent = d4 + " perusahaan dicek 4 November 2026, " + d5 +
          " perusahaan dicek 5 November 2026. Lowongan bisa berubah setelah tanggal cek.";
      }
    }

    /* ----- Angka statistik: naik dari 0 ke angka asli ----- */
    function animateCounts() {
      var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.querySelectorAll(".count").forEach(function (node) {
        var target = parseInt(node.getAttribute("data-count"), 10);
        if (reduce || !target) { node.textContent = String(target); return; }
        var start = null;
        var duration = 800;
        function step(ts) {
          if (start === null) { start = ts; }
          var p = Math.min((ts - start) / duration, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          node.textContent = String(Math.round(target * eased));
          if (p < 1) { window.requestAnimationFrame(step); }
        }
        window.requestAnimationFrame(step);
      });
    }

    /* ----- Muat data ----- */
    function fail(message) {
      dataFailed = true;
      var count = $("result-count");
      if (count) { count.textContent = message; }
      var rail = $("vacancy-rail");
      if (rail) {
        rail.textContent = "";
        rail.appendChild(el("p", "state", message));
      }
    }

    fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) { throw new Error("HTTP " + res.status); }
        return res.json();
      })
      .then(function (data) {
        DATA = data;
        var catSelect = $("kategori");
        if (catSelect) {
          topEntries(countBy(DATA, "kategori"), 100).forEach(function (e) {
            var opt = document.createElement("option");
            opt.value = e.label;
            opt.textContent = e.label;
            catSelect.appendChild(opt);
          });
        }
        renderVacancyRail();
        renderDashboard();
        animateCounts();
        runSearch(readQuery($("search-form")));
      })
      .catch(function () {
        fail("Data perusahaan tidak bisa dimuat. Periksa koneksi lalu muat ulang halaman.");
      });

    /* ----- Form pencarian (Cari) ----- */
    var form = $("search-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        runSearch(readQuery(form));
      });
      var reset = $("reset");
      if (reset) {
        reset.addEventListener("click", function () {
          form.reset();
          runSearch(readQuery(form));
        });
      }
      var more = $("load-more");
      if (more) {
        more.addEventListener("click", function () {
          visibleCount += PAGE_SIZE;
          renderResults();
        });
      }
    }

    /* ----- Form hero (Beranda): pindah ke Cari lalu cari ----- */
    var heroForm = $("hero-form");
    if (heroForm) {
      heroForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var cari = $("search-form");
        if (cari) {
          cari.domisili.value = heroForm["hero-domisili"].value;
          cari.posisi.value = heroForm["hero-posisi"].value;
          runSearch(readQuery(cari));
        }
        if (window.location.hash !== "#/cari") {
          window.location.hash = "#/cari";
        } else {
          showView("cari", false);
        }
      });
    }

    document.querySelectorAll(".example-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var heroDom = $("hero-domisili");
        var heroPos = $("hero-posisi");
        if (heroDom) { heroDom.value = chip.getAttribute("data-domisili") || ""; }
        if (heroPos) { heroPos.value = chip.getAttribute("data-posisi") || ""; }
        if (heroForm) {
          heroForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        }
      });
    });

    showView(viewFromHash(), false);
  })();
}
