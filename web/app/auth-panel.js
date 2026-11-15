"use client";

/* Panel akun Karir: masuk, daftar, dan keluar. Masuk itu pilihan,
 * bukan syarat: tanpa masuk pun semua fitur situs tetap bisa dipakai.
 * Yang didapat akun hanya satu hal, sinkronisasi pelacak lamaran ke
 * akun, supaya lamaran tidak hilang bila ganti perangkat.
 *
 * Firebase Auth diimpor malas (dynamic import) supaya halaman yang
 * tidak memakai akun tidak memuat SDK auth. Masuk memakai email dan
 * kata sandi. Masuk dengan Google tidak tersedia: provider Google
 * tidak aktif di Firebase Auth proyek ini, jadi tombolnya dihapus
 * (mengaktifkannya butuh pemilik mengaktifkan provider Google di
 * Firebase Console). Pesan error memakai bahasa sehari-hari. Email
 * tidak pernah ditulis ke event pengunjung. */
import { useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { clearAnalyticsUid, setAnalyticsUid } from "@/lib/analytics";
import {
  authErrorMessage,
  sendPasswordReset,
  sendVerificationEmail,
} from "@/lib/account-data";
import { consumeSessionEnded, markSignOutIntended } from "@/app/tracker";

export { authErrorMessage };

/* ============ BLOK LOGIKA MURNI (AKUN-12) ============
 * Fungsi-fungsi di antara penanda __PURE_START__ dan __PURE_END__
 * diuji unit lewat ekstraksi sumber di app/w2c-admin.test.js:
 * berkas ini tidak bisa diimpor langsung oleh node:test karena
 * JSX dan impor Next. Blok ini WAJIB mandiri: hanya memakai
 * global standar, tanpa impor atau state lain. Jangan menambah
 * ketergantungan di dalam blok ini.
/* __PURE_START__ */

/* Syarat kata sandi pendaftaran (AKUN-12): minimal 8 huruf (lebih
 * kuat dari batas 6 Firebase) dan skor kekuatan minimal 2. Batas
 * 8 HANYA untuk pendaftaran — akun lama dengan kata sandi 6-7
 * huruf tetap bisa masuk. */
export const MIN_PASSWORD_LENGTH_DAFTAR = 8;
export const MIN_STRENGTH_DAFTAR = 2;
/* Pendaftaran yang diisi kurang dari 3 detik sejak formulir
 * daftar tampil diperlakukan sebagai pola bot (bersama honeypot
 * di bawah): manusia tidak sempat mengetik email dan kata sandi
 * secepat itu. Sanksinya hanya pesan coba lagi, bukan blokir. */
export const REGISTER_MIN_FILL_MS = 3000;

/* Kata sandi yang terlalu umum: selalu dinilai Lemah dan ditolak
 * saat daftar, betapa pun panjangnya. Daftar kecil yang sengaja
 * singkat — hanya pola yang paling sering dipakai penyerang. */
export const COMMON_PASSWORDS = [
  "123456",
  "12345678",
  "123456789",
  "1234567890",
  "11111111",
  "00000000",
  "password",
  "password1",
  "password123",
  "qwerty123",
  "admin123",
  "karir123",
  "indonesia",
  "bismillah",
];

export function isCommonPassword(password) {
  if (typeof password !== "string") return false;
  return COMMON_PASSWORDS.includes(password.trim().toLowerCase());
}

/* Skor kekuatan kata sandi 0-5: +1 panjang >= 8, +1 panjang
 * >= 12, +1 huruf besar dan kecil, +1 angka, +1 karakter selain
 * huruf dan angka. Kata sandi umum selalu 0. Label: 0-1 Lemah,
 * 2 Cukup, 3 Bagus, 4-5 Kuat. */
export function passwordStrength(password) {
  const s = typeof password === "string" ? password : "";
  if (s.length === 0) return { score: 0, label: "Lemah", common: false };
  if (isCommonPassword(s)) return { score: 0, label: "Lemah", common: true };
  let score = 0;
  if (s.length >= 8) score++;
  if (s.length >= 12) score++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) score++;
  if (/\d/.test(s)) score++;
  if (/[^A-Za-z0-9]/.test(s)) score++;
  const label =
    score <= 1 ? "Lemah" : score === 2 ? "Cukup" : score === 3 ? "Bagus" : "Kuat";
  return { score, label, common: false };
}

/* True bila pendaftaran dikirim terlalu cepat sejak formulir
 * daftar tampil (pola bot, AKUN-12). */
export function isRegistrationTooFast(shownAtMs, nowMs) {
  if (!Number.isFinite(shownAtMs) || !Number.isFinite(nowMs)) return false;
  return nowMs - shownAtMs < REGISTER_MIN_FILL_MS;
}

/* __PURE_END__ */
/* ============ AKHIR BLOK LOGIKA MURNI ============ */

/* Label panel (W2a, UX-08/UX-13): diteruskan navigasi lewat props
 * (objek auth dari layout akar); tanpa props, teks Indonesia di
 * bawah dipakai sebagai cadangan. Kunci invalidEmail..verifySent
 * adalah pesan lib/account-data.js. */
const AUTH_DEFAULTS = {
  account: "Akun",
  loadingStatus: "Memuat status akun…",
  signedInAs: "Masuk sebagai",
  syncNote:
    "Lamaran di perangkat ini ikut tersimpan ke akun. Semua fitur tetap bisa dipakai tanpa masuk.",
  notVerifiedNote:
    "Email ini belum terverifikasi. Ketuk tautan di email verifikasi supaya akun ini dikenali sebagai milikmu.",
  resendVerify: "Kirim ulang email verifikasi",
  checkAgain: "Periksa lagi",
  verified: "Email sudah terverifikasi.",
  signingOut: "Keluar…",
  signOut: "Keluar",
  signInChoice:
    "Masuk itu pilihan. Tanpa masuk pun semua fitur tetap bisa dipakai, hanya lamaran yang tidak tersimpan ke akun.",
  modeLabel: "Pilih masuk atau daftar",
  signIn: "Masuk",
  signUp: "Daftar",
  displayName: "Nama tampilan (boleh kosong)",
  displayNameLabel: "Nama tampilan",
  displayNamePh: "Nama yang tampil di akun",
  email: "Email",
  password: "Kata sandi",
  passwordPh: "Minimal 6 huruf",
  passwordPhSignUp: "Minimal 8 huruf",
  wait: "Tunggu…",
  createAccount: "Buat akun",
  sending: "Mengirim…",
  forgotPassword: "Lupa kata sandi?",
  writeEmailFirst: "Tulis email dulu di kolom di atas, baru minta tautan.",
  verifyStillNot:
    "Email masih belum terverifikasi. Ketuk tautan di email yang dikirim, lalu periksa lagi.",
  verifyCheckFailed:
    "Status verifikasi belum bisa diperiksa. Coba lagi sebentar lagi.",
  close: "Tutup",
  invalidEmail: "Alamat email tidak dikenal. Periksa lagi tulisannya.",
  wrongCredentials: "Email atau kata sandi salah.",
  cannotRegister: "Tidak bisa mendaftar sekarang. Coba lagi sebentar lagi.",
  weakPassword: "Kata sandi terlalu pendek, minimal 6 huruf.",
  tooManyRequests: "Terlalu sering mencoba. Tunggu sebentar lalu coba lagi.",
  noConnection: "Tidak ada koneksi. Periksa internet lalu coba lagi.",
  cannotSignIn: "Tidak bisa masuk sekarang. Coba lagi sebentar lagi.",
  resetSent:
    "Tautan untuk membuat kata sandi baru sudah dikirim ke email itu. Periksa kotak masuk, lalu ikuti tautannya.",
  cannotSendReset:
    "Tidak bisa mengirim tautan sekarang. Coba lagi sebentar lagi.",
  noAccount: "Tidak ada akun yang masuk.",
  verifySent:
    "Email verifikasi sudah dikirim. Buka email itu, ketuk tautannya, lalu tekan Periksa lagi.",
};

/* Mengikuti status masuk pengguna beserta status muatnya (AKUN-13):
 * `loading` true sampai onAuthStateChanged pertama menjawab, supaya
 * pemanggil bisa membedakan "belum diketahui" dari "belum masuk".
 * Dipakai panel ini dan navigasi. */
export function useAuthStatus() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    import("firebase/auth").then(({ onAuthStateChanged }) => {
      if (cancelled) return;
      unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
  return { user, loading };
}

/* Kompatibilitas: pemanggil lama (mis. /pengaturan) hanya butuh
 * penggunanya. Panel ini dan navigasi memakai useAuthStatus
 * supaya tidak berkedip selama status masih dimuat. */
export function useAuthUser() {
  return useAuthStatus().user;
}

/* Pengamat status masuk yang selalu aktif: ditempel di setiap event
 * pengunjung, dan menyimpan profil akun sekali saat masuk atau
 * daftar berhasil. Tidak menampilkan apa pun. Gagal simpan profil
 * tidak mengganggu: pelacak lokal tetap jalan. */
export function AuthWatcher() {
  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    import("firebase/auth").then(({ onAuthStateChanged }) => {
      if (cancelled) return;
      unsub = onAuthStateChanged(auth, (u) => {
        if (!u) {
          clearAnalyticsUid();
          return;
        }
        setAnalyticsUid(u.uid);
        import("@/lib/tracker-sync")
          .then(({ saveUserProfile }) => saveUserProfile(u))
          .catch(() => {});
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
  return null;
}

export default function AuthPanel({ labels: labelsProp }) {
  const labels = { ...AUTH_DEFAULTS, ...(labelsProp || {}) };
  const { user, loading } = useAuthStatus();
  const [mode, setMode] = useState("masuk");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  /* Hanya pemicunya yang dipakai: menaikkan angka ini memaksa
   * render ulang supaya status terverifikasi yang baru terbaca. */
  const [, setVerifyChecked] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  /* AKUN-12: honeypot pendaftaran — isian yang disembunyikan dari
   * manusia; bot pengisi formulir otomatis cenderung mengisinya. */
  const [website, setWebsite] = useState("");
  /* AKUN-12: kapan formulir daftar tampil (untuk gerbang isi
   * terlalu cepat). */
  const daftarShownAt = useRef(0);
  useEffect(() => {
    if (mode === "daftar") daftarShownAt.current = Date.now();
  }, [mode]);

  /* AKUN-10: bila sesi berakhir sendiri (bukan keluar sengaja),
   * pelacak meninggalkan penanda — tampilkan sekali di sini
   * supaya pengguna tahu kenapa kembali ke form masuk. */
  useEffect(() => {
    if (loading || user) return;
    /* setState dijadwalkan sebagai microtask: setState di dalam
     * callback, bukan sinkron di badan effect (pola yang sama
     * dengan hook lain di repo). */
    queueMicrotask(() => {
      if (consumeSessionEnded()) {
        setInfo(
          "Sesi akun berakhir. Masuk lagi untuk menyimpan lamaran ke akun.",
        );
      }
    });
  }, [loading, user]);

  /* AKUN-12: kekuatan kata sandi yang sedang diketik (untuk
   * pengukur di mode daftar). */
  const strength = passwordStrength(password);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (mode === "daftar") {
      /* AKUN-12: honeypot terisi atau formulir dikirim terlalu
       * cepat = pola bot. Pesannya generik supaya jebakannya
       * tidak terungkap; manusia yang tidak sengaja kena cukup
       * mencoba lagi. */
      if (website.trim()) {
        setError("Tidak bisa mendaftar sekarang. Coba lagi sebentar lagi.");
        return;
      }
      if (isRegistrationTooFast(daftarShownAt.current, Date.now())) {
        setError("Tidak bisa mendaftar sekarang. Coba lagi sebentar lagi.");
        return;
      }
      if (password.length < MIN_PASSWORD_LENGTH_DAFTAR) {
        setError("Kata sandi minimal 8 huruf.");
        return;
      }
      if (strength.common) {
        setError(
          "Kata sandi ini terlalu umum dipakai. Pakai kombinasi lain.",
        );
        return;
      }
      if (strength.score < MIN_STRENGTH_DAFTAR) {
        setError(
          "Kata sandi masih lemah. Campur huruf besar, huruf kecil, dan angka.",
        );
        return;
      }
    }
    setBusy(true);
    try {
      const {
        createUserWithEmailAndPassword,
        signInWithEmailAndPassword,
        sendEmailVerification,
        updateProfile,
      } = await import("firebase/auth");
      if (mode === "daftar") {
        const cred = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
        const displayName = name.trim();
        if (displayName) {
          await updateProfile(cred.user, { displayName }).catch(() => {});
        }
        /* Email verifikasi dikirim sekali saat daftar; gagal kirim
         * tidak menggagalkan pendaftaran, tombol kirim ulang di
         * tampilan akun menutupinya. */
        await sendEmailVerification(cred.user).catch(() => {});
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      setPassword("");
    } catch (err) {
      setError(authErrorMessage(err && err.code, labels));
    }
    setBusy(false);
  }

  /* Lupa kata sandi: kirim tautan reset ke email yang tertulis.
   * Pesannya sama untuk email terdaftar maupun tidak, supaya
   * keberadaan email tidak bocor. */
  async function forgotPassword() {
    const address = email.trim();
    if (!address) {
      setError(labels.writeEmailFirst);
      setInfo("");
      return;
    }
    setError("");
    setInfo("");
    setResetBusy(true);
    const result = await sendPasswordReset(address, labels);
    if (result.sent) {
      setInfo(result.message);
    } else {
      setError(result.message);
    }
    setResetBusy(false);
  }

  async function resendVerification() {
    if (!user) return;
    setError("");
    setInfo("");
    setVerifyBusy(true);
    const result = await sendVerificationEmail(user, labels);
    if (result.ok) {
      setInfo(result.message);
    } else {
      setError(result.message);
    }
    setVerifyBusy(false);
  }

  /* Muat ulang status akun dari server, supaya tanda terverifikasi
   * muncul setelah pengguna mengetuk tautan di emailnya. */
  async function recheckVerification() {
    if (!user) return;
    setError("");
    setInfo("");
    setVerifyBusy(true);
    try {
      await user.reload();
      setVerifyChecked((n) => n + 1);
      if (user.emailVerified) {
        setInfo(labels.verified);
      } else {
        setInfo(labels.verifyStillNot);
      }
    } catch {
      setError(labels.verifyCheckFailed);
    }
    setVerifyBusy(false);
  }

  async function signOutUser() {
    setSigningOut(true);
    try {
      const { signOut } = await import("firebase/auth");
      /* AKUN-10: tandai keluar yang disengaja, supaya pelacak
       * tidak salah menafsirkannya sebagai sesi yang berakhir. */
      markSignOutIntended();
      await signOut(auth);
    } catch {
      /* Tetap tampil masuk bila keluar gagal; coba lagi dari sini. */
    }
    setSigningOut(false);
  }

  /* AKUN-13: status masuk belum diketahui — tampilkan penahan,
   * bukan form masuk yang berkedip. */
  if (loading) {
    return (
      <div className="filters" style={{ marginTop: 16 }}>
        <p className="section-label">{labels.account}</p>
        <p className="section-note" role="status">
          {labels.loadingStatus}
        </p>
      </div>
    );
  }

  if (user) {
    return (
      <div className="filters" style={{ marginTop: 16 }}>
        <p className="section-label">{labels.account}</p>
        <p>
          {labels.signedInAs} <strong>{user.email}</strong>
          {user.displayName ? ` (${user.displayName})` : ""}
        </p>
        <p className="section-note">{labels.syncNote}</p>
        {!user.emailVerified && (
          <>
            <p className="notice">{labels.notVerifiedNote}</p>
            <div className="filter-actions">
              <button
                className="btn ghost small"
                type="button"
                onClick={resendVerification}
                disabled={verifyBusy}
              >
                {verifyBusy ? labels.sending : labels.resendVerify}
              </button>
              <button
                className="btn ghost small"
                type="button"
                onClick={recheckVerification}
                disabled={verifyBusy}
              >
                {labels.checkAgain}
              </button>
            </div>
          </>
        )}
        {user.emailVerified && (
          <p className="section-note">{labels.verified}</p>
        )}
        {/* AKSES-05: hasil aksi akun diumumkan — info sebagai status,
          * error sebagai alert. */}
        {info && (
          <p className="notice" role="status">
            {info}
          </p>
        )}
        {error && (
          <p className="notice" role="alert" id="akun-error">
            {error}
          </p>
        )}
        <div className="filter-actions">
          <button
            className="btn ghost small"
            type="button"
            onClick={signOutUser}
            disabled={signingOut}
          >
            {signingOut ? labels.signingOut : labels.signOut}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="filters" style={{ marginTop: 16 }}>
      <p className="section-label">{labels.account}</p>
      <p className="section-note">{labels.signInChoice}</p>
      <div className="chip-row" role="group" aria-label={labels.modeLabel}>
        {/* UX-13: tombol mode aktif memakai kelas .btn (latar gelap
          * dari variabel tema), bukan gaya sebaris warna gelap/putih
          * yang tidak mengikuti tema gelap. */}
        <button
          type="button"
          className={mode === "masuk" ? "btn small" : "btn ghost small"}
          aria-pressed={mode === "masuk"}
          onClick={() => {
            setMode("masuk");
            setError("");
            setInfo("");
          }}
        >
          {labels.signIn}
        </button>
        <button
          type="button"
          className={mode === "daftar" ? "btn small" : "btn ghost small"}
          aria-pressed={mode === "daftar"}
          onClick={() => {
            setMode("daftar");
            setError("");
            setInfo("");
          }}
        >
          {labels.signUp}
        </button>
      </div>
      <form onSubmit={submit}>
        {mode === "daftar" && (
          <fieldset>
            <legend>{labels.displayName}</legend>
            {/* AKSES-06: legend memberi konteks, tetapi label eksplisit
              * memberi nama aksesibel yang pasti pada tiap isian.
              * Label disembunyikan visual (sr-only) karena legend
              * sudah tampil di layar. */}
            <label className="sr-only" htmlFor="akun-nama">
              {labels.displayNameLabel}
            </label>
            <input
              id="akun-nama"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
              maxLength={100}
              placeholder={labels.displayNamePh}
              aria-describedby={error ? "akun-error" : undefined}
            />
          </fieldset>
        )}
        <fieldset>
          <legend>{labels.email}</legend>
          <label className="sr-only" htmlFor="akun-email">
            {labels.email}
          </label>
          <input
            id="akun-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            placeholder="nama@email.com"
            aria-describedby={error ? "akun-error" : undefined}
          />
        </fieldset>
        <fieldset>
          <legend>{labels.password}</legend>
          <label className="sr-only" htmlFor="akun-password">
            {labels.password}
          </label>
          <input
            id="akun-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === "daftar" ? "new-password" : "current-password"}
            minLength={mode === "daftar" ? MIN_PASSWORD_LENGTH_DAFTAR : 6}
            placeholder={
              mode === "daftar" ? labels.passwordPhSignUp : labels.passwordPh
            }
            aria-describedby={error ? "akun-error" : undefined}
          />
        </fieldset>
        {/* AKUN-12: pengukur kekuatan, hanya saat daftar dan hanya
          * bila sudah ada yang diketik. Bilah memakai token warna
          * yang sama dengan status lain di situs. */}
        {mode === "daftar" && password.length > 0 && (
          <div role="status">
            <p className="section-note">
              Kekuatan kata sandi: {strength.label}
              {strength.common ? " — kata sandi ini terlalu umum." : ""}
            </p>
            <div
              aria-hidden="true"
              style={{
                height: 6,
                background: "var(--sunken)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(strength.score / 5) * 100}%`,
                  height: "100%",
                  background:
                    strength.score <= 1 ? "var(--warn)" : "var(--ok)",
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
        )}
        {/* AKUN-12: honeypot pendaftaran — disembunyikan dari
          * manusia (sr-only + di luar urutan tab + tersembunyi
          * dari pembaca layar); bot pengisi formulir otomatis
          * cenderung mengisinya dan pengiriman ditolak diam-diam. */}
        {mode === "daftar" && (
          <div aria-hidden="true">
            <label className="sr-only" htmlFor="akun-website">
              Situs web (biarkan kosong)
            </label>
            <input
              id="akun-website"
              className="sr-only"
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              autoComplete="off"
              tabIndex={-1}
            />
          </div>
        )}
        {error && (
          <p className="notice" role="alert" id="akun-error">
            {error}
          </p>
        )}
        {info && (
          <p className="notice" role="status">
            {info}
          </p>
        )}
        <div className="filter-actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy
              ? labels.wait
              : mode === "daftar"
                ? labels.createAccount
                : labels.signIn}
          </button>
          {mode === "masuk" && (
            <button
              className="btn ghost small"
              type="button"
              onClick={forgotPassword}
              disabled={busy || resetBusy}
            >
              {resetBusy ? labels.sending : labels.forgotPassword}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
