/* Mock langganan web push untuk tes E2E (P-01).
 *
 * Langganan push sungguhan butuh layanan push browser (FCM) dan
 * endpoint nyata — keduanya tidak tersedia secara andal di CI dan
 * tidak pantas dipakai dari tes (akan membuat langganan sampah).
 * Karena itu dua titik dicegat, sementara sisa alur tetap nyata:
 * - PushManager.prototype.subscribe/getSubscription diganti stub
 *   (via addInitScript, sebelum JS aplikasi jalan) yang
 *   mengembalikan langganan palsu dan mengingatnya di
 *   sessionStorage supaya tetap "aktif" sesudah navigasi.
 * - POST /api/push/subscribe dicegat dan dijawab 200 — server
 *   tidak pernah menerima langganan palsu ini.
 *
 * Izin notifikasi juga di-stub (Notification.permission dibaca
 * "granted", requestPermission menjawab "granted"): pemberian izin
 * lewat grantPermissions Playwright terbukti tidak bekerja di
 * Chromium sandbox VM ini (permission tetap "denied" meski sudah
 * di-grant eksplisit, teruji 17 Nov 2026), dan prompt izin adalah
 * chrome browser, bukan logika aplikasi. Yang diuji adalah logika
 * aplikasi saat izin diberikan, bukan prompt browsernya.
 *
 * Yang TETAP nyata dan ikut teruji: pendaftaran service worker
 * (/sw.js asli dari server), pembuatan applicationServerKey dari
 * kunci VAPID build, pengiriman token akun di header Authorization,
 * dan pembaruan status UI sesudah subscribe.
 *
 * Endpoint palsu memakai domain .invalid (RFC 2606, tidak bisa
 * dijangkau) dan kunci palsu "calsu" (base64 dari "tes"). */

export const FAKE_SUBSCRIPTION = {
  endpoint: "https://push-contoh.invalid/e2e-langganan-palsu",
  keys: { p256dh: "calsu", auth: "calsu" },
};

/* Pasang stub PushManager + intersep route subscribe. Kembalikan
 * pencatat request subscribe (dipakai tes untuk membuktikan klien
 * benar-benar memanggil endpoint dengan langganan palsu).
 * Panggil SEBELUM goto pertama. */
export async function mockPush(page, fake = FAKE_SUBSCRIPTION) {
  const calls = [];
  await page.addInitScript((sub) => {
    /* Izin notifikasi selalu "granted" (lihat kepala berkas). */
    try {
      Object.defineProperty(window.Notification, "permission", {
        value: "granted",
        configurable: true,
      });
      window.Notification.requestPermission = async () => "granted";
    } catch {
      /* Abaikan: bila stub gagal, getPushStatus membaca izin asli. */
    }
    const KEY = "karir-e2e-push-palsu";
    function makeSubscription() {
      return {
        endpoint: sub.endpoint,
        expirationTime: null,
        options: { applicationServerKey: null, userVisibleOnly: true },
        getKey: () => null,
        toJSON: () => ({ endpoint: sub.endpoint, keys: sub.keys }),
        unsubscribe: async () => {
          try {
            window.sessionStorage.removeItem(KEY);
          } catch {
            /* Abaikan: tanpa storage, langganan tetap hilang
             * dari memori di bawah. */
          }
          return true;
        },
      };
    }
    function isActive() {
      try {
        return window.sessionStorage.getItem(KEY) === "1";
      } catch {
        return false;
      }
    }
    if (typeof PushManager !== "undefined") {
      PushManager.prototype.subscribe = async () => {
        try {
          window.sessionStorage.setItem(KEY, "1");
        } catch {
          /* Abaikan: status aktif tetap benar di halaman ini. */
        }
        return makeSubscription();
      };
      PushManager.prototype.getSubscription = async () =>
        isActive() ? makeSubscription() : null;
    }
  }, fake);
  await page.route("**/api/push/subscribe", async (route) => {
    if (route.request().method() === "POST") {
      let body = null;
      try {
        body = route.request().postDataJSON();
      } catch {
        body = null;
      }
      calls.push({
        authorization: route.request().headers().authorization || "",
        body,
      });
      await route.fulfill({ status: 200, json: { ok: true } });
    } else {
      await route.continue();
    }
  });
  return { calls };
}
