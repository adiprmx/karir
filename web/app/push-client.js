/* Helper klien notifikasi web push (T10), mengikuti pola
 * app/tracker.js dan app/analytics-track.js: helper klien murni,
 * Firebase diimpor malas di dalam fungsi.
 *
 * Aturan yang dijaga di sini:
 * - Izin notifikasi HANYA diminta dari ketukan pengguna (tombol
 *   "Aktifkan notifikasi" di /pengaturan). Tidak ada auto-prompt
 *   dalam bentuk apa pun: tidak ada banner, modal, atau ajakan
 *   di halaman lain.
 * - Service worker hanya didaftarkan saat pengguna menekan tombol
 *   itu, bukan saat halaman dimuat.
 * - Langganan terikat akun: subscribe mengirim ID token pengguna
 *   yang masuk; tamu tidak bisa berlangganan.
 * - Semua fetch memakai timeout 15 detik (semua fetch klien
 *   wajib timeout — pelajaran AyoQris).
 *
 * Kode hasil subscribe/unsubscribe (pola kode error tracker-sync,
 * supaya UI bisa menjelaskan tanpa istilah teknis):
 * ok | ditolak | tidak-didukung | belum-masuk | offline | sibuk
 * | gagal. */

const FETCH_TIMEOUT_MS = 15_000;

/* Kunci publik VAPID dari env build (bukan rahasia: kunci ini
 * memang dibagikan ke browser). */
function vapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
}

/* Ubah string base64url menjadi Uint8Array untuk
 * applicationServerKey di pushManager.subscribe. */
export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/* true bila browser ini mendukung web push sepenuhnya. */
export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/* Status langganan di browser ini:
 * - "unsupported": browser tidak mendukung push.
 * - "denied": izin notifikasi ditolak di browser (prompt ulang
 *   tidak diizinkan browser).
 * - "active": izin diberikan dan ada langganan push aktif.
 * - "inactive": selain itu (izin belum diputuskan, atau izin
 *   diberikan tapi belum berlangganan).
 * Hanya MEMBACA registrasi yang sudah ada; tidak mendaftarkan
 * service worker (registrasi hanya saat pengguna menekan tombol). */
export async function getPushStatus() {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "inactive";
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return "inactive";
    const subscription = await registration.pushManager.getSubscription();
    return subscription ? "active" : "inactive";
  } catch {
    return "inactive";
  }
}

async function fetchJsonWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, ok: res.ok, body };
  } finally {
    clearTimeout(timer);
  }
}

/* Daftarkan service worker, minta izin notifikasi, buat
 * langganan push, dan simpan ke server. HANYA dipanggil dari
 * handler klik tombol "Aktifkan notifikasi" — pemanggilan
 * Notification.requestPermission() di luar ketukan pengguna
 * tidak diizinkan browser dan melanggar aturan T10. */
export async function subscribePush() {
  if (!isPushSupported()) return { ok: false, code: "tidak-didukung" };
  const publicKey = vapidPublicKey();
  if (!publicKey) return { ok: false, code: "gagal" };
  let registration;
  try {
    registration = await navigator.serviceWorker.register("/sw.js");
  } catch {
    return { ok: false, code: "gagal" };
  }
  let permission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return { ok: false, code: "gagal" };
  }
  if (permission !== "granted") {
    return { ok: false, code: "ditolak" };
  }
  let subscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  } catch {
    return { ok: false, code: "gagal" };
  }
  /* Ambil ID token pengguna yang masuk (impor malas Firebase,
   * pola yang sama dengan halaman Pengaturan). */
  let idToken;
  try {
    const { auth } = await import("@/lib/firebase");
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) {
      /* Langganan browser sudah dibuat tapi tidak bisa disimpan
       * tanpa akun: batalkan lagi supaya tidak ada langganan
       * menggantung yang tidak terikat akun. */
      try {
        await subscription.unsubscribe();
      } catch {
        /* Abaikan: langganan tanpa dokumen server tidak akan
         * pernah dikirimi digest. */
      }
      return { ok: false, code: "belum-masuk" };
    }
    idToken = await user.getIdToken();
  } catch {
    /* Token gagal didapat sesudah langganan browser dibuat:
     * batalkan langganan itu (rollback yang sama dengan cabang
     * gagal lain) supaya status tidak bohong "aktif" padahal
     * server tidak punya catatannya. */
    try {
      await subscription.unsubscribe();
    } catch {
      /* Abaikan: langganan tanpa dokumen server tidak akan pernah
       * dikirimi digest. */
    }
    return { ok: false, code: "gagal" };
  }
  let result;
  try {
    result = await fetchJsonWithTimeout("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent,
      }),
    });
  } catch (err) {
    /* Jaringan gagal: batalkan langganan browser (alasan yang sama
     * dengan di bawah — status tidak boleh bohong). */
    try {
      await subscription.unsubscribe();
    } catch {
      /* Abaikan. */
    }
    if (err && err.name === "AbortError") return { ok: false, code: "gagal" };
    return { ok: false, code: "offline" };
  }
  if (result.ok) return { ok: true, code: "ok" };
  /* Server menolak / gagal menyimpan: batalkan langganan browser
   * supaya status tidak bohong ("aktif" padahal server tidak punya
   * catatannya). Pengguna bisa menekan tombol lagi untuk mencoba. */
  try {
    await subscription.unsubscribe();
  } catch {
    /* Abaikan: langganan tanpa dokumen server tidak akan pernah
     * dikirimi digest. */
  }
  if (result.status === 429) return { ok: false, code: "sibuk" };
  if (result.status === 401) return { ok: false, code: "belum-masuk" };
  return { ok: false, code: "gagal" };
}

/* Berhenti berlangganan: batalkan langganan di browser, lalu
 * hapus dokumennya di server. Kegagalan hapus server tidak
 * menggagalkan unsubscribe lokal — langganan yang tertinggal di
 * server akan terhapus sendiri saat kirim mendapat 410. */
export async function unsubscribePush() {
  if (!isPushSupported()) return { ok: false, code: "tidak-didukung" };
  let subscription = null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      subscription = await registration.pushManager.getSubscription();
    }
  } catch {
    subscription = null;
  }
  if (!subscription) return { ok: true, code: "ok" };
  const endpoint = subscription.endpoint;
  try {
    await subscription.unsubscribe();
  } catch {
    return { ok: false, code: "gagal" };
  }
  /* Hapus di server (best-effort): butuh ID token; bila tidak
   * ada akun yang masuk, lewati — dokumen server akan terhapus
   * sendiri saat kirim mendapat 410. */
  try {
    const { auth } = await import("@/lib/firebase");
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) return { ok: true, code: "ok" };
    const idToken = await user.getIdToken();
    await fetchJsonWithTimeout("/api/push/subscribe", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    /* Abaikan: unsubscribe lokal sudah berhasil. */
  }
  return { ok: true, code: "ok" };
}
