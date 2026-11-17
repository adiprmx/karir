/* Tes E2E alur utama Karir (P-01, kriteria 1).
 *
 * Satu perjalanan pengguna penuh, dari beranda sampai ekspor data:
 * beranda -> cari perusahaan -> buka detail -> daftar (mock Auth)
 * -> tambah pelacak -> aktifkan push (mock) -> ekspor data.
 *
 * Perusahaan target TIDAK dikode keras: tes membaca kartu pertama
 * dari daftar target di beranda, lalu memakai nama perusahaan itu
 * sebagai kata kunci pencarian. Dengan begitu tes ikut saat data
 * berubah lewat hunting harian, dan berlaku sama di server lokal
 * (seed) maupun deployment pratinjau (data live).
 *
 * Mock yang dipakai (lihat e2e/helpers/): Firebase Auth, Firestore
 * klien (503 cepat), analitik (dicegat supaya tes tidak menulis
 * event ke server), dan langganan push. Tidak ada satu pun mock
 * yang menulis ke produksi: pendaftaran, langganan, dan analitik
 * dicegat di browser, pelacak hanya tersimpan di localStorage
 * konteks tes yang dibuang sesudah tes selesai. */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  TEST_USER,
  mockFirebaseAuth,
  mockFirestoreOffline,
} from "./helpers/firebase-auth-mock.js";
import { FAKE_SUBSCRIPTION, mockPush } from "./helpers/push-mock.js";
import { mockAnalytics } from "./helpers/analytics-mock.js";

/* Batas total 5 menit: tiap render server jatuh ke seed sesudah
 * percobaan Firestore gagal, dan tiap percobaan bisa memakan
 * 5-10 detik saat egress lambat (lib/companies.js). Di CI yang
 * egress-nya sehat, perjalanan ini selesai jauh di bawah batas. */
test.setTimeout(300_000);

test("alur utama: cari, daftar, lacak, push, ekspor", async ({ page }) => {
  /* Mock dipasang sebelum navigasi pertama. */
  await mockFirebaseAuth(page);
  await mockFirestoreOffline(page);
  await mockAnalytics(page);
  const push = await mockPush(page);

  let targetNo = 0;
  let targetName = "";

  await test.step("beranda menampilkan total dari API", async () => {
    const statsRes = await page.request.get("/api/stats");
    expect(statsRes.ok()).toBeTruthy();
    const stats = await statsRes.json();
    expect(typeof stats.total).toBe("number");
    expect(stats.total).toBeGreaterThan(0);

    await page.goto("/", { timeout: 60_000 });
    await expect(
      page.getByRole("heading", {
        name: "Lowongan yang dicek, bukan yang dicopas.",
      }),
    ).toBeVisible({ timeout: 30_000 });
    /* Lede beranda memakai total yang sama dengan /api/stats. */
    await expect(
      page.getByText(`${stats.total} kanal karir resmi`),
    ).toBeVisible();

    /* Perusahaan target: kartu pertama daftar target. */
    const firstCard = page
      .locator("section:has(#target-h) article.co")
      .first();
    await expect(firstCard).toBeVisible();
    targetNo = Number(await firstCard.getAttribute("data-no"));
    targetName = (await firstCard.locator("h3.co-name").innerText()).trim();
    expect(targetNo).toBeGreaterThan(0);
    expect(targetName.length).toBeGreaterThan(0);
  });

  await test.step("cari perusahaan lalu buka detail", async () => {
    await page.locator("#hero-posisi").fill(targetName);
    await page.getByRole("button", { name: "Cari loker" }).click();
    await expect(page).toHaveURL(/\/cari\?/);
    /* Hasil pencarian memuat perusahaan target; buka detailnya.
     * Batas 30 detik (bukan 10 bawaan): render server jatuh ke seed
     * sesudah percobaan Firestore gagal, dan percobaan itu bisa
     * memakan ~10 detik saat egress lambat. */
    const result = page.locator(`article.co[data-no="${targetNo}"]`);
    await expect(result).toBeVisible({ timeout: 30_000 });
    /* RACE YANG DITEMUKAN P-01 (dilaporkan ke koordinator untuk
     * P-14, bukan diperbaiki di sini): /cari menjalankan
     * history.replaceState (sinkronisasi URL, debounce 600 mdtk
     * sesudah mount — app/cari/search-app.js) dan Next.js mencegat
     * replaceState itu sebagai sinyal navigasi, sehingga navigasi
     * Link yang sedang berjalan DIBATALKAN (RSC dibatalkan,
     * URL tetap /cari). Pengguna sungguhan yang mengeklik hasil
     * dalam 600 mdtk pertama juga kena — klik keduanya berhasil.
     * Tes menunggu 1,5 detik supaya efek itu lewat dulu, lalu
     * mencoba klik sampai 3 kali bila navigasi belum commit. */
    await page.waitForTimeout(1500);
    let navigated = false;
    for (let attempt = 0; attempt < 3 && !navigated; attempt++) {
      await result.locator("h3.co-name a").click();
      try {
        /* Navigasi klien baru commit sesudah server selesai
         * me-render halaman detail (jatuh ke seed sesudah DUA
         * percobaan Firestore gagal berurutan — detail + terkait
         * — masing-masing sampai 10 detik saat egress lambat). */
        await expect(page).toHaveURL(`/perusahaan/${targetNo}`, {
          timeout: 20_000,
        });
        navigated = true;
      } catch {
        /* Navigasi terbunuh replaceState /cari — coba klik lagi. */
      }
    }
    expect(navigated).toBe(true);
    await expect(
      page.getByRole("heading", { name: targetName }).first(),
    ).toBeVisible({ timeout: 60_000 });
  });

  await test.step("daftar akun (Auth mock)", async () => {
    await page
      .getByRole("button", { name: "Masuk atau daftar" })
      .click();
    await page.getByRole("button", { name: "Daftar", exact: true }).click();
    /* Gerbang anti-bot AKUN-12: pendaftaran yang dikirim kurang
     * dari 3 detik sesudah formulir daftar tampil ditolak. Tunggu
     * gerbang itu lewat sebelum mengisi. */
    await page.waitForTimeout(3200);
    await page.locator("#akun-email").fill(TEST_USER.email);
    await page.locator("#akun-password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Buat akun" }).click();
    await expect(
      page.getByText(`Masuk sebagai ${TEST_USER.email}`),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });

  await test.step("tambah pelacak di halaman detail", async () => {
    await page.getByRole("radio", { name: "Ditandai" }).click();
    await expect(
      page.locator('.toast-wrap[role="status"]'),
    ).toContainText("Tersimpan di browser ini.");
    /* Entri tersimpan di kunci pelacak akun (bukan kunci tamu),
     * karena pengguna sudah masuk saat menandai. */
    const stored = await page.evaluate((uid) => {
      try {
        return window.localStorage.getItem(`karir-lamaran:${uid}`);
      } catch {
        return null;
      }
    }, TEST_USER.uid);
    expect(stored).toBeTruthy();
    const entries = JSON.parse(stored);
    expect(entries[String(targetNo)].status).toBe("Ditandai");
  });

  await test.step("aktifkan push (mock)", async () => {
    await page.goto("/pengaturan", { timeout: 60_000 });
    await page
      .getByRole("button", { name: "Aktifkan notifikasi" })
      .click();
    await expect(
      page.getByText("Notifikasi aktif di browser ini."),
    ).toBeVisible();
    /* Klien benar-benar memanggil endpoint subscribe dengan
     * langganan palsu dan token akun. */
    expect(push.calls.length).toBe(1);
    expect(push.calls[0].body.subscription.endpoint).toBe(
      FAKE_SUBSCRIPTION.endpoint,
    );
    expect(push.calls[0].authorization.startsWith("Bearer ")).toBe(true);
  });

  await test.step("ekspor data memuat pelacak dan akun", async () => {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Unduh data (JSON)" }).click();
    const download = await downloadPromise;
    const path = await download.path();
    const exported = JSON.parse(readFileSync(path, "utf8"));
    expect(exported.akun.email).toBe(TEST_USER.email);
    const entry = (exported.tandaLamaran || []).find(
      (e) => e.no === targetNo,
    );
    expect(entry).toBeTruthy();
    expect(entry.status).toBe("Ditandai");
  });
});
