import { getLocale } from "@/lib/i18n";
import FaqSearch from "@/app/faq/faq-search";

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
    a: "Ya, gratis. Tidak ada biaya, tidak ada akun, dan tidak ada data pribadi yang diminta.",
  },
  {
    q: "Kenapa tidak ada akun?",
    a: "Supaya kamu bisa langsung pakai tanpa daftar dan tanpa menyerahkan data pribadi. Semua data perusahaan bisa dibaca siapa pun.",
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
    q: "Bagaimana melaporkan tautan mati?",
    a: "Buka halaman perusahaannya, lalu pakai tombol Laporkan tautan mati. Kamu juga bisa buka issue di repo GitHub Karir.",
  },
  {
    q: "Bagaimana berkontribusi?",
    a: "Usulkan perusahaan baru atau koreksi lewat issue dan pull request di repo GitHub. Sertakan tautan halaman resmi yang kamu buka langsung sebagai bukti.",
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
    </div>
  );
}
