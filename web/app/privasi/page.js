import Link from "next/link";
import { getLocale } from "@/lib/i18n";

export const metadata = {
  title: "Kebijakan Privasi",
  description:
    "Data apa yang Karir simpan, di mana data itu berada, dan cara menghapusnya.",
};

const COPY = {
  title: { id: "Kebijakan Privasi", en: "Privacy Policy" },
  lede: {
    id: "Data apa yang Karir simpan, di mana data itu berada, dan cara menghapusnya.",
    en: "What data Karir stores, where it lives, and how to delete it.",
  },
};

export default async function Privasi() {
  const locale = await getLocale();

  return (
    <div className="wrap narrow">
      <div className="page-head">
        <h1>{COPY.title[locale]}</h1>
        <p className="lede">{COPY.lede[locale]}</p>
      </div>

      <section className="dash-section" aria-label="Akun">
        <p className="section-label">Akun</p>
        <h2>Masuk itu pilihan</h2>
        <p>
          Semua fitur Karir bisa dipakai tanpa masuk. Akun hanya berguna
          untuk satu hal: menyimpan tanda lamaran ke akun, supaya tidak
          hilang bila kamu ganti perangkat atau menghapus data browser.
        </p>
        <p>Masuk memakai email dan kata sandi, minimal 6 huruf.</p>
        <p>
          Yang tersimpan di profil akun: alamat email dan nama tampilan.
          Hanya kamu dan admin yang bisa melihat profil itu.
        </p>
        <p>
          Bila kamu masuk, tanda lamaranmu tersimpan juga di akun:
          perusahaan yang kamu tandai, statusnya, tanggal, dan catatan.
          Hanya kamu yang bisa melihatnya.
        </p>
        <p>
          Kata sandi dipegang Firebase, layanan akun dari Google. Kata
          sandi tidak disimpan di data Karir.
        </p>
      </section>

      <section className="dash-section" aria-label="Data di browser">
        <p className="section-label">Di browser kamu</p>
        <h2>Yang tersimpan di perangkatmu</h2>
        <p>
          Data di bawah ini tersimpan di browser ini. Dua di antaranya
          bisa ikut terkirim: nomor pengunjung ikut dalam catatan
          kunjungan tanpa nama, dan tanda lamaran tersimpan ke akun bila
          kamu masuk. Sisanya tidak pernah keluar dari perangkatmu.
        </p>
        <ul className="recheck-list">
          <li>
            <code>karir-visitor</code>: nomor acak pengunjung. Dipakai
            untuk menghitung pengunjung tanpa nama, dan ikut terkirim
            bersama catatan kunjungan.
          </li>
          <li>
            <code>karir-lamaran</code>: perusahaan yang kamu tandai
            beserta status lamarannya. Tersimpan ke akun bila kamu masuk.
          </li>
          <li>
            <code>karir-onboarding</code>: domisili dan posisi yang kamu
            pilih di awal.
          </li>
          <li>
            <code>karir-recent-search</code>: pencarian terakhirmu, supaya
            bisa dibuka lagi dengan cepat.
          </li>
          <li>
            <code>karir-theme</code>: pilihan tema terang atau gelap.
          </li>
          <li>
            <code>karir-visited-metode</code>: penanda bahwa kamu sudah
            membuka halaman Metode.
          </li>
          <li>
            <code>karir-tanpa-analitik</code>: penanda bahwa kamu memilih
            kunjunganmu tidak dicatat. Hanya ada bila kamu mengaktifkan
            pilihan itu di Pengaturan.
          </li>
          <li>
            Cookie <code>karir-locale</code>: pilihan bahasa Indonesia
            atau Inggris.
          </li>
        </ul>
        <p>
          Kamu bisa melihat dan menghapus data di browser dari halaman{" "}
          <Link href="/pengaturan">Pengaturan</Link>.
        </p>
      </section>

      <section className="dash-section" aria-label="Catatan kunjungan">
        <p className="section-label">Catatan kunjungan</p>
        <h2>Yang kami catat saat kamu berkunjung</h2>
        <p>
          Karir mencatat kunjungan tanpa nama, untuk tahu halaman mana
          yang dibuka dan kata apa yang dicari. Catatan ini dipakai untuk
          angka gabungan, misalnya halaman yang paling sering dibuka.
        </p>
        <p>
          Yang dicatat: halaman yang dibuka, kata yang dicari, perusahaan
          yang detailnya dibuka, filter yang dipakai di pencarian, kanal
          lamar yang diklik (portal perusahaan, WhatsApp, atau email),
          lamaran yang ditandai, alamat email atau nomor WhatsApp yang
          disalin dari halaman perusahaan, laporan tautan mati yang
          dikirim, dan apakah pengenalan awal di halaman Mulai
          diselesaikan atau dilewati. Yang tidak dicatat: alamat
          internetmu, alamat emailmu, dan isi laporan atau jawaban
          pengenalan awalmu.
        </p>
        <p>
          Tiap pengunjung mendapat nomor acak yang tersimpan di browser.
          Nomor ini hanya angka acak yang tidak memuat nama atau alamat
          email, dan situs tidak mencoba mengenali perangkatmu dari
          ciri-ciri browser.
        </p>
        <p>
          Kata yang kamu ketik di pencarian ikut terkirim ke server, tanpa
          nama, untuk statistik gabungan. Sebelum disimpan, alamat email
          dan nomor telepon yang tidak sengaja terketik di kolom
          pencarian disamarkan, jadi yang tersimpan bukan teks mentahnya.
        </p>
        <p>
          Alamat internetmu tidak disimpan. Alamat itu diubah jadi kode
          yang berubah tiap hari, lalu alamat aslinya dibuang. Kode itu
          dipakai untuk menghitung pengunjung unik per hari dan membatasi
          permintaan yang terlalu banyak.
        </p>
        <p>
          Bila kamu masuk akun, catatan kunjungan ikut menempel nomor akun
          acak dari Firebase. Alamat emailmu tidak ikut terkirim. Nomor
          itu hanya dipakai untuk membedakan akun yang masuk dari tamu.
        </p>
        <p>
          Kunjungan dari program otomatis ditandai, supaya tidak tercampur
          dengan kunjungan orang.
        </p>
        <p>Catatan kunjungan mentah disimpan 90 hari, lalu dihapus.</p>
        <p>
          Kamu bisa menolak pencatatan ini kapan saja: buka halaman{" "}
          <Link href="/pengaturan">Pengaturan</Link>, lalu centang
          &ldquo;Jangan catat kunjungan saya&rdquo;. Setelah itu tidak ada
          lagi kunjungan yang dicatat dari browser ini. Catatan yang sudah
          terkirim sebelumnya tetap terhapus sendiri setelah 90 hari.
        </p>
      </section>

      <section className="dash-section" aria-label="Laporan tautan mati">
        <p className="section-label">Laporan</p>
        <h2>Laporan tautan mati</h2>
        <p>
          Saat kamu melaporkan tautan mati dari halaman perusahaan, yang
          terkirim: nomor dan nama perusahaan, alasan yang kamu tulis, dan
          waktu laporan. Hanya admin yang bisa membaca laporan itu.
          Laporan tidak bisa diubah atau dihapus setelah terkirim.
        </p>
      </section>

      <section className="dash-section" aria-label="Pihak ketiga">
        <p className="section-label">Pihak ketiga</p>
        <h2>Siapa lagi yang memegang data</h2>
        <p>
          Firebase dari Google menyimpan akun, profil, tanda lamaran yang
          tersinkron, dan catatan kunjungan. Datanya berada di server
          Google di Asia Tenggara (wilayah asia-southeast1).
        </p>
        <p>Vercel menayangkan situs ini.</p>
        <p>
          Tidak ada iklan di situs ini, dan data tidak dijual ke siapa
          pun.
        </p>
      </section>

      <section className="dash-section" aria-label="Hak kamu">
        <p className="section-label">Hak kamu</p>
        <h2>Yang bisa kamu lakukan</h2>
        <p>
          Lihat dan hapus data di browser dari halaman{" "}
          <Link href="/pengaturan">Pengaturan</Link>, termasuk tombol hapus
          semua data.
        </p>
        <p>Keluar dari akun kapan saja dari menu situs.</p>
        <p>
          Hapus akun belum punya tombol di situs. Minta lewat{" "}
          <a
            href="https://github.com/adiprmx/karir/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            Issues di repo GitHub Karir
          </a>
          , pengelola akan membalas dan mengatur penghapusannya.
        </p>
      </section>

      <section className="dash-section" aria-label="Perubahan kebijakan">
        <p className="section-label">Perubahan</p>
        <h2>Kalau kebijakan ini berubah</h2>
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
