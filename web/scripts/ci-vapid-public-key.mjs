/* Buat kunci VAPID sekali pakai untuk build CI (P-01).
 *
 * Tes E2E push butuh kunci publik VAPID di build (tanpanya,
 * subscribePush mengembalikan "gagal" sebelum mendaftarkan service
 * worker). Kunci ini dibuat baru di tiap run CI dan hanya dipakai
 * build itu — kunci privatnya TIDAK PERNAH dicetak atau disimpan
 * ke mana pun; ia hanya hidup di memori proses ini lalu dibuang.
 * Kunci publik memang dibagikan ke browser (bukan rahasia).
 *
 * Bila env GITHUB_ENV ada, skrip menambahkan baris
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY=<kunci publik> ke berkas itu
 * (pola resmi GitHub Actions untuk men-set env langkah berikut).
 * Bila tidak ada (lokal), skrip mencetak baris yang sama ke stdout
 * supaya bisa di-eval atau disalin manual.
 *
 * Jalankan dari web/: node scripts/ci-vapid-public-key.mjs */

import { appendFileSync } from "node:fs";
import { generateVAPIDKeys } from "web-push";

const { publicKey } = generateVAPIDKeys();
const line = `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`;

if (process.env.GITHUB_ENV) {
  appendFileSync(process.env.GITHUB_ENV, `${line}\n`);
  console.log("Kunci publik VAPID sekali pakai ditulis ke GITHUB_ENV.");
} else {
  console.log(line);
}
