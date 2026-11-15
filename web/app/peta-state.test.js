/* Tes state peta (PETA-05, koordinator Gelombang 3 Fase 5), memakai
 * test runner bawaan Node. Dijalankan dengan: npm test
 *
 * Tes wiring statis — MEMBACA berkas sumber langsung, pola yang sama
 * dengan app/w1-b1.test.js: komponen memakai JSX sehingga tidak bisa
 * diimpor node:test, tetapi state loading dan state kosong dijaga agar
 * tidak hilang diam-diam. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");

function baca(relatif) {
  return readFileSync(join(WEB, relatif), "utf-8");
}

describe("state peta (PETA-05)", () => {
  it("teks loading tampil selama Leaflet dimuat, hilang sesudah peta siap", () => {
    const src = baca("app/map-client.js");
    assert.ok(src.includes("mapReady"), "tidak ada state mapReady");
    assert.ok(src.includes("setMapReady(true)"), "mapReady tidak pernah true");
    assert.ok(
      src.includes("!mapReady && !failed"),
      "teks loading tidak digerbangi mapReady/failed",
    );
    assert.ok(src.includes("labels.loading"), "teks loading tidak memakai label");
    assert.ok(
      src.includes('role="status"'),
      "teks loading tidak diumumkan ke pembaca layar",
    );
  });

  it("pesan kosong tampil bila tidak ada grup, tanpa menunggu panel kota", () => {
    const src = baca("app/map-client.js");
    assert.ok(
      src.includes("groups.length === 0"),
      "tidak ada cabang groups kosong",
    );
    assert.ok(src.includes("labels.empty"), "pesan kosong tidak memakai label");
  });

  it("label loading + kosong ada di i18n (ID + EN) dan diteruskan peta/page.js", () => {
    const i18n = baca("lib/i18n.js");
    for (const kunci of ['"map.loading"', '"map.empty"']) {
      const jumlah = i18n.split(kunci).length - 1;
      assert.equal(jumlah, 2, `${kunci} muncul ${jumlah}x, harus 2x (ID + EN)`);
    }
    const peta = baca("app/peta/page.js");
    assert.ok(peta.includes('"map.loading"'), "peta/page.js tidak meneruskan loading");
    assert.ok(peta.includes('"map.empty"'), "peta/page.js tidak meneruskan empty");
  });

  it("cadangan Indonesia untuk kedua label ada di map-client.js", () => {
    const src = baca("app/map-client.js");
    assert.ok(src.includes('loading: "Memuat peta…"'));
    assert.ok(src.includes('empty: "Belum ada lowongan target di peta."'));
  });
});
