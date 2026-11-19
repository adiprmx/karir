/* Rantai fallback berlapis D1 -> Firestore -> seed (P-08, H1/H3).
 *
 * File ini adalah implementasi REFERENSI untuk integrasi ke
 * web/lib/companies.js pada H3 (cutover baca). File ini TIDAK
 * diimpor oleh kode produksi apa pun hari ini — sengaja, supaya
 * Tahap 3 tidak mengubah perilaku produksi.
 *
 * Rantai (resolveCatalog):
 *   1. D1 (Worker /v1/delta?rev=N): bila berhasil, gabungkan delta
 *      ke salinan lokal (cache instance) dan kembalikan
 *      {list, source: "d1", rev}.
 *   2. Firestore (refill yang sudah ada di lib/companies.js): bila
 *      Worker gagal (502, timeout, jaringan), pakai jalur lama dan
 *      kembalikan {list, source: "live", rev}.
 *   3. Seed (web/data/companies.json): bila Firestore juga gagal,
 *      kembalikan {list, source: "seed", rev: null}.
 *
 * Aturan yang dipertahankan dari seed-first:
 * - Fungsi ini TIDAK PERNAH melempar karena lapisan data: semua
 *   kegagalan berakhir di seed.
 * - `source` selalu jujur: "d1" hanya bila data benar-benar dari
 *   D1; cache basi tidak pernah dilabeli "live".
 * - Delta kosong (rev tidak berubah) berarti salinan lokal masih
 *   berlaku — tanpa baca tambahan.
 *
 * Integrasi ke web/lib/companies.js (H3, sesudah flag baca ada):
 * ganti isi resolveCompanies() dengan pemanggilan resolveCatalog()
 * ini, dengan fetchDelta memanggil Worker, refillFirestore memanggil
 * refillFromFirestore() yang sudah ada, dan loadSeed memanggil
 * loadSeed() yang sudah ada. Lihat d1/README.md §5. */

export function applyDelta(cached, changed, removed) {
  const byNo = new Map((cached || []).map((c) => [c.no, c]));
  for (const c of changed || []) byNo.set(c.no, c);
  for (const no of removed || []) byNo.delete(no);
  return [...byNo.values()].sort((a, b) => a.no - b.no);
}

/* Satu langkah rantai: coba D1, lalu Firestore, lalu seed.
 * - fetchDelta(rev): Promise<{rev, changed, removed, total}>.
 *   Melempar / menolak bila Worker tidak dapat dipakai.
 * - refillFirestore(): Promise<{list, rev}> — jalur lama.
 * - loadSeed(): Promise<list>.
 * - cached: {list, rev} salinan lokal terakhir (boleh null).
 * Kembalikan {list, source, rev}. */
export async function resolveCatalog({
  fetchDelta,
  refillFirestore,
  loadSeed,
  cached,
}) {
  const knownRev = cached && cached.rev != null ? cached.rev : 0;
  try {
    const delta = await fetchDelta(knownRev);
    const list = applyDelta(cached ? cached.list : [], delta.changed, delta.removed);
    return { list, source: "d1", rev: delta.rev };
  } catch {
    /* D1 gagal: jatuh ke Firestore (jalur lama). */
  }
  try {
    const { list, rev } = await refillFirestore();
    return { list, source: "live", rev: rev ?? null };
  } catch {
    /* Firestore gagal: jatuh ke seed. */
  }
  const list = await loadSeed();
  return { list, source: "seed", rev: null };
}
