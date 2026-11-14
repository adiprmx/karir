import Link from "next/link";
import { getLocale } from "@/lib/i18n";

export const metadata = {
  title: "Syarat Penggunaan",
  description:
    "Aturan pakai Karir: gratis, info lowongan bisa berubah, dan cara melaporkan tautan mati.",
};

const COPY = {
  title: { id: "Syarat Penggunaan", en: "Terms of Use" },
  lede: {
    id: "Aturan pakai Karir, ditulis dengan bahasa sehari-hari.",
    en: "The rules for using Karir, written in plain language.",
  },
};

export default async function Syarat() {
  const locale = await getLocale();

  return (
    <div className="wrap narrow">
      <div className="page-head">
        <h1>{COPY.title[locale]}</h1>
        <p className="lede">{COPY.lede[locale]}</p>
      </div>

      <section className="dash-section" aria-label="Layanan gratis">
        <p className="section-label">Gratis</p>
        <h2>Layanan gratis</h2>
        <p>
          Karir gratis. Tidak ada biaya, dan tidak ada fitur berbayar.
        </p>
      </section>

      <section className="dash-section" aria-label="Info lowongan">
        <p className="section-label">Info lowongan</p>
        <h2>Info lowongan bisa berubah</h2>
        <p>
          Tiap perusahaan dicek langsung di portal resminya, dan tanggal
          cek tercatat di halaman perusahaan. Pengecekan ulang berjalan
          tiap hari.
        </p>
        <p>
          Lowongan bisa berubah setelah tanggal cek. Selalu periksa portal
          resmi perusahaan sebelum melamar.
        </p>
        <p>
          Karir hanya menunjukkan kanal resmi perusahaan. Kamu melamar
          lewat portal perusahaan, dan Karir tidak menerima lamaran. Karir
          juga tidak menjamin kamu diterima kerja.
        </p>
        <p>
          Status ditulis sesuai keadaan pada tanggal cek. Portal yang
          tidak bisa dibuka berarti aksesnya gagal saat dicek. Itu tidak
          membuktikan perusahaan itu tidak membuka lowongan.
        </p>
      </section>

      <section className="dash-section" aria-label="Laporkan tautan mati">
        <p className="section-label">Laporan</p>
        <h2>Laporkan tautan mati</h2>
        <p>
          Kalau tautan tidak bisa dibuka atau isinya salah, buka halaman
          perusahaan itu dan pakai tombol Laporkan tautan mati. Kamu juga
          bisa mengusulkan koreksi lewat issue di repo GitHub Karir.
        </p>
      </section>

      <section className="dash-section" aria-label="Pakai dengan wajar">
        <p className="section-label">Pakai dengan wajar</p>
        <h2>Jangan membanjiri server</h2>
        <p>
          Permintaan ke situs dibatasi supaya tetap jalan untuk semua
          orang. Jangan mengirim permintaan beruntun dalam jumlah besar,
          dan jangan memakai program otomatis untuk menyedot data situs.
        </p>
        <p>
          Akun yang dipakai untuk menyalahgunakan situs bisa ditutup.
        </p>
      </section>

      <section className="dash-section" aria-label="Perubahan syarat">
        <p className="section-label">Perubahan</p>
        <h2>Kalau syarat ini berubah</h2>
        <p>
          Perubahan diumumkan di halaman{" "}
          <Link href="/changelog">Riwayat perubahan</Link>.
        </p>
        <p className="section-note">
          Terakhir diperbarui 15 November 2026.
        </p>
      </section>
    </div>
  );
}
