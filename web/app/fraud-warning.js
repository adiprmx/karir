/* Peringatan penipuan Karir: tanda-tanda lowongan palsu + aturan
 * "jangan pernah membayar untuk melamar". Varian "full" dipakai di
 * halaman FAQ dan Metode; varian "short" dipakai di halaman detail
 * perusahaan, dekat tombol portal. Nada menenangkan: memberi tahu
 * tandanya, bukan menakut-nakuti. Ini peringatan umum, BUKAN label
 * per perusahaan — label peringatan perusahaan diatur di
 * docs/TRUST-SAFETY.md dan hanya dipakai setelah investigasi. */
import Link from "next/link";
import { Icon } from "@/app/visual";

const COPY = {
  id: {
    label: "Hati-hati penipuan",
    title: "Kenali lowongan palsu",
    intro:
      "Kebanyakan lowongan di daftar ini berasal dari kanal resmi perusahaan, tapi penipuan rekrutmen memang ada. Selama kamu tahu tandanya, kamu bisa menghindarinya.",
    signs: [
      "Diminta membayar — uang pendaftaran, seragam, pelatihan, atau apa pun namanya. Rekrutmen resmi tidak pernah meminta bayaran.",
      "Diminta foto KTP, rekening, atau data pribadi lain di awal, sebelum ada kepastian.",
      "Gaji yang dijanjikan jauh di atas wajar untuk posisi itu.",
      "Dihubungi dari nomor pribadi atau email gratisan, bukan dari kanal resmi perusahaan.",
      "Prosesnya terburu-buru: langsung dinyatakan diterima tanpa tes atau wawancara yang jelas.",
    ],
    closing:
      "Jangan pernah membayar untuk melamar. Kalau menemukan yang mencurigakan di daftar ini, beri tahu kami lewat",
    reportLink: "issue di repo GitHub Karir",
    short:
      "Rekrutmen resmi tidak pernah meminta bayaran — jangan pernah membayar untuk melamar.",
    shortLink: "Kenali ciri lowongan palsu",
  },
  en: {
    label: "Beware of scams",
    title: "Spot a fake opening",
    intro:
      "Most openings in this list come from official company channels, but recruitment scams do exist. Once you know the signs, you can avoid them.",
    signs: [
      "You are asked to pay — a registration fee, uniform, training, or anything else by any name. Official recruitment never asks for payment.",
      "You are asked for a photo of your ID, bank account, or other personal data up front, before anything is certain.",
      "The promised salary is far above what is normal for the role.",
      "You are contacted from a personal number or a free email address, not from the company's official channel.",
      "The process is rushed: you are declared accepted with no clear test or interview.",
    ],
    closing:
      "Never pay to apply. If you spot something suspicious in this list, let us know through an",
    reportLink: "issue on the Karir GitHub repo",
    short:
      "Official recruitment never asks for payment — never pay to apply.",
    shortLink: "Learn the signs of a fake opening",
  },
};

export function FraudWarning({ locale = "id", variant = "full" }) {
  const c = COPY[locale] || COPY.id;

  if (variant === "short") {
    return (
      <p className="note-line">
        <Icon name="alert" size={16} />
        <span>
          {c.short}{" "}
          <Link href="/faq">{c.shortLink}</Link>
        </span>
      </p>
    );
  }

  return (
    <section className="dash-section anim-fade-up" aria-label={c.title}>
      <p className="section-label">{c.label}</p>
      <h2>{c.title}</h2>
      <p>{c.intro}</p>
      <ul className="recheck-list">
        {c.signs.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p>
        {c.closing}{" "}
        <a
          href="https://github.com/adiprmx/karir/issues/new"
          target="_blank"
          rel="noopener noreferrer"
        >
          {c.reportLink}
        </a>
        .
      </p>
    </section>
  );
}
