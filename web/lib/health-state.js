/* Keadaan modul untuk endpoint /api/health (P-06, K8): ringkasan
 * run cron terakhir yang dicatat instance INI (best-effort — tiap
 * instance serverless punya salinannya sendiri; sumber kebenaran
 * run cron tetap dokumen heartbeat cron-runs yang dibaca watcher).
 * Route recheck memanggil noteCronRun() sesudah menulis heartbeat;
 * route health membaca getLastCronRun() tanpa baca Firestore
 * (endpoint health WAJIB 0 baca per panggilan). */

let lastCronRun = null;
let bootAt = Date.now();

/* Catat ringkasan run cron ({ date, status, trigger, finishedAt }).
 * Nilai yang bukan objek diabaikan. */
export function noteCronRun(record) {
  if (!record || typeof record !== "object") return;
  lastCronRun = {
    date: typeof record.date === "string" ? record.date : "",
    status: typeof record.status === "string" ? record.status : "",
    trigger: typeof record.trigger === "string" ? record.trigger : "",
    finishedAt:
      typeof record.finishedAt === "string" ? record.finishedAt : "",
  };
}

export function getLastCronRun() {
  return lastCronRun ? { ...lastCronRun } : null;
}

export function getUptimeMs(nowMs = Date.now()) {
  return Math.max(0, nowMs - bootAt);
}

export function resetHealthStateForTests() {
  lastCronRun = null;
  bootAt = Date.now();
}
