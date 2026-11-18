/* Test koleksi incidents Firestore (P-06, K1/K4).
 * Dijalankan dengan: node --test lib/incidents.test.js
 * Semua fetch di-mock — tidak ada panggilan Firestore sungguhan. */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  INCIDENT_UPDATE_THROTTLE_MS,
  incidentDocId,
  incidentsSink,
  recordIncidentEvent,
  resetIncidentsForTests,
  wibDateHour,
} from "./incidents.js";

const PROJECT = "proyek-uji";
const API_KEY = "kunci-uji";

function mockResponse({ ok, status, body = {} }) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

describe("wibDateHour / incidentDocId", () => {
  it("WIB = UTC+7: 17:00 UTC menjadi 00:00 keesokan hari", () => {
    const { date, hour } = wibDateHour(Date.parse("2026-11-17T17:00:00Z"));
    assert.equal(date, "2026-11-18");
    assert.equal(hour, 0);
  });

  it("10:30 UTC menjadi 17:30 WIB di tanggal yang sama", () => {
    const { date, hour } = wibDateHour(Date.parse("2026-11-18T10:30:00Z"));
    assert.equal(date, "2026-11-18");
    assert.equal(hour, 17);
  });

  it("id dokumen memakai format KODE-TANGGAL-JAM dua digit", () => {
    assert.equal(
      incidentDocId("MARKER_READ_FAILED", "2026-11-18", 7),
      "MARKER_READ_FAILED-2026-11-18-07",
    );
  });
});

describe("recordIncidentEvent", () => {
  beforeEach(() => {
    resetIncidentsForTests();
  });

  it("kejadian pertama membuat dokumen dengan field lengkap", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url: String(url), options });
      return mockResponse({ ok: true, status: 200 });
    };
    const result = await recordIncidentEvent(
      {
        code: "MARKER_READ_FAILED",
        component: "companies",
        message: "baca marker gagal",
      },
      {
        fetchImpl,
        projectId: PROJECT,
        apiKey: API_KEY,
        nowMs: Date.parse("2026-11-18T10:00:00Z"),
      },
    );
    assert.equal(result, "created");
    assert.equal(calls.length, 1);
    assert.ok(
      calls[0].url.includes(
        "/incidents?documentId=MARKER_READ_FAILED-2026-11-18-17",
      ),
    );
    assert.equal(calls[0].options.method, "POST");
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.fields.code.stringValue, "MARKER_READ_FAILED");
    assert.equal(body.fields.count.integerValue, "1");
    assert.equal(body.fields.message.stringValue, "baca marker gagal");
    assert.equal(body.fields.source.stringValue, "companies");
  });

  it("kejadian kedua dalam jeda throttle dilewati tanpa fetch", async () => {
    let n = 0;
    const fetchImpl = async () => {
      n += 1;
      return mockResponse({ ok: true, status: 200 });
    };
    const opts = {
      fetchImpl,
      projectId: PROJECT,
      apiKey: API_KEY,
      nowMs: Date.parse("2026-11-18T10:00:00Z"),
    };
    assert.equal(
      await recordIncidentEvent({ code: "KODE_A", message: "a" }, opts),
      "created",
    );
    assert.equal(
      await recordIncidentEvent(
        { code: "KODE_A", message: "b" },
        { ...opts, nowMs: opts.nowMs + 60_000 },
      ),
      "skipped",
    );
    assert.equal(n, 1);
  });

  it("409 lalu pembaruan sesudah 15 menit menaikkan count", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      const u = String(url);
      calls.push({ url: u, method: options?.method || "GET" });
      if ((options?.method || "GET") === "POST") {
        return mockResponse({ ok: false, status: 409 });
      }
      if (u.includes("updateMask.fieldPaths=count")) {
        return mockResponse({ ok: true, status: 200 });
      }
      return mockResponse({
        ok: true,
        status: 200,
        body: { fields: { count: { integerValue: "4" } } },
      });
    };
    const base = Date.parse("2026-11-18T10:00:00Z");
    const opts = {
      fetchImpl,
      projectId: PROJECT,
      apiKey: API_KEY,
      nowMs: base,
    };
    /* Panggilan pertama: 409, lalu belum lewat throttle 15 menit
     * (lastUpdate kosong -> 0, selisih besar -> update jalan). */
    const first = await recordIncidentEvent(
      { code: "KODE_B", message: "a" },
      opts,
    );
    assert.equal(first, "updated");
    const patch = calls.find((c) => c.method === "PATCH");
    assert.ok(patch);
    const patchCall = calls[calls.indexOf(patch)];
    assert.ok(patchCall.url.includes("KODE_B-2026-11-18-17"));
    /* Panggilan kedua 5 menit kemudian: masih dalam throttle. */
    const second = await recordIncidentEvent(
      { code: "KODE_B", message: "b" },
      { ...opts, nowMs: base + 5 * 60 * 1000 },
    );
    assert.equal(second, "skipped");
    /* Panggilan ketiga sesudah 15 menit: update lagi. */
    const third = await recordIncidentEvent(
      { code: "KODE_B", message: "c" },
      {
        ...opts,
        nowMs: base + INCIDENT_UPDATE_THROTTLE_MS + 1000,
      },
    );
    assert.equal(third, "updated");
  });

  it("tanpa projectId/apiKey mengembalikan failed tanpa fetch", async () => {
    let n = 0;
    const fetchImpl = async () => {
      n += 1;
      return mockResponse({ ok: true, status: 200 });
    };
    assert.equal(
      await recordIncidentEvent(
        { code: "KODE_A", message: "a" },
        { fetchImpl, projectId: "", apiKey: API_KEY },
      ),
      "failed",
    );
    assert.equal(n, 0);
  });

  it("kode tidak valid ditolak tanpa fetch", async () => {
    let n = 0;
    const fetchImpl = async () => {
      n += 1;
      return mockResponse({ ok: true, status: 200 });
    };
    assert.equal(
      await recordIncidentEvent(
        { code: "kode-kecil", message: "a" },
        { fetchImpl, projectId: PROJECT, apiKey: API_KEY },
      ),
      "failed",
    );
    assert.equal(n, 0);
  });

  it("status selain 200/409 (mis. 403 rules belum terbit) = failed", async () => {
    const fetchImpl = async () =>
      mockResponse({ ok: false, status: 403 });
    assert.equal(
      await recordIncidentEvent(
        { code: "KODE_A", message: "a" },
        { fetchImpl, projectId: PROJECT, apiKey: API_KEY },
      ),
      "failed",
    );
  });

  it("fetch yang melempar = failed, bukan exception", async () => {
    const fetchImpl = async () => {
      throw new Error("jaringan mati");
    };
    assert.equal(
      await recordIncidentEvent(
        { code: "KODE_A", message: "a" },
        { fetchImpl, projectId: PROJECT, apiKey: API_KEY },
      ),
      "failed",
    );
  });

  it("pesan dibersihkan (email disamarkan) sebelum ditulis", async () => {
    let body = null;
    const fetchImpl = async (url, options) => {
      body = JSON.parse(options.body);
      return mockResponse({ ok: true, status: 200 });
    };
    await recordIncidentEvent(
      { code: "KODE_A", message: "hubungi admin@contoh.id" },
      { fetchImpl, projectId: PROJECT, apiKey: API_KEY },
    );
    assert.ok(
      !body.fields.message.stringValue.includes("admin@contoh.id"),
    );
  });

  it("incidentsSink tidak pernah melempar (fire-and-forget)", () => {
    assert.doesNotThrow(() =>
      incidentsSink({ code: "KODE_A", message: "a" }),
    );
  });
});
