/* Tes unit untuk scripts/export-health-history.mjs (P-06, K8),
 * memakai test runner bawaan Node. Dijalankan dengan:
 * node --test scripts/export-health-history.test.js
 * Yang dites: uraian argumen, penyusun markdown (termasuk
 * penyamaran email), dan jalan end-to-end run() dengan fetch
 * tiruan + direktori keluaran sementara. Tidak ada panggilan
 * jaringan nyata dan tidak ada tulis ke repo. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildHistoryMarkdown,
  parseArgs,
  run,
  scrubForPublic,
  wibDateString,
} from "./export-health-history.mjs";

const BASE =
  "https://mock.invalid/v1/projects/karir-9d53a/databases/(default)/documents";
const NOW = new Date("2026-11-18T20:00:00.000Z"); /* 19 Nov 03:00 WIB */

function response({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const HEALTH_OK = {
  ok: true,
  degraded: false,
  source: "live",
  rev: "abc123",
  seedDate: "2026-11-17",
  readsEstimate: 1200,
  quotaPercent: 2.4,
  liveAsOf: "2026-11-18T10:00:00.000Z",
  lastMarkerCheck: "2026-11-18T10:00:00.000Z",
  lastCronRun: { date: "2026-11-18", status: "ok", trigger: "github-actions" },
  seedModeMinutes: 0,
  cacheAgeMs: 5000,
  cacheWarm: true,
  rateLimitDegraded: false,
  uptimeMs: 3600000,
};

function incidentRow({ code, count, firstSeen, lastSeen, message }) {
  return {
    document: {
      name: `${BASE}/incidents/${code}-2026-11-18-10`,
      fields: {
        code: { stringValue: code },
        count: { integerValue: String(count) },
        firstSeen: { stringValue: firstSeen },
        lastSeen: { stringValue: lastSeen },
        message: { stringValue: message },
      },
    },
  };
}

function recheckDoc({ status, error } = {}) {
  const fields = {
    status: { stringValue: status || "ok" },
    finishedAt: { stringValue: "2026-11-18T01:05:00.000Z" },
  };
  if (error !== undefined) fields.error = { stringValue: error };
  return { name: `${BASE}/cron-runs/recheck-2026-11-18`, fields };
}

function watcherDoc() {
  return {
    name: `${BASE}/meta/watcher`,
    fields: {
      lastRunAt: { stringValue: "2026-11-18T18:30:00.000Z" },
      lastRunOk: { booleanValue: true },
      alarmsSent: { integerValue: "2" },
    },
  };
}

describe("parseArgs", () => {
  it("bawaan: semua null kecuali help false", () => {
    assert.deepEqual(parseArgs([]), {
      date: null,
      outDir: null,
      baseUrl: null,
      help: false,
    });
  });

  it("menerima --date/--out-dir/--base-url", () => {
    const args = parseArgs([
      "--date",
      "2026-11-18",
      "--out-dir",
      "/tmp/x",
      "--base-url",
      "https://contoh.invalid/",
    ]);
    assert.equal(args.date, "2026-11-18");
    assert.equal(args.outDir, "/tmp/x");
    assert.equal(args.baseUrl, "https://contoh.invalid/");
  });

  it("menolak argumen tidak valid", () => {
    assert.throws(() => parseArgs(["--date", "18-11-2026"]), /YYYY-MM-DD/);
    assert.throws(() => parseArgs(["--out-dir"]), /direktori/);
    assert.throws(() => parseArgs(["--tidak-ada"]), /tidak dikenal/);
  });
});

describe("wibDateString", () => {
  it("menggeser UTC +7 jam", () => {
    /* 2026-11-18 20:00 UTC = 19 Nov 03:00 WIB. */
    assert.equal(wibDateString(NOW), "2026-11-19");
    assert.equal(
      wibDateString(new Date("2026-11-18T16:59:59.999Z")),
      "2026-11-18",
    );
  });
});

describe("scrubForPublic", () => {
  it("menyamarkan email, membiarkan teks lain", () => {
    assert.equal(
      scrubForPublic("hubungi admin@contoh.id soal gagal"),
      "hubungi [email] soal gagal",
    );
    assert.equal(scrubForPublic("tanpa email"), "tanpa email");
    assert.equal(scrubForPublic(null), "");
  });
});

describe("buildHistoryMarkdown", () => {
  it("menyusun snapshot sehat + insiden + heartbeat", () => {
    const md = buildHistoryMarkdown({
      date: "2026-11-18",
      health: HEALTH_OK,
      healthError: null,
      incidents: [
        {
          code: "MARKER_READ_FAILED",
          count: 3,
          firstSeen: "2026-11-18T01:00:00.000Z",
          lastSeen: "2026-11-18T01:30:00.000Z",
          message: "Gagal membaca marker.",
        },
      ],
      incidentsError: null,
      heartbeats: {
        "cron-runs/recheck-2026-11-18": { status: "ok", note: "selesai" },
      },
      firestoreUnavailable: false,
    });
    assert.match(md, /^# Riwayat kesehatan — 2026-11-18/m);
    assert.match(md, /Status: \*\*SEHAT\*\* \(sumber: live\)/);
    assert.match(md, /1200 \(2\.4% kuota harian\)/);
    assert.match(md, /\| MARKER_READ_FAILED \| 3 \|/);
    assert.match(md, /\| cron-runs\/recheck-2026-11-18 \| ok \|/);
  });

  it("menyamarkan email di pesan insiden dan error heartbeat", () => {
    const md = buildHistoryMarkdown({
      date: "2026-11-18",
      health: HEALTH_OK,
      healthError: null,
      incidents: [
        {
          code: "API_ROUTE_ERROR",
          count: 1,
          firstSeen: "2026-11-18T01:00:00.000Z",
          lastSeen: "2026-11-18T01:00:00.000Z",
          message: "gagal untuk pemilik@contoh.id",
        },
      ],
      incidentsError: null,
      heartbeats: {},
      firestoreUnavailable: false,
    });
    assert.doesNotMatch(md, /pemilik@contoh\.id/);
    assert.match(md, /\[email\]/);
  });

  it("menangani kegagalan health dan Firestore tanpa crash", () => {
    const md = buildHistoryMarkdown({
      date: "2026-11-18",
      health: null,
      healthError: "HTTP 500",
      incidents: null,
      incidentsError: "HTTP 429",
      heartbeats: {},
      firestoreUnavailable: false,
    });
    assert.match(md, /Tidak bisa diambil:.*HTTP 500/);
    assert.match(md, /Gagal dibaca:.*HTTP 429/);
  });

  it("menandai data Firestore tidak tersedia", () => {
    const md = buildHistoryMarkdown({
      date: "2026-11-18",
      health: HEALTH_OK,
      healthError: null,
      incidents: null,
      incidentsError: null,
      heartbeats: {},
      firestoreUnavailable: true,
    });
    assert.match(md, /Data Firestore tidak tersedia/);
  });
});

describe("run", () => {
  async function withTempDir(fn) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "health-history-"));
    try {
      await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  function fetchImplFor({ health = HEALTH_OK, incidents = [], recheck = null } = {}) {
    return async (url) => {
      const u = String(url);
      if (u.endsWith("/api/health")) return response({ body: health });
      if (u.endsWith(":runQuery")) return response({ body: incidents });
      if (u.includes("/cron-runs/recheck-")) {
        return recheck
          ? response({ body: recheckDoc(recheck) })
          : response({ ok: false, status: 404, body: {} });
      }
      if (u.includes("/cron-runs/digest-")) {
        return response({ ok: false, status: 404, body: {} });
      }
      if (u.includes("/meta/watcher")) {
        return response({ body: watcherDoc() });
      }
      throw new Error(`URL tidak terduga: ${u}`);
    };
  }

  const envWithToken = {
    FIRESTORE_BASE: BASE,
    FIRESTORE_ACCESS_TOKEN: "token-uji",
  };

  it("menulis file lengkap dan keluar 0", async () => {
    await withTempDir(async (dir) => {
      const code = await run(
        ["--date", "2026-11-18", "--out-dir", dir],
        {
          env: envWithToken,
          fetchImpl: fetchImplFor({
            incidents: [
              incidentRow({
                code: "QUOTA_ALERT_FAILED",
                count: 2,
                firstSeen: "2026-11-18T01:00:00.000Z",
                lastSeen: "2026-11-18T01:10:00.000Z",
                message: "Alert kuota gagal.",
              }),
            ],
            recheck: { status: "ok" },
          }),
          now: NOW,
        },
      );
      assert.equal(code, 0);
      const md = await readFile(path.join(dir, "2026-11-18.md"), "utf8");
      assert.match(md, /Status: \*\*SEHAT\*\*/);
      assert.match(md, /\| QUOTA_ALERT_FAILED \| 2 \|/);
      assert.match(md, /\| meta\/watcher \| ok \|/);
      assert.match(md, /alarm terkirim 2/);
    });
  });

  it("tanpa kredensial Firestore tetap menulis file health-only", async () => {
    await withTempDir(async (dir) => {
      const code = await run(["--date", "2026-11-18", "--out-dir", dir], {
        env: {},
        fetchImpl: fetchImplFor(),
        now: NOW,
      });
      assert.equal(code, 0);
      const md = await readFile(path.join(dir, "2026-11-18.md"), "utf8");
      assert.match(md, /Data Firestore tidak tersedia/);
    });
  });

  it("health gagal: file kegagalan ditulis, keluar 1", async () => {
    await withTempDir(async (dir) => {
      const fetchImpl = async (url) => {
        if (String(url).endsWith("/api/health")) {
          return response({ ok: false, status: 500, body: {} });
        }
        return response({ ok: false, status: 404, body: {} });
      };
      const code = await run(["--date", "2026-11-18", "--out-dir", dir], {
        env: envWithToken,
        fetchImpl,
        now: NOW,
      });
      assert.equal(code, 1);
      const md = await readFile(path.join(dir, "2026-11-18.md"), "utf8");
      assert.match(md, /Tidak bisa diambil:.*HTTP 500/);
    });
  });

  it("heartbeat 404/500 + watcher gagal dicatat di file", async () => {
    await withTempDir(async (dir) => {
      const fetchImpl = async (url) => {
        const u = String(url);
        if (u.endsWith("/api/health")) return response({ body: HEALTH_OK });
        if (u.endsWith(":runQuery")) return response({ body: [] });
        if (u.includes("/cron-runs/recheck-")) {
          return response({ ok: false, status: 404, body: {} });
        }
        if (u.includes("/cron-runs/digest-")) {
          return response({ ok: false, status: 500, body: {} });
        }
        if (u.includes("/meta/watcher")) {
          return response({
            body: {
              name: `${BASE}/meta/watcher`,
              fields: {
                lastRunAt: { stringValue: "2026-11-18T18:30:00.000Z" },
                lastRunOk: { booleanValue: false },
                alarmsSent: { integerValue: "1" },
              },
            },
          });
        }
        throw new Error(`URL tidak terduga: ${u}`);
      };
      const code = await run(["--date", "2026-11-18", "--out-dir", dir], {
        env: envWithToken,
        fetchImpl,
        now: NOW,
      });
      assert.equal(code, 0);
      const md = await readFile(path.join(dir, "2026-11-18.md"), "utf8");
      assert.match(md, /\| cron-runs\/recheck-2026-11-18 \| tidak-ada \|/);
      assert.match(md, /\| cron-runs\/digest-2026-11-18 \| gagal-baca \|/);
      assert.match(md, /\| meta\/watcher \| gagal \|/);
      assert.match(md, /alarm terkirim 1/);
    });
  });

  it("baca insiden gagal: kegagalan dicatat di file, tetap keluar 0", async () => {
    await withTempDir(async (dir) => {
      const fetchImpl = async (url) => {
        const u = String(url);
        if (u.endsWith("/api/health")) return response({ body: HEALTH_OK });
        if (u.endsWith(":runQuery")) {
          return response({ ok: false, status: 429, body: {} });
        }
        return response({ ok: false, status: 404, body: {} });
      };
      const code = await run(["--date", "2026-11-18", "--out-dir", dir], {
        env: envWithToken,
        fetchImpl,
        now: NOW,
      });
      assert.equal(code, 0);
      const md = await readFile(path.join(dir, "2026-11-18.md"), "utf8");
      assert.match(md, /Gagal dibaca:.*HTTP 429/);
    });
  });

  it("fetch insiden melempar: kegagalan dicatat, tetap keluar 0", async () => {
    await withTempDir(async (dir) => {
      const fetchImpl = async (url) => {
        const u = String(url);
        if (u.endsWith("/api/health")) return response({ body: HEALTH_OK });
        if (u.endsWith(":runQuery")) {
          throw new Error("jaringan putus");
        }
        return response({ ok: false, status: 404, body: {} });
      };
      const code = await run(["--date", "2026-11-18", "--out-dir", dir], {
        env: envWithToken,
        fetchImpl,
        now: NOW,
      });
      assert.equal(code, 0);
      const md = await readFile(path.join(dir, "2026-11-18.md"), "utf8");
      assert.match(md, /Gagal dibaca:.*jaringan putus/);
    });
  });

  it("argumen tidak valid keluar 2", async () => {
    const code = await run(["--date", "salah"], {
      env: envWithToken,
      fetchImpl: fetchImplFor(),
      now: NOW,
    });
    assert.equal(code, 2);
  });

  it("--help keluar 0", async () => {
    const code = await run(["--help"], {
      env: {},
      fetchImpl: fetchImplFor(),
      now: NOW,
    });
    assert.equal(code, 0);
  });
});
