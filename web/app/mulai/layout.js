/* Halaman mulai adalah komponen klien sehingga tidak bisa
 * mengekspor metadata sendiri (FE-07/ONB-06); metadata ditaruh
 * di layout rute ini. */
export const metadata = {
  title: "Mulai",
  description:
    "Tiga langkah menemukan kanal lowongan yang cocok: pilih domisili dan posisi, lalu lihat kanal yang sesuai.",
};

export default function MulaiLayout({ children }) {
  return <>{children}</>;
}
