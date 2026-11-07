import Link from "next/link";
import { getLocale, t } from "@/lib/i18n";

export default async function NotFound() {
  const locale = await getLocale();

  return (
    <div className="wrap narrow">
      <div className="page-head">
        <h1>Halaman tidak ditemukan</h1>
        <p className="lede">
          Alamat yang kamu buka tidak ada di Karir. Mungkin tautannya salah
          ketik, atau halamannya sudah tidak ada.
        </p>
      </div>
      <div className="actions-row">
        <Link href="/" className="btn">
          {t(locale, "nav.home")}
        </Link>
        <Link href="/cari" className="btn ghost">
          {t(locale, "nav.search")}
        </Link>
      </div>
    </div>
  );
}
