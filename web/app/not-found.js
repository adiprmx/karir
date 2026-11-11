import Link from "next/link";

export const metadata = { title: "Halaman tidak ditemukan" };

export default function NotFound() {
  return (
    <div className="wrap narrow">
      <div className="page-head">
        <h1>Halaman tidak ditemukan</h1>
        <p className="lede">Alamat yang kamu buka tidak ada di Karir. Mungkin salah ketik, atau halamannya sudah dihapus.</p>
      </div>
      <div className="actions">
        <Link href="/" className="btn">
          Ke Beranda
        </Link>
        <Link href="/cari" className="btn ghost">
          Cari perusahaan
        </Link>
      </div>
    </div>
  );
}
