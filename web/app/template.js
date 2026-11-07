/* Template (bukan layout): dibuat ulang tiap pindah halaman, jadi isi
 * halaman masuk dengan satu gerak singkat. Cuma opacity dan geser 6px. */
export default function Template({ children }) {
  return <div className="page">{children}</div>;
}
