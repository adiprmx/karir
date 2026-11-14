/* Izin singkat untuk memanggil /api/index.
 * Server hanya melayani /api/index bila permintaan membawa izin yang
 * masih berlaku di header Authorization. Izin itu diminta dari
 * GET /api/token, berlaku 60 detik, lalu disimpan di memori dan
 * dipakai ulang sampai hampir habis, jadi mengetik tidak memicu
 * permintaan izin baru tiap kali. Bila server menjawab 401, izin
 * baru diminta sekali lalu permintaan diulang sekali. Bila tetap
 * gagal, error diteruskan ke pemanggil supaya halaman menampilkan
 * state error yang sudah ada, bukan daftar kosong.
 * Semua fungsi di sini murni dan bisa dites tanpa browser: fetch
 * disuntikkan lewat parameter, waktu lewat parameter now.
 * Respons /api/index membawa `source` ("live" | "seed") + `seedDate`
 * (arsitektur seed-first S3): fetchIndex merekamnya sebagai meta
 * terakhir (getIndexMeta) supaya halaman bisa menampilkan catatan
 * "data cadangan" bila source=seed. Bila server lama belum mengirim
 * field itu, source dianggap "live". */
export const TOKEN_TTL_MS = 60_000;
/* Jangan pakai izin yang sisa berlakunya tinggal kurang dari ini. */
export const TOKEN_SAFETY_MS = 10_000;

export function parseTokenResponse(json, now = Date.now()) {
  if (!json || typeof json.token !== "string" || !json.token) return null;
  const ttl = Number(json.expiresIn ?? json.expires_in ?? 60);
  const ttlMs =
    Number.isFinite(ttl) && ttl > 0 ? ttl * 1000 : TOKEN_TTL_MS;
  return { token: json.token, expiresAt: now + ttlMs };
}

export function isTokenFresh(cached, now = Date.now()) {
  return (
    Boolean(cached && typeof cached.token === "string" && cached.token) &&
    Number.isFinite(cached.expiresAt) &&
    now + TOKEN_SAFETY_MS < cached.expiresAt
  );
}

export function createIndexFetcher(fetchImpl = fetch) {
  let cachedToken = null;
  let inflightToken = null;
  /* Meta respons /api/index terakhir: {source, seedDate}. */
  let lastMeta = null;

  function getIndexMeta() {
    return lastMeta;
  }

  async function getToken(force = false) {
    if (!force && isTokenFresh(cachedToken)) return cachedToken.token;
    if (!inflightToken) {
      inflightToken = fetchImpl("/api/token")
        .then(async (r) => {
          if (!r.ok) throw new Error("gagal");
          const parsed = parseTokenResponse(await r.json());
          if (!parsed) throw new Error("gagal");
          cachedToken = parsed;
          return parsed.token;
        })
        .finally(() => {
          inflightToken = null;
        });
    }
    return inflightToken;
  }

  async function fetchIndex() {
    const token = await getToken();
    let res = await fetchImpl("/api/index", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      cachedToken = null;
      const fresh = await getToken(true);
      res = await fetchImpl("/api/index", {
        headers: { Authorization: `Bearer ${fresh}` },
      });
    }
    if (!res.ok) throw new Error("gagal");
    const j = await res.json();
    lastMeta = {
      source: j.source === "seed" ? "seed" : "live",
      seedDate: typeof j.seedDate === "string" ? j.seedDate : "",
    };
    return Array.isArray(j.companies) ? j.companies : [];
  }

  return { fetchIndex, getToken, getIndexMeta };
}
