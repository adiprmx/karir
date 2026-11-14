/* Cek satu URL: bisa dibuka atau tidak. Dipakai panel admin dan cron
 * cek ulang harian, supaya logikanya satu tempat.
 * HEAD dulu (ringan); kalau server menolak HEAD (405/501), lanjut GET.
 * Timeout lewat AbortController, maksimal 5 redirect. Tanpa dependensi
 * baru. Kembalikan {ok, status, finalUrl}; status null bila URL tidak
 * bisa dihubungi sama sekali (timeout, DNS, koneksi putus).
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

const USER_AGENT = "Karir-LinkCheck/1.0";
const MAX_REDIRECTS = 5;

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

export async function checkUrl(url, options = {}) {
  const timeoutMs =
    typeof options.timeoutMs === "number" ? options.timeoutMs : 8000;
  const fetchImpl = options.fetchImpl || fetch;
  const lookupImpl = options.lookupImpl || dnsLookup;
  const deadline = Date.now() + timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fail = { ok: false, status: null, finalUrl: url };
  const headers = { "User-Agent": USER_AGENT };
  try {
    let current = url;
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
      const next = new URL(res.headers.get("location"), current).toString();
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
       * redirect yang sudah dilewati HEAD. */
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
        const next = new URL(res.headers.get("location"), current).toString();
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
