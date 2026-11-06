/* Lapisan baca umpan perubahan Karir — sumber: Firestore, koleksi
 * `changes` (proyek karir-9d53a). Dibaca lewat Firestore REST API
 * (fetch biasa), pola yang sama dengan lib/companies.js: SDK JS tidak
 * dipakai karena gRPC-nya tidak bisa menembus proxy egress VM ini.
 * Baca koleksi changes terbuka untuk siapa pun (lihat firestore.rules).
 * Dokumen perubahan bentuknya {companyNo, perusahaan, from, to,
 * checkedAt "YYYY-MM-DD", createdAt ISO}, ditulis cron cek ulang harian
 * (app/api/cron/recheck/route.js). */

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function fetchJson(url, timeoutMs = 5_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 60 },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function docToChange(d) {
  const f = d.fields || {};
  const s = (k) => (f[k] && f[k].stringValue != null ? f[k].stringValue : "");
  const name = (d.name || "").split("/").pop() || "";
  return {
    id: name,
    companyNo:
      f.companyNo && f.companyNo.integerValue != null
        ? Number(f.companyNo.integerValue)
        : 0,
    perusahaan: s("perusahaan"),
    from: s("from"),
    to: s("to"),
    checkedAt: s("checkedAt"),
    createdAt: s("createdAt"),
  };
}

/* Perubahan terbaru dulu (createdAt menurun). Bila Firestore tidak bisa
 * dijangkau, lempar supaya pemanggil bisa memutuskan sendiri (API
 * /api/changes mengembalikan daftar kosong, bukan error). */
export async function getChanges(limit = 10) {
  const n = Math.max(1, Math.min(50, Number(limit) || 10));
  const url =
    `${BASE}/changes?pageSize=${n}` +
    `&orderBy=${encodeURIComponent("createdAt desc")}&key=${API_KEY}`;
  const res = await fetchJson(url);
  if (!res.ok) {
    throw new Error(`Firestore list changes gagal: HTTP ${res.status}`);
  }
  const body = await res.json();
  const list = (body.documents || []).map(docToChange);
  /* Urutan cadangan di sisi server bila orderBy tidak diterapkan. */
  list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return list;
}
