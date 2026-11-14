import { getLocale } from "@/lib/i18n";
import FaqSearch from "@/app/faq/faq-search";
import { FraudWarning } from "@/app/fraud-warning";

export const metadata = {
  title: "Pertanyaan umum",
  description:
    "Jawaban singkat untuk hal yang paling sering ditanyakan soal Karir: cara pakai, gratis atau tidak, cara data dicek, dan cara berkontribusi.",
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
    q: "Apakah Karir gratis?",
    a: "Ya, gratis. Tidak ada biaya. Masuk akun itu pilihan, bukan kewajiban. Tanpa masuk pun semua fitur tetap bisa dipakai.",
  },
  {
    q: "Apakah harus masuk akun untuk memakai Karir?",
    a: "Tidak. Kamu bisa langsung pakai tanpa masuk. Yang masuk bisa menyimpan tanda lamaran di akun supaya tidak hilang bila data browser dihapus.",
  },
  {
    q: "Bagaimana data dicek?",
    a: "Tiap perusahaan dibuka kanal karir resminya langsung di browser. Tanggal cek dicatat di tiap baris data.",
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
    q: "Bagaimana melaporkan tautan mati?",
    a: "Buka halaman perusahaannya, lalu buka bagian Ada yang salah? Laporkan tautan mati. Cara lain melapor dan yang terjadi setelah melapor ada di halaman Dukungan.",
  },
  {
    q: "Apakah laporan saya dibalas?",
    a: "Tidak ada balasan perorangan, karena laporan tidak meminta nama atau kontak. Bila tautan diperbaiki dan status perusahaan berubah, perubahannya tercatat di bagian Yang berubah di Beranda.",
  },
  {
    q: "Bagaimana berkontribusi?",
    a: "Usulkan perusahaan baru atau koreksi lewat issue dan pull request di repo GitHub. Sertakan tautan halaman resmi yang kamu buka langsung sebagai bukti. Cara lengkapnya ada di halaman Dukungan.",
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

  return (
    <div className="wrap">
      <div className="page-head anim-fade-up">
        <h1>{COPY.title[locale]}</h1>
        <p className="lede">{COPY.lede[locale]}</p>
      </div>

      <section className="dash-section anim-fade-up" aria-label="Tanya jawab">
        <FaqSearch items={QA} />
      </section>

      <FraudWarning locale={locale} />
    </div>
  );
}
