import Link from "next/link";
import { getStatsOrSeed } from "@/lib/companies";
import { formatDate } from "@/app/components";

/* Data di-render saat request, bukan saat build. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tentang Karir",
  description:
    "Karir adalah daftar kanal karir resmi perusahaan Indonesia yang dicek langsung di browser. Login opsional, semua fitur bisa dipakai sebagai tamu.",
};

export default async function Tentang() {
  const stats = await getStatsOrSeed();
  const total = stats.total;
  const targets = stats.byStatus["Ada lowongan target"] || 0;
  const notFit = stats.byStatus["Ada lowongan target (tidak cocok)"] || 0;
  const dates = Object.entries(stats.byDate).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="wrap narrow">
      <div className="page-head">
        <h1>Tentang Karir</h1>
        <p className="lede">Karir mengumpulkan kanal karir resmi perusahaan Indonesia, lalu mengeceknya satu per satu di browser.</p>
      </div>

      <div className="doc">
        <section aria-labelledby="t-angka">
          <h2 id="t-angka">Angka di data</h2>
          <ul className="rows">
            <li>
              <b className="num">{total}</b>
              <span>perusahaan di data</span>
            </li>
            <li>
              <b className="num">{targets}</b>
              <span>punya lowongan target terverifikasi</span>
            </li>
            <li>
              <b className="num">{notFit}</b>
              <span>punya lowongan target, tetapi syaratnya tidak cocok</span>
            </li>
          </ul>
          <p className="hint">
            Tanggal cek: {dates.map(([d, n]) => `${formatDate(d)} (${n} perusahaan)`).join(", ") || "belum ada"}.
            Semua angka dihitung langsung dari data.
          </p>
        </section>

        <section aria-labelledby="t-apa">
          <h2 id="t-apa">Karir dipakai untuk apa</h2>
          <div className="prose">
            <ul>
              <li>Ketik kota dan posisi yang kamu cari, lalu buka portal resmi perusahaan yang paling relevan dan lamar lewat sana.</li>
              <li>Pengecekan difokuskan ke gudang, produksi, cleaning, office boy, packing, dan crew store.</li>
              <li>
                Data dan kode ada di{" "}
                <a href="https://github.com/adiprmx/karir" target="_blank" rel="noopener noreferrer">
                  repo terbuka
                </a>
                , dan siapa pun bisa mengusulkan koreksi lewat issue dan pull request.
              </li>
            </ul>
          </div>
        </section>

        <section aria-labelledby="t-akun">
          <h2 id="t-akun">Akun dan data pribadi</h2>
          <div className="prose">
            <p>
              Masuk akun itu pilihan. Tanpa masuk, semua fitur tetap bisa dipakai
              dan lamaranmu tersimpan di browser ini saja. Kalau masuk (email
              atau Google), tanda lamaranmu ikut tersimpan di akun supaya tidak
              hilang saat ganti HP.
            </p>
            <p>
              Situs mencatat kunjungan secara anonim: halaman yang dibuka dan
              kata pencarian, dengan pengenal acak di browser dan IP yang hanya
              dipakai untuk batas laju. Email tidak pernah ikut ke catatan itu.
              Yang tersimpan di browser bisa kamu hapus di{" "}
              <Link href="/pengaturan">Pengaturan</Link>.
            </p>
          </div>
        </section>

        <section aria-labelledby="t-jujur">
          <h2 id="t-jujur">Kejujuran data</h2>
          <div className="prose">
            <p>
              Status ditulis sesuai keadaan pada tanggal cek. Portal yang tidak
              bisa dibuka berarti aksesnya gagal, bukan bukti tidak ada lowongan,
              dan skor hanya mengurutkan kanal, bukan janji lowongan masih ada.{" "}
              <Link href="/metode">Cara pengecekan selengkapnya.</Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
