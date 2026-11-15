/* Service worker Karir (T10): hanya notifikasi web push.
 * Tanpa fetch handler dan tanpa caching — push saja.
 * Didaftarkan hanya saat pengguna menekan tombol "Aktifkan
 * notifikasi" di /pengaturan (app/push-client.js), bukan saat
 * halaman dimuat. Header Cache-Control max-age=0 dipasang di
 * next.config.mjs supaya perbaikan file ini tidak tertahan cache.
 *
 * Kontrak payload dengan server (lib/push.js formatPushPayload):
 * judul dan badan di level atas; url, date, dan tag BERTINGKAT di
 * dalam `data` — `{title, body, data: {url, date, tag}}`. Tag per
 * hari membuat notifikasi hari yang sama saling mengganti, hari
 * berbeda menumpuk. Field level atas dibaca sebagai cadangan
 * supaya payload lama yang meratakan field tetap tampil benar.
 * Kontrak ini dikunci test lib/sw-push.test.js (payload asli dari
 * formatPushPayload dijalankan terhadap file ini). */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  if (!data || typeof data !== "object") data = {};
  const inner = data.data && typeof data.data === "object" ? data.data : {};
  const title = data.title || "Lowongan baru di Karir";
  const options = {
    body: data.body || "Ada lowongan baru hari ini. Ketuk untuk melihat.",
    icon: "/icon-192.png",
    badge: "/icon.svg",
    tag: inner.tag || data.tag || "karir-digest",
    data: {
      url: inner.url || data.url || "/",
      date: inner.date || data.date || "",
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* URL klik yang aman: hanya same-origin. Path relatif ("/...")
 * di-resolve ke origin service worker; URL lintas origin, skema
 * lain, atau tidak valid diganti "/" — payload tidak pernah boleh
 * membuka situs lain. Balasan selalu bentuk path ("/pengaturan"),
 * bukan URL absolut. */
function safeNotificationUrl(rawUrl) {
  try {
    const target = new URL(rawUrl || "/", self.location.origin);
    if (target.origin !== self.location.origin) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeNotificationUrl(
    event.notification.data && event.notification.data.url,
  );
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (
            new URL(client.url).pathname ===
            new URL(url, self.location.origin).pathname
          ) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
        return undefined;
      }),
  );
});
