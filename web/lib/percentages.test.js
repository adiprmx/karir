/* Tes unit untuk lib/percentages.js (DASH-07, W1-TRACKER), memakai
 * test runner bawaan Node. Dijalankan dengan:
 *   node --test lib/percentages.test.js
 * Yang dites: jumlah persentase selalu tepat 100 (metode sisa
 * terbesar, bukan pembulatan independen), penjaga total 0 (bukan
 * NaN), dan determinisme seri. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { largestRemainderPercents } from "./percentages.js";

describe("largestRemainderPercents", () => {
  it("jumlahnya tepat 100 walau pembulatan independen tidak", () => {
    /* Tiga baris sama besar: Math.round memberi 33+33+33 = 99. */
    const out = largestRemainderPercents([1, 1, 1], 3);
    assert.equal(out.reduce((a, b) => a + b, 0), 100);
    assert.deepEqual(out, [34, 33, 33]);
  });

  it("sisa poin jatuh ke sisa pecahan terbesar", () => {
    /* 49,5% / 49,5% / 1%: lantai 49+49+1 = 99, sisa 1 poin ke salah
     * satu 49,5% (seri diputus hitungan sama lalu urutan awal). */
    const out = largestRemainderPercents([99, 99, 2], 200);
    assert.equal(out.reduce((a, b) => a + b, 0), 100);
    assert.deepEqual(out, [50, 49, 1]);
  });

  it("total 0: semua 0, bukan NaN", () => {
    assert.deepEqual(largestRemainderPercents([0, 0, 0], 0), [0, 0, 0]);
    assert.deepEqual(largestRemainderPercents([], 0), []);
  });

  it("total tidak diisi: dihitung dari hitungan", () => {
    assert.deepEqual(largestRemainderPercents([3, 1]), [75, 25]);
  });

  it("hitungan nol di tengah tetap 0", () => {
    assert.deepEqual(largestRemainderPercents([10, 0, 10], 20), [50, 0, 50]);
  });

  it("masukan kotor (negatif, NaN) diperlakukan sebagai 0", () => {
    const out = largestRemainderPercents([50, -5, Number.NaN], 50);
    assert.deepEqual(out, [100, 0, 0]);
  });

  it("masukan tidak diubah", () => {
    const counts = [1, 1, 1];
    largestRemainderPercents(counts, 3);
    assert.deepEqual(counts, [1, 1, 1]);
  });
});
