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

/* Pesan bawaan (Bahasa Indonesia) untuk error dan hasil aksi akun.
 * W2a (UX-08): fungsi di bawah menerima objek pesan opsional sebagai
 * argumen terakhir — panel akun dan pengaturan meneruskan label
 * terjemahan dari layout; tanpa argumen itu pesan Indonesia di sini
 * yang dipakai, jadi pemanggil lama dan tes lama tidak berubah. */
const DEFAULT_AUTH_MESSAGES = {
  invalidEmail: "Alamat email tidak dikenal. Periksa lagi tulisannya.",
  wrongCredentials: "Email atau kata sandi salah.",
  cannotRegister: "Tidak bisa mendaftar sekarang. Coba lagi sebentar lagi.",
  weakPassword: "Kata sandi terlalu pendek, minimal 6 huruf.",
  tooManyRequests: "Terlalu sering mencoba. Tunggu sebentar lalu coba lagi.",
  noConnection: "Tidak ada koneksi. Periksa internet lalu coba lagi.",
  cannotSignIn: "Tidak bisa masuk sekarang. Coba lagi sebentar lagi.",
  resetSent:
    "Tautan untuk membuat kata sandi baru sudah dikirim ke email itu. " +
    "Periksa kotak masuk, lalu ikuti tautannya.",
  cannotSendReset:
    "Tidak bisa mengirim tautan sekarang. Coba lagi sebentar lagi.",
  noAccount: "Tidak ada akun yang masuk.",
  verifySent:
    "Email verifikasi sudah dikirim. Buka email itu, ketuk tautannya, " +
    "lalu tekan Periksa lagi.",
};

function withAuthMessages(messages) {
  return { ...DEFAULT_AUTH_MESSAGES, ...(messages || {}) };
}

/* Terjemahan kode error Firebase Auth ke bahasa sehari-hari. */
export function authErrorMessage(code, messages) {
  const m = withAuthMessages(messages);
  switch (code) {
    case "auth/invalid-email":
      return m.invalidEmail;
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return m.wrongCredentials;
    case "auth/email-already-in-use":
      /* SEC-17: pesan sengaja NETRAL — sama nadanya dengan kegagalan
       * pendaftaran umum, tanpa menyebut email sudah dipakai.
       * Pesan lama ("Email ini sudah dipakai. Coba masuk, atau
       * pakai email lain.") membocorkan keberadaan email ke siapa
       * pun yang mencoba mendaftar dengan email orang lain. Kode
       * ini hanya muncul saat pendaftaran (createUser), jadi pesan
       * ini tidak pernah tampil di alur masuk. */
      return m.cannotRegister;
    case "auth/weak-password":
      return m.weakPassword;
    case "auth/too-many-requests":
      return m.tooManyRequests;
    case "auth/network-request-failed":
      return m.noConnection;
    default:
      return m.cannotSignIn;
  }
}

/* Hasil permintaan tautan reset kata sandi, dari kode error Firebase
 * (null bila berhasil). Sengaja tidak membedakan email terdaftar
 * dan tidak: keduanya mendapat pesan yang sama, supaya keberadaan
 * email tidak bocor. Kembalikan { sent, message }. */
export function passwordResetOutcome(code, messages) {
  const m = withAuthMessages(messages);
  if (!code || code === "auth/user-not-found") {
    return {
      sent: true,
      message: m.resetSent,
    };
  }
  if (code === "auth/invalid-email") {
    return { sent: false, message: authErrorMessage(code, messages) };
  }
  if (
    code === "auth/too-many-requests" ||
    code === "auth/network-request-failed"
  ) {
    return { sent: false, message: authErrorMessage(code, messages) };
  }
  return {
    sent: false,
    message: m.cannotSendReset,
  };
}

/* Kirim email reset kata sandi. Kembalikan hasil passwordResetOutcome;
 * tidak pernah melempar. */
export async function sendPasswordReset(email, messages) {
  try {
    const [{ sendPasswordResetEmail }, { auth }] = await Promise.all([
      import("firebase/auth"),
      import("./firebase.js"),
    ]);
    await sendPasswordResetEmail(auth, email);
    return passwordResetOutcome(null, messages);
  } catch (err) {
    return passwordResetOutcome(err && err.code, messages);
  }
}

/* Kirim ulang email verifikasi ke pengguna yang masuk. Kembalikan
 * { ok, message }; tidak pernah melempar. */
export async function sendVerificationEmail(user, messages) {
  const m = withAuthMessages(messages);
  if (!user || typeof user.email !== "string" || !user.email) {
    return { ok: false, message: m.noAccount };
  }
  try {
    const { sendEmailVerification } = await import("firebase/auth");
    await sendEmailVerification(user);
    return {
      ok: true,
      message: m.verifySent,
    };
  } catch (err) {
    return { ok: false, message: authErrorMessage(err && err.code, messages) };
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

/* Rapikan satu event analitik untuk berkas ekspor. Kembalikan null
 * bila waktu/jenis/halaman tidak sah. Hanya field yang dikenal
 * yang disalin, dengan cek tipe — isi dari server tidak pernah
 * dipercaya mentah-mentah. */
function normalizeExportEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.ts !== "string" || !raw.ts) return null;
  if (typeof raw.type !== "string" || !raw.type) return null;
  if (typeof raw.path !== "string") return null;
  const event = { ts: raw.ts, type: raw.type, path: raw.path };
  if (typeof raw.q === "string" && raw.q) event.q = raw.q;
  if (Number.isInteger(raw.results)) event.results = raw.results;
  if (typeof raw.filter === "string" && raw.filter) {
    event.filter = raw.filter;
  }
  if (Number.isInteger(raw.companyNo)) event.companyNo = raw.companyNo;
  if (typeof raw.action === "string" && raw.action) {
    event.action = raw.action;
  }
  if (typeof raw.visitor === "string" && raw.visitor) {
    event.visitor = raw.visitor;
  }
  return event;
}

/* Batas pertahanan di sisi klien untuk event yang ikut diekspor
 * (server sudah membatasi 500; angka ini hanya pengaman bila
 * respons server berubah). */
const EXPORT_EVENTS_MAX = 500;

/* Catatan untuk berkas ekspor bila sinkron pelacak akun belum
 * selesai saat berkas dibuat (S8/C-06). Kembalikan null bila
 * tidak masuk akun (tidak ada yang perlu disinkron) atau bila
 * akun sudah tergabung di sesi ini (entri akun sudah ada di
 * perangkat). Kalimatnya sengaja berhati-hati ("bisa belum
 * ikut"): sinkron yang tertunda belum tentu berarti ada entri
 * yang hilang, tetapi pembaca berkas wajib tahu risikonya. */
export function exportSyncNote({ signedIn, accountMerged } = {}) {
  if (!signedIn || accountMerged) return null;
  return (
    "Sinkron dengan akun belum selesai saat berkas ini dibuat, " +
    "jadi sebagian tanda lamaran dari akun bisa belum ikut. " +
    "Coba unduh lagi setelah sinkron selesai."
  );
}

/* Susun isi berkas unduh data pengguna (JSON, dibuat di perangkat,
 * tidak dikirim ke mana pun). Masukan: profil akun (atau null bila
 * belum masuk), peta entri pelacak, pilihan onboarding, pencarian
 * terakhir, tema, dan nomor pengunjung. `now` hanya untuk tes
 * (tanggal ekspor yang tetap); pemanggil biasa tidak mengisinya.
 *
 * S8: dua masukan opsional baru — `analyticsEvents` (daftar event
 * analitik milik akun dari /api/akun/export; null bila tamu atau
 * bila pengambilan gagal) menjadi field `catatanKunjungan`, dan
 * `catatanEkspor` (string, mis. peringatan sinkron belum selesai
 * atau catatan kunjungan gagal diambil) menjadi field
 * `catatanEkspor` yang hanya ada bila ada catatan. */
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
  const analyticsEvents = Array.isArray(input.analyticsEvents)
    ? input.analyticsEvents
        .map(normalizeExportEvent)
        .filter(Boolean)
        .slice(0, EXPORT_EVENTS_MAX)
    : null;
  const catatanEkspor =
    typeof input.catatanEkspor === "string" && input.catatanEkspor
      ? input.catatanEkspor
      : null;
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
    /* Catatan kunjungan milik akun ini (null bila tamu, atau bila
     * pengambilan dari server gagal — lihat catatanEkspor). */
    catatanKunjungan: analyticsEvents,
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
    /* Hanya ada bila ada yang perlu diketahui pembaca berkas
     * (mis. sinkron belum selesai atau catatan kunjungan gagal
     * diambil) — berkas normal tanpa catatan tidak membawa
     * field ini. */
    ...(catatanEkspor ? { catatanEkspor } : {}),
  };
}
