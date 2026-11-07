/* Helper klien untuk analitik pengunjung anonim.
 * ID pengunjung dibuat acak sekali di localStorage (kunci karir-visitor).
 * Tanpa fingerprinting: tanpa canvas, tanpa user-agent mentah, tanpa
 * sidik perangkat. Pengiriman tidak pernah memblokir dan tidak pernah
 * melempar: semua kegagalan ditelan diam-diam.
 *
 * Pengguna yang masuk boleh menyertakan UID akunnya di event
 * (setAnalyticsUid), supaya admin bisa membedakan akun yang masuk
 * dari tamu. UID adalah pengenal acak dari Firebase, bukan email:
 * email tidak pernah masuk ke event apa pun. Tamu tidak punya UID. */

const STORAGE_KEY = "karir-visitor";

let analyticsUid = null;

/* Simpan UID akun yang sedang masuk untuk ditempel di event berikut.
 * Dipanggil komponen akun saat status berubah. UID di luar string
 * atau yang kosong diabaikan. */
export function setAnalyticsUid(uid) {
  analyticsUid =
    typeof uid === "string" && uid ? uid.slice(0, 128) : null;
}

/* Hapus UID saat keluar, supaya event sesudahnya kembali tanpa UID. */
export function clearAnalyticsUid() {
  analyticsUid = null;
}

function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getVisitorId() {
  try {
    if (typeof localStorage === "undefined") return null;
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/* Kirim satu event ke /api/analytics. Bentuk event:
 * { type, path, q?, companyNo?, action?, uid? } dengan type salah satu dari
 * pageview, search, detail, portal_click, tracker_mark, filter.
 * path diisi lokasi halaman saat ini bila tidak disebut. uid hanya ada
 * bila ada pengguna yang masuk; email tidak pernah dikirim. */
export function trackEvent(event) {
  try {
    if (!event || typeof event.type !== "string") return;
    const payload = {
      ...event,
      path:
        event.path ||
        (typeof location !== "undefined" ? location.pathname : "/"),
      visitor: getVisitorId() || undefined,
      ...(analyticsUid ? { uid: analyticsUid } : {}),
    };
    const body = JSON.stringify(payload);
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/analytics", blob)) return;
    }
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* Analitik tidak boleh merusak halaman. */
  }
}
