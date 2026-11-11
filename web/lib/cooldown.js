/* Jeda singkat setelah sebuah sumber gagal. Dipakai lib/companies.js untuk
 * jalur "atau data cadangan": begitu Firestore gagal dijangkau, halaman
 * langsung memakai data cadangan selama jeda, bukan masing-masing menunggu
 * timeout 10 detik (layout, halaman, dan halaman lain menunggu bergantian).
 * Fungsi murni dengan jam yang bisa disuntik supaya bisa diuji. */
export function createCooldown(ms, clock = Date.now) {
  let until = 0;
  return {
    /* Benar selama jeda masih berjalan. */
    active: () => clock() < until,
    /* Mulai jeda baru dari sekarang. */
    trip: () => {
      until = clock() + ms;
    },
    /* Akhiri jeda (mis. setelah admin menulis data). */
    reset: () => {
      until = 0;
    },
  };
}
