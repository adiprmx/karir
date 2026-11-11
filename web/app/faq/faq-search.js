"use client";

/* Pencarian FAQ: menyaring daftar tanya jawab berdasarkan kata kunci.
 * Isi pertanyaan dan jawaban tidak diubah, hanya disaring. */
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/visual";

export default function FaqSearch({ items }) {
  const [query, setQuery] = useState("");
  const needle = query.toLowerCase().trim();
  const shown = needle
    ? items.filter((i) => i.q.toLowerCase().includes(needle) || i.a.toLowerCase().includes(needle))
    : items;

  return (
    <>
      <div className="field">
        <label htmlFor="faq-search">Cari pertanyaan</label>
        <div className="in-icon">
          <Icon name="search" size={20} />
          <input id="faq-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Misalnya: akun, gratis, tautan" autoComplete="off" />
        </div>
      </div>
      <div style={{ marginTop: 16, borderTop: "2px solid var(--ink)" }} aria-live="polite">
        {shown.length === 0 ? (
          <div className="state" style={{ marginTop: 16 }}>
            <strong>Tidak ada pertanyaan yang cocok.</strong>
            <p>
              Cara data dicek ada di halaman <Link href="/metode">Metode</Link>.
            </p>
          </div>
        ) : (
          shown.map((item) => (
            <details className="faq-item" key={item.q}>
              <summary>
                {item.q}
                <Icon name="chevron" size={20} />
              </summary>
              <p>
                {item.a}
                {item.q === "Bagaimana data dicek?" && (
                  <>
                    {" "}
                    Cara lengkapnya ada di halaman <Link href="/metode">Metode</Link>.
                  </>
                )}
              </p>
            </details>
          ))
        )}
      </div>
    </>
  );
}
