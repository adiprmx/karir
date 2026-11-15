import { getLocale, t } from "@/lib/i18n";
import FaqSearch from "@/app/faq/faq-search";
import { FraudWarning } from "@/app/fraud-warning";

export const metadata = {
  title: "Pertanyaan umum",
  description:
    "Jawaban singkat untuk hal yang paling sering ditanyakan soal Karir: cara pakai, gratis atau tidak, cara data dicek, dan cara berkontribusi.",
  /* SEO-05: blok openGraph; SEO-04: kanonis /faq (W2b). */
  openGraph: {
    title: "Pertanyaan umum",
    description:
      "Jawaban singkat untuk hal yang paling sering ditanyakan soal Karir: cara pakai, gratis atau tidak, cara data dicek, dan cara berkontribusi.",
    url: "/faq",
  },
  alternates: { canonical: "/faq" },
};

const COPY = {
  title: { id: "Pertanyaan umum", en: "Frequently asked questions" },
  lede: {
    id: "Jawaban singkat untuk hal yang paling sering ditanyakan.",
    en: "Short answers to the most common questions.",
  },
};

const QA = [
  {
    q: "Bagaimana cara memakai Karir?",
    a: "Ketik domisili dan posisi di Beranda, lalu lihat kanal yang paling cocok. Buka portal resminya dari hasil, baca syarat lengkapnya, dan lamar lewat kanal resmi.",
  },
  {
    q: "Apakah bisa melamar lewat email atau WhatsApp?",
    a: "Sebagian perusahaan mencantumkan email atau WhatsApp HR. Bila ada, kanal itu tampil di halaman perusahaan sebagai Cara lain melamar. Lamar hanya lewat kanal resmi yang tercantum di sana.",
  },
  {
    q: "Apakah Karir gratis?",
    a: "Ya, gratis. Tidak ada biaya. Masuk akun itu pilihan, bukan kewajiban. Tanpa masuk pun semua fitur tetap bisa dipakai.",
  },
  {
    q: "Apakah harus masuk akun untuk memakai Karir?",
    a: "Tidak. Kamu bisa langsung pakai tanpa masuk. Yang masuk bisa menyimpan tanda lamaran di akun supaya tidak hilang bila data browser dihapus.",
  },
  {
    q: "Bagaimana data dicek?",
    a: "Tiap perusahaan dibuka kanal karir resminya langsung di browser. Tiap perusahaan dicatat tanggal cek terakhirnya, supaya kamu tahu seberapa baru datanya.",
  },
  {
    q: "Kenapa ada lowongan yang tidak terverifikasi?",
    a: "Kadang kanalnya tidak ditemukan, halamannya kosong, atau lowongannya cuma terlihat setelah login. Itu bukan berarti perusahaan itu tidak membuka lowongan.",
  },
  {
    q: "Bagaimana mengenali lowongan palsu?",
    a: "Rekrutmen resmi tidak pernah meminta bayaran. Jangan pernah membayar untuk melamar, termasuk uang pendaftaran, seragam, atau pelatihan. Hati-hati juga bila diminta foto KTP atau rekening di awal, dijanjikan gaji jauh di atas wajar, atau dihubungi dari nomor pribadi, bukan kanal resmi perusahaan. Kalau menemukan yang mencurigakan di daftar ini, beri tahu kami lewat halaman Dukungan.",
  },
  {
    q: "Bagaimana melaporkan masalah?",
    a: "Buka halaman perusahaannya, lalu buka bagian Ada yang salah? Laporkan masalah. Pilih jenis masalahnya — tautan mati, data salah, atau lainnya — lalu jelaskan masalahnya. Cara lain melapor dan yang terjadi setelah melapor ada di halaman Dukungan.",
  },
  {
    q: "Apakah laporan saya dibalas?",
    a: "Tidak ada balasan perorangan, karena laporan tidak meminta nama atau kontak. Bila tautan diperbaiki dan status perusahaan berubah, perubahannya tercatat di bagian Yang berubah di Beranda.",
  },
  {
    q: "Bagaimana berkontribusi?",
    a: "Usulkan perusahaan baru atau koreksi lewat formulir Koreksi data. Sertakan tautan halaman resmi yang kamu buka langsung sebagai bukti. Cara lengkapnya ada di halaman Dukungan.",
    link: {
      href: "https://github.com/adiprmx/karir/issues/new?template=koreksi.md",
      text: "Buka formulir Koreksi data",
    },
  },
  {
    q: "Ke mana bertanya bila jawaban tidak ada di sini?",
    a: "Buka halaman Dukungan. Di sana ada cara melaporkan masalah, mengoreksi data, dan mengajukan pertanyaan lewat issue GitHub.",
  },
  {
    q: "Kenapa skor bukan janji lowongan?",
    a: "Skor cuma mengurutkan kanal berdasarkan kecocokan data dengan yang kamu cari. Lowongan bisa berubah setelah tanggal cek, jadi selalu periksa portal resminya.",
  },
];

export default async function Faq() {
  const locale = await getLocale();

  /* SEO-07: schema FAQPage dibangun dari daftar tanya jawab yang
   * sama dengan yang tampil di halaman, jadi isinya tidak mungkin
   * berbeda dari yang dilihat pengunjung. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: QA.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <div className="wrap">
      <div className="page-head anim-fade-up">
        <h1>{COPY.title[locale]}</h1>
        <p className="lede">{COPY.lede[locale]}</p>
        {/* INFO-11: isi halaman ini hanya Bahasa Indonesia; beri tahu
          * pengunjung mode Inggris, bukan pura-pura diterjemahkan. */}
        {locale === "en" && (
          <p className="note-line">{t(locale, "info.idOnly")}</p>
        )}
      </div>

      <section className="dash-section anim-fade-up" aria-label="Tanya jawab">
        <FaqSearch items={QA} />
      </section>

      <FraudWarning locale={locale} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}
