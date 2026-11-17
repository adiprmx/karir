/* Konfigurasi Playwright untuk tes E2E Karir (P-01, DX-07/QA-03).
 *
 * Dua mode jalan:
 * - Lokal/CI: tanpa E2E_BASE_URL, Playwright menjalankan server
 *   produksi dari hasil build (`npx next start -p 3000`) dan
 *   menguji http://localhost:3000. Build harus sudah dibuat dulu
 *   (`npm run build`); di CI langkah Build berjalan sebelum E2E.
 * - Pratinjau: dengan E2E_BASE_URL=https://<deployment>.vercel.app,
 *   Playwright menguji URL itu tanpa menjalankan server lokal
 *   (dipakai workflow e2e-preview.yml untuk kriteria P-01 nomor 6).
 *
 * Yang di-mock di dalam tes (lihat e2e/helpers/): Firebase Auth
 * (REST identitytoolkit — tidak ada akun yang dibuat di proyek
 * Firebase mana pun), Firestore dari browser (503 cepat — data
 * disajikan seed/server, bukan Firestore klien), dan langganan
 * push (PushManager + /api/push/subscribe). Tidak ada mock yang
 * menyentuh kode produksi: semua mock hidup di proses tes dan
 * hanya berlaku selama tes berjalan. */
import { defineConfig } from "@playwright/test";

const BASE_URL =
  process.env.E2E_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
    /* Izin notifikasi diminta di muka (cadangan — mekanisme utama
     * adalah stub Notification di e2e/helpers/push-mock.js, karena
     * grantPermissions terbukti tidak bekerja di Chromium sandbox
     * VM ini). */
    permissions: ["notifications"],
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  /* Server lokal hanya bila tidak menguji URL luar. reuseExisting
   * memungkinkan server yang sudah jalan manual dipakai ulang. */
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npx next start -p 3000",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [{ name: "chromium", use: {} }],
});
