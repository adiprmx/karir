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
  todayWib,
  daysUntil,
  isNewChange,
  newTargetAlertId,
  deadlineAlertId,
  collectNewTargetAlerts,
  collectDeadlineAlerts,
  formatTelegramMessage,
  sendTelegramMessage,
  splitTelegramMessage,
  markAlertsSent,
  buildCronRunRecord,
  TELEGRAM_MESSAGE_LIMIT,
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

describe("todayWib (regresi UTC, T11d)", () => {
  it("tanggal memakai WIB, bukan UTC", () => {
    /* 15 Nov 2026 00:30 WIB = 14 Nov 17:30 UTC: tanggal WIB-nya
     * 15 Nov, bukan 14 Nov. Bug UTC di daysUntil halaman detail
     * (fix WIB 15 Nov 00:15) membuat penanda meleset +1 hari pada
     * 00:00-07:00 WIB; jalur alert cron memakai todayWib yang sama
     * dan wajib tidak mengulanginya. */
    assert.equal(todayWib(new Date("2026-11-14T17:30:00Z")), "2026-11-15");
    assert.equal(todayWib(new Date("2026-11-14T16:30:00Z")), "2026-11-14");
    assert.equal(todayWib(new Date("2026-11-14T16:59:59Z")), "2026-11-14");
    assert.equal(todayWib(new Date("2026-11-14T17:00:00Z")), "2026-11-15");
  });

  it("alert deadline di 00:30 WIB hari tenggat menyebut 0 hari (bukan 1)", () => {
    /* Skenario nyata PMSol 15 Nov 2026: cron 01:00 WIB di hari
     * tenggat. Bila todayIso dihitung UTC (14 Nov), daysLeft jadi
     * 1 ("1 hari lagi") padahal batasnya hari ini. */
    const today = todayWib(new Date("2026-11-14T17:30:00Z"));
    assert.equal(today, "2026-11-15");
    const alerts = collectDeadlineAlerts(
      [target({ no: 568, batas_lamar: "2026-11-15" })],
      today,
    );
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].daysLeft, 0);
    const msg = formatTelegramMessage(alerts, today);
    assert.match(msg, /hari ini/);
    assert.doesNotMatch(msg, /1 hari lagi/);
  });
});

describe("splitTelegramMessage (NOTIF-08)", () => {
  it("teks pendek tidak dipecah", () => {
    assert.equal(TELEGRAM_MESSAGE_LIMIT, 4096);
    assert.deepEqual(splitTelegramMessage("halo"), ["halo"]);
    assert.deepEqual(splitTelegramMessage(""), []);
    assert.deepEqual(splitTelegramMessage("a".repeat(4096)), [
      "a".repeat(4096),
    ]);
  });

  it("pecah pada batas baris, tiap potongan <= 4096", () => {
    const lines = Array.from(
      { length: 200 },
      (_, i) => `• Perusahaan ${i} — lowongan baru.`,
    );
    const text = lines.join("\n");
    assert.ok(text.length > 4096);
    const chunks = splitTelegramMessage(text);
    assert.ok(chunks.length > 1);
    for (const chunk of chunks) {
      assert.ok(chunk.length <= 4096, `potongan ${chunk.length} karakter`);
      assert.ok(chunk.length > 0);
    }
    assert.equal(chunks.join("\n"), text);
  });

  it("baris tunggal yang terlalu panjang dipotong keras", () => {
    const text = `x${"y".repeat(5000)}`;
    const chunks = splitTelegramMessage(text);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].length, 4096);
    assert.equal(chunks.join(""), text);
  });
});

describe("sendTelegramMessage mengirim potongan berurutan (NOTIF-08)", () => {
  it("pesan panjang dikirim dalam beberapa panggilan", async () => {
    const seen = [];
    const fakeFetch = async (_url, options) => {
      seen.push(JSON.parse(options.body).text);
      return { ok: true, json: async () => ({ ok: true }) };
    };
    const lines = Array.from(
      { length: 200 },
      (_, i) => `• Perusahaan ${i} — lowongan baru.`,
    );
    const res = await sendTelegramMessage({
      token: "TOKEN-UJI",
      text: lines.join("\n"),
      fetchImpl: fakeFetch,
    });
    assert.deepEqual(res, { ok: true });
    assert.ok(seen.length > 1);
    for (const text of seen) assert.ok(text.length <= 4096);
    assert.equal(seen.join("\n"), lines.join("\n"));
  });

  it("potongan kedua gagal menghentikan pengiriman", async () => {
    let calls = 0;
    const fakeFetch = async () => {
      calls += 1;
      if (calls === 2) return { ok: false, status: 429 };
      return { ok: true, json: async () => ({ ok: true }) };
    };
    const res = await sendTelegramMessage({
      token: "TOKEN-UJI",
      text: `a${"b".repeat(9000)}`,
      fetchImpl: fakeFetch,
    });
    assert.deepEqual(res, { ok: false, error: "HTTP 429" });
    assert.equal(calls, 2);
  });
});

describe("markAlertsSent (NOTIF-01)", () => {
  it("menandai semua alert yang patch-nya berhasil", async () => {
    const patched = [];
    const res = await markAlertsSent(
      async (alert) => {
        patched.push(alert.id);
        return true;
      },
      [
        { id: "new-target-1-2026-11-15" },
        { id: "deadline-2-2026-11-18" },
      ],
    );
    assert.deepEqual(res.marked, [
      "new-target-1-2026-11-15",
      "deadline-2-2026-11-18",
    ]);
    assert.deepEqual(res.failed, []);
    assert.equal(patched.length, 2);
  });

  it("kegagalan patch dilaporkan per id, tanpa melempar", async () => {
    const res = await markAlertsSent(
      async (alert) => {
        if (alert.id === "gagal") throw new Error("putus");
        return alert.id !== "tolak";
      },
      [{ id: "ok" }, { id: "tolak" }, { id: "gagal" }],
    );
    assert.deepEqual(res.marked, ["ok"]);
    assert.deepEqual(res.failed.sort(), ["gagal", "tolak"]);
  });

  it("daftar kosong tidak memanggil patch", async () => {
    let calls = 0;
    const res = await markAlertsSent(
      async () => {
        calls += 1;
        return true;
      },
      [],
    );
    assert.deepEqual(res, { marked: [], failed: [] });
    assert.equal(calls, 0);
  });
});

describe("buildCronRunRecord (OPS-01)", () => {
  it("bentuk field Firestore lengkap untuk run sukses", () => {
    const record = buildCronRunRecord(
      {
        checked: 120,
        changed: 3,
        updated: 117,
        skipped: 173,
        openSkipped: 0,
        truncated: true,
        alerts: 2,
        alertsFailed: 0,
        telegram: "sent",
        telegramMarked: 2,
        markerBumped: true,
        queue: { urgent: 1, open: 237, dead: 55, total: 293 },
        alertPhaseTruncated: false,
        snapshotKnown: true,
        snapshotWritten: true,
      },
      {
        date: "2026-11-15",
        startedAt: Date.parse("2026-11-14T18:00:00Z"),
        finishedAt: Date.parse("2026-11-14T18:00:52Z"),
      },
    );
    assert.equal(record.date.stringValue, "2026-11-15");
    assert.equal(record.status.stringValue, "truncated");
    assert.equal(record.durationMs.integerValue, "52000");
    assert.equal(record.checked.integerValue, "120");
    assert.equal(record.openSkipped.integerValue, "0");
    assert.equal(record.telegram.stringValue, "sent");
    assert.equal(record.telegramMarked.integerValue, "2");
    assert.equal(record.markerBumped.booleanValue, true);
    assert.equal(record.queueTotal.integerValue, "293");
    assert.equal(record.queueUrgent.integerValue, "1");
    assert.equal(record.snapshotWritten.booleanValue, true);
  });

  it("run tanpa pemotongan berstatus ok dan nilai hilang jadi nol", () => {
    const record = buildCronRunRecord(
      { truncated: false },
      {
        date: "2026-11-15",
        startedAt: 1000,
        finishedAt: 2000,
      },
    );
    assert.equal(record.status.stringValue, "ok");
    assert.equal(record.checked.integerValue, "0");
    assert.equal(record.queueTotal.integerValue, "0");
    assert.equal(record.durationMs.integerValue, "1000");
  });
});
