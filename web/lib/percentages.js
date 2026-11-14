/* Persentase bilangan bulat dari hitungan (DASH-07, W1-TRACKER).
 * Modul murni tanpa JSX supaya bisa diuji unit langsung dengan
 * node:test (berkas halaman tidak bisa diimpor test runner).
 *
 * largestRemainderPercents memakai metode sisa terbesar: tiap baris
 * dibulatkan ke bawah dulu, lalu sisa poin (100 - jumlah lantai)
 * dibagikan satu per satu ke baris dengan sisa pecahan terbesar,
 * supaya jumlah persentasenya selalu tepat 100. Seri sisa pecahan
 * diputus oleh hitungan yang lebih besar, lalu urutan awal (stabil
 * dan deterministik). Bila total 0 atau tidak ada hitungan, semua
 * baris mendapat 0 (bukan NaN). Masukan tidak diubah. */

/* Hitung persentase bilangan bulat per hitungan. `counts` larik
 * angka (negatif dan bukan angka diperlakukan sebagai 0); `total`
 * jumlah keseluruhan — bila tidak diisi, dihitung dari `counts`.
 * Kembalikan larik bilangan bulat sepanjang `counts` yang jumlahnya
 * 100 bila total > 0, atau semuanya 0 bila total <= 0. */
export function largestRemainderPercents(counts, total) {
  const clean = (Array.isArray(counts) ? counts : []).map((n) =>
    typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0,
  );
  const sum =
    typeof total === "number" && Number.isFinite(total) && total > 0
      ? total
      : clean.reduce((a, b) => a + b, 0);
  if (clean.length === 0 || sum <= 0) return clean.map(() => 0);
  const floors = [];
  const remainders = [];
  let used = 0;
  for (const n of clean) {
    const exact = (n / sum) * 100;
    const floor = Math.floor(exact);
    floors.push(floor);
    remainders.push(exact - floor);
    used += floor;
  }
  let left = 100 - used;
  const order = clean
    .map((n, i) => i)
    .sort((a, b) => {
      if (remainders[b] !== remainders[a]) {
        return remainders[b] - remainders[a];
      }
      if (clean[b] !== clean[a]) return clean[b] - clean[a];
      return a - b;
    });
  /* `left` selalu < jumlah baris (tiap sisa pecahan < 1), jadi satu
   * putaran cukup; penjaga while berjaga-jaga bila ada pembulatan
   * aneh dari floating point. */
  let k = 0;
  while (left > 0 && order.length > 0) {
    floors[order[k % order.length]] += 1;
    left -= 1;
    k += 1;
  }
  return floors;
}
