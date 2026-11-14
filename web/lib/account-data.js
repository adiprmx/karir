/* Data akun Karir: pesan error masuk, lupa kata sandi, verifikasi
 * email, daftar kunci data lokal, dan unduh data pengguna (T4).
 *
 * Modul ini murni di tingkat atas: Firebase diimpor malas di dalam
 * fungsi yang memakainya, supaya tes unit dan halaman tamu tidak
 * memuat SDK. Komponen (panel akun, pengaturan) memakai fungsi di
 * sini; pesan-pesannya memakai bahasa sehari-hari, tanpa istilah
 * teknis, dan tidak pernah membocorkan apakah sebuah email terdaftar
 * atau tidak.
 *
 * Masuk dengan Google TIDAK tersedia: provider Google tidak aktif
 * di Firebase Auth proyek ini (terverifikasi koordinator lewat
 * konfigurasi Identity Toolkit, hanya email yang aktif). Tombolnya
 * dihapus dari panel akun; mengaktifkannya butuh pemilik
 * mengaktifkan provider Google di Firebase Console. */
import { TRACKER_STATUSES } from "./tracker-sync.js";

/* Terjemahan kode error Firebase Auth ke bahasa sehari-hari. */
export function authErrorMessage(code) {
  switch (code) {
    case "auth/invalid-email":
      return "Alamat email tidak dikenal. Periksa lagi tulisannya.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email atau kata sandi salah.";
    case "auth/email-already-in-use":
      /* SEC-17: pesan sengaja NETRAL — sama nadanya dengan kegagalan
       * pendaftaran umum, tanpa menyebut email sudah dipakai.
       * Pesan lama ("Email ini sudah dipakai. Coba masuk, atau
       * pakai email lain.") membocorkan keberadaan email ke siapa
       * pun yang mencoba mendaftar dengan email orang lain. Kode
       * ini hanya muncul saat pendaftaran (createUser), jadi pesan
       * ini tidak pernah tampil di alur masuk. */
      return "Tidak bisa mendaftar sekarang. Coba lagi sebentar lagi.";
    case "auth/weak-password":
      return "Kata sandi terlalu pendek, minimal 6 huruf.";
    case "auth/too-many-requests":
      return "Terlalu sering mencoba. Tunggu sebentar lalu coba lagi.";
    case "auth/network-request-failed":
      return "Tidak ada koneksi. Periksa internet lalu coba lagi.";
    default:
      return "Tidak bisa masuk sekarang. Coba lagi sebentar lagi.";
  }
}

/* Hasil permintaan tautan reset kata sandi, dari kode error Firebase
 * (null bila berhasil). Sengaja tidak membedakan email terdaftar
 * dan tidak: keduanya mendapat pesan yang sama, supaya keberadaan
 * email tidak bocor. Kembalikan { sent, message }. */
export function passwordResetOutcome(code) {
  if (!code || code === "auth/user-not-found") {
    return {
      sent: true,
      message:
        "Tautan untuk membuat kata sandi baru sudah dikirim ke email itu. " +
        "Periksa kotak masuk, lalu ikuti tautannya.",
    };
  }
  if (code === "auth/invalid-email") {
    return { sent: false, message: authErrorMessage(code) };
  }
  if (
    code === "auth/too-many-requests" ||
    code === "auth/network-request-failed"
  ) {
    return { sent: false, message: authErrorMessage(code) };
  }
  return {
    sent: false,
    message: "Tidak bisa mengirim tautan sekarang. Coba lagi sebentar lagi.",
  };
}

/* Kirim email reset kata sandi. Kembalikan hasil passwordResetOutcome;
 * tidak pernah melempar. */
export async function sendPasswordReset(email) {
  try {
    const [{ sendPasswordResetEmail }, { auth }] = await Promise.all([
      import("firebase/auth"),
      import("./firebase.js"),
    ]);
    await sendPasswordResetEmail(auth, email);
    return passwordResetOutcome(null);
  } catch (err) {
    return passwordResetOutcome(err && err.code);
  }
}

/* Kirim ulang email verifikasi ke pengguna yang masuk. Kembalikan
 * { ok, message }; tidak pernah melempar. */
export async function sendVerificationEmail(user) {
  if (!user || typeof user.email !== "string" || !user.email) {
    return { ok: false, message: "Tidak ada akun yang masuk." };
  }
  try {
    const { sendEmailVerification } = await import("firebase/auth");
    await sendEmailVerification(user);
    return {
      ok: true,
      message:
        "Email verifikasi sudah dikirim. Buka email itu, ketuk tautannya, " +
        "lalu tekan Periksa lagi.",
    };
  } catch (err) {
    return { ok: false, message: authErrorMessage(err && err.code) };
  }
}

/* Kunci localStorage untuk nomor pengunjung analitik: nomor acak
 * yang dibuat browser, dipakai menghitung pengunjung tanpa nama. */
export const VISITOR_KEY = "karir-visitor";

/* Keenam kunci data lokal Karir. "Hapus semua data" di Pengaturan
 * menghapus semuanya (AKUN-05, FE-02). Kunci penanda hapus pelacak
 * (karir-lamaran-dihapus) sengaja TIDAK ada di sini: penanda itu
 * adalah jaminan hapus di akun pada sinkron berikutnya, jadi
 * menghapusnya justru bisa membangkitkan lamaran yang sudah dihapus. */
export const LOCAL_DATA_KEYS = [
  "karir-onboarding",
  "karir-lamaran",
  "karir-recent-search",
  VISITOR_KEY,
  "karir-theme",
  "karir-visited-metode",
];

/* Hapus keenam kunci dari penyimpanan (localStorage atau tiruan
 * dengan bentuk yang sama). Kembalikan daftar kunci yang benar-benar
 * ada lalu terhapus; tidak pernah melempar. */
export function clearLocalData(storage) {
  const removed = [];
  if (!storage || typeof storage.removeItem !== "function") return removed;
  LOCAL_DATA_KEYS.forEach((key) => {
    try {
      const existed =
        typeof storage.getItem === "function" &&
        storage.getItem(key) !== null;
      storage.removeItem(key);
      if (existed) removed.push(key);
    } catch {
      /* Browser menolak: lanjutkan ke kunci berikutnya. */
    }
  });
  return removed;
}

/* Rapikan satu entri pelacak untuk berkas ekspor. Kembalikan null
 * bila nomor perusahaan atau statusnya tidak sah. */
function normalizeExportEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const no = Number(raw.companyNo ?? raw.no);
  if (!Number.isInteger(no) || no < 1 || no > 10000) return null;
  if (!TRACKER_STATUSES.includes(raw.status)) return null;
  const tanggal =
    typeof raw.tanggal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.tanggal)
      ? raw.tanggal
      : "";
  return {
    no,
    status: raw.status,
    tanggal,
    catatan: typeof raw.catatan === "string" ? raw.catatan : "",
  };
}

/* Susun isi berkas unduh data pengguna (JSON, dibuat di perangkat,
 * tidak dikirim ke mana pun). Masukan: profil akun (atau null bila
 * belum masuk), peta entri pelacak, pilihan onboarding, pencarian
 * terakhir, tema, dan nomor pengunjung. `now` hanya untuk tes
 * (tanggal ekspor yang tetap); pemanggil biasa tidak mengisinya. */
export function buildAccountExport(data, now) {
  const input = data && typeof data === "object" ? data : {};
  const profile = input.profile;
  const entries = [];
  Object.values(input.trackers || {}).forEach((raw) => {
    const entry = normalizeExportEntry(raw);
    if (entry) entries.push(entry);
  });
  entries.sort((a, b) => a.no - b.no);
  const onboarding = input.onboarding;
  const recent = input.recentSearch;
  const theme =
    input.theme === "light" || input.theme === "dark" ? input.theme : null;
  const exportedAt =
    now instanceof Date && !Number.isNaN(now.getTime())
      ? now.toISOString()
      : new Date().toISOString();
  return {
    dieksporPada: exportedAt,
    akun:
      profile && typeof profile === "object"
        ? {
            email: typeof profile.email === "string" ? profile.email : "",
            namaTampilan:
              typeof profile.displayName === "string"
                ? profile.displayName
                : "",
            emailTerverifikasi: profile.emailVerified === true,
          }
        : null,
    tandaLamaran: entries,
    pengaturan: {
      pilihan:
        onboarding && typeof onboarding === "object"
          ? {
              domisili:
                typeof onboarding.domisili === "string"
                  ? onboarding.domisili
                  : "",
              posisi:
                typeof onboarding.posisi === "string" ? onboarding.posisi : "",
            }
          : null,
      pencarianTerakhir:
        recent && typeof recent === "object"
          ? {
              domisili:
                typeof recent.domisili === "string" ? recent.domisili : "",
              posisi: typeof recent.posisi === "string" ? recent.posisi : "",
            }
          : null,
      tema: theme,
    },
    nomorPengunjung:
      typeof input.visitorId === "string" && input.visitorId
        ? input.visitorId
        : null,
  };
}
