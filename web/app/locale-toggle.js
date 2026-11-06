"use client";

/* Saklar bahasa ID/EN di header. Mengarah ke /api/locale dengan path
 * halaman saat ini, supaya pengguna tetap di halaman yang sama. */
import { usePathname, useSearchParams } from "next/navigation";

export default function LocaleToggle({ locale }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const next = encodeURIComponent(
    pathname + (search.toString() ? `?${search.toString()}` : ""),
  );
  return (
    <span className="locale-toggle" aria-label="Bahasa / Language">
      <a
        href={`/api/locale?lang=id&next=${next}`}
        aria-current={locale === "id" ? "true" : undefined}
      >
        ID
      </a>
      <span aria-hidden="true"> / </span>
      <a
        href={`/api/locale?lang=en&next=${next}`}
        aria-current={locale === "en" ? "true" : undefined}
      >
        EN
      </a>
    </span>
  );
}
