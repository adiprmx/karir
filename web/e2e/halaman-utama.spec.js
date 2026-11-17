/* Tes E2E halaman utama Karir (P-01, pendamping alur utama).
 *
 * Setiap halaman publik utama menjawab 200 dan menampilkan judul
 * utamanya. Tes ini menangkap regresi routing/render yang tidak
 * ditangkap alur utama (mis. halaman yang 500 karena impor rusak).
 * Judul dibaca dari teks yang tampil, bukan dari data — tidak ada
 * angka perusahaan yang dikode keras di sini. */
import { expect, test } from "@playwright/test";
import { mockAnalytics } from "./helpers/analytics-mock.js";

/* Pageview tiap navigasi dicegat supaya tes tidak menulis event
 * analitik ke server (lihat helpers/analytics-mock.js). */
test.beforeEach(async ({ page }) => {
  await mockAnalytics(page);
});

/* Judul di bawah adalah teks Indonesia yang tampil di tiap halaman
 * (dari lib/i18n.js dan COPY tiap halaman, locale bawaan id). */
const PAGES = [
  { path: "/cari", heading: "Cari kanal karir" },
  { path: "/peta", heading: "Peta lowongan" },
  { path: "/dasbor", heading: "Dasbor data" },
  { path: "/mulai", heading: "Mulai" },
  { path: "/lamaran", heading: "Lamaran Saya" },
  { path: "/pengaturan", heading: "Pengaturan" },
  { path: "/faq", heading: "Pertanyaan umum" },
  { path: "/changelog", heading: "Riwayat perubahan" },
];

for (const { path, heading } of PAGES) {
  test(`halaman ${path} menjawab 200 dan menampilkan judul`, async ({
    page,
  }) => {
    /* Batas 60 detik: render server jatuh ke seed sesudah percobaan
     * Firestore gagal, yang bisa memakan 5-10 detik tiap panggilan
     * saat egress lambat. */
    const response = await page.goto(path, { timeout: 60_000 });
    expect(response.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: heading }).first(),
    ).toBeVisible({ timeout: 30_000 });
  });
}

test("/api/stats menjawab total yang konsisten dengan beranda", async ({
  page,
}) => {
  const statsRes = await page.request.get("/api/stats");
  expect(statsRes.ok()).toBeTruthy();
  const stats = await statsRes.json();
  expect(stats.total).toBeGreaterThan(0);
  await page.goto("/");
  await expect(
    page.getByText(`${stats.total} kanal karir resmi`),
  ).toBeVisible();
});
