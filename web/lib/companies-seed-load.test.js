/* Tes SEED_LOAD_FAILED lib/companies.js (P-06, BE2-02) — file
 * terpisah dengan sengaja: tes ini butuh instans modul companies.js
 * yang segar (seedCache kosong) supaya loadSeed benar-benar jalan.
 * Satu-satunya cara yang aman adalah proses tes yang segar: file
 * tes sendiri, impor biasa. JANGAN memakai impor query string
 * (mis. "./companies.js?segar=1") — terbukti 18 Nov 2026 merusak
 * penggabungan coverage Node: companies.js anjlok dari 98,48% ke
 * 46,25% lines / 18,60% funcs di CI hanya karena satu impor query
 * (lihat laporan P-06). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* companies.js membaca env saat modul dimuat, jadi env dipasang
 * SEBELUM impor dinamis. Nilai di sini tiruan, bukan kredensial. */
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
const KUNCI_UJI = "kunci-uji";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = KUNCI_UJI;

const { OBS_CODES, registerObservabilitySink } = await import(
  "./observability.js"
);
const { getCompanies } = await import("./companies.js");

const fetchAsli = globalThis.fetch;

function jawaban({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: () => jawaban({ ok, status, body }),
  };
}

describe("SEED_LOAD_FAILED (instans modul segar)", () => {
  it("muat seed lewat alias gagal di luar Next -> SEED_LOAD_FAILED sekali", async () => {
    const tercatat = [];
    registerObservabilitySink((event) => tercatat.push(event));
    /* Marker 429 memaksa jatuh ke seed, sehingga loadSeed jalan. */
    globalThis.fetch = async (url) => {
      if (String(url).includes("/meta/lastChange")) {
        return jawaban({ ok: false, status: 429, body: {} });
      }
      return jawaban({ ok: false, status: 429, body: {} });
    };
    try {
      await getCompanies();
    } finally {
      globalThis.fetch = fetchAsli;
    }
    const ev = tercatat.filter(
      (e) => e.code === OBS_CODES.SEED_LOAD_FAILED,
    );
    /* Di luar Next (tes Node), impor alias @ selalu gagal sekali. */
    assert.equal(ev.length, 1);
    assert.equal(ev[0].meta.reason, "alias-import-failed");
  });
});
