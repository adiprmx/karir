/* Stub Firebase untuk test app/push-client.test.js (T10).
 * push-client.js mengimpor `@/lib/firebase` secara malas di dalam
 * subscribePush()/unsubscribePush(); loader test
 * (lib/push-client-test-loader.mjs) memetakan impor itu ke file
 * ini supaya test bisa mengendalikan pengguna yang masuk dan
 * perilaku getIdToken() tanpa SDK Firebase asli.
 *
 * Test mengatur `auth.currentUser` langsung (null = belum masuk;
 * objek dengan getIdToken() = masuk). Modul yang sama dipakai
 * push-client.js dan test, jadi mutasi terlihat di kedua sisi.
 * Dipakai HANYA oleh test; tidak dipakai kode produksi. */
export const auth = {
  currentUser: null,
};
