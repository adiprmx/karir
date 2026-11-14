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

/* Kata peniadaan: kemunculan kota yang didahului salah satunya dalam
 * jarak dekat dan dalam klausa yang sama TIDAK dihitung sebagai lokasi.
 * Frasa dicek bersama kata tunggalnya ("tidak ada" dan "tidak" keduanya
 * ada di daftar) supaya jarak diukur dari akhir frasa yang paling dekat
 * dengan nama kota. */
const NEGATIONS = [
  "tidak ada",
  "tak ada",
  "bukan di",
  "tidak",
  "bukan",
  "tanpa",
  "belum",
];

/* Jarak maksimum (karakter) antara akhir kata peniadaan dan awal nama
 * kota agar kemunculan itu dianggap dinegasikan. */
const NEGATION_WINDOW = 20;

/* Pemisah klausa: peniadaan tidak menembus batas ini. Contoh:
 * "tidak di Jakarta, ada di Bandung" — koma memisahkan klausa yang
 * dinegasikan dari klausa yang menegaskan Bandung. */
const CLAUSE_BREAK = /[,;:()[\].\n—–-]/;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* Cari semua kemunculan kunci sebagai kata utuh (batas kata di kedua
 * sisi, tidak peka huruf besar/kecil). Kunci multi-kata ("gunung
 * putri") dicocokkan sebagai frasa utuh. Kembalikan posisi awal tiap
 * kemunculan. */
function findWholeWord(text, key) {
  const pattern = new RegExp(`\\b${escapeRegExp(key)}\\b`, "g");
  const starts = [];
  let m;
  while ((m = pattern.exec(text)) !== null) starts.push(m.index);
  return starts;
}

/* Apakah kemunculan kota pada posisi `start` didahului kata peniadaan?
 * Hanya teks dalam klausa yang sama yang diperiksa (berhenti di
 * pemisah klausa terdekat), dan hanya peniadaan yang berakhir paling
 * jauh NEGATION_WINDOW karakter sebelum kemunculan yang dihitung. */
function isNegated(text, start) {
  const before = text.slice(0, start);
  let cut = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    if (CLAUSE_BREAK.test(before[i])) {
      cut = i + 1;
      break;
    }
  }
  const fragment = before.slice(cut);
  for (const neg of NEGATIONS) {
    const pattern = new RegExp(`\\b${escapeRegExp(neg)}\\b`, "g");
    let m;
    while ((m = pattern.exec(fragment)) !== null) {
      if (fragment.length - (m.index + m[0].length) <= NEGATION_WINDOW) {
        return true;
      }
    }
  }
  return false;
}

/* Cocokkan teks lokasi bebas ke kota. Kembalikan objek kota atau null
 * bila tidak ada yang cocok. Sebuah kota cocok bila ada SATU
 * kemunculan kata utuhnya yang tidak dinegasikan — jadi kota yang
 * sama disebut sekali dalam peniadaan dan sekali di luar peniadaan
 * tetap cocok. */
export function matchCity(lokasi) {
  if (!lokasi) return null;
  const text = String(lokasi).toLowerCase().replace(/\s+/g, " ");
  for (const city of CITIES) {
    for (const key of city.keys) {
      for (const start of findWholeWord(text, key)) {
        if (!isNegated(text, start)) return city;
      }
    }
  }
  return null;
}
