"use client";

/* Panel akun Karir: masuk, daftar, dan keluar. Masuk itu pilihan,
 * bukan syarat: tanpa masuk pun semua fitur situs tetap bisa dipakai.
 * Yang didapat akun hanya satu hal, sinkronisasi pelacak lamaran ke
 * akun, supaya lamaran tidak hilang bila ganti perangkat.
 *
 * Firebase Auth diimpor malas (dynamic import) supaya halaman yang
 * tidak memakai akun tidak memuat SDK auth. Masuk dengan Google
 * memakai jendela timbul; bila provider Google belum diaktifkan di
 * Firebase Console, pesannya jelas begitu, bukan klaim sudah aktif.
 * Email dan kata sandi sudah aktif. Pesan error memakai bahasa
 * sehari-hari. Email tidak pernah ditulis ke event pengunjung. */
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { clearAnalyticsUid, setAnalyticsUid } from "@/lib/analytics";
import { Icon } from "./visual";

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
      return "Email ini sudah dipakai. Coba masuk, atau pakai email lain.";
    case "auth/weak-password":
      return "Kata sandi terlalu pendek, minimal 6 huruf.";
    case "auth/too-many-requests":
      return "Terlalu sering mencoba. Tunggu sebentar lalu coba lagi.";
    case "auth/network-request-failed":
      return "Tidak ada koneksi. Periksa internet lalu coba lagi.";
    case "auth/popup-blocked":
      return "Jendela masuk diblokir browser. Izinkan jendela timbul untuk situs ini lalu coba lagi.";
    case "auth/popup-closed-by-user":
      return "Jendela masuk ditutup sebelum selesai. Coba lagi.";
    case "auth/operation-not-allowed":
    case "auth/provider-not-enabled":
      return "Masuk dengan Google belum diaktifkan. Coba masuk dengan email.";
    default:
      return "Tidak bisa masuk sekarang. Coba lagi sebentar lagi.";
  }
}

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
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const {
        createUserWithEmailAndPassword,
        signInWithEmailAndPassword,
        updateProfile,
      } = await import("firebase/auth");
      if (mode === "daftar") {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const displayName = name.trim();
        if (displayName) {
          await updateProfile(cred.user, { displayName }).catch(() => {});
        }
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      setPassword("");
    } catch (err) {
      setError(authErrorMessage(err && err.code));
    }
    setBusy(false);
  }

  async function signInGoogle() {
    setError("");
    setBusy(true);
    try {
      const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      if (err && err.code !== "auth/cancelled-popup-request") {
        setError(authErrorMessage(err && err.code));
      }
    }
    setBusy(false);
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
      <section className="panel" style={{ marginTop: 20 }} aria-label="Akun">
        <h3>Akun</h3>
        <p>
          Masuk sebagai <strong>{user.email}</strong>
          {user.displayName ? ` (${user.displayName})` : ""}
        </p>
        <p className="hint">
          Lamaran di perangkat ini ikut tersimpan ke akun. Semua fitur tetap
          bisa dipakai tanpa masuk.
        </p>
        <div className="actions">
          <button className="btn ghost small" type="button" onClick={signOutUser} disabled={signingOut}>
            {signingOut ? "Keluar..." : "Keluar dari akun"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel" style={{ marginTop: 20 }} aria-label="Masuk atau daftar">
      <h3>Masuk akun (pilihan)</h3>
      <p className="hint">
        Tanpa masuk pun semua fitur tetap bisa dipakai. Akun hanya menyimpan
        tanda lamaranmu supaya tidak hilang saat ganti HP.
      </p>
      <div className="chips" role="group" aria-label="Pilih masuk atau daftar">
        {["masuk", "daftar"].map((m) => (
          <button
            key={m}
            type="button"
            className="chip"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              setError("");
            }}
          >
            {m === "masuk" ? "Masuk" : "Daftar"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        {mode === "daftar" && (
          <div className="field">
            <label htmlFor="auth-name">Nama tampilan (boleh kosong)</label>
            <input id="auth-name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" maxLength={100} />
          </div>
        )}
        <div className="field">
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" placeholder="email@example.com" />
        </div>
        <div className="field">
          <label htmlFor="auth-pass">Kata sandi</label>
          <input id="auth-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === "daftar" ? "new-password" : "current-password"} placeholder="Minimal 6 huruf" />
        </div>
        {error && (
          <p className="note" role="alert">
            <Icon name="alert" size={18} />
            {error}
          </p>
        )}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Tunggu..." : mode === "daftar" ? "Buat akun" : "Masuk dengan email"}
        </button>
      </form>
      <button className="btn ghost" type="button" onClick={signInGoogle} disabled={busy}>
        Masuk dengan Google
      </button>
    </section>
  );
}
