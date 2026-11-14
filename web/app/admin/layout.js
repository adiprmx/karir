/* Panel admin selalu tampil terang: gayanya memakai warna tetap, dan
 * hanya dipakai pemilik. Membungkus dengan token terang. */
export const metadata = {
  title: "Admin",
  /* Panel pemilik: jangan diindeks mesin pencari (S7/SEO-03). */
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return <div className="force-light">{children}</div>;
}
