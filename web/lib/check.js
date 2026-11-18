/* Cek satu URL: bisa dibuka atau tidak. Dipakai panel admin dan cron
 * cek ulang harian, supaya logikanya satu tempat.
 * HEAD dulu (ringan); kalau server menolak HEAD (405/501), lanjut GET.
 * Timeout lewat AbortController, maksimal 5 redirect. Tanpa dependensi
 * baru. Kembalikan {ok, status, finalUrl}; status null bila URL tidak
 * bisa dihubungi sama sekali (timeout, DNS, koneksi putus) ATAU bila
 * penjaga SSRF menolak target sebelum fetch — kedua kasus itu TIDAK
 * BISA dibedakan dari hasil ini, dan pemanggil (cron recheck) wajib
 * memperlakukan keduanya sebagai "tidak diketahui", bukan sebagai
 * portal mati (BE2-01, P-04).
 *
 * Kredensial di URL (user:pass@host) dihapus sebelum fetch (BE2-26):
 * tidak pernah dikirim ke server dan tidak pernah muncul di finalUrl
 * yang dikembalikan. Badan respons GET fallback dibatalkan sesudah
 * status dibaca (BE2-26) supaya soket tidak tertahan.
 *
 * Modul ini juga menyusun antrean cek cron (buildCheckQueue, BE-05):
 * perusahaan yang ada lowongan didahulukan tiap run, portal mati
 * bergilir dengan sisa anggaran.
 *
 * Keputusan recheck (decideRecheckAction, P-04/K-11) juga tinggal di
 * sini sebagai fungsi murni supaya bisa diuji tanpa Firestore:
 * - portal tidak bisa dihubungi (status null) -> "tidak diketahui",
 *   status TIDAK diubah (bukti O-01: 26 dari 28 flip 16-17 Nov salah
 *   karena satu kegagalan jangkau sesaat dianggap portal mati);
 * - portal menjawab 403/diblokir -> TIDAK PERNAH di-flip (K-11):
 *   server hidup, cek otomatisnya yang diblokir;
 * - hanya 404/410 (sesudah retry 1x) dan 5xx (two-strike 2 run
 *   berturut-turut) yang boleh membalik status portal yang ada
 *   lowongannya menjadi "Portal tidak bisa dibuka".
 * Cek ini HANYA menguji portal bisa dibuka (status HTTP), BUKAN isi
 * lowongannya — portal yang memuat lowongan asinkron (mis. Gojek:
 * "0 open jobs" saat pertama, "10 open jobs" sesudah reload, O-01)
 * tidak bisa salah dinilai oleh cek ini, karena isi tidak pernah
 * dibaca. Bila suatu hari isi ikut dinilai, konten yang tidak dapat
 * ditentukan wajib diperlakukan sebagai "tidak diketahui", bukan
 * dasar flip.
 *
 * Penjaga SSRF: hanya skema http/https yang diizinkan; sebelum SETIAP
 * fetch — termasuk tiap hop redirect, di jalur HEAD maupun jalur
 * fallback GET — hostname di-resolve dan semua IP hasil resolve
 * ditolak bila masuk rentang privat/loopback/link-local/reserved
 * (lihat isBlockedIp). Hostname literal localhost juga ditolak.
 * Redirect di jalur GET dulunya memakai redirect: "follow" bawaan
 * fetch, yang tidak bisa divalidasi per hop; sekarang GET juga
 * mengikuti redirect secara manual supaya tiap hop tetap dicek.
 *
 * Keterbatasan yang jujur (TOCTOU / DNS rebinding): IP yang dicek
 * adalah hasil resolve sesaat SEBELUM fetch, sementara fetch sendiri
 * melakukan resolve lagi saat koneksi dibuka. Penyerang yang menguasai
 * DNS sebuah hostname bisa membalas IP publik saat resolve penjaga
 * lalu IP privat saat fetch (atau memakai TTL sangat pendek). Guard
 * ini menutup serangan langsung — URL privat, redirect ke alamat
 * privat, hostname yang resolve ke alamat privat — tetapi BUKAN
 * mitigasi penuh DNS rebinding. Mitigasi penuh (pin IP hasil resolve
 * ke koneksi lewat agent kustom, atau resolver internal yang
 * memvalidasi ulang jawaban DNS) di luar cakupan paket ini. */
import { lookup as dnsLookup } from "node:dns/promises";
import { daysUntil, parseBatasLamar } from "./notify.js";

const USER_AGENT = "Karir-LinkCheck/1.0";
const MAX_REDIRECTS = 5;

/* Jendela batas lamar untuk tier mendesak antrean cron: perusahaan
 * yang ada lowongannya dan batas lamarnya 0-7 hari lagi dicek
 * pertama di tiap run (BE-05). */
export const CHECK_QUEUE_DEADLINE_DAYS = 7;
export const CHECK_QUEUE_OPEN_STATUSES = ["Ada lowongan"];
export const CHECK_QUEUE_DEAD_STATUS = "Portal tidak bisa dibuka";

/* Parse IPv4 dotted-quad ketat. Kembalikan [a, b, c, d] atau null
 * bila bukan literal IPv4 yang sah. */
function parseIPv4(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  if (octets.some((n) => n > 255)) return null;
  return octets;
}

/* Parse IPv6 menjadi 8 grup 16-bit, atau null bila tidak sah.
 * Menangani kompresi "::" dan IPv4 tersemat (::ffff:127.0.0.1). */
function parseIPv6(ip) {
  if (typeof ip !== "string" || ip === "") return null;
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const parseSide = (side) => {
    if (side === "") return [];
    const labels = side.split(":");
    const groups = [];
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      if (label.includes(".")) {
        /* IPv4 tersemat hanya sah di label terakhir. */
        if (i !== labels.length - 1) return null;
        const v4 = parseIPv4(label);
        if (!v4) return null;
        groups.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(label)) return null;
        groups.push(parseInt(label, 16));
      }
    }
    return groups;
  };
  const head = parseSide(halves[0]);
  const tail = halves.length === 2 ? parseSide(halves[1]) : [];
  if (head === null || tail === null) return null;
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    return head;
  }
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...new Array(missing).fill(0), ...tail];
}

/* Benar bila IPv4 masuk rentang yang dilarang: 0.0.0.0/8,
 * 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16. */
function isBlockedIPv4([a, b]) {
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/* Benar bila IPv6 masuk rentang yang dilarang: :: (tak tentu),
 * ::1 (loopback), fc00::/7 (unique-local), fe80::/10 (link-local),
 * dan ::ffff:a.b.c.d yang alamat IPv4 tersematnya dilarang. */
function isBlockedIPv6(groups) {
  const isZero = (from, to) => groups.slice(from, to).every((g) => g === 0);
  if (isZero(0, 7) && (groups[7] === 0 || groups[7] === 1)) return true;
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  if (isZero(0, 5) && groups[5] === 0xffff) {
    const v4 = [
      (groups[6] >> 8) & 0xff,
      groups[6] & 0xff,
      (groups[7] >> 8) & 0xff,
      groups[7] & 0xff,
    ];
    return isBlockedIPv4(v4);
  }
  return false;
}

/* Cek satu literal IP. Kembalikan true bila dilarang, false bila IP
 * publik yang sah, null bila input bukan literal IP sama sekali.
 * Diekspor supaya test unit bisa menguji tiap rentang langsung. */
export function isBlockedIp(ip) {
  if (typeof ip !== "string") return null;
  const v4 = parseIPv4(ip);
  if (v4) return isBlockedIPv4(v4);
  const v6 = parseIPv6(ip);
  if (v6) return isBlockedIPv6(v6);
  return null;
}

/* Resolve dengan batas waktu sisa. Melempar bila waktu habis, supaya
 * pemanggil gagal tertutup (fail-closed) seperti kegagalan DNS lain. */
async function lookupWithTimeout(lookupImpl, hostname, deadlineMs) {
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) throw new Error("batas waktu resolve habis");
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("batas waktu resolve habis")),
      remaining,
    );
  });
  try {
    return await Promise.race([lookupImpl(hostname, { all: true }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/* Benar bila target boleh diambil: skema http/https, hostname bukan
 * localhost, dan — untuk literal IP maupun hasil resolve hostname —
 * TIDAK ADA satu pun alamat yang masuk rentang terlarang. Kegagalan
 * apa pun (URL tidak sah, DNS gagal, waktu habis) berarti tidak
 * boleh: gagal tertutup.
 *
 * Catatan: hostname diambil dari URL yang sudah diparse WHATWG, jadi
 * bentuk IPv4 alternatif (desimal, oktal, heksa) sudah dinormalisasi
 * menjadi dotted-quad oleh parser sebelum sampai ke sini. */
async function isTargetAllowed(target, lookupImpl, deadlineMs) {
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  let host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  const literal = isBlockedIp(host);
  if (literal !== null) return !literal;
  let addresses;
  try {
    addresses = await lookupWithTimeout(lookupImpl, host, deadlineMs);
  } catch {
    return false;
  }
  if (!Array.isArray(addresses) || addresses.length === 0) return false;
  for (const entry of addresses) {
    const address = typeof entry === "string" ? entry : entry?.address;
    /* Satu saja alamat terlarang (atau tak terbaca) cukup menolak. */
    if (isBlockedIp(address) !== false) return false;
  }
  return true;
}

/* Hapus kredensial dari URL (BE2-26): userinfo (user:pass@) tidak
 * pernah dikirim ke server dan tidak pernah muncul di finalUrl.
 * Tanpa kredensial, URL dikembalikan apa adanya supaya normalisasi
 * (mis. penambahan garis miring akhir) tidak mengubah perilaku lama.
 * URL yang tidak bisa di-parse dikembalikan apa adanya — penjaga
 * SSRF akan menolaknya (fail-closed). */
function stripCredentials(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  if (!parsed.username && !parsed.password) return raw;
  parsed.username = "";
  parsed.password = "";
  return parsed.toString();
}

/* Batalkan badan respons yang tidak dibaca isinya (BE2-26):
 * respons GET fallback hanya dipakai statusnya, jadi badannya
 * dibatalkan supaya soket tidak tertahan menunggu konsumsi.
 * Best-effort total: mock respons tanpa body dan pembatalan yang
 * gagal tidak boleh mengganggu hasil cek. */
function cancelBody(res) {
  try {
    const done = res?.body?.cancel?.();
    if (done && typeof done.catch === "function") done.catch(() => {});
  } catch {
    /* Abaikan: pembatalan badan tidak pernah memengaruhi hasil. */
  }
}

export async function checkUrl(url, options = {}) {
  const timeoutMs =
    typeof options.timeoutMs === "number" ? options.timeoutMs : 8000;
  const fetchImpl = options.fetchImpl || fetch;
  const lookupImpl = options.lookupImpl || dnsLookup;
  const deadline = Date.now() + timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  /* finalUrl selalu versi tanpa kredensial (BE2-26). */
  const cleanUrl = stripCredentials(url);
  const fail = { ok: false, status: null, finalUrl: cleanUrl };
  const headers = { "User-Agent": USER_AGENT };
  try {
    let current = cleanUrl;
    if (!(await isTargetAllowed(current, lookupImpl, deadline))) {
      return fail;
    }
    let res = await fetchImpl(current, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal,
      headers,
    });
    let hops = 0;
    while (
      res.status >= 300 &&
      res.status < 400 &&
      res.headers.get("location") &&
      hops < MAX_REDIRECTS
    ) {
      const next = stripCredentials(
        new URL(res.headers.get("location"), current).toString(),
      );
      if (!(await isTargetAllowed(next, lookupImpl, deadline))) {
        return fail;
      }
      current = next;
      res = await fetchImpl(current, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
        headers,
      });
      hops++;
    }
    if (res.status === 405 || res.status === 501) {
      /* Fallback GET memakai redirect manual juga, supaya tiap hop
       * tetap melewati penjaga SSRF. GET dimulai dari URL yang
       * menolak HEAD (bukan URL awal) agar tidak mengulang hop
       * redirect yang sudah dilewati HEAD. Badan tiap respons GET
       * dibatalkan sesudah status dibaca (BE2-26): isinya tidak
       * pernah dipakai, hanya statusnya. */
      res = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers,
      });
      let getHops = 0;
      while (
        res.status >= 300 &&
        res.status < 400 &&
        res.headers.get("location") &&
        getHops < MAX_REDIRECTS
      ) {
        cancelBody(res);
        const next = stripCredentials(
          new URL(res.headers.get("location"), current).toString(),
        );
        if (!(await isTargetAllowed(next, lookupImpl, deadline))) {
          return fail;
        }
        current = next;
        res = await fetchImpl(current, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers,
        });
        getHops++;
      }
      cancelBody(res);
    }
    return {
      ok: res.status < 400,
      status: res.status,
      finalUrl: current,
    };
  } catch {
    return fail;
  } finally {
    clearTimeout(timer);
  }
}

/* Cek satu URL dengan retry 1x bila hasil pertama gagal (P-04,
 * kriteria 2): kegagalan sesaat (timeout, DNS, koneksi putus,
 * respons error sekali) tidak boleh langsung menjadi dasar
 * keputusan. Keputusan pemanggil memakai hasil AKHIR: bila retry
 * berhasil, portal dianggap hidup; bila retry gagal juga (atau
 * gagal jangkau sesudah respons error pertama), hasil retry-lah
 * yang menentukan. Retry memanggil checkUrl yang sama, jadi tiap
 * percobaan tetap melewati penjaga SSRF penuh — retry tidak
 * memperlebar permukaan SSRF. Kembalikan {result, retried}. */
export async function checkUrlWithRetry(url, options = {}) {
  const first = await checkUrl(url, options);
  if (first.ok) return { result: first, retried: false };
  const second = await checkUrl(url, options);
  return { result: second, retried: true };
}

/* Status "Tidak dapat diverifikasi": tujuan flip saat portal yang
 * tadinya mati kini hidup kembali (lowongannya belum dicek ulang
 * manusia, jadi tidak boleh langsung kembali jadi ada lowongan). */
export const CHECK_QUEUE_UNVERIFIED_STATUS = "Tidak dapat diverifikasi";

/* Tentukan tindakan recheck dari status lama perusahaan dan hasil
 * cek AKHIR (sesudah retry, lihat checkUrlWithRetry). Fungsi murni
 * supaya tiap cabang bisa diuji tanpa Firestore (P-04/K-11).
 *
 * Kembalikan { outcome, newStatus }:
 * - outcome "alive": portal hidup (ok). newStatus =
 *   "Tidak dapat diverifikasi" bila status lama portal mati,
 *   selain itu null (status tetap, tanggal cek diperbarui).
 * - outcome "unreachable": status null — portal tidak bisa
 *   dihubungi ATAU penjaga SSRF menolak target; keduanya "tidak
 *   diketahui". newStatus null: status TIDAK diubah, tanggal cek
 *   TIDAK diperbarui, pencacah gagal_cek perusahaan naik 1.
 * - outcome "blocked": server menjawab tetapi menolak cek
 *   otomatis (403 dan 4xx lain di luar 404/410, mis. 401/429).
 *   Server HIDUP — status TIDAK PERNAH diubah (K-11). newStatus
 *   null; tanggal cek diperbarui (ceknya selesai, hasilnya
 *   "diblokir") dan portal masuk antrean tinjau manual.
 * - outcome "dead": 404/410 sesudah retry — tautan benar-benar
 *   tidak ada. newStatus = "Portal tidak bisa dibuka" bila status
 *   lama ada lowongan, selain itu null (sudah mati, tetap mati).
 * - outcome "server-error": 5xx sesudah retry. newStatus =
 *   "Portal tidak bisa dibuka" HANYA bila portal yang sama juga
 *   5xx di run kemarin (struckYesterday — two-strike 2 run, K-11)
 *   dan status lama ada lowongan; selain itu null (strike pertama
 *   dicatat, portal tidak di-flip).
 *
 * Cabang default gagal tertutup: respons error yang tidak masuk
 * kategori di atas diperlakukan sebagai "blocked" (server merespons,
 * jangan flip), bukan sebagai portal mati. */
export function decideRecheckAction(oldStatus, result, options = {}) {
  const openStatuses =
    options.openStatuses || CHECK_QUEUE_OPEN_STATUSES;
  const deadStatus = options.deadStatus || CHECK_QUEUE_DEAD_STATUS;
  const unverifiedStatus =
    options.unverifiedStatus || CHECK_QUEUE_UNVERIFIED_STATUS;
  const struckYesterday = options.struckYesterday === true;
  const isOpen = openStatuses.includes(oldStatus);

  if (result && result.ok) {
    return {
      outcome: "alive",
      newStatus: oldStatus === deadStatus ? unverifiedStatus : null,
    };
  }
  const status = result ? result.status : null;
  if (status === null || status === undefined) {
    return { outcome: "unreachable", newStatus: null };
  }
  if (status === 404 || status === 410) {
    return {
      outcome: "dead",
      newStatus: isOpen ? deadStatus : null,
    };
  }
  if (status >= 500 && status < 600) {
    return {
      outcome: "server-error",
      newStatus: struckYesterday && isOpen ? deadStatus : null,
    };
  }
  /* 403 dan 4xx lain (401, 429, ...) + apa pun yang tidak dikenal:
   * server merespons, jadi portal tidak mati — jangan flip. */
  return { outcome: "blocked", newStatus: null };
}

/* Susun antrean cek cron (BE-05). Antrean jauh lebih besar daripada
 * yang bisa dicek dalam anggaran 50 detik (293 URL pada 15 Nov 2026:
 * 238 yang ada lowongan + 55 portal mati), jadi urutan menentukan
 * mana yang sempat dicek dan mana yang menunggu besok.
 *
 * Tiga tier, berurutan:
 * 1. "urgent" — ada lowongan + batas_lamar 0-7 hari lagi. Portal
 *    perusahaan ini paling penting dicek tiap run karena owner
 *    mungkin melamar sebelum batasnya. Diurutkan batas terdekat
 *    dulu, lalu yang paling lama tidak dicek.
 * 2. "open" — ada lowongan lainnya. Diurutkan dari yang paling lama
 *    tidak dicek (tanggal_cek tertua dulu; tanpa tanggal_cek
 *    paling dulu), supaya cek harian berputar ke seluruh daftar:
 *    yang baru dicek (tanggal_cek diperbarui tiap run) otomatis
 *    pindah ke belakang.
 * 3. "dead" — portal mati, dicek untuk mendeteksi pulih. Hanya
 *    terjangkau bila anggaran tersisa sesudah tier 1-2; urutan
 *    yang sama (tanggal_cek tertua dulu) membuatnya bergilir antar
 *    run, bukan selalu yang itu-itu saja.
 *
 * Perusahaan tanpa tautan karir tidak masuk antrean (tidak ada URL
 * yang bisa dicek) dan status lain (tidak ada lowongan, tidak dapat
 * diverifikasi) tidak dicek ulang oleh cron. Kembalikan
 * {queue, counts}: queue berisi {company, tier} sesuai urutan cek,
 * counts berisi jumlah per tier + total untuk ringkasan cron dan
 * dokumen heartbeat. Murni fungsi tanpa efek samping; todayIso
 * adalah tanggal WIB "YYYY-MM-DD" dari pemanggil. */
export function buildCheckQueue(companies, options = {}) {
  const todayIso = options.todayIso;
  const openStatuses =
    options.openStatuses || CHECK_QUEUE_OPEN_STATUSES;
  const deadStatus = options.deadStatus || CHECK_QUEUE_DEAD_STATUS;
  const deadlineDays =
    typeof options.deadlineDays === "number"
      ? options.deadlineDays
      : CHECK_QUEUE_DEADLINE_DAYS;
  /* Tanggal cek tertua dulu; tanpa tanggal_cek paling dulu; seri
   * diputus nomor naik supaya urutan deterministik. */
  const byOldestCheck = (a, b) =>
    (a.tanggal_cek || "").localeCompare(b.tanggal_cek || "") ||
    Number(a.no) - Number(b.no);
  const urgent = [];
  const open = [];
  const dead = [];
  for (const c of companies || []) {
    if (!c || !c.link_karir) continue;
    if (openStatuses.includes(c.status)) {
      const batas = parseBatasLamar(c.batas_lamar);
      const days = batas ? daysUntil(batas, todayIso) : null;
      if (days !== null && days >= 0 && days <= deadlineDays) {
        urgent.push({ company: c, batas });
      } else {
        open.push(c);
      }
    } else if (c.status === deadStatus) {
      dead.push(c);
    }
  }
  urgent.sort(
    (a, b) =>
      a.batas.localeCompare(b.batas) || byOldestCheck(a.company, b.company),
  );
  open.sort(byOldestCheck);
  dead.sort(byOldestCheck);
  const queue = [
    ...urgent.map(({ company }) => ({ company, tier: "urgent" })),
    ...open.map((company) => ({ company, tier: "open" })),
    ...dead.map((company) => ({ company, tier: "dead" })),
  ];
  return {
    queue,
    counts: {
      urgent: urgent.length,
      open: open.length,
      dead: dead.length,
      total: queue.length,
    },
  };
}
