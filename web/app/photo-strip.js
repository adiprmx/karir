/* Strip foto asli Beranda: tiga foto Unsplash terverifikasi, tampil
 * grayscale. Bila sebuah foto gagal dimuat (jaringan, domain diblokir),
 * figurnya hilang rapi; bila ketiganya gagal, seluruh seksi tidak tampil
 * supaya tidak ada lubang kosong. */
"use client";

import { useState } from "react";

const PHOTOS = [
  {
    key: "warehouse",
    src: "https://images.unsplash.com/photo-1553413077-190dd305871c?w=1200&q=80&auto=format&fit=crop",
    alt: "Lorong gudang dengan rak tinggi berisi kardus dan palet",
  },
  {
    key: "production",
    src: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1200&q=80&auto=format&fit=crop",
    alt: "Pekerja di lini produksi dengan laptop di antara mesin",
  },
  {
    key: "cleaning",
    src: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&q=80&auto=format&fit=crop",
    alt: "Pekerja membersihkan jendela dengan spons dan sarung tangan",
  },
];

export default function PhotoStrip({ title, captions }) {
  const [failed, setFailed] = useState({});
  const hide = (key) => setFailed((f) => ({ ...f, [key]: true }));
  const visible = PHOTOS.filter((p) => !failed[p.key]);
  if (visible.length === 0) return null;
  return (
    <section
      className="landing-section anim-fade-in-2"
      aria-labelledby="photos-title"
    >
      <h2 id="photos-title">{title}</h2>
      <div className="photo-strip">
        {visible.map((p) => (
          <figure key={p.key}>
            <img
              src={p.src}
              alt={p.alt}
              loading="lazy"
              onError={() => hide(p.key)}
            />
            <figcaption>{captions[p.key]}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
