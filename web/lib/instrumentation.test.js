/* Tes regresi instrumentation.js (P-06, K3): onRequestError WAJIB
 * berupa penugasan Sentry.captureRequestError — BUKAN re-ekspor nama
 * (`export { onRequestError } from "@sentry/nextjs"`), karena nama
 * itu tidak diekspor paket @sentry/nextjs v11 dan mematahkan build
 * Turbopack (deployment Vercel 18 Nov 2026 gagal total karenanya).
 * Dijalankan dengan: node --test lib/instrumentation.test.js */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as Sentry from "@sentry/nextjs";
import { onRequestError, register } from "../instrumentation.js";

describe("instrumentation.js", () => {
  it("onRequestError adalah Sentry.captureRequestError", () => {
    assert.equal(typeof onRequestError, "function");
    assert.equal(onRequestError, Sentry.captureRequestError);
  });

  it("register adalah fungsi", () => {
    assert.equal(typeof register, "function");
  });
});
