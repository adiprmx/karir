/* Sinkronisasi pelacak lamaran ke akun (opsional).
 * Tamu tetap memakai localStorage seperti biasa. Saat ada pengguna
 * yang masuk, pelacak lokalnya digabung dengan yang tersimpan di akun,
 * lalu hasilnya ditulis ke akun dan kembali ke perangkat ini. Salinan
 * lokal tidak pernah dihapus oleh sinkronisasi ini.
 *
 * Penghapusan ikut tersinkron (W-P0-05 / LAM-01): menghapus lamaran
 * mencatat penanda hapus (tombstone) di localStorage dan, bila sedang
 * masuk, langsung menghapus dokumen akunnya (deleteTracker). Hapus
 * yang dilakukan saat keluar atau offline tetap tercatat sebagai
 * tombstone, lalu syncTrackers menghapus dokumen akunnya pada
 * sinkron berikutnya. Tombstone yang dokumen akunnya ternyata lebih
 * baru (lamaran ditambah lagi dari perangkat lain) dibuang dan
 * entrinya dipertahankan.
 *
 * Bentuk satu entri pelacak: { companyNo, status, tanggal, catatan }.
 * companyNo angka 1-10000, status salah satu dari TRACKER_STATUSES,
 * tanggal string YYYY-MM-DD (boleh kosong), catatan string maks 200
 * huruf. Di localStorage entri disimpan sebagai peta dengan kunci
 * nomor perusahaan dan field `no`; di akun disimpan satu dokumen per
 * perusahaan di subkoleksi user_trackers/{uid}/items/{companyNo}.
 * mergeTrackers menerima peta atau larik, jadi kedua bentuk bisa
 * digabung. Modul ini murni di tingkat atas: Firebase diimpor malas
 * di dalam fungsi, supaya tes unit dan halaman tamu tidak memuat SDK.
 *
 * T3 (LAM-03/04/05, AKUN-02/06): perubahan setelah masuk dikirim ke
 * akun saat terjadi (pushTracker, debounce di app/tracker.js), bukan
 * hanya saat masuk; bentrok diselesaikan dengan updatedAt (waktu
 * ubah), bukan tanggal lamaran; penanda hapus dipisah per akun
 * supaya tidak menghapus lamaran akun lain di perangkat bersama;
 * semua kegagalan mengembalikan `code` (offline/sibuk/ditolak/sesi/
 * gagal) supaya antarmuka bisa menjelaskan tanpa istilah teknis.
 * Fungsi yang menyentuh Firestore menerima klien suntik sebagai
 * argumen terakhir (untuk tes dengan mock, tanpa jaringan). */

export const TRACKER_STATUSES = [
  "Ditandai",
  "Sudah dilamar",
  "Dipanggil",
  "Ditolak",
];

const MAX_COMPANY_NO = 10000;
const MAX_CATATAN = 200;

/* Kunci localStorage untuk penanda hapus (tombstone): peta
 * { "<companyNo>": "waktu-hapus-ISO" }. Tombstone dicatat setiap
 * kali pengguna menghapus lamaran, termasuk saat keluar atau
 * offline, supaya sinkron berikutnya menghapus dokumen akunnya.
 * Tombstone dibersihkan setelah penghapusan di akun terkonfirmasi. */
export const TOMBSTONE_KEY = "karir-lamaran-dihapus";

/* Kunci penanda hapus untuk satu akun (AKUN-06): penanda hapus
 * milik satu akun tidak boleh menghapus lamaran akun lain di
 * perangkat bersama. Tanpa uid, kembalikan kunci global lama
 * (dipakai sebelum T3). Kunci global TIDAK pernah diterapkan ke
 * akun mana pun sejak T3: penanda lama tidak bisa dipastikan
 * milik akun yang sedang masuk, jadi menerapkannya berisiko
 * menghapus data orang lain; penanda itu dibiarkan tidak terpakai
 * dan penghapusan lama yang belum terkirim perlu diulang sekali
 * oleh pemiliknya. */
export function tombstoneKeyFor(uid) {
  return typeof uid === "string" && uid
    ? `${TOMBSTONE_KEY}:${uid}`
    : TOMBSTONE_KEY;
}

/* Baca tombstone dari localStorage. Kembalikan peta kosong bila
 * tidak ada, rusak, atau di luar browser (mis. saat tes unit).
 * Bila uid diisi, baca kunci akun itu; tanpa uid, baca kunci
 * global lama. */
export function readTombstones(uid) {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(tombstoneKeyFor(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (typeof value === "string") out[key] = value;
    });
    return out;
  } catch {
    return {};
  }
}

/* Tulis peta tombstone ke localStorage. Kembalikan false bila
 * browser menolak menyimpan atau di luar browser. Bila uid diisi,
 * tulis ke kunci akun itu. */
export function writeTombstones(tombstones, uid) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      tombstoneKeyFor(uid),
      JSON.stringify(tombstones || {}),
    );
    return true;
  } catch {
    return false;
  }
}

/* Catat penanda hapus untuk satu perusahaan (waktu sekarang).
 * Kembalikan peta tombstone terbaru; nomor tidak sah diabaikan.
 * Bila uid diisi, catat di kunci akun itu. */
export function recordTombstone(companyNo, uid) {
  const no = Number(companyNo);
  if (!Number.isInteger(no) || no < 1 || no > MAX_COMPANY_NO) {
    return readTombstones(uid);
  }
  const next = {
    ...readTombstones(uid),
    [String(no)]: new Date().toISOString(),
  };
  writeTombstones(next, uid);
  return next;
}

/* Terapkan penanda hapus ke hasil gabung. Fungsi murni (tanpa
 * Firebase, tanpa localStorage) supaya bisa diuji unit.
 *
 * Untuk tiap companyNo di tombstone:
 * - dokumen akun tidak ada -> entri dihapus dari hasil gabung,
 *   tidak ada yang perlu dihapus di akun, tombstone selesai;
 * - updatedAt akun <= waktu tombstone -> entri dihapus dari hasil
 *   gabung dan dokumen akun ditandai untuk dihapus;
 * - updatedAt akun LEBIH BARU dari tombstone -> lamaran ditambah
 *   lagi dari perangkat lain setelah dihapus di sini, jadi entri
 *   dipertahankan dan tombstonenya dibuang.
 * Dokumen akun tanpa updatedAt dianggap lebih lama dari tombstone
 * (niat hapus menang). Nilai tombstone yang bukan tanggal sah juga
 * dianggap menang atas dokumen akun mana pun.
 *
 * Kembalikan { merged, toDelete, remainingTombstones }: merged
 * hasil gabung yang sudah bersih, toDelete daftar companyNo yang
 * dokumen akunnya harus dihapus, remainingTombstones penanda yang
 * masih menunggu konfirmasi hapus di akun. Masukan tidak diubah. */
export function applyTombstones(merged, remote, tombstones) {
  const out = { ...(merged || {}) };
  const toDelete = [];
  const remainingTombstones = {};
  Object.entries(tombstones || {}).forEach(([key, deletedAt]) => {
    const remoteDoc =
      remote && typeof remote === "object" ? remote[key] : undefined;
    if (!remoteDoc) {
      delete out[key];
      return;
    }
    const tombTime = Date.parse(deletedAt);
    const remoteTime = Date.parse(remoteDoc.updatedAt);
    const tombWins =
      Number.isNaN(tombTime) ||
      Number.isNaN(remoteTime) ||
      remoteTime <= tombTime;
    if (tombWins) {
      delete out[key];
      toDelete.push(key);
      remainingTombstones[key] = deletedAt;
    }
    /* Bila dokumen akun lebih baru, entri dipertahankan dan
     * tombstonenya dibuang (tidak masuk remainingTombstones). */
  });
  return { merged: out, toDelete, remainingTombstones };
}

/* Bersihkan tombstone yang penghapusannya di akun sudah
 * terkonfirmasi. Fungsi murni: kembalikan salinan peta tanpa kunci
 * yang ada di daftar `deleted`. Masukan tidak diubah. */
export function pruneTombstones(tombstones, deleted) {
  const out = { ...(tombstones || {}) };
  (Array.isArray(deleted) ? deleted : []).forEach((key) => {
    delete out[String(key)];
  });
  return out;
}

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
  const entry = { companyNo: no, status: raw.status, tanggal, catatan };
  /* updatedAt dipertahankan untuk penyelesaian bentrok (LAM-05):
   * entri yang diubah belakangan yang menang, bukan yang tanggal
   * lamarannya belakangan. Nilai yang bukan tanggal sah dibuang,
   * supaya entri lama tanpa updatedAt jatuh ke fallback tanggal. */
  if (
    typeof raw.updatedAt === "string" &&
    !Number.isNaN(Date.parse(raw.updatedAt))
  ) {
    entry.updatedAt = raw.updatedAt;
  }
  return entry;
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
 * Nomor yang sama: yang diubah belakangan menang (bandingkan
 * updatedAt, LAM-05). Bila salah satu sisi tidak punya updatedAt
 * yang sah (entri lama), fallback ke tanggal lamaran seperti dulu;
 * tanggal sama: entri lokal dipertahankan. Nomor yang beda:
 * keduanya disimpan. Daftar kosong atau entri yang tidak sah
 * tidak membuat error. */
export function mergeTrackers(local, remote) {
  const merged = toMap(local);
  toMap(remote).forEach((entry, key) => {
    const cur = merged.get(key);
    if (!cur) {
      merged.set(key, entry);
      return;
    }
    const remoteTime = Date.parse(entry.updatedAt || "");
    const curTime = Date.parse(cur.updatedAt || "");
    if (!Number.isNaN(remoteTime) && !Number.isNaN(curTime)) {
      if (remoteTime > curTime) merged.set(key, entry);
      return;
    }
    if ((entry.tanggal || "") > (cur.tanggal || "")) {
      merged.set(key, entry);
    }
  });
  const out = {};
  merged.forEach((entry, key) => {
    out[key] = entry;
  });
  return out;
}

/* Kelompokkan error Firestore ke kode yang bisa dijelaskan ke
 * pengguna tanpa istilah teknis (kondisi terdegradasi, S4):
 * "offline" (tidak tersambung), "sibuk" (batas server tercapai,
 * 429), "ditolak" (izin), "sesi" (sesi akun berakhir), "gagal"
 * (lainnya). Fungsi murni: tanpa Firebase; cek navigator hanya
 * bila ada (di tes unit navigator tidak ada). */
export function classifySyncError(error) {
  const code = error && typeof error.code === "string" ? error.code : "";
  if (code === "unavailable") return "offline";
  if (code === "resource-exhausted") return "sibuk";
  if (code === "permission-denied") return "ditolak";
  if (code === "unauthenticated") return "sesi";
  if (
    typeof navigator !== "undefined" &&
    navigator &&
    navigator.onLine === false
  ) {
    return "offline";
  }
  return "gagal";
}

/* Ambil API Firestore: klien yang disuntikkan (untuk tes dengan
 * mock) atau impor malas SDK asli. Bentuk klien suntik sama
 * dengan yang dipakai fungsi-fungsi di bawah: { db, collection,
 * doc, getDocs, writeBatch, deleteDoc, setDoc }. */
async function loadFirestore(provided) {
  if (provided && typeof provided === "object") return provided;
  const [{ collection, doc, getDocs, writeBatch, deleteDoc, setDoc }, { db }] =
    await Promise.all([import("firebase/firestore"), import("./firebase.js")]);
  return { db, collection, doc, getDocs, writeBatch, deleteDoc, setDoc };
}

/* Baca pelacak akun, gabung dengan pelacak lokal, terapkan penanda
 * hapus, tulis hasilnya kembali ke akun. Kembalikan
 * { ok, merged, localCount, remoteCount, deletedCount,
 *   remainingTombstones } atau { ok: false, error, code } bila
 * gagal; gagal sync tidak pernah melempar dan tidak mengubah data
 * lokal maupun tombstone. Bila argumen tombstones tidak diisi,
 * tombstone dibaca dari localStorage untuk akun ini (kunci per
 * akun, AKUN-06), supaya pemanggil yang sudah ada (sinkron saat
 * masuk) ikut menghapus dokumen akun yang ditandai. Argumen
 * terakhir firestoreClient hanya untuk tes (mock Firestore). */
export async function syncTrackers(
  uid,
  localEntries,
  tombstones = {},
  firestoreClient = null,
) {
  if (typeof uid !== "string" || !uid) {
    return { ok: false, error: "UID akun tidak ada.", code: "gagal" };
  }
  const passed =
    tombstones && typeof tombstones === "object" ? tombstones : {};
  const fromStorage = Object.keys(passed).length === 0;
  const effective = fromStorage ? readTombstones(uid) : passed;
  try {
    const { db, collection, doc, getDocs, writeBatch } =
      await loadFirestore(firestoreClient);
    const itemsRef = collection(db, "user_trackers", uid, "items");
    const snap = await getDocs(itemsRef);
    const remote = {};
    snap.docs.forEach((d) => {
      remote[d.id] = d.data();
    });
    const mergedBefore = mergeTrackers(localEntries, remote);
    const { merged, toDelete, remainingTombstones } = applyTombstones(
      mergedBefore,
      remote,
      effective,
    );
    const localCount = toMap(localEntries).size;
    const remoteCount = toMap(remote).size;
    const batch = writeBatch(db);
    Object.values(merged).forEach((entry) => {
      batch.set(
        doc(itemsRef, String(entry.companyNo)),
        { ...entry, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    });
    toDelete.forEach((key) => {
      batch.delete(doc(itemsRef, key));
    });
    await batch.commit();
    const remaining = pruneTombstones(remainingTombstones, toDelete);
    if (fromStorage) writeTombstones(remaining, uid);
    return {
      ok: true,
      merged,
      localCount,
      remoteCount,
      deletedCount: toDelete.length,
      remainingTombstones: remaining,
    };
  } catch (error) {
    return {
      ok: false,
      error: "Sinkronisasi gagal.",
      code: classifySyncError(error),
    };
  }
}

/* Hapus satu lamaran dari akun (user_trackers/{uid}/items/{no}).
 * Kembalikan { ok } atau { ok: false, error, code }; tidak pernah
 * melempar. Dipanggil langsung saat pengguna menghapus lamaran
 * dalam keadaan masuk; bila gagal, tombstone yang dicatat pemanggil
 * menjamin sinkron berikutnya menghapusnya. Argumen terakhir
 * firestoreClient hanya untuk tes (mock Firestore). */
export async function deleteTracker(uid, companyNo, firestoreClient = null) {
  const no = Number(companyNo);
  if (typeof uid !== "string" || !uid) {
    return { ok: false, error: "UID akun tidak ada.", code: "gagal" };
  }
  if (!Number.isInteger(no) || no < 1 || no > MAX_COMPANY_NO) {
    return { ok: false, error: "Nomor perusahaan tidak sah.", code: "gagal" };
  }
  try {
    const { db, collection, doc, deleteDoc } =
      await loadFirestore(firestoreClient);
    const itemsRef = collection(db, "user_trackers", uid, "items");
    await deleteDoc(doc(itemsRef, String(no)));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: "Hapus dari akun gagal.",
      code: classifySyncError(error),
    };
  }
}

/* Kirim satu lamaran ke akun (LAM-03, push-on-change): dipanggil
 * setelah pengguna mengubah pelacak dalam keadaan masuk, supaya
 * perubahan tidak menunggu muat ulang. Tulis memakai merge agar
 * field lain di dokumen tidak hilang; updatedAt diperbarui.
 * Kembalikan { ok } atau { ok: false, error, code }; tidak pernah
 * melempar. Gagal kirim tidak mengubah data lokal; pemanggil
 * menandai status tertunda dan mencoba lagi nanti. Argumen
 * terakhir firestoreClient hanya untuk tes (mock Firestore). */
export async function pushTracker(uid, entry, firestoreClient = null) {
  if (typeof uid !== "string" || !uid) {
    return { ok: false, error: "UID akun tidak ada.", code: "gagal" };
  }
  const clean = normalizeEntry(entry);
  if (!clean) {
    return { ok: false, error: "Lamaran tidak sah.", code: "gagal" };
  }
  try {
    const { db, collection, doc, setDoc } =
      await loadFirestore(firestoreClient);
    const itemsRef = collection(db, "user_trackers", uid, "items");
    await setDoc(
      doc(itemsRef, String(clean.companyNo)),
      { ...clean, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: "Kirim ke akun gagal.",
      code: classifySyncError(error),
    };
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
