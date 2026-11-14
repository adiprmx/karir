/* Helper klien untuk analitik pengunjung anonim.
 * ID pengunjung dibuat acak sekali di localStorage (kunci karir-visitor).
 * Tanpa fingerprinting: tanpa canvas, tanpa user-agent mentah, tanpa
 * sidik perangkat. Pengiriman tidak pernah memblokir dan tidak pernah
 * melempar: semua kegagalan ditelan diam-diam.
 *
 * Pengguna yang masuk boleh menyertakan UID akunnya di event
 * (setAnalyticsUid), supaya admin bisa membedakan akun yang masuk
 * dari tamu. UID adalah pengenal acak dari Firebase, bukan email:
 * email tidak pernah masuk ke event apa pun. Tamu tidak punya UID.
 *
 * SEC-07: UID dari body TIDAK dipercaya server (siapa pun bisa
 * menempel UID orang lain). Supaya UID tetap tercatat, event dari
 * pengguna yang masuk membawa ID token Firebase di body (field
 * idToken) — lewat body, bukan header, karena sendBeacon tidak bisa
 * memasang header kustom. Server memverifikasi token itu lalu
 * memakai UID-nya; token sendiri tidak pernah disimpan. Token
 * diambil malas (lazy) dari Firebase saat event dikirim, disimpan
 * di memori saja, dan disegarkan bila sudah lebih dari 50 menit
 * (token Firebase berlaku 1 jam). */

const STORAGE_KEY = "karir-visitor";
/* Segarkan token bila usianya melewati ini (di bawah masa berlaku
 * token Firebase, 1 jam, supaya tidak pernah mengirim token mati). */
const TOKEN_FRESH_MS = 50 * 60 * 1000;
/* Jeda minimum antar percobaan ambil token, supaya event yang
 * beruntun saat belum masuk tidak memanggil Firebase berkali-kali. */
const TOKEN_RETRY_MS = 30 * 1000;

let analyticsUid = null;
let analyticsIdToken = null;
let tokenFetchedAt = 0;
let lastRefreshAttempt = 0;

/* Simpan ID token Firebase untuk ditempel di event berikut.
 * Dipakai bila ada pemanggil yang sudah memegang token (mis. panel
 * akun); jalur biasa adalah ambil malas di maybeRefreshIdToken. */
export function setAnalyticsIdToken(token) {
  analyticsIdToken =
    typeof token === "string" && token ? token : null;
  tokenFetchedAt = analyticsIdToken ? Date.now() : 0;
}

/* Hapus token tersimpan (mis. saat keluar), supaya event sesudahnya
 * kembali tanpa UID. */
export function clearAnalyticsIdToken() {
  analyticsIdToken = null;
  tokenFetchedAt = 0;
}

/* Ambil ID token pengguna yang sedang masuk, di latar belakang.
 * Gagal apa pun (belum masuk, Firebase belum termuat, offline)
 * berarti event berikutnya tetap dikirim tanpa token — analitik
 * tidak boleh merusak halaman. */
async function refreshIdToken() {
  try {
    const { auth } = await import("@/lib/firebase");
    const user = auth && auth.currentUser;
    if (!user) {
      analyticsIdToken = null;
      return;
    }
    const token = await user.getIdToken();
    if (typeof token === "string" && token) {
      analyticsIdToken = token;
      tokenFetchedAt = Date.now();
    }
  } catch {
    /* Abaikan: event tetap terkirim tanpa UID. */
  }
}

/* Mulai penyegaran token bila perlu, tanpa menunggu (fire-and-
 * forget): event saat ini memakai token yang sudah tersimpan, bila
 * ada; event berikutnya memakai token hasil segaran. */
function maybeRefreshIdToken() {
  const now = Date.now();
  if (now - lastRefreshAttempt < TOKEN_RETRY_MS) return;
  if (analyticsIdToken && now - tokenFetchedAt < TOKEN_FRESH_MS) return;
  lastRefreshAttempt = now;
  refreshIdToken();
}

/* Simpan UID akun yang sedang masuk untuk ditempel di event berikut.
 * Dipanggil komponen akun saat status berubah. UID di luar string
 * atau yang kosong diabaikan. */
export function setAnalyticsUid(uid) {
  analyticsUid =
    typeof uid === "string" && uid ? uid.slice(0, 128) : null;
}

/* Hapus UID saat keluar, supaya event sesudahnya kembali tanpa UID.
 * Token ikut dihapus supaya tidak ada token basi yang terkirim. */
export function clearAnalyticsUid() {
  analyticsUid = null;
  clearAnalyticsIdToken();
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
 * pageview, search, detail, portal_click, tracker_mark, filter,
 * onboarding, report, channel_copy.
 * path diisi lokasi halaman saat ini bila tidak disebut. uid hanya ada
 * bila ada pengguna yang masuk; email tidak pernah dikirim. Bila
 * pengguna masuk, ID token Firebase ikut di body (field idToken)
 * supaya server bisa memverifikasi UID-nya; token tidak disimpan. */
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
      ...(analyticsIdToken ? { idToken: analyticsIdToken } : {}),
    };
    /* Segarkan token di latar belakang untuk event berikutnya;
     * event ini tidak menunggu. */
    maybeRefreshIdToken();
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
