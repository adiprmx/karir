/* Halaman pengaturan adalah komponen klien sehingga tidak bisa
 * mengekspor metadata sendiri (FE-07); metadata ditaruh di layout
 * rute ini. Halaman personal: jangan diindeks mesin pencari (S7). */
export const metadata = {
  title: "Pengaturan",
  description: "Atur tampilan, bahasa, dan data yang tersimpan di perangkat.",
  robots: { index: false, follow: false },
};

export default function PengaturanLayout({ children }) {
  return <>{children}</>;
}
