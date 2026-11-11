import Link from "next/link";
import { getCompaniesOrSeed, getStatsOrSeed, getTargetsOrSeed, STATUS_ORDER } from "@/lib/companies";
import { countBy, topEntries } from "@/lib/search";
import { Icon, Reveal, STATUS_SWATCH } from "@/app/visual";
import { formatDate } from "@/app/components";
import DashboardPersonal from "@/app/dashboard-personal";

/* Data di-render saat request, bukan saat build. */
export const dynamic = "force-dynamic";

export const metadata = { title: "Dasbor" };

function MiniRow({ c }) {
  return (
    <li>
      <Link href={`/perusahaan/${c.no}`}>
        <span className="mini-name">
          {c.no}. {c.perusahaan}
        </span>
        <span className="mini-sub">
          {[(c.posisi || "").split(",")[0], c.lokasi].filter(Boolean).join(" · ")}
        </span>
      </Link>
    </li>
  );
}

function RecheckList({ title, status, list }) {
  return (
    <details className="fold">
      <summary>
        <span className="grow">{title}</span>
        <span className="num">{list.length}</span>
        <Icon name="chevron" size={20} />
      </summary>
      <ul className="mini-list">
        {list.slice(0, 10).map((c) => (
          <MiniRow key={c.no} c={c} />
        ))}
      </ul>
      {list.length > 10 && (
        <Link className="textlink" href={`/cari?status=${encodeURIComponent(status)}`}>
          Lihat {list.length - 10} lainnya di Cari
        </Link>
      )}
    </details>
  );
}

export default async function Dasbor() {
  const [companies, stats, targets] = await Promise.all([
    getCompaniesOrSeed(),
    getStatsOrSeed(),
    getTargetsOrSeed(),
  ]);
  const total = stats.total;
  const topCats = topEntries(countBy(companies, "kategori"), 8);
  const topCatMax = topCats.length > 0 ? topCats[0].count : 1;
  const byName = (a, b) => a.perusahaan.localeCompare(b.perusahaan, "id");
  const portalDead = companies.filter((c) => c.status === "Portal tidak bisa dibuka").sort(byName);
  const unverified = companies.filter((c) => c.status === "Tidak dapat diverifikasi").sort(byName);
  const dates = Object.entries(stats.byDate).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Dasbor</h1>
        <p className="lede">
          Ruang kerjamu di atas, ringkasan dan sebaran data {total} perusahaan di bawah. Semua angka dihitung dari data.
        </p>
      </div>

      <DashboardPersonal />

      <div className="dash-grid sec">
        <Reveal as="section" className="panel" aria-labelledby="sebaran-h">
          <h2 id="sebaran-h" className="panel-title">
            Berapa dari {total} perusahaan yang punya lowongan target?
          </h2>
          <div className="stack" role="img" aria-label="Sebaran status perusahaan">
            {STATUS_ORDER.map((s) => {
              const n = stats.byStatus[s] || 0;
              return n > 0 ? <span key={s} className={STATUS_SWATCH[s]} style={{ "--g": n }} /> : null;
            })}
          </div>
          <ul className="status-rows">
            {STATUS_ORDER.map((s) => {
              const n = stats.byStatus[s] || 0;
              return (
                <li key={s}>
                  <Link href={`/cari?status=${encodeURIComponent(s)}`}>
                    <span className={`sw ${STATUS_SWATCH[s]}`} aria-hidden="true" />
                    <span>{s}</span>
                    <span className="status-n num">{n}</span>
                    <span className="status-pct num">{total ? Math.round((n / total) * 100) : 0}%</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="hint">
            Tanggal cek di data:{" "}
            {dates.map(([d, n]) => `${formatDate(d)} (${n} perusahaan)`).join(", ") || "belum ada"}.
          </p>
        </Reveal>

        <Reveal as="section" className="panel" aria-labelledby="kat-h">
          <h2 id="kat-h" className="panel-title">
            Kategori dengan kanal terbanyak
          </h2>
          <div className="cat-list" style={{ gridTemplateColumns: "1fr" }}>
            {topCats.map((e) => (
              <Link key={e.label} href={`/cari?kategori=${encodeURIComponent(e.label)}`}>
                <span className="cat-name">{e.label}</span>
                <span className="cat-n num">{e.count}</span>
                <span className="bar" aria-hidden="true">
                  <i style={{ "--w": (e.count / topCatMax) * 100 }} />
                </span>
              </Link>
            ))}
          </div>
        </Reveal>
      </div>

      <Reveal as="section" className="sec" aria-labelledby="dash-targets">
        <div className="sec-head">
          <h2 id="dash-targets">
            Lowongan target terverifikasi <span className="num">({targets.length})</span>
          </h2>
          <Link className="textlink" href="/peta">
            Lihat di peta
          </Link>
        </div>
        {targets.length === 0 ? (
          <div className="state">
            <strong>Belum ada lowongan target yang terverifikasi.</strong>
          </div>
        ) : (
          <ul className="mini-list">
            {targets.map((c) => (
              <MiniRow key={c.no} c={c} />
            ))}
          </ul>
        )}
      </Reveal>

      <Reveal as="section" className="sec" aria-label="Perlu dicek ulang">
        <div className="sec-head">
          <h2>Perlu dicek ulang</h2>
        </div>
        <RecheckList title="Portal tidak bisa dibuka" status="Portal tidak bisa dibuka" list={portalDead} />
        <RecheckList title="Tidak dapat diverifikasi" status="Tidak dapat diverifikasi" list={unverified} />
      </Reveal>
    </div>
  );
}
