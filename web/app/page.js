import Link from "next/link";
import { getCompaniesOrSeed, getTargetsOrSeed, getStatsOrSeed } from "@/lib/companies";
import { countBy, runSearch, topEntries } from "@/lib/search";
import { Icon, PrintButton, Reveal } from "@/app/visual";
import { formatDate } from "@/app/components";
import Finder from "@/app/finder";
import ChangesFeed from "@/app/changes-feed";
import TargetFilter from "@/app/target-filter";

/* Data di-render saat request, bukan saat build, supaya build tidak gagal
 * bila Firestore tidak bisa dijangkau dari mesin build. */
export const dynamic = "force-dynamic";

/* Posisi yang dicari pencari kerja lulusan SMK (dari brief produk). */
const ROLE_NAMES = [
  "Helper Gudang",
  "Staff Gudang",
  "Cleaning Service",
  "Office Boy",
  "Packing",
  "Operator Produksi",
  "Crew Store",
];

export default async function Beranda() {
  const [companies, stats, targets] = await Promise.all([
    getCompaniesOrSeed(),
    getStatsOrSeed(),
    getTargetsOrSeed(),
  ]);

  /* Angka di chip posisi dihitung dari data: kanal yang punya lowongan
   * target DAN posisinya cocok dengan nama posisi itu. */
  const roles = ROLE_NAMES.map((name) => {
    const { results } = runSearch(companies, { posisi: name });
    const count = results.filter(
      (e) => e.positionMatched && e.company.status === "Ada lowongan target",
    ).length;
    return { name, count };
  });

  const dateKeys = Object.keys(stats.byDate).sort();
  const latestDate = dateKeys.length ? dateKeys[dateKeys.length - 1] : null;
  const cats = topEntries(countBy(companies, "kategori"), 10);
  const catMax = cats.length ? cats[0].count : 1;
  const catTotal = new Set(companies.map((c) => c.kategori).filter(Boolean)).size;

  const shareText =
    `Lowongan target di Karir (${targets.length} perusahaan):\n` +
    targets
      .map((c) => `- ${c.perusahaan}: https://karir-adiprmx.vercel.app/perusahaan/${c.no}`)
      .join("\n");
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="wrap">
      <section className="hero" aria-label="Ringkasan dan pencarian">
        <div className="slab">
          <span className="slab-n num" aria-hidden="true">
            {targets.length}
          </span>
          <p className="slab-t">
            <strong>
              {targets.length} dari {stats.total} perusahaan punya lowongan peran target
            </strong>
            <span>
              {latestDate
                ? `Hasil cek terakhir ${formatDate(latestDate)}. Buka portal resminya sebelum melamar.`
                : "Tanggal cek belum tercatat."}
            </span>
          </p>
        </div>
        <Finder roles={roles} />
      </section>

      <section className="sec" aria-labelledby="target-h">
        <div className="sec-head">
          <h2 id="target-h">Lowongan yang sedang dibuka</h2>
          <Link className="textlink" href="/cari?status=Ada%20lowongan%20target">
            Buka di halaman Cari
          </Link>
        </div>
        <TargetFilter targets={targets} />
        <div className="actions no-print" style={{ marginTop: 16 }}>
          <a className="btn ghost small" href={waHref} target="_blank" rel="noopener noreferrer">
            <Icon name="share" size={18} />
            Kirim daftar ke WhatsApp
          </a>
          <PrintButton label="Cetak daftar" />
        </div>
      </section>

      <Reveal as="section" className="sec" aria-labelledby="cat-h">
        <div className="sec-head">
          <h2 id="cat-h">Industri mana yang paling banyak kanalnya?</h2>
          <Link className="textlink" href="/cari">
            {catTotal} kategori di Cari
          </Link>
        </div>
        <div className="cat-list">
          {cats.map((e) => (
            <Link key={e.label} href={`/cari?kategori=${encodeURIComponent(e.label)}`}>
              <span className="cat-name">{e.label}</span>
              <span className="cat-n num">{e.count}</span>
              <span className="bar" aria-hidden="true">
                <i style={{ "--w": (e.count / catMax) * 100 }} />
              </span>
            </Link>
          ))}
        </div>
      </Reveal>

      <Reveal as="section" className="sec" id="berubah" aria-labelledby="changes-h">
        <div className="sec-head">
          <h2 id="changes-h">Yang berubah baru-baru ini</h2>
        </div>
        <ChangesFeed />
      </Reveal>

      <Reveal as="section" className="sec" aria-labelledby="trust-h">
        <div className="prose">
          <h2 id="trust-h">Kenapa angkanya bisa dipercaya</h2>
          <p>
            Tiap kanal karir dibuka langsung di browser lewat situs resmi
            perusahaannya, lalu statusnya dicatat dengan tanggal cek.{" "}
            {stats.byStatus["Portal tidak bisa dibuka"] || 0} portal gagal
            dibuka saat dicek. Itu ditulis apa adanya sebagai
            &ldquo;Portal tidak bisa dibuka&rdquo;, bukan dianggap tidak ada lowongan.
          </p>
          <p>
            <Link className="textlink" href="/metode">
              Baca cara pengecekannya
            </Link>
          </p>
        </div>
      </Reveal>
    </div>
  );
}
