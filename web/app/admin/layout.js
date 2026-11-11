import "./admin.css";

/* Panel admin selalu tampil terang dan memakai gaya sendiri yang dibatasi
 * di .adm, supaya tidak bertabrakan dengan sistem desain publik. */
export const metadata = { title: "Admin" };

export default function AdminLayout({ children }) {
  return <div className="force-light adm">{children}</div>;
}
