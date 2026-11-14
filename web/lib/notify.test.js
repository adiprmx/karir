/* Tes unit untuk lib/notify.js, memakai test runner bawaan Node.
 * Dijalankan dengan: node --test lib/notify.test.js
 * Meniru perilaku nyata yang dipakai cron: parse tanggal dari catatan,
 * jendela 48 jam untuk chip "Baru", id alert deterministik, jendela
 * batas lamar 0-3 hari, pesan gabungan, dan kirim Telegram yang tidak
 * pernah melempar (timeout dan HTTP gagal dikembalikan sebagai
 * {ok:false}, bukan exception). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseBatasLamar,
  formatTanggalId,
  daysUntil,
  isNewChange,
  newTargetAlertId,
  deadlineAlertId,
  collectNewTargetAlerts,
  collectDeadlineAlerts,
  formatTelegramMessage,
  sendTelegramMessage,
  QUOTA_DAILY_LIMIT,
  QUOTA_ALERT_READS,
  quotaAlertId,
  quotaPercent,
  formatQuotaAlertMessage,
} from "./notify.js";

function target(overrides = {}) {
  return {
    no: 299,
    perusahaan: "Angkasa Pura Supports",
    posisi: "CLEANING SERVICE",
    link_karir: "https://contoh.test/karir",
    status: "Ada lowongan",
    batas_lamar: "",
    ...overrides,
  };
}

describe("parseBatasLamar", () => {
  it("format tanggal dari catatan yang sudah ada", () => {
    assert.equal(parseBatasLamar("31 Des 2026"), "2026-12-31");
    assert.equal(parseBatasLamar("10 November 2026"), "2026-11-10");
    assert.equal(parseBatasLamar("06/11/2026"), "2026-11-06");
    assert.equal(parseBatasLamar("2026-11-10"), "2026-11-10");
  });

  it("menolak tanggal yang tidak bisa diparse tanpa ragu", () => {
    assert.equal(parseBatasLamar(""), null);
    assert.equal(parseBatasLamar(null), null);
    assert.equal(parseBatasLamar("segera"), null);
    assert.equal(parseBatasLamar("31 Feb 2026"), null);
    assert.equal(parseBatasLamar("32/11/2026"), null);
    assert.equal(parseBatasLamar("10 Foo 2026"), null);
    assert.equal(parseBatasLamar("2026-13-01"), null);
    assert.equal(parseBatasLamar("batas 10 Nov 2026"), null);
  });
});

describe("formatTanggalId", () => {
  it("ISO menjadi tanggal Indonesia singkat", () => {
    assert.equal(formatTanggalId("2026-11-10"), "10 Nov 2026");
    assert.equal(formatTanggalId("2026-12-31"), "31 Des 2026");
    assert.equal(formatTanggalId("bukan tanggal"), "bukan tanggal");
  });
});

describe("daysUntil", () => {
  it("selisih hari kalender", () => {
    assert.equal(daysUntil("2026-11-10", "2026-11-08"), 2);
    assert.equal(daysUntil("2026-11-08", "2026-11-08"), 0);
    assert.equal(daysUntil("2026-11-07", "2026-11-08"), -1);
    assert.equal(daysUntil("bukan tanggal", "2026-11-08"), null);
  });
});

describe("isNewChange", () => {
  it("48 jam terakhir dihitung dari createdAt", () => {
    const now = Date.parse("2026-11-08T10:00:00Z");
    assert.equal(isNewChange("2026-11-08T09:00:00Z", now), true);
    assert.equal(isNewChange("2026-11-06T10:00:01Z", now), true);
    assert.equal(isNewChange("2026-11-06T09:59:59Z", now), false);
    assert.equal(isNewChange("2026-11-09T10:00:00Z", now), false);
    assert.equal(isNewChange("", now), false);
    assert.equal(isNewChange("bukan tanggal", now), false);
  });
});

describe("id alert deterministik", () => {
  it("satu kejadian selalu menghasilkan id yang sama", () => {
    assert.equal(newTargetAlertId(299, "2026-11-08"), "new-target-299-2026-11-08");
    assert.equal(
      newTargetAlertId(299, "2026-11-08"),
      newTargetAlertId(299, "2026-11-08"),
    );
    assert.equal(
      deadlineAlertId(299, "2026-11-10"),
      "deadline-299-2026-11-10",
    );
    assert.notEqual(
      deadlineAlertId(299, "2026-11-10"),
      deadlineAlertId(299, "2026-11-18"),
    );
  });
});

describe("collectNewTargetAlerts", () => {
  it("hanya nomor yang belum ada di snapshot", () => {
    const alerts = collectNewTargetAlerts(
      [100, 299],
      [target({ no: 100 }), target({ no: 299 }), target({ no: 383 })],
      "2026-11-08",
    );
    assert.deepEqual(
      alerts.map((a) => a.id),
      ["new-target-383-2026-11-08"],
    );
    assert.equal(alerts[0].type, "new-target");
    assert.equal(alerts[0].perusahaan, "Angkasa Pura Supports");
  });

  it("snapshot kosong di run pertama tidak langsung dianggap baru oleh pemanggil (ditangani di route)", () => {
    const alerts = collectNewTargetAlerts(
      [],
      [target({ no: 299 })],
      "2026-11-08",
    );
    assert.equal(alerts.length, 1);
  });
});

describe("collectDeadlineAlerts", () => {
  it("jendela 0-3 hari, batas inklusif", () => {
    const alerts = collectDeadlineAlerts(
      [
        target({ no: 1, batas_lamar: "2026-11-08" }),
        target({ no: 2, batas_lamar: "2026-11-11" }),
        target({ no: 3, batas_lamar: "2026-11-12" }),
        target({ no: 4, batas_lamar: "2026-11-07" }),
        target({ no: 5, batas_lamar: "" }),
        target({ no: 6 }),
      ],
      "2026-11-08",
    );
    assert.deepEqual(
      alerts.map((a) => a.companyNo),
      [1, 2],
    );
    assert.deepEqual(
      alerts.map((a) => a.daysLeft),
      [0, 3],
    );
    assert.equal(alerts[0].id, "deadline-1-2026-11-08");
  });
});

describe("formatTelegramMessage", () => {
  it("pesan gabungan memuat nama, posisi, batas, dan tautan", () => {
    const msg = formatTelegramMessage(
      [
        {
          type: "new-target",
          perusahaan: "Angkasa Pura Supports",
          posisi: "CLEANING SERVICE",
          link: "https://contoh.test/karir",
        },
        {
          type: "deadline",
          perusahaan: "Angkasa Pura Supports",
          posisi: "CLEANING SERVICE",
          link: "https://contoh.test/karir",
          batasLamar: "2026-11-10",
          daysLeft: 2,
        },
      ],
      "2026-11-08",
    );
    assert.match(msg, /Angkasa Pura Supports/);
    assert.match(msg, /CLEANING SERVICE/);
    assert.match(msg, /10 Nov 2026/);
    assert.match(msg, /2 hari lagi/);
    assert.match(msg, /https:\/\/contoh\.test\/karir/);
    assert.match(msg, /karir-adiprmx\.vercel\.app/);
  });

  it("daftar kosong menghasilkan string kosong", () => {
    assert.equal(formatTelegramMessage([], "2026-11-08"), "");
  });

  it("batas hari ini ditulis 'hari ini'", () => {
    const msg = formatTelegramMessage(
      [
        {
          type: "deadline",
          perusahaan: "PT Contoh",
          posisi: "",
          link: "",
          batasLamar: "2026-11-08",
          daysLeft: 0,
        },
      ],
      "2026-11-08",
    );
    assert.match(msg, /hari ini/);
  });
});

describe("sendTelegramMessage", () => {
  it("sukses mengembalikan ok true dan memanggil endpoint yang benar", async () => {
    let seenUrl = "";
    let seenBody = null;
    const fakeFetch = async (url, options) => {
      seenUrl = url;
      seenBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ ok: true }) };
    };
    const res = await sendTelegramMessage({
      token: "TOKEN-UJI",
      chatId: "2028330429",
      text: "uji",
      fetchImpl: fakeFetch,
    });
    assert.deepEqual(res, { ok: true });
    assert.equal(
      seenUrl,
      "https://api.telegram.org/botTOKEN-UJI/sendMessage",
    );
    assert.equal(seenBody.chat_id, "2028330429");
    assert.equal(seenBody.text, "uji");
  });

  it("HTTP gagal tidak melempar", async () => {
    const fakeFetch = async () => ({ ok: false, status: 403 });
    const res = await sendTelegramMessage({
      token: "TOKEN-UJI",
      text: "uji",
      fetchImpl: fakeFetch,
    });
    assert.deepEqual(res, { ok: false, error: "HTTP 403" });
  });

  it("timeout tidak melempar", async () => {
    const fakeFetch = async (_url, options) => {
      await new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("abort"), { name: "AbortError" })),
        );
      });
    };
    const res = await sendTelegramMessage({
      token: "TOKEN-UJI",
      text: "uji",
      fetchImpl: fakeFetch,
      timeoutMs: 10,
    });
    assert.deepEqual(res, { ok: false, error: "timeout" });
  });

  it("token atau teks kosong tidak memanggil fetch", async () => {
    let called = false;
    const fakeFetch = async () => {
      called = true;
      return { ok: true, json: async () => ({ ok: true }) };
    };
    const res = await sendTelegramMessage({
      token: "",
      text: "uji",
      fetchImpl: fakeFetch,
    });
    assert.equal(res.ok, false);
    assert.equal(called, false);
  });
});

describe("alert kuota baca (FIN-02)", () => {
  it("ambang alert 70% dari 50.000 baca harian", () => {
    assert.equal(QUOTA_DAILY_LIMIT, 50000);
    assert.equal(QUOTA_ALERT_READS, 35000);
  });

  it("id alert kuota deterministik per hari", () => {
    assert.equal(quotaAlertId("2026-11-15"), "quota-70-2026-11-15");
    assert.equal(quotaAlertId("2026-11-15"), quotaAlertId("2026-11-15"));
    assert.notEqual(quotaAlertId("2026-11-15"), quotaAlertId("2026-11-16"));
  });

  it("persen kuota dibulatkan", () => {
    assert.equal(quotaPercent(0), 0);
    assert.equal(quotaPercent(25000), 50);
    assert.equal(quotaPercent(35000), 70);
    assert.equal(quotaPercent(35002), 70);
    assert.equal(quotaPercent(50000), 100);
  });

  it("pesan alert kuota menyebut persen dan reset 15:00 WIB", () => {
    const msg = formatQuotaAlertMessage(35000, "2026-11-15");
    assert.match(msg, /70%/);
    assert.match(msg, /35\.000/);
    assert.match(msg, /15 Nov 2026/);
    assert.match(msg, /15:00 WIB/);
  });
});
