/* Cek satu URL: bisa dibuka atau tidak. Dipakai panel admin dan cron
 * cek ulang harian, supaya logikanya satu tempat.
 * HEAD dulu (ringan); kalau server menolak HEAD (405/501), lanjut GET.
 * Timeout lewat AbortController, maksimal 5 redirect. Tanpa dependensi
 * baru. Kembalikan {ok, status, finalUrl}; status null bila URL tidak
 * bisa dihubungi sama sekali (timeout, DNS, koneksi putus). */

const USER_AGENT = "Karir-LinkCheck/1.0";

export async function checkUrl(url, options = {}) {
  const timeoutMs =
    typeof options.timeoutMs === "number" ? options.timeoutMs : 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    let hops = 0;
    while (
      res.status >= 300 &&
      res.status < 400 &&
      res.headers.get("location") &&
      hops < 5
    ) {
      const next = new URL(res.headers.get("location"), url).toString();
      res = await fetch(next, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT },
      });
      hops++;
    }
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT },
      });
    }
    return {
      ok: res.status < 400,
      status: res.status,
      finalUrl: res.url || url,
    };
  } catch {
    return { ok: false, status: null, finalUrl: url };
  } finally {
    clearTimeout(timer);
  }
}
