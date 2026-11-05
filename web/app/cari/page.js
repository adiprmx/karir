import Link from "next/link";
import { getCompanies, getCategories, STATUS_ORDER } from "@/lib/companies";
import { runSearch, tokenize } from "@/lib/search";
import { ResultsTable } from "@/app/components";

const PAGE_SIZE = 20;

export const metadata = { title: "Cari — Karir" };

export default async function Cari({ searchParams }) {
  const params = await searchParams;
  const domisili = params.domisili || "";
  const posisi = params.posisi || "";
  const kategori = params.kategori || "";
  const status = params.status || "";
  const urutan = params.urutan || "relevansi";
  const limit = Math.max(
    PAGE_SIZE,
    Math.min(400, parseInt(params.limit || String(PAGE_SIZE), 10) || PAGE_SIZE),
  );

  const companies = getCompanies();
  const { results, mode, query } = runSearch(companies, {
    domisili,
    posisi,
    kategori,
    status,
    urutan,
  });
  const shown = results.slice(0, limit);
  const queryHasPosisi = tokenize(posisi).length > 0;
  const anyPositionMatch =
    mode === "perusahaan" || results.some((e) => e.positionMatched);

  const qs = new URLSearchParams();
  if (domisili) qs.set("domisili", domisili);
  if (posisi) qs.set("posisi", posisi);
  if (kategori) qs.set("kategori", kategori);
  if (status) qs.set("status", status);
  if (urutan) qs.set("urutan", urutan);

  const moreQs = new URLSearchParams(qs);
  moreQs.set("limit", String(limit + PAGE_SIZE));

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Cari perusahaan</h1>
        <p className="lede">
          Hasil diurutkan berdasarkan kecocokan posisi, domisili, dan status
          verifikasi.
        </p>
      </div>

      <div className="cari-grid">
        <form className="filters" method="get" action="/cari">
          <fieldset>
            <legend>Domisili</legend>
            <input
              name="domisili"
              type="text"
              defaultValue={domisili}
              placeholder="Misal: Depok"
              autoComplete="off"
            />
          </fieldset>
          <fieldset>
            <legend>Posisi atau perusahaan</legend>
            <input
              name="posisi"
              type="text"
              defaultValue={posisi}
              placeholder="Misal: Administrasi atau PGN"
              autoComplete="off"
            />
          </fieldset>
          <fieldset>
            <legend>Kategori</legend>
            <select name="kategori" defaultValue={kategori}>
              <option value="">Semua kategori</option>
              {getCategories().map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </fieldset>
          <fieldset>
            <legend>Status</legend>
            <select name="status" defaultValue={status}>
              <option value="">Semua status</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </fieldset>
          <fieldset>
            <legend>Urutan</legend>
            <select name="urutan" defaultValue={urutan}>
              <option value="relevansi">Paling relevan</option>
              <option value="nama">Nama A–Z</option>
            </select>
          </fieldset>
          <div className="filter-actions">
            <button className="btn" type="submit">
              Cari
            </button>
            <Link className="btn ghost" href="/cari">
              Atur ulang
            </Link>
          </div>
        </form>

        <section aria-label="Hasil pencarian">
          <p className="result-count">
            Menampilkan {shown.length} dari {results.length} perusahaan
          </p>
          {queryHasPosisi && mode !== "perusahaan" && !anyPositionMatch && (
            <p className="search-note">
              Tidak ada kecocokan posisi di data kami. Hasil di bawah ini
              adalah rekomendasi kanal berdasarkan domisili dan status, bukan
              lowongan yang terverifikasi.
            </p>
          )}
          <ResultsTable entries={shown} queryHasPosisi={queryHasPosisi} />
          {results.length > limit && (
            <div className="load-more">
              <Link className="btn ghost" href={`/cari?${moreQs.toString()}`}>
                Tampilkan lebih banyak
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
