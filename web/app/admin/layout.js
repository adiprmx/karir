/* Panel admin selalu tampil terang: gayanya memakai warna tetap, dan
 * hanya dipakai pemilik. Membungkus dengan token terang. */
export default function AdminLayout({ children }) {
  return <div className="force-light">{children}</div>;
}
