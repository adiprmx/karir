"use client";

/* Onboarding Karir: 3 langkah singkat yang membantu pengunjung baru
 * menentukan apa yang dicari, lalu mengantarnya ke hasil yang cocok.
 * BUKAN pendaftaran: tidak perlu masuk akun untuk mengisinya. Semua
 * tersimpan di localStorage browser pengguna saja, dengan kunci
 * "karir-onboarding". Bentuk data: {domisili, posisi, selesai: true}.
 * Setiap tulis atau hapus mengirim event "karir-onboarding-change"
 * supaya komponen lain yang memakai useOnboarding ikut update.
 *
 * Kebijakan "pilihan tersimpan" (ONB-02, satu definisi untuk /mulai,
 * Dasbor, dan Pengaturan): pilihan SEBAGIAN (salah satu kolom terisi)
 * diakui sebagai pilihan tersimpan di semua tempat, karena wizard
 * menyimpan begitu salah satu kolom terisi. hasOnboardingChoice()
 * adalah satu-satunya definisi itu; jangan menulis ulang syaratnya
 * di komponen lain. isOnboardingComplete() dipakai bila sebuah langkah
 * memang menuntut kedua kolom terisi. */
import { useCallback, useEffect, useState } from "react";

export const ONBOARDING_KEY = "karir-onboarding";

function isValid(data) {
  return (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    typeof data.domisili === "string" &&
    typeof data.posisi === "string" &&
    data.selesai === true
  );
}

/* Pilihan tersimpan: data sah dengan paling tidak satu kolom terisi.
 * Dipakai /mulai (ringkasan), Dasbor (judul + tombol hasil), dan
 * Pengaturan (baris pilihan) supaya pesannya tidak bertentangan. */
export function hasOnboardingChoice(data) {
  if (!isValid(data)) return false;
  return Boolean(data.domisili.trim() || data.posisi.trim());
}

/* Pilihan lengkap: kedua kolom terisi. Dipakai langkah Dasbor
 * "Tentukan domisili dan posisi", yang memang menuntut keduanya. */
export function isOnboardingComplete(data) {
  if (!isValid(data)) return false;
  return Boolean(data.domisili.trim() && data.posisi.trim());
}

export function loadOnboarding() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/* Simpan pilihan. Kembalikan true bila tersimpan, false bila
 * browser menolak atau di luar browser (ONB-09): pemanggil wajib
 * memeriksa hasilnya dan memberi umpan balik bila gagal, bukan
 * diam-diam menganggap tersimpan. */
export function saveOnboarding(data) {
  if (typeof window === "undefined") return false;
  const next = {
    domisili: String(data.domisili || "").trim(),
    posisi: String(data.posisi || "").trim(),
    selesai: true,
  };
  try {
    window.localStorage.setItem(ONBOARDING_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event("karir-onboarding-change"));
  return true;
}

/* Hapus pilihan. Kembalikan true bila terhapus, false bila browser
 * menolak atau di luar browser (ONB-09). */
export function clearOnboarding() {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    return false;
  }
  window.dispatchEvent(new Event("karir-onboarding-change"));
  return true;
}

export function useOnboarding() {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    /* Baca awal dijadwalkan sebagai microtask: setState di dalam
     * callback, bukan sinkron di badan effect. */
    queueMicrotask(() => {
      setData(loadOnboarding());
      setLoaded(true);
    });
    const onChange = () => setData(loadOnboarding());
    window.addEventListener("karir-onboarding-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("karir-onboarding-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  /* save/clear mengembalikan status (ONB-09) dan hanya mengubah
   * state bila tulisnya berhasil — gagal simpan tidak boleh
   * menimpa state dengan data lama hasil baca ulang. */
  const save = useCallback((next) => {
    const ok = saveOnboarding(next);
    if (ok) setData(loadOnboarding());
    return ok;
  }, []);

  const clear = useCallback(() => {
    const ok = clearOnboarding();
    if (ok) setData(null);
    return ok;
  }, []);

  return { data, loaded, save, clear };
}
