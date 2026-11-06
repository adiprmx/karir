"use client";

/* Admin panel Karir — /admin.
 * Login pakai Firebase Auth (Email/Password). Akun admin dibuat owner
 * di Firebase Console, bukan di sini, dan tidak ada pendaftaran mandiri.
 * Setelah masuk: cari perusahaan, ubah datanya, tambah baru, atau hapus.
 * Tulis hanya diizinkan untuk pengguna yang sudah login (aturan Firestore).
 */
import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { STATUS_ORDER } from "@/lib/companies";

const EMPTY = {
  no: "",
  perusahaan: "",
  kategori: "",
  link_karir: "",
  status: "Tidak ada lowongan target",
  tanggal_cek: "",
  catatan: "",
  lokasi: "",
  posisi: "",
};

export default function Admin() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "companies"), orderBy("no", "asc")))
      .then((snap) =>
        setCompanies(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      )
      .catch(() => setMessage("Gagal memuat data perusahaan."));
  }, [user]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setLoginError("Email atau kata sandi salah.");
    }
  }

  function pick(c) {
    setSelected(c);
    setForm({
      no: String(c.no),
      perusahaan: c.perusahaan || "",
      kategori: c.kategori || "",
      link_karir: c.link_karir || "",
      status: c.status || "Tidak ada lowongan target",
      tanggal_cek: c.tanggal_cek || "",
      catatan: c.catatan || "",
      lokasi: c.lokasi || "",
      posisi: c.posisi || "",
    });
    setMessage("");
  }

  function addNew() {
    const nextNo =
      companies.length > 0
        ? Math.max(...companies.map((c) => Number(c.no) || 0)) + 1
        : 1;
    setSelected(null);
    setForm({ ...EMPTY, no: String(nextNo) });
    setMessage("");
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    const no = Number(form.no);
    if (!no || !form.perusahaan.trim()) {
      setMessage("Nomor dan nama perusahaan wajib diisi.");
      setSaving(false);
      return;
    }
    try {
      const data = {
        no,
        perusahaan: form.perusahaan.trim(),
        kategori: form.kategori.trim(),
        link_karir: form.link_karir.trim(),
        status: form.status,
        tanggal_cek: form.tanggal_cek.trim(),
        catatan: form.catatan.trim(),
        lokasi: form.lokasi.trim(),
        posisi: form.posisi.trim(),
      };
      await setDoc(doc(db, "companies", String(no)), data);
      setCompanies((prev) => {
        const rest = prev.filter((c) => Number(c.no) !== no);
        return [...rest, { id: String(no), ...data }].sort(
          (a, b) => a.no - b.no,
        );
      });
      setMessage(`Tersimpan: ${data.perusahaan}.`);
    } catch {
      setMessage("Gagal menyimpan. Periksa aturan Firestore dan koneksi.");
    }
    setSaving(false);
  }

  async function remove() {
    if (!selected) return;
    if (!window.confirm(`Hapus ${selected.perusahaan}?`)) return;
    try {
      await deleteDoc(doc(db, "companies", String(selected.no)));
      setCompanies((prev) =>
        prev.filter((c) => Number(c.no) !== Number(selected.no)),
      );
      setSelected(null);
      setForm(EMPTY);
      setMessage("Dihapus.");
    } catch {
      setMessage("Gagal menghapus.");
    }
  }

  if (!authChecked) {
    return (
      <div className="wrap">
        <div className="state">
          <strong>Memuat…</strong>
        </div>
      </div>
    );
  }

  if (!user) {
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
          onSubmit={handleLogin}
        >
          <fieldset>
            <legend>Email</legend>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </fieldset>
          <fieldset>
            <legend>Kata sandi</legend>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </fieldset>
          {loginError && <p className="notice">{loginError}</p>}
          <button className="btn" type="submit">
            Masuk
          </button>
        </form>
      </div>
    );
  }

  const shown = companies.filter((c) =>
    `${c.perusahaan} ${c.no}`.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Admin</h1>
        <p className="lede">
          Masuk sebagai {user.email} · {companies.length} perusahaan ·{" "}
          <button
            type="button"
            onClick={() => signOut(auth)}
            style={{
              background: "none",
              border: 0,
              padding: 0,
              font: "inherit",
              color: "inherit",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Keluar
          </button>
        </p>
      </div>

      <div className="cari-grid">
        <div>
          <div className="filters" style={{ position: "static" }}>
            <fieldset>
              <legend>Cari perusahaan</legend>
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Nama atau nomor"
                autoComplete="off"
              />
            </fieldset>
            <button className="btn" type="button" onClick={addNew}>
              Tambah perusahaan
            </button>
          </div>
          <ul className="recheck-list" style={{ marginTop: 20 }}>
            {shown.slice(0, 50).map((c) => (
              <li key={c.no}>
                <button
                  type="button"
                  onClick={() => pick(c)}
                  style={{
                    background: "none",
                    border: 0,
                    padding: 0,
                    font: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                    fontWeight:
                      selected && Number(selected.no) === Number(c.no)
                        ? 700
                        : 400,
                  }}
                >
                  {c.no}. {c.perusahaan}
                </button>
              </li>
            ))}
            {shown.length > 50 && (
              <li className="plain-more">
                dan {shown.length - 50} lainnya — persempit pencarian.
              </li>
            )}
          </ul>
        </div>

        <form className="filters" style={{ position: "static" }} onSubmit={save}>
          <fieldset>
            <legend>Nomor</legend>
            <input
              type="number"
              value={form.no}
              onChange={(e) => setForm({ ...form, no: e.target.value })}
              required
            />
          </fieldset>
          <fieldset>
            <legend>Perusahaan</legend>
            <input
              type="text"
              value={form.perusahaan}
              onChange={(e) => setForm({ ...form, perusahaan: e.target.value })}
              required
            />
          </fieldset>
          <fieldset>
            <legend>Kategori</legend>
            <input
              type="text"
              value={form.kategori}
              onChange={(e) => setForm({ ...form, kategori: e.target.value })}
            />
          </fieldset>
          <fieldset>
            <legend>Link karir</legend>
            <input
              type="url"
              value={form.link_karir}
              onChange={(e) => setForm({ ...form, link_karir: e.target.value })}
              placeholder="https://…"
            />
          </fieldset>
          <fieldset>
            <legend>Status</legend>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </fieldset>
          <fieldset>
            <legend>Tanggal cek (YYYY-MM-DD)</legend>
            <input
              type="text"
              value={form.tanggal_cek}
              onChange={(e) => setForm({ ...form, tanggal_cek: e.target.value })}
              placeholder="2026-11-06"
            />
          </fieldset>
          <fieldset>
            <legend>Lokasi</legend>
            <input
              type="text"
              value={form.lokasi}
              onChange={(e) => setForm({ ...form, lokasi: e.target.value })}
            />
          </fieldset>
          <fieldset>
            <legend>Posisi tercatat</legend>
            <input
              type="text"
              value={form.posisi}
              onChange={(e) => setForm({ ...form, posisi: e.target.value })}
            />
          </fieldset>
          <fieldset>
            <legend>Catatan</legend>
            <input
              type="text"
              value={form.catatan}
              onChange={(e) => setForm({ ...form, catatan: e.target.value })}
            />
          </fieldset>
          {message && <p className="notice">{message}</p>}
          <div className="filter-actions">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </button>
            {selected && (
              <button
                className="btn ghost"
                type="button"
                onClick={remove}
                disabled={saving}
              >
                Hapus
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
