/* Halaman mulai adalah komponen klien sehingga tidak bisa
 * mengekspor metadata sendiri (FE-07/ONB-06); metadata ditaruh
 * di layout rute ini. */
export const metadata = {
  title: "Mulai",
  description:
    "Tiga langkah menemukan kanal lowongan yang cocok: pilih domisili dan posisi, lalu lihat kanal yang sesuai.",
  /* SEO-04 + MKT-03 (pass metadata kanonis, W2b). */
  alternates: { canonical: "/mulai" },
};

export default function MulaiLayout({ children }) {
  return <>{children}</>;
}
