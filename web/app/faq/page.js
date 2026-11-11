import FaqSearch from "@/app/faq/faq-search";

export const metadata = {
  title: "Pertanyaan umum",
  description:
    "Jawaban singkat untuk hal yang paling sering ditanyakan soal Karir: cara pakai, gratis atau tidak, akun, cara data dicek, dan cara berkontribusi.",
};

const QA = [
  {
    q: "Bagaimana cara memakai Karir?",
    a: "Ketik kota dan posisi di Beranda, lalu lihat kanal yang paling cocok. Buka portal resminya dari hasil, baca syarat lengkapnya, dan lamar lewat kanal resmi.",
  },
  {
    q: "Apakah Karir gratis?",
    a: "Ya, gratis. Tidak ada biaya dan tidak ada fitur berbayar.",
  },
  {
    q: "Apakah saya harus punya akun?",
    a: "Tidak. Masuk akun itu pilihan. Tanpa masuk, semua fitur tetap bisa dipakai dan lamaranmu tersimpan di browser ini. Dengan akun, tanda lamaran ikut tersimpan supaya tidak hilang saat ganti HP.",
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
    a: "Buka halaman perusahaannya, lalu pakai tombol Laporkan tautan mati atau data yang salah. Kamu juga bisa membuka issue di repo GitHub Karir.",
  },
  {
    q: "Bagaimana berkontribusi?",
    a: "Usulkan perusahaan baru atau koreksi lewat issue dan pull request di repo GitHub. Sertakan tautan halaman resmi yang kamu buka langsung sebagai bukti.",
  },
  {
    q: "Kenapa skor bukan janji lowongan?",
    a: "Skor hanya mengurutkan kanal berdasarkan kecocokan data dengan yang kamu cari. Lowongan bisa berubah setelah tanggal cek, jadi selalu periksa portal resminya.",
  },
];

export default function Faq() {
  return (
    <div className="wrap narrow">
      <div className="page-head">
        <h1>Pertanyaan umum</h1>
        <p className="lede">Jawaban singkat untuk hal yang paling sering ditanyakan.</p>
      </div>
      <FaqSearch items={QA} />
    </div>
  );
}
