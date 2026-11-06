/* Koordinat kota (fakta geografis umum) dan pencocok lokasi perusahaan.
 * Urutan penting: kota yang lebih spesifik dicek dulu, "Gunung Putri"
 * sebelum "Bogor" dan "Cikarang" sebelum "Bekasi", supaya lokasi seperti
 * "Gunung Putri Bogor" atau "Cikarang, Bekasi" jatuh ke kota yang benar. */

export const CITIES = [
  { name: "Gunung Putri", lat: -6.423, lng: 106.93, keys: ["gunung putri"] },
  { name: "Citeureup", lat: -6.5, lng: 106.8833, keys: ["citeureup"] },
  { name: "Cikarang", lat: -6.2568, lng: 107.1447, keys: ["cikarang"] },
  { name: "Bojonggede", lat: -6.4833, lng: 106.79, keys: ["bojonggede"] },
  { name: "Cibinong", lat: -6.4812, lng: 106.854, keys: ["cibinong"] },
  { name: "Depok", lat: -6.4025, lng: 106.7942, keys: ["depok"] },
  { name: "Bekasi", lat: -6.2383, lng: 106.9756, keys: ["bekasi"] },
  { name: "Karawang", lat: -6.3061, lng: 107.2993, keys: ["karawang"] },
  { name: "Tangerang", lat: -6.17, lng: 106.64, keys: ["tangerang"] },
  { name: "Bandung", lat: -6.9175, lng: 107.6191, keys: ["bandung"] },
  { name: "Semarang", lat: -6.9667, lng: 110.4167, keys: ["semarang"] },
  { name: "Surabaya", lat: -7.2575, lng: 112.7521, keys: ["surabaya"] },
  {
    name: "Yogyakarta",
    lat: -7.7956,
    lng: 110.3695,
    keys: ["yogyakarta", "yogya"],
  },
  { name: "Batam", lat: 1.13, lng: 104.05, keys: ["batam"] },
  { name: "Bogor", lat: -6.5971, lng: 106.806, keys: ["bogor"] },
  { name: "Jakarta", lat: -6.2088, lng: 106.8456, keys: ["jakarta"] },
];

/* Cocokkan teks lokasi bebas ke kota. Kembalikan objek kota atau null
 * bila tidak ada yang cocok. */
export function matchCity(lokasi) {
  if (!lokasi) return null;
  const text = lokasi.toLowerCase();
  for (const city of CITIES) {
    if (city.keys.some((k) => text.includes(k))) return city;
  }
  return null;
}
