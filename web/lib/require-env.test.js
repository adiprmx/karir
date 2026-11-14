/* Tes unit untuk lib/require-env.js, memakai test runner bawaan Node.
 * Dijalankan dengan: node --test lib/require-env.test.js
 * Yang dites: nilai ada dikembalikan, nilai kosong/tidak ada melempar,
 * dan pesan error tidak pernah mengandung nilai variabel. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requireEnv } from "./require-env.js";

describe("requireEnv", () => {
  it("mengembalikan nilai bila variabel ada dan tidak kosong", () => {
    const env = { API_TOKEN_SECRET: "nilai-uji-bukan-rahasia" };
    assert.equal(requireEnv("API_TOKEN_SECRET", env), "nilai-uji-bukan-rahasia");
  });

  it("melempar bila variabel tidak ada", () => {
    assert.throws(() => requireEnv("API_TOKEN_SECRET", {}), /API_TOKEN_SECRET/);
  });

  it("melempar bila variabel berupa string kosong", () => {
    assert.throws(
      () => requireEnv("CRON_SECRET", { CRON_SECRET: "" }),
      /CRON_SECRET/,
    );
  });

  it("melempar bila variabel hanya berisi spasi", () => {
    assert.throws(
      () => requireEnv("ANALYTICS_SALT", { ANALYTICS_SALT: "   " }),
      /ANALYTICS_SALT/,
    );
  });

  it("pesan error menyebut nama variabel, bukan nilainya", () => {
    const env = { LAIN: "nilai-lain-yang-harus-tidak-bocor" };
    assert.throws(
      () => requireEnv("API_TOKEN_SECRET", env),
      (err) => {
        assert.match(err.message, /API_TOKEN_SECRET/);
        assert.equal(err.message.includes("nilai-lain-yang-harus-tidak-bocor"), false);
        return true;
      },
    );
  });

  it("pesan error berbunyi jelas", () => {
    assert.throws(
      () => requireEnv("CRON_SECRET", {}),
      /Variabel CRON_SECRET belum dipasang/,
    );
  });

  it("memakai process.env bila parameter env tidak diberikan", () => {
    const lama = process.env.KARIR_UJI_REQUIRE_ENV;
    process.env.KARIR_UJI_REQUIRE_ENV = "dari-process-env";
    try {
      assert.equal(requireEnv("KARIR_UJI_REQUIRE_ENV"), "dari-process-env");
    } finally {
      if (lama === undefined) delete process.env.KARIR_UJI_REQUIRE_ENV;
      else process.env.KARIR_UJI_REQUIRE_ENV = lama;
    }
  });

  it("melempar bila env tidak diberikan dan process.env kosong", () => {
    const lama = process.env.KARIR_UJI_REQUIRE_ENV_HILANG;
    delete process.env.KARIR_UJI_REQUIRE_ENV_HILANG;
    try {
      assert.throws(
        () => requireEnv("KARIR_UJI_REQUIRE_ENV_HILANG"),
        /KARIR_UJI_REQUIRE_ENV_HILANG/,
      );
    } finally {
      if (lama !== undefined) {
        process.env.KARIR_UJI_REQUIRE_ENV_HILANG = lama;
      }
    }
  });
});
