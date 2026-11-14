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
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { clearAnalyticsUid, setAnalyticsUid } from "@/lib/analytics";
import {
  authErrorMessage,
  sendPasswordReset,
  sendVerificationEmail,
} from "@/lib/account-data";

export { authErrorMessage };

/* Mengikuti status masuk pengguna. Dipakai panel ini dan navigasi
 * untuk menampilkan siapa yang sedang masuk. */
export function useAuthUser() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    import("firebase/auth").then(({ onAuthStateChanged }) => {
      if (cancelled) return;
      unsub = onAuthStateChanged(auth, setUser);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
  return user;
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

export default function AuthPanel() {
  const user = useAuthUser();
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

  async function submit(e) {
    e.preventDefault();
    setError("");
    setInfo("");
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
      setError(authErrorMessage(err && err.code));
    }
    setBusy(false);
  }

  /* Lupa kata sandi: kirim tautan reset ke email yang tertulis.
   * Pesannya sama untuk email terdaftar maupun tidak, supaya
   * keberadaan email tidak bocor. */
  async function forgotPassword() {
    const address = email.trim();
    if (!address) {
      setError("Tulis email dulu di kolom di atas, baru minta tautan.");
      setInfo("");
      return;
    }
    setError("");
    setInfo("");
    setResetBusy(true);
    const result = await sendPasswordReset(address);
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
    const result = await sendVerificationEmail(user);
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
        setInfo("Email sudah terverifikasi.");
      } else {
        setInfo(
          "Email masih belum terverifikasi. Ketuk tautan di email yang " +
            "dikirim, lalu periksa lagi.",
        );
      }
    } catch {
      setError("Status verifikasi belum bisa diperiksa. Coba lagi sebentar lagi.");
    }
    setVerifyBusy(false);
  }

  async function signOutUser() {
    setSigningOut(true);
    try {
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
    } catch {
      /* Tetap tampil masuk bila keluar gagal; coba lagi dari sini. */
    }
    setSigningOut(false);
  }

  if (user) {
    return (
      <div className="filters" style={{ marginTop: 16 }}>
        <p className="section-label">Akun</p>
        <p>
          Masuk sebagai <strong>{user.email}</strong>
          {user.displayName ? ` (${user.displayName})` : ""}
        </p>
        <p className="section-note">
          Lamaran di perangkat ini ikut tersimpan ke akun. Semua fitur
          tetap bisa dipakai tanpa masuk.
        </p>
        {!user.emailVerified && (
          <>
            <p className="notice">
              Email ini belum terverifikasi. Ketuk tautan di email
              verifikasi supaya akun ini dikenali sebagai milikmu.
            </p>
            <div className="filter-actions">
              <button
                className="btn ghost small"
                type="button"
                onClick={resendVerification}
                disabled={verifyBusy}
              >
                {verifyBusy ? "Mengirim…" : "Kirim ulang email verifikasi"}
              </button>
              <button
                className="btn ghost small"
                type="button"
                onClick={recheckVerification}
                disabled={verifyBusy}
              >
                Periksa lagi
              </button>
            </div>
          </>
        )}
        {user.emailVerified && (
          <p className="section-note">Email sudah terverifikasi.</p>
        )}
        {info && <p className="notice">{info}</p>}
        {error && <p className="notice">{error}</p>}
        <div className="filter-actions">
          <button
            className="btn ghost small"
            type="button"
            onClick={signOutUser}
            disabled={signingOut}
          >
            {signingOut ? "Keluar…" : "Keluar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="filters" style={{ marginTop: 16 }}>
      <p className="section-label">Akun</p>
      <p className="section-note">
        Masuk itu pilihan. Tanpa masuk pun semua fitur tetap bisa dipakai,
        hanya lamaran yang tidak tersimpan ke akun.
      </p>
      <div className="chip-row" role="group" aria-label="Pilih masuk atau daftar">
        <button
          type="button"
          className="btn ghost small"
          aria-pressed={mode === "masuk"}
          onClick={() => {
            setMode("masuk");
            setError("");
            setInfo("");
          }}
          style={
            mode === "masuk"
              ? { background: "#0a0a0a", color: "#fff" }
              : undefined
          }
        >
          Masuk
        </button>
        <button
          type="button"
          className="btn ghost small"
          aria-pressed={mode === "daftar"}
          onClick={() => {
            setMode("daftar");
            setError("");
            setInfo("");
          }}
          style={
            mode === "daftar"
              ? { background: "#0a0a0a", color: "#fff" }
              : undefined
          }
        >
          Daftar
        </button>
      </div>
      <form onSubmit={submit}>
        {mode === "daftar" && (
          <fieldset>
            <legend>Nama tampilan (boleh kosong)</legend>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
              maxLength={100}
              placeholder="Nama yang tampil di akun"
            />
          </fieldset>
        )}
        <fieldset>
          <legend>Email</legend>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            placeholder="nama@email.com"
          />
        </fieldset>
        <fieldset>
          <legend>Kata sandi</legend>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === "daftar" ? "new-password" : "current-password"}
            minLength={6}
            placeholder="Minimal 6 huruf"
          />
        </fieldset>
        {error && <p className="notice">{error}</p>}
        {info && <p className="notice">{info}</p>}
        <div className="filter-actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Tunggu…" : mode === "daftar" ? "Buat akun" : "Masuk"}
          </button>
          {mode === "masuk" && (
            <button
              className="btn ghost small"
              type="button"
              onClick={forgotPassword}
              disabled={busy || resetBusy}
            >
              {resetBusy ? "Mengirim…" : "Lupa kata sandi?"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
