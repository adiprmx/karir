"use client";

/* Gerbang akses panel admin (FE-18, dipindah dari page.js): status
 * muat saat pemeriksaan akun berjalan, formulir masuk untuk akun
 * yang belum masuk, dan pesan penolakan untuk akun yang masuk tetapi
 * bukan admin. Semua keputusan (siapa yang melihat apa) tetap di
 * page.js; komponen di sini hanya menampilkan. */

import { useState } from "react";

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
  onForgotPassword,
  resetBusy,
  resetInfo,
}) {
  /* ADM-10: opsi tampilkan kata sandi, supaya salah ketik bisa
   * dilihat sebelum masuk. State lokal form ini saja. */
  const [showPassword, setShowPassword] = useState(false);
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
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            required
            autoComplete="current-password"
          />
        </fieldset>
        {/* BUG-3: nowrap supaya "Tampilkan kata sandi" tetap satu
          * baris; ukuran checkbox sendiri diperbaiki aturan global
          * input[type="checkbox"] di globals.css. */}
        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
          />
          Tampilkan kata sandi
        </label>
        {/* AKSES-05: error masuk diumumkan sebagai alert. */}
        {loginError && (
          <p className="notice" role="alert">
            {loginError}
          </p>
        )}
        {/* ADM-10: hasil kirim tautan reset diumumkan sebagai status. */}
        {resetInfo && (
          <p className="notice" role="status">
            {resetInfo}
          </p>
        )}
        <div className="filter-actions">
          <button className="btn" type="submit">
            Masuk
          </button>
          {/* ADM-10: lupa kata sandi — kirim tautan reset ke email
            * yang tertulis, tanpa perlu keluar ke Firebase Console. */}
          <button
            className="btn ghost small"
            type="button"
            onClick={onForgotPassword}
            disabled={resetBusy}
          >
            {resetBusy ? "Mengirim…" : "Lupa kata sandi?"}
          </button>
        </div>
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
