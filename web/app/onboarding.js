"use client";

/* Onboarding Karir: 3 langkah singkat yang membantu pengunjung baru
 * menentukan apa yang dicari, lalu mengantarnya ke hasil yang cocok.
 * BUKAN pendaftaran, tidak ada akun, tidak ada server. Semua tersimpan
 * di localStorage browser pengguna saja, dengan kunci
 * "karir-onboarding". Bentuk data: {domisili, posisi, selesai: true}.
 * Setiap tulis atau hapus mengirim event "karir-onboarding-change"
 * supaya komponen lain yang memakai useOnboarding ikut update. */
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

export function saveOnboarding(data) {
  if (typeof window === "undefined") return;
  const next = {
    domisili: String(data.domisili || "").trim(),
    posisi: String(data.posisi || "").trim(),
    selesai: true,
  };
  try {
    window.localStorage.setItem(ONBOARDING_KEY, JSON.stringify(next));
  } catch {
    return;
  }
  window.dispatchEvent(new Event("karir-onboarding-change"));
}

export function clearOnboarding() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    return;
  }
  window.dispatchEvent(new Event("karir-onboarding-change"));
}

export function useOnboarding() {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setData(loadOnboarding());
    setLoaded(true);
    const onChange = () => setData(loadOnboarding());
    window.addEventListener("karir-onboarding-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("karir-onboarding-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const save = useCallback((next) => {
    saveOnboarding(next);
    setData(loadOnboarding());
  }, []);

  const clear = useCallback(() => {
    clearOnboarding();
    setData(null);
  }, []);

  return { data, loaded, save, clear };
}
