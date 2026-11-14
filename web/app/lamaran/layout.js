/* Halaman lamaran adalah komponen klien sehingga tidak bisa
 * mengekspor metadata sendiri (FE-07); metadata ditaruh di layout
 * rute ini. Halaman personal: jangan diindeks mesin pencari (S7). */
export const metadata = {
  title: "Lamaran",
  description:
    "Lamaran yang dilacak: perusahaan yang sudah dilamar dan status tiap lamaran.",
  robots: { index: false, follow: false },
};

export default function LamaranLayout({ children }) {
  return <>{children}</>;
}
