/* Sinkronisasi pelacak lamaran ke akun (opsional).
 * Tamu tetap memakai localStorage seperti biasa. Saat ada pengguna
 * yang masuk, pelacak lokalnya digabung dengan yang tersimpan di akun,
 * lalu hasilnya ditulis ke akun dan kembali ke perangkat ini. Salinan
 * lokal tidak pernah dihapus oleh sinkronisasi ini.
 *
 * Bentuk satu entri pelacak: { companyNo, status, tanggal, catatan }.
 * companyNo angka 1-10000, status salah satu dari TRACKER_STATUSES,
 * tanggal string YYYY-MM-DD (boleh kosong), catatan string maks 200
 * huruf. Di localStorage entri disimpan sebagai peta dengan kunci
 * nomor perusahaan dan field `no`; di akun disimpan satu dokumen per
 * perusahaan di subkoleksi user_trackers/{uid}/items/{companyNo}.
 * mergeTrackers menerima peta atau larik, jadi kedua bentuk bisa
 * digabung. Modul ini murni di tingkat atas: Firebase diimpor malas
 * di dalam fungsi, supaya tes unit dan halaman tamu tidak memuat SDK. */

export const TRACKER_STATUSES = [
  "Ditandai",
  "Sudah dilamar",
  "Dipanggil",
  "Ditolak",
];

const MAX_COMPANY_NO = 10000;
const MAX_CATATAN = 200;

/* Rapikan satu entri mentah ke bentuk baku. Kembalikan null bila
 * nomor perusahaan atau statusnya tidak sah. */
function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const no = Number(raw.companyNo ?? raw.no);
  if (!Number.isInteger(no) || no < 1 || no > MAX_COMPANY_NO) return null;
  if (!TRACKER_STATUSES.includes(raw.status)) return null;
  const tanggal =
    typeof raw.tanggal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.tanggal)
      ? raw.tanggal
      : "";
  const catatan =
    typeof raw.catatan === "string" ? raw.catatan.slice(0, MAX_CATATAN) : "";
  return { companyNo: no, status: raw.status, tanggal, catatan };
}

/* Ubah peta ({ "12": {...} }) atau larik ([{...}]) jadi peta dengan
 * kunci string nomor perusahaan dan nilai entri baku. Entri yang
 * tidak sah dibuang. */
function toMap(input) {
  const map = new Map();
  if (Array.isArray(input)) {
    input.forEach((raw) => {
      const entry = normalizeEntry(raw);
      if (entry) map.set(String(entry.companyNo), entry);
    });
    return map;
  }
  if (input && typeof input === "object") {
    Object.values(input).forEach((raw) => {
      const entry = normalizeEntry(raw);
      if (entry) map.set(String(entry.companyNo), entry);
    });
  }
  return map;
}

/* Gabung dua daftar pelacak jadi satu peta { "<no>": entri }.
 * Nomor yang sama: tanggal yang lebih baru menang. Tanggal sama:
 * entri lokal dipertahankan. Nomor yang beda: keduanya disimpan.
 * Daftar kosong atau entri yang tidak sah tidak membuat error. */
export function mergeTrackers(local, remote) {
  const merged = toMap(local);
  toMap(remote).forEach((entry, key) => {
    const cur = merged.get(key);
    if (!cur || (entry.tanggal || "") > (cur.tanggal || "")) {
      merged.set(key, entry);
    }
  });
  const out = {};
  merged.forEach((entry, key) => {
    out[key] = entry;
  });
  return out;
}

/* Baca pelacak akun, gabung dengan pelacak lokal, tulis hasilnya
 * kembali ke akun. Kembalikan { ok, merged, localCount, remoteCount }
 * atau { ok: false, error } bila gagal; gagal sync tidak pernah
 * melempar dan tidak mengubah data lokal. */
export async function syncTrackers(uid, localEntries) {
  if (typeof uid !== "string" || !uid) {
    return { ok: false, error: "UID akun tidak ada." };
  }
  try {
    const [{ collection, doc, getDocs, writeBatch }, { db }] =
      await Promise.all([
        import("firebase/firestore"),
        import("./firebase.js"),
      ]);
    const itemsRef = collection(db, "user_trackers", uid, "items");
    const snap = await getDocs(itemsRef);
    const remote = {};
    snap.docs.forEach((d) => {
      remote[d.id] = d.data();
    });
    const merged = mergeTrackers(localEntries, remote);
    const localCount = Object.keys(toMap(localEntries)).length;
    const remoteCount = Object.keys(toMap(remote)).length;
    const batch = writeBatch(db);
    Object.values(merged).forEach((entry) => {
      batch.set(
        doc(itemsRef, String(entry.companyNo)),
        { ...entry, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    });
    await batch.commit();
    return { ok: true, merged, localCount, remoteCount };
  } catch {
    return { ok: false, error: "Sinkronisasi gagal." };
  }
}

/* Tulis atau perbarui profil akun (user_profiles/{uid}) dengan email
 * dan nama tampilan. Dipanggil sekali saat masuk atau daftar berhasil,
 * supaya dasbor admin bisa menampilkan akun tanpa email tersimpan di
 * dalam event pengunjung. Gagal tulis tidak pernah melempar. */
export async function saveUserProfile(user) {
  if (!user || typeof user.uid !== "string" || !user.uid) {
    return { ok: false, error: "Pengguna tidak ada." };
  }
  try {
    const [{ doc, setDoc }, { db }] = await Promise.all([
      import("firebase/firestore"),
      import("./firebase.js"),
    ]);
    await setDoc(
      doc(db, "user_profiles", user.uid),
      {
        email: typeof user.email === "string" ? user.email : "",
        displayName:
          typeof user.displayName === "string" ? user.displayName : "",
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return { ok: true };
  } catch {
    return { ok: false, error: "Profil gagal disimpan." };
  }
}
