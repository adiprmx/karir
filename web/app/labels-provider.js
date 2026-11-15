/* Penyedia label terjemahan untuk komponen klien (W2a, UX-08/ONB-07).
 *
 * Komponen klien tidak bisa mengimpor lib/i18n (modul itu memakai
 * next/headers, khusus server). Pola repo selama ini: komponen server
 * meneruskan label terjemahan lewat props. Pola itu tidak bisa dipakai
 * halaman yang SELURUHNYA komponen klien (Lamaran, Mulai, Pengaturan)
 * karena layout rute tidak bisa meneruskan props ke halaman.
 *
 * Karena itu label diteruskan lewat konteks: layout server (akar atau
 * rute) membangun objek label dengan t() lalu membungkus anaknya
 * dengan LabelsProvider; komponen klien membaca lewat useLabels().
 * Provider boleh bersarang — label dalam digabung ke label luar
 * (milik layout akar: toast pelacak + halaman error; milik layout
 * rute: label halaman itu sendiri).
 *
 * useLabels(defaults): gabungkan label konteks ke atas nilai
 * bawaan (Bahasa Indonesia). Bila komponen dipakai di luar provider
 * atau ada kunci yang belum diteruskan, teks Indonesia tampil
 * sebagai cadangan — tidak pernah tampil nama kunci mentah. */
"use client";

import { createContext, useContext, useMemo } from "react";

const LabelsContext = createContext({ locale: "id", labels: {} });

export function LabelsProvider({ locale = "id", labels = {}, children }) {
  const parent = useContext(LabelsContext);
  /* Nilai konteks dimemo supaya identitasnya stabil: label server
   * tidak berubah selama halaman hidup, dan konsumen yang memakai
   * hasil useLabels di dependensi hook tidak boleh terpicu ulang
   * tiap render. */
  const value = useMemo(
    () => ({
      locale: locale || parent.locale,
      labels: { ...parent.labels, ...labels },
    }),
    [locale, labels, parent.locale, parent.labels],
  );
  return (
    <LabelsContext.Provider value={value}>
      {children}
    </LabelsContext.Provider>
  );
}

export function useLabels(defaults = {}) {
  const { labels } = useContext(LabelsContext);
  return useMemo(
    () => ({ ...defaults, ...labels }),
    [labels, defaults],
  );
}

export function useLocale() {
  return useContext(LabelsContext).locale;
}
