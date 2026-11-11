import { test } from "node:test";
import assert from "node:assert/strict";
import { createCooldown } from "./cooldown.js";

test("jeda tidak aktif sebelum pernah gagal", () => {
  const c = createCooldown(30_000, () => 1_000);
  assert.equal(c.active(), false);
});

test("jeda aktif selama ms lalu berakhir sendiri", () => {
  let now = 1_000;
  const c = createCooldown(30_000, () => now);
  c.trip();
  now = 30_999;
  assert.equal(c.active(), true);
  now = 31_000;
  assert.equal(c.active(), false);
});

test("reset mengakhiri jeda lebih awal dan trip bisa dimulai lagi", () => {
  let now = 0;
  const c = createCooldown(10, () => now);
  c.trip();
  assert.equal(c.active(), true);
  c.reset();
  assert.equal(c.active(), false);
  now = 100;
  c.trip();
  assert.equal(c.active(), true);
});
