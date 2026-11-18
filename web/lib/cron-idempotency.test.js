/* Test kunci idempotency cron (P-05, C9), memakai test runner
 * bawaan Node. Dijalankan dengan:
 *   node --test lib/cron-idempotency.test.js
 *
 * Firestore di-mock penuh di memori (MockStore): pembuatan dokumen
 * atomik (409 bila id sudah ada), PATCH dengan prasyarat updateTime
 * (412 bila tidak cocok), dan stempel updateTime server. Tidak ada
 * jaringan, tidak ada Firestore live. Skenario kunci yang dites:
 * dua pemicu bersamaan -> SATU eksekusi (kriteria P-05 no. 4),
 * takeover kunci basi/gagal, balapan takeover, dan fallback
 * hapus-lalu-buat bila prasyarat ditolak. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  acquireCronLock,
  buildLockId,
  lockAgeMs,
  lockIsStale,
  parseLockDoc,
  releaseCronLock,
  LOCK_TTL_MS,
} from "./cron-idempotency.js";

const FS_BASE =
  "https://firestore.googleapis.com/v1/projects/proyek-uji/databases/(default)/documents";
const TOKEN = "token-uji";
const NOW = Date.parse("2026-11-18T01:00:00.000Z");

function iso(ms) {
  return new Date(ms).toISOString();
}

/* Penyimpanan dokumen tiruan dengan semantik REST Firestore yang
 * relevan: create atomik, prasyarat updateTime di PATCH, dan
 * updateTime server yang naik tiap tulis. */
class MockStore {
  constructor() {
    this.docs = new Map();
    this.clock = NOW;
    this.patchShouldFail = null;
    this.createShouldFail = null;
    this.getShouldFail = null;
    this.deleteShouldFail = null;
    this.calls = [];
  }

  response(status, body) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body ?? {},
    };
  }

  fetch = async (url, options = {}) => {
    const u = String(url);
    const method = (options.method || "GET").toUpperCase();
    this.calls.push({ method, url: u });
    const parsed = new URL(u);
    const path = parsed.pathname;
    const docMatch = path.match(/\/cron-locks\/([^/]+)$/);
    const collectionMatch = path.endsWith("/cron-locks");
    if (method === "POST" && collectionMatch) {
      if (this.createShouldFail) {
        return this.response(this.createShouldFail, {});
      }
      const id = parsed.searchParams.get("documentId");
      if (this.docs.has(id)) return this.response(409, {});
      const body = JSON.parse(options.body || "{}");
      const doc = {
        name: `${FS_BASE}/cron-locks/${id}`,
        fields: body.fields || {},
        createTime: iso(this.clock),
        updateTime: iso(this.clock),
      };
      this.docs.set(id, doc);
      return this.response(200, structuredClone(doc));
    }
    if (!docMatch) return this.response(404, {});
    const id = docMatch[1];
    if (method === "GET") {
      if (this.getShouldFail) {
        return this.response(this.getShouldFail, {});
      }
      const doc = this.docs.get(id);
      if (!doc) return this.response(404, {});
      return this.response(200, structuredClone(doc));
    }
    if (method === "PATCH") {
      if (this.patchShouldFail) {
        return this.response(this.patchShouldFail, {});
      }
      const doc = this.docs.get(id);
      if (!doc) return this.response(404, {});
      const want = parsed.searchParams.get("currentDocument.updateTime");
      if (want && want !== doc.updateTime) {
        return this.response(412, {});
      }
      const body = JSON.parse(options.body || "{}");
      this.clock += 1;
      doc.fields = { ...doc.fields, ...(body.fields || {}) };
      doc.updateTime = iso(this.clock);
      return this.response(200, structuredClone(doc));
    }
    if (method === "DELETE") {
      if (this.deleteShouldFail) {
        return this.response(this.deleteShouldFail, {});
      }
      if (!this.docs.has(id)) return this.response(404, {});
      this.docs.delete(id);
      return this.response(200, {});
    }
    return this.response(405, {});
  };

  /* Tanam dokumen kunci dengan keadaan tertentu (untuk skenario
   * "sudah ada"). updateTime diatur dari umur yang diminta. */
  seed(id, { status = "running", ageMs = 0, runId = "run-lama" } = {}) {
    const stamp = iso(NOW - ageMs);
    this.docs.set(id, {
      name: `${FS_BASE}/cron-locks/${id}`,
      fields: {
        job: { stringValue: "recheck" },
        date: { stringValue: "2026-11-18" },
        runId: { stringValue: runId },
        trigger: { stringValue: "github-actions" },
        status: { stringValue: status },
        startedAt: { stringValue: stamp },
        finishedAt: { stringValue: "" },
      },
      createTime: stamp,
      updateTime: stamp,
    });
  }
}

function acquire(store, overrides = {}) {
  return acquireCronLock({
    fsBase: FS_BASE,
    token: TOKEN,
    job: "recheck",
    date: "2026-11-18",
    runId: "run-baru",
    trigger: "github-actions",
    fetchImpl: store.fetch,
    nowMs: NOW,
    ...overrides,
  });
}

describe("buildLockId / parseLockDoc / lockIsStale", () => {
  it("id kunci = job-tanggal", () => {
    assert.equal(buildLockId("recheck", "2026-11-18"), "recheck-2026-11-18");
    assert.equal(buildLockId("digest", "2026-11-18"), "digest-2026-11-18");
  });

  it("menolak nama job dan tanggal yang tidak valid", () => {
    assert.throws(() => buildLockId("recheck/x", "2026-11-18"));
    assert.throws(() => buildLockId("recheck", "18-11-2026"));
    assert.throws(() => buildLockId("Recheck", "2026-11-18"));
  });

  it("parseLockDoc membaca field + updateTime, status default running", () => {
    const lock = parseLockDoc({
      fields: {
        job: { stringValue: "recheck" },
        status: { stringValue: "done" },
      },
      updateTime: "2026-11-18T01:00:00.000Z",
    });
    assert.equal(lock.job, "recheck");
    assert.equal(lock.status, "done");
    assert.equal(lock.updateTime, "2026-11-18T01:00:00.000Z");
    assert.equal(parseLockDoc({ fields: {} }).status, "running");
    assert.equal(parseLockDoc(null), null);
  });

  it("umur dihitung dari updateTime server, cadangan startedAt", () => {
    const lock = {
      updateTime: iso(NOW - 60_000),
      startedAt: iso(NOW - 600_000),
    };
    assert.equal(lockAgeMs(lock, NOW), 60_000);
    assert.equal(lockAgeMs({ startedAt: iso(NOW - 5_000) }, NOW), 5_000);
    assert.equal(lockAgeMs({}, NOW), null);
  });

  it("stale: umur >= TTL 3 menit; tanpa stempel dianggap basi", () => {
    assert.equal(LOCK_TTL_MS, 3 * 60 * 1000);
    assert.equal(
      lockIsStale({ updateTime: iso(NOW - LOCK_TTL_MS) }, NOW),
      true,
    );
    assert.equal(
      lockIsStale({ updateTime: iso(NOW - LOCK_TTL_MS + 1000) }, NOW),
      false,
    );
    assert.equal(lockIsStale({}, NOW), true);
  });
});

describe("acquireCronLock", () => {
  it("kunci baru: acquired, dokumen tertulis lengkap", async () => {
    const store = new MockStore();
    const hasil = await acquire(store);
    assert.equal(hasil.acquired, true);
    assert.equal(hasil.lockId, "recheck-2026-11-18");
    assert.equal(hasil.tookOver, false);
    const doc = store.docs.get("recheck-2026-11-18");
    assert.equal(doc.fields.status.stringValue, "running");
    assert.equal(doc.fields.runId.stringValue, "run-baru");
    assert.equal(doc.fields.trigger.stringValue, "github-actions");
    assert.equal(doc.fields.job.stringValue, "recheck");
  });

  it("DUA PEMICU BERSAMAAN: satu jalan, satu ditolak (kriteria P-05 no. 4)", async () => {
    const store = new MockStore();
    const [a, b] = await Promise.all([
      acquire(store, { runId: "run-actions", trigger: "github-actions" }),
      acquire(store, { runId: "run-qstash", trigger: "qstash" }),
    ]);
    const menang = [a, b].filter((r) => r.acquired);
    const kalah = [a, b].filter((r) => !r.acquired);
    assert.equal(menang.length, 1);
    assert.equal(kalah.length, 1);
    assert.equal(kalah[0].reason, "running");
    /* Dokumen kunci hanya satu, milik pemenang. */
    assert.equal(store.docs.size, 1);
    const doc = store.docs.get("recheck-2026-11-18");
    assert.equal(
      doc.fields.runId.stringValue,
      a.acquired ? "run-actions" : "run-qstash",
    );
  });

  it("pemicu kedua sesudah run selesai: ditolak reason done", async () => {
    const store = new MockStore();
    store.seed("recheck-2026-11-18", { status: "done", ageMs: 60_000 });
    const hasil = await acquire(store);
    assert.equal(hasil.acquired, false);
    assert.equal(hasil.reason, "done");
  });

  it("allowRerun (cleanup): done boleh jalan lagi", async () => {
    const store = new MockStore();
    store.seed("recheck-2026-11-18", { status: "done", ageMs: 60_000 });
    const hasil = await acquire(store, { allowRerun: true });
    assert.equal(hasil.acquired, true);
    assert.equal(hasil.tookOver, true);
    const doc = store.docs.get("recheck-2026-11-18");
    assert.equal(doc.fields.status.stringValue, "running");
    assert.equal(doc.fields.runId.stringValue, "run-baru");
  });

  it("run gagal sebelumnya: takeover diizinkan berapa pun umurnya", async () => {
    const store = new MockStore();
    store.seed("recheck-2026-11-18", { status: "failed", ageMs: 30_000 });
    const hasil = await acquire(store);
    assert.equal(hasil.acquired, true);
    assert.equal(hasil.tookOver, true);
  });

  it("kunci running basi (> TTL): takeover via CAS", async () => {
    const store = new MockStore();
    store.seed("recheck-2026-11-18", {
      status: "running",
      ageMs: LOCK_TTL_MS + 60_000,
    });
    const hasil = await acquire(store);
    assert.equal(hasil.acquired, true);
    assert.equal(hasil.tookOver, true);
    const doc = store.docs.get("recheck-2026-11-18");
    assert.equal(doc.fields.runId.stringValue, "run-baru");
    assert.equal(doc.fields.status.stringValue, "running");
  });

  it("BALAPAN TAKEOVER: dua pengambil alih kunci basi, satu menang (412)", async () => {
    const store = new MockStore();
    store.seed("recheck-2026-11-18", {
      status: "running",
      ageMs: LOCK_TTL_MS + 60_000,
    });
    const [a, b] = await Promise.all([
      acquire(store, { runId: "takeover-1" }),
      acquire(store, { runId: "takeover-2" }),
    ]);
    const menang = [a, b].filter((r) => r.acquired);
    const kalah = [a, b].filter((r) => !r.acquired);
    assert.equal(menang.length, 1);
    assert.equal(kalah.length, 1);
    assert.equal(kalah[0].reason, "running");
  });

  it("prasyarat ditolak (PATCH 400): fallback hapus-lalu-buat berhasil", async () => {
    const store = new MockStore();
    store.seed("recheck-2026-11-18", {
      status: "running",
      ageMs: LOCK_TTL_MS + 60_000,
    });
    store.patchShouldFail = 400;
    const hasil = await acquire(store);
    assert.equal(hasil.acquired, true);
    assert.equal(hasil.tookOver, true);
    const doc = store.docs.get("recheck-2026-11-18");
    assert.equal(doc.fields.runId.stringValue, "run-baru");
  });

  it("dokumen lenyap antara 409 dan baca: coba buat lagi, berhasil", async () => {
    const store = new MockStore();
    store.seed("recheck-2026-11-18", { status: "running", ageMs: 1000 });
    /* GET pertama 404 (dokumen "lenyap"), create berikut sukses. */
    let getCount = 0;
    const fetchAsli = store.fetch;
    store.fetch = async (url, options = {}) => {
      const method = (options.method || "GET").toUpperCase();
      if (method === "GET" && String(url).includes("/cron-locks/")) {
        getCount += 1;
        if (getCount === 1) {
          store.docs.delete("recheck-2026-11-18");
          return store.response(404, {});
        }
      }
      return fetchAsli(url, options);
    };
    const hasil = await acquire(store);
    assert.equal(hasil.acquired, true);
  });

  it("create gagal 500: melempar (fail-closed)", async () => {
    const store = new MockStore();
    store.createShouldFail = 500;
    await assert.rejects(() => acquire(store), /HTTP 500/);
  });

  it("baca kunci gagal 500: melempar (fail-closed)", async () => {
    const store = new MockStore();
    store.seed("recheck-2026-11-18", { status: "running", ageMs: 1000 });
    store.getShouldFail = 500;
    await assert.rejects(() => acquire(store), /HTTP 500/);
  });

  it("hapus fallback gagal: melempar (fail-closed)", async () => {
    const store = new MockStore();
    store.seed("recheck-2026-11-18", {
      status: "running",
      ageMs: LOCK_TTL_MS + 60_000,
    });
    store.patchShouldFail = 400;
    store.deleteShouldFail = 500;
    await assert.rejects(() => acquire(store), /HTTP 500/);
  });
});

describe("releaseCronLock", () => {
  it("menandai done + finishedAt", async () => {
    const store = new MockStore();
    const kunci = await acquire(store);
    await releaseCronLock({
      fsBase: FS_BASE,
      token: TOKEN,
      job: "recheck",
      date: "2026-11-18",
      status: "done",
      updateTime: kunci.updateTime,
      fetchImpl: store.fetch,
      nowMs: NOW + 45_000,
    });
    const doc = store.docs.get("recheck-2026-11-18");
    assert.equal(doc.fields.status.stringValue, "done");
    assert.equal(doc.fields.finishedAt.stringValue, iso(NOW + 45_000));
  });

  it("updateTime kedaluwarsa (sudah diambil alih): 412 diabaikan, tidak melempar", async () => {
    const store = new MockStore();
    await acquire(store);
    await releaseCronLock({
      fsBase: FS_BASE,
      token: TOKEN,
      job: "recheck",
      date: "2026-11-18",
      status: "done",
      updateTime: "2026-01-01T00:00:00.000Z",
      fetchImpl: store.fetch,
      nowMs: NOW,
    });
    /* Status tetap running (milik run lain), tidak ditimpa. */
    const doc = store.docs.get("recheck-2026-11-18");
    assert.equal(doc.fields.status.stringValue, "running");
  });

  it("jaringan gagal saat lepas: tidak melempar (best-effort)", async () => {
    const store = new MockStore();
    await acquire(store);
    const fetchGagal = async () => {
      throw new Error("jaringan mati");
    };
    await releaseCronLock({
      fsBase: FS_BASE,
      token: TOKEN,
      job: "recheck",
      date: "2026-11-18",
      status: "done",
      fetchImpl: fetchGagal,
      nowMs: NOW,
    });
  });

  it("kunci sudah tidak ada: 404 diabaikan, tidak melempar", async () => {
    const store = new MockStore();
    await releaseCronLock({
      fsBase: FS_BASE,
      token: TOKEN,
      job: "recheck",
      date: "2026-11-18",
      status: "done",
      fetchImpl: store.fetch,
      nowMs: NOW,
    });
  });
});
