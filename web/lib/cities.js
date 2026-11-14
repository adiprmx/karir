/* Koordinat kota (fakta geografis umum) dan pencocok lokasi perusahaan.
 * Urutan penting: kota yang lebih spesifik dicek dulu, "Gunung Putri"
 * sebelum "Bogor" dan "Cikarang" sebelum "Bekasi", supaya lokasi seperti
 * "Gunung Putri Bogor" atau "Cikarang, Bekasi" jatuh ke kota yang benar.
 * Kota-kota di bawah garis pemisah (PETA-03, 15 Nov 2026) ditambahkan
 * karena muncul di teks lokasi perusahaan yang ada lowongan; koordinatnya
 * hasil geocode 15 Nov 2026, tiga yang pertama (Cilegon, Samarinda,
 * Balikpapan) diverifikasi balik lewat reverse geocode (masing-masing
 * jatuh di dalam kota yang benar). Urutan di blok ini alfabetis — tidak
 * ada yang tumpang tindih nama, jadi urutannya tidak memengaruhi hasil.
 * "Solo" memakai nama yang dikenal pengguna dengan kunci "surakarta"
 * sebagai alias; "Bandar Lampung" memakai kunci "lampung" karena teks
 * lokasi menulis nama provinsinya; "Bali" dipetakan ke Denpasar (ibu
 * kota provinsi) karena teks lokasi menyebut pulaunya, bukan kotanya. */

export const CITIES = [
  { name: "Gunung Putri", lat: -6.423, lng: 106.93, keys: ["gunung putri"] },
  { name: "Citeureup", lat: -6.5, lng: 106.8833, keys: ["citeureup"] },
  { name: "Cikarang", lat: -6.2568, lng: 107.1447, keys: ["cikarang"] },
  { name: "Bojonggede", lat: -6.4833, lng: 106.79, keys: ["bojonggede"] },
  { name: "Cibinong", lat: -6.4812, lng: 106.854, keys: ["cibinong"] },
  { name: "Depok", lat: -6.4025, lng: 106.7942, keys: ["depok", "cimanggis"] },
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
  // --- Kota tambahan (PETA-03): muncul di data target, di bawah ini ---
  { name: "Balikpapan", lat: -1.2379, lng: 116.8529, keys: ["balikpapan"] },
  {
    name: "Bandar Lampung",
    lat: -5.4224,
    lng: 105.26,
    keys: ["bandar lampung", "lampung"],
  },
  { name: "Banjarmasin", lat: -3.329, lng: 114.5905, keys: ["banjarmasin"] },
  { name: "Cilegon", lat: -6.026, lng: 106.0468, keys: ["cilegon"] },
  { name: "Cirebon", lat: -6.7377, lng: 108.5196, keys: ["cirebon"] },
  {
    name: "Denpasar",
    lat: -8.6727,
    lng: 115.2358,
    keys: ["denpasar", "bali"],
  },
  { name: "Gresik", lat: -7.1602, lng: 112.6471, keys: ["gresik"] },
  { name: "Makassar", lat: -5.1465, lng: 119.4229, keys: ["makassar"] },
  { name: "Malang", lat: -7.9907, lng: 112.6397, keys: ["malang"] },
  { name: "Medan", lat: 3.5921, lng: 98.6769, keys: ["medan"] },
  { name: "Palembang", lat: -2.8899, lng: 104.6936, keys: ["palembang"] },
  { name: "Pekanbaru", lat: 0.5274, lng: 101.4523, keys: ["pekanbaru"] },
  { name: "Probolinggo", lat: -7.7832, lng: 113.178, keys: ["probolinggo"] },
  { name: "Purwokerto", lat: -7.4252, lng: 109.2298, keys: ["purwokerto"] },
  { name: "Samarinda", lat: -0.4788, lng: 117.1456, keys: ["samarinda"] },
  { name: "Serang", lat: -6.1054, lng: 106.1586, keys: ["serang"] },
  { name: "Solo", lat: -7.5573, lng: 110.8223, keys: ["solo", "surakarta"] },
  { name: "Tegal", lat: -6.8673, lng: 109.1365, keys: ["tegal"] },
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

/* Apakah kota ini cocok dengan teks (sudah dinormalisasi)? Sebuah kota
 * cocok bila ada SATU kemunculan kata utuh dari salah satu kuncinya
 * yang tidak dinegasikan — jadi kota yang sama disebut sekali dalam
 * peniadaan dan sekali di luar peniadaan tetap cocok. */
function cityMatches(text, city) {
  for (const key of city.keys) {
    for (const start of findWholeWord(text, key)) {
      if (!isNegated(text, start)) return true;
    }
  }
  return false;
}

function normalizeText(lokasi) {
  if (!lokasi) return "";
  return String(lokasi).toLowerCase().replace(/\s+/g, " ");
}

/* Cocokkan teks lokasi bebas ke kota. Kembalikan objek kota atau null
 * bila tidak ada yang cocok. Kota pertama dalam urutan CITIES yang
 * cocok yang dipakai (dipakai pemanggil yang butuh satu kota saja). */
export function matchCity(lokasi) {
  const text = normalizeText(lokasi);
  if (!text) return null;
  for (const city of CITIES) {
    if (cityMatches(text, city)) return city;
  }
  return null;
}

/* Cocokkan teks lokasi bebas ke SEMUA kota yang tercantum (PETA-02).
 * Kembalikan daftar objek kota dalam urutan CITIES, atau daftar kosong
 * bila tidak ada yang cocok. Satu perusahaan yang lokasinya menyebut
 * banyak kota muncul di tiap kotanya di peta, bukan hanya di satu. */
export function matchCities(lokasi) {
  const text = normalizeText(lokasi);
  if (!text) return [];
  return CITIES.filter((city) => cityMatches(text, city));
}
