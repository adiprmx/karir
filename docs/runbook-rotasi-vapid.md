# Runbook rotasi kunci VAPID (P-07)

Kunci VAPID mengesahkan notifikasi push web ke layanan push
browser (FCM untuk Chrome/Android, layanan push Apple untuk
Safari). Pasangan kunci ini dipakai di dua tempat:

- Kunci publik — variabel build `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
  Karena bersifat build-time, menggantinya WAJIB redeploy
  (nilai lama tertanam di bundle JavaScript yang sudah dibangun).
- Kunci privat — variabel runtime `VAPID_PRIVATE_KEY` di Vercel
  (dipakai server saat mengirim push lewat `web-push`).

Kunci privat TIDAK PERNAH ditulis nilainya di dokumen, laporan,
chat, atau repo mana pun. Dokumen ini hanya mencatat prosedur
dan lokasi penyimpanan amannya.

## Salinan aman kunci privat

| Lokasi | Status (18 Nov 2026) |
|---|---|
| Vercel — variabel runtime `VAPID_PRIVATE_KEY` | Aktif, dipakai produksi |
| GitHub Secrets repo ini — secret `VAPID_PRIVATE_KEY` | ADA (dibuat 17 Nov 2026 23:54 UTC; keberadaannya diverifikasi lewat API GitHub 18 Nov 2026, nama saja — nilai tidak pernah dibaca) |
| Salinan offline terenkripsi milik pemilik | BELUM — tindakan pemilik (lihat langkah di bawah) |

Nilai di GitHub Secrets BELUM pernah dibandingkan dengan nilai
di Vercel (nilai secret tidak bisa dibaca kembali lewat API).
Pemilik disarankan memverifikasi kesesuaiannya pada rotasi
berikut atau dengan memutar ulang secret dari nilai Vercel
yang sahih.

Salinan offline: pemilik menyimpan kunci privat di berkas
terenkripsi (mis. pengelola kata sandi) di luar Vercel dan
GitHub, supaya kehilangan akses ke salah satu layanan tidak
berarti kehilangan kunci. Tanpa salinan ini, kunci yang hilang
hanya bisa diganti dengan rotasi penuh (lihat risiko-kepatuhan
§9.4 — tidak ada jalan pintas).

## Kapan rotasi diperlukan

- Kunci privat diduga bocor (mis. tertempel di chat publik,
  masuk ke commit, atau diakses pihak yang tidak berwenang).
- Kunci privat hilang (tidak ada salinan yang bisa dipakai).
- Rotasi berkala atas kebijakan pemilik (tidak ada jadwal
  wajib — rotasi hanya bila ada alasan).

Rotasi BUKAN tindakan darurat sekali klik: langganan lama yang
dibuat dengan kunci lama TIDAK BISA dipindahkan ke kunci baru
oleh server. Setiap perangkat harus berlangganan ulang. Karena
itu rotasi selalu diikuti pengumuman + masa migrasi (di bawah).

## Prosedur rotasi (urutan wajib)

1. **Buat pasangan kunci baru.** Di mesin lokal pemilik (bukan
   di VM bersama):
   `npx web-push generate-vapid-keys`
   Perintah ini mencetak satu pasangan kunci publik + privat
   baru. Jangan bagikan outputnya ke chat atau dokumen.
2. **Simpan kunci privat baru di tiga tempat, SEBELUM deploy:**
   - Vercel: perbarui variabel `VAPID_PRIVATE_KEY` (Production).
   - GitHub Secrets repo ini: perbarui secret
     `VAPID_PRIVATE_KEY` (Settings > Secrets and variables >
     Actions) — ini salinan cadangan bila Vercel tidak bisa
     diakses.
   - Salinan offline terenkripsi milik pemilik.
3. **Deploy dengan kunci publik baru.** Perbarui variabel
   build `NEXT_PUBLIC_VAPID_PUBLIC_KEY` di Vercel, lalu
   redeploy. Deployment yang sedang berjalan tidak berubah
   saat variabel env diperbarui — kunci baru (publik +
   privat) berlaku bersamaan pada deployment baru, jadi
   langkah 2 dan 3 aman dilakukan berurutan. Yang DILARANG:
   redeploy dengan hanya SATU kunci baru (mis. privat baru
   tapi publik lama) — selama jendela itu push gagal 401/403
   untuk semua langganan (heartbeat mencatat
   `pushConfigError: true`).
4. **Umumkan rotasi.** Teks pengumuman (spanduk situs +
   catatan perubahan):
   > "Notifikasi lowongan diperbarui. Bila notifikasi berhenti
   > sampai, buka halaman Pengaturan lalu ketuk 'Aktifkan ulang
   > notifikasi'."
5. **Migrasi langganan.** Perangkat yang membuka situs sesudah
   rotasi mendeteksi kunci lama (klien menyimpan kunci publik
   yang dipakai saat berlangganan di localStorage) dan halaman
   Pengaturan menampilkan tombol "Aktifkan ulang notifikasi".
   Satu ketukan membatalkan langganan lama lalu berlangganan
   ulang dengan kunci baru (`resubscribePush`).
   - Langganan lama yang BELUM migrasi: pengiriman gagal
     401/403 dan dicatat `pushFailed` — dokumennya TIDAK
     dihapus (kegagalan konfigurasi bukan bukti langganan
     mati; perangkat masih bisa migrasi kapan saja).
   - Langganan lama tetap dihitung `pushStaleKey` di
     heartbeat (dokumen yang sidik kuncinya berbeda dengan
     kunci saat ini) — angka ini harus menuju nol seiring
     migrasi.
   - Dokumen lama tanpa sidik kunci (dibuat sebelum P-07)
     dihitung `pushUnknownKey`, bukan `pushStaleKey`.
6. **Verifikasi.**
   - Heartbeat digest/recheck sesudah deploy: `pushConfigError`
     harus `false` (bila `true`, kunci privat dan kunci publik
     tidak berpasangan — periksa langkah 2–3).
   - `pushStaleKey` menurun dari hari ke hari; `pushSent`
     pulih ke angka normal.
   - Satu pelanggan uji menerima notifikasi di perangkat nyata
     (prosedur di `docs/observasi-pasca-merge-p07.md`).
7. **Rollback (bila rotasi bermasalah).** Kembalikan kunci
   privat lama dari GitHub Secrets / salinan offline ke
   Vercel, kembalikan kunci publik lama, lalu redeploy.
   Langganan lama langsung berfungsi lagi (dokumennya tidak
   pernah dihapus selama rotasi).

## Pengujian logika rotasi (P-07)

Tanpa proyek Firebase staging (pembuatannya butuh Console UI),
pengujian penuh ujung-ke-ujung di staging didokumentasikan
sebagai utang. Yang sudah diuji dengan mock/fixture:

- Sidik kunci (`vapidKeyHash`, 12 karakter awal SHA-256 kunci
  publik) ditulis di dokumen langganan saat subscribe dan
  dipakai menghitung `pushStaleKey`/`pushUnknownKey`
  (`web/lib/push.test.js`).
- Deteksi kunci basi di klien (`getPushStatus` →
  `"stale-key"`) + subscribe ulang (`resubscribePush`):
  batalkan lama, subscribe baru, kunci baru tersimpan
  (`web/app/push-client.test.js`).
- Kegagalan konfigurasi (401/403 atau kunci VAPID tidak valid)
  menghentikan run dengan `pushConfigError: true` TANPA
  menghapus langganan (`web/lib/push.test.js`).

## Pembersihan langganan malformed (K3) — gerbang flag

Fase pembersihan di cron cleanup mingguan (Senin 02:00 WIB)
DIPAGARI flag env `PUSH_MALFORMED_CLEANUP_ENABLED`. Tanpa flag
(`"1"`), fase dilewati dan heartbeat mencatat
`pushCleanupSkipped: true` + `skipReason: "flag-mati"`.

Flag HANYA diaktifkan sesudah cadangan `push_subscriptions`
Fase B P-03 terverifikasi (manifest artifact backup berisi
koleksi itu) — penghapusan tidak bisa dibatalkan tanpa
cadangan. Sampai saat itu, kode pembersihan ada di repo tapi
tidak pernah menghapus apa pun di produksi.

Kriteria hapus (dicatat di `classifySubscriptionDoc`,
`web/lib/push.js`) — dokumen dihapus HANYA bila tidak bisa
menerima push sama sekali:

- endpoint hilang / bukan URL https / lebih dari 2000 karakter
  / bukan URL valid;
- `p256dh` hilang atau bukan 65 byte berawalan `0x04` sesudah
  decode;
- `auth` hilang atau bukan 16 byte sesudah decode.

Yang SENGAJA tidak dihapus: dokumen tanpa UID (masih bisa
dikirim; pemilik perangkat bisa mengklaimnya lewat subscribe
sesudah perbaikan TOCTOU P-07) dan dokumen yang id-nya bukan
SHA-256 endpoint (pengiriman memakai endpoint + kunci, bukan
id dokumen). Batas per run: maks 100 hapus, maks 1000 dokumen
diperiksa, anggaran 30 detik; sisa dilaporkan `hasMore: true`
dan dicoba run berikutnya.
