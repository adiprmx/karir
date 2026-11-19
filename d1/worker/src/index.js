/* Worker API "karir-data" — baca katalog Karir dari D1 (P-08, H1).
 *
 * Binding: env.DB (D1, lihat wrangler.toml). Worker ini TIPIS:
 * kueri D1 adalah I/O dan tidak memakan jatah CPU 10 ms Workers
 * Free; tidak ada komputasi berat di sini.
 *
 * Endpoint (semua GET bersifat publik — data katalog adalah data
 * publik, sama seperti /api/companies di Vercel hari ini):
 *   GET /v1/meta .................. {rev, updatedAt}
 *   GET /v1/delta?rev=N ........... delta by marker (lihat delta.js)
 *   GET /v1/companies ............. daftar + filter + paginasi
 *       ?status=&kategori=&kota=&limit=&offset=
 *   GET /v1/companies/:no ......... satu perusahaan (404 bila tidak ada)
 *   GET /v1/changes?limit= ........ umpan perubahan terbaru
 *   GET /v1/stats ................. agregat {total, byStatus}
 *   POST /v1/internal/* ........... STUB 501 — tulis internal H2
 *       (dual-write) diaktifkan sesudah O-02 + secret bersama;
 *       lihat d1/rencana-dual-write.md §3.
 *
 * Kegagalan D1 -> 502 + {source:"unavailable"}: klien jatuh ke
 * Firestore lalu seed (rantai di src/client.mjs). Worker tidak
 * pernah menyembunyikan kegagalan sebagai respons kosong. */

import {
  buildDeltaResponse,
  errorBody,
  parsePagination,
  parseRev,
  rowToCompany,
} from "./delta.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

async function getMeta(db) {
  const { results } = await db
    .prepare("SELECT key, value FROM meta WHERE key IN ('rev', 'updatedAt')")
    .all();
  const map = new Map((results || []).map((r) => [r.key, r.value]));
  return {
    rev: Number(map.get("rev") || "0"),
    updatedAt: map.get("updatedAt") || "",
  };
}

async function handleMeta(db) {
  const meta = await getMeta(db);
  return json(200, { ...meta, source: "d1" });
}

async function handleDelta(db, url) {
  const rawRev = url.searchParams.get("rev");
  const rev = parseRev(rawRev);
  if (Number.isNaN(rev)) {
    return json(400, errorBody("BAD_REV", "Parameter rev harus bilangan bulat >= 0."));
  }
  const sinceRev = rev === null ? 0 : rev;
  const meta = await getMeta(db);
  const { results } = await db
    .prepare("SELECT * FROM companies WHERE rev > ? ORDER BY no ASC")
    .bind(sinceRev)
    .all();
  const { results: totalRows } = await db
    .prepare("SELECT COUNT(*) AS n FROM companies")
    .all();
  return json(
    200,
    buildDeltaResponse({
      rev: meta.rev,
      updatedAt: meta.updatedAt,
      changed: (results || []).map(rowToCompany),
      total: totalRows?.[0]?.n ?? 0,
    }),
  );
}

async function handleCompanies(db, url) {
  const { limit, offset } = parsePagination(url.searchParams);
  const where = [];
  const params = [];
  const status = url.searchParams.get("status");
  const kategori = url.searchParams.get("kategori");
  const kota = url.searchParams.get("kota");
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (kategori) {
    where.push("kategori = ?");
    params.push(kategori);
  }
  if (kota) {
    where.push("lokasi = ?");
    params.push(kota);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const stmt = db.prepare(
    `SELECT * FROM companies ${clause} ORDER BY no ASC LIMIT ? OFFSET ?`,
  );
  const { results } = await stmt.bind(...params, limit, offset).all();
  const countStmt = db.prepare(
    `SELECT COUNT(*) AS n FROM companies ${clause}`,
  );
  const { results: countRows } = await countStmt.bind(...params).all();
  return json(200, {
    companies: (results || []).map(rowToCompany),
    total: countRows?.[0]?.n ?? 0,
    limit,
    offset,
    source: "d1",
  });
}

async function handleCompanyByNo(db, no) {
  if (!/^\d+$/.test(no)) {
    return json(400, errorBody("BAD_NO", "Nomor perusahaan harus bilangan bulat."));
  }
  const row = await db
    .prepare("SELECT * FROM companies WHERE no = ?")
    .bind(Number(no))
    .first();
  if (!row) {
    return json(404, errorBody("NOT_FOUND", "Perusahaan tidak ditemukan."));
  }
  return json(200, { company: rowToCompany(row), source: "d1" });
}

async function handleChanges(db, url) {
  const { limit } = parsePagination(url.searchParams);
  const { results } = await db
    .prepare(
      "SELECT * FROM changes ORDER BY created_at DESC, id DESC LIMIT ?",
    )
    .bind(limit)
    .all();
  return json(200, {
    changes: (results || []).map((r) => ({
      id: r.id,
      companyNo: r.company_no,
      perusahaan: r.perusahaan ?? "",
      from: r.from_status ?? "",
      to: r.to_status ?? "",
      checkedAt: r.checked_at ?? "",
      createdAt: r.created_at ?? "",
      source: r.source ?? "",
    })),
    source: "d1",
  });
}

async function handleStats(db) {
  const { results } = await db
    .prepare("SELECT status, COUNT(*) AS n FROM companies GROUP BY status")
    .all();
  const byStatus = {};
  let total = 0;
  for (const r of results || []) {
    byStatus[r.status] = r.n;
    total += r.n;
  }
  return json(200, { total, byStatus, source: "d1" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    /* Tulis internal (H2) — belum aktif sampai O-02 + secret bersama.
     * Stub ini sengaja 501, bukan 404: rutenya dikenal, fiturnya
     * belum ada. Jangan mengaktifkan tanpa secret + Red Team. */
    if (path.startsWith("/v1/internal/")) {
      return json(
        501,
        errorBody("NOT_IMPLEMENTED", "Endpoint tulis internal belum aktif (H2)."),
      );
    }

    if (request.method !== "GET") {
      return json(405, errorBody("METHOD_NOT_ALLOWED", "Hanya GET yang didukung."));
    }

    /* PENTING: setiap handler di-AWAIT di sini (bukan sekadar
     * return promise) supaya penolakan async tertangkap catch
     * di bawah dan menjadi 502 terstruktur, bukan rejection
     * yang lolos ke runtime. */
    try {
      if (path === "/v1/meta") return await handleMeta(env.DB);
      if (path === "/v1/delta") return await handleDelta(env.DB, url);
      if (path === "/v1/companies") return await handleCompanies(env.DB, url);
      if (path === "/v1/changes") return await handleChanges(env.DB, url);
      if (path === "/v1/stats") return await handleStats(env.DB);
      const byNo = path.match(/^\/v1\/companies\/([^/]+)$/);
      if (byNo) return await handleCompanyByNo(env.DB, byNo[1]);
      return json(404, errorBody("NOT_FOUND", "Endpoint tidak dikenal."));
    } catch (err) {
      /* D1 gagal (kuota habis, database tidak dapat dijangkau):
       * 502 terstruktur supaya klien jatuh ke Firestore lalu seed.
       * Pesan error internal tidak dibocorkan ke publik. */
      return json(
        502,
        errorBody("D1_UNAVAILABLE", "Basis data katalog tidak dapat dijangkau."),
      );
    }
  },
};
