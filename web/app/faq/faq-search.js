/* Pencarian FAQ: saring daftar tanya jawab berdasarkan kata kunci.
 * Isi pertanyaan dan jawaban tidak diubah, hanya disaring. */
"use client";

import { useState } from "react";
import Link from "next/link";
import { Reveal } from "@/app/visual";

export default function FaqSearch({ items }) {
  const [query, setQuery] = useState("");
  const needle = query.toLowerCase().trim();
  const shown = needle
    ? items.filter(
        (item) =>
          item.q.toLowerCase().includes(needle) ||
          item.a.toLowerCase().includes(needle),
      )
    : items;

  return (
    <>
      <Reveal>
        <label htmlFor="faq-search">Cari pertanyaan</label>
        <input
          id="faq-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari pertanyaan..."
          autoComplete="off"
        />
      </Reveal>
      {shown.length === 0 ? (
        <Reveal delay={80}>
          <p>
            Tidak ada pertanyaan yang cocok. Cara data dicek ada di halaman{" "}
            <Link href="/metode">Metode</Link>.
          </p>
        </Reveal>
      ) : (
        shown.map((item, i) => (
          <Reveal key={item.q} delay={Math.min(i * 40, 240)}>
            <details className="faq-item">
              <summary>{item.q}</summary>
              <p>
                {item.a}
                {item.q === "Bagaimana data dicek?" && (
                  <>
                    {" "}
                    Cara lengkapnya ada di halaman{" "}
                    <Link href="/metode">Metode</Link>.
                  </>
                )}
              </p>
            </details>
          </Reveal>
        ))
      )}
    </>
  );
}
