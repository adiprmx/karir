/* Mock analitik untuk tes E2E (P-01, temuan Red Team R1).
 *
 * Aplikasi mengirim event pageview/search/detail/tracker ke
 * POST /api/analytics di setiap navigasi dan aksi. Melawan
 * deployment pratinjau, panggilan itu mencapai server pratinjau
 * dan MENULIS event ke koleksi analitik Firestore produksi —
 * polusi data dari tes, yang tidak dibutuhkan untuk membuktikan
 * apa pun (analitik sudah tercakup tes unit). Karena itu seluruh
 * panggilan /api/analytics dari browser dicegat dan dijawab 200
 * di sini, di semua spesifikasi E2E. Alur analitik klien sendiri
 * (pengiriman beacon/fetch + opt-out) tetap jalan sampai titik
 * panggilnya; hanya tulis servernya yang tidak terjadi. */

export async function mockAnalytics(page) {
  await page.route("**/api/analytics", async (route) => {
    await route.fulfill({ status: 200, json: { ok: true } });
  });
}
