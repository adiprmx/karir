/* Stub `web-push` untuk test lib/cron-recheck.test.js (T10,
 * wiring recheck -> sendPushDigest). Loader test
 * (lib/webpush-test-loader.mjs) memetakan impor `web-push` di
 * lib/push.js ke file ini supaya test bisa mengamati pemanggilan
 * kirim (langganan + payload JSON) tanpa jaringan dan tanpa
 * enkripsi sungguhan. setVapidDetails/sendNotification meniru
 * signature aslinya; perilaku kirim dikendalikan lewat
 * `webpushStub.mode` ("ok" = 201, "gone" = error 410).
 * Dipakai HANYA oleh test itu; tidak dipakai kode produksi. */
export const webpushStub = {
  vapidCalls: [],
  sendCalls: [],
  mode: "ok",
  reset() {
    this.vapidCalls.length = 0;
    this.sendCalls.length = 0;
    this.mode = "ok";
  },
};

export function setVapidDetails(subject, publicKey, privateKey) {
  webpushStub.vapidCalls.push({ subject, publicKey, privateKey });
}

export async function sendNotification(subscription, payload) {
  webpushStub.sendCalls.push({ subscription, payload });
  if (webpushStub.mode === "gone") {
    const err = new Error("gone");
    err.statusCode = 410;
    throw err;
  }
  return { statusCode: 201 };
}
