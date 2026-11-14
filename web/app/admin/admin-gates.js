"use client";

/* Gerbang akses panel admin (FE-18, dipindah dari page.js): status
 * muat saat pemeriksaan akun berjalan, formulir masuk untuk akun
 * yang belum masuk, dan pesan penolakan untuk akun yang masuk tetapi
 * bukan admin. Semua keputusan (siapa yang melihat apa) tetap di
 * page.js; komponen di sini hanya menampilkan. */

export function LoadingGate() {
  return (
    <div className="wrap">
      <div className="state">
        <strong>Memuat…</strong>
      </div>
    </div>
  );
}

export function LoginForm({
  email,
  password,
  loginError,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}) {
  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Admin</h1>
        <p className="lede">
          Masuk dengan akun admin yang dibuat di Firebase Console.
        </p>
      </div>
      <form
        className="filters"
        style={{ maxWidth: 360 }}
        onSubmit={onSubmit}
      >
        <fieldset>
          <legend>Email</legend>
          {/* AKSES-06: label eksplisit sr-only pada semua kontrol
            * halaman ini — legend memberi konteks, label memberi
            * nama aksesibel yang pasti (pola yang sama dengan
            * panel akun). */}
          <label className="sr-only" htmlFor="admin-login-email">
            Email
          </label>
          <input
            id="admin-login-email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            required
            autoComplete="username"
          />
        </fieldset>
        <fieldset>
          <legend>Kata sandi</legend>
          <label className="sr-only" htmlFor="admin-login-password">
            Kata sandi
          </label>
          <input
            id="admin-login-password"
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            required
            autoComplete="current-password"
          />
        </fieldset>
        {/* AKSES-05: error masuk diumumkan sebagai alert. */}
        {loginError && (
          <p className="notice" role="alert">
            {loginError}
          </p>
        )}
        <button className="btn" type="submit">
          Masuk
        </button>
      </form>
    </div>
  );
}

export function NotAdmin({ adminCheckError, onSignOut }) {
  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Admin</h1>
        <p className="lede">
          {adminCheckError
            ? "Akses akun belum bisa diperiksa. Coba muat ulang halaman ini."
            : "Akun ini bukan akun admin, jadi halaman ini tidak bisa dibuka. Masuk dengan akun admin untuk mengelola data Karir."}
        </p>
      </div>
      <button
        className="btn"
        type="button"
        onClick={onSignOut}
      >
        Keluar
      </button>
    </div>
  );
}
