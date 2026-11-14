import Link from "next/link";
import { getLocale } from "@/lib/i18n";

export const metadata = {
  title: "Dukungan",
  description:
    "Cara melaporkan masalah, mengoreksi data, dan bertanya soal Karir.",
};

/* Tautan issue memakai template Koreksi data yang sudah ada di repo
 * (bukan issue kosong: blank_issues_enabled false di config template).
 * Kanal yang dicantumkan di halaman ini hanya kanal yang nyata: tidak
 * ada kanal diskusi di repo (belum diaktifkan), tidak ada email atau
 * chat. */
const KOREKSI_URL =
  "https://github.com/adiprmx/karir/issues/new?template=koreksi.md";

const COPY = {
  title: { id: "Dukungan", en: "Support" },
  lede: {
    id: "Cara melaporkan masalah, mengoreksi data, dan bertanya.",
    en: "How to report a problem, correct data, and ask a question.",
  },
  deadLabel: { id: "Tautan mati", en: "Dead link" },
  deadTitle: { id: "Laporkan tautan mati", en: "Report a dead link" },
  dead1: {
    id: "Buka halaman perusahaannya, lalu buka bagian Ada yang salah? Laporkan tautan mati. Tulis alasan singkat, misalnya halaman tidak bisa dibuka, lalu kirim.",
    en: "Open the company page, then open the section Something wrong? Report a dead link. Write a short reason, for example that the page cannot be opened, then send it.",
  },
  dead2: {
    id: "Tidak perlu masuk akun dan tidak perlu menulis nama. Yang terkirim hanya nomor dan nama perusahaan, alasan yang kamu tulis, dan waktu laporan.",
    en: "No account and no name needed. Only the company number and name, the reason you wrote, and the time of the report are sent.",
  },
  dead3: {
    id: "Pengelola membaca laporan yang masuk. Tidak ada balasan perorangan, karena laporan tidak meminta kontak. Bila tautan diperbaiki dan status perusahaan berubah, perubahannya tercatat di bagian Yang berubah di Beranda.",
    en: "The maintainer reads incoming reports. There is no personal reply, because reports do not ask for contact details. If the link is fixed and the company status changes, the change is listed under What changed on the homepage.",
  },
  fixLabel: { id: "Data salah", en: "Wrong data" },
  fixTitle: { id: "Koreksi data yang salah", en: "Correct wrong data" },
  fix1: {
    id: "Bila nama, lokasi, posisi, atau tautan perusahaan salah, laporkan lewat issue Koreksi data di repo GitHub Karir.",
    en: "If a company name, location, role, or link is wrong, report it through a Koreksi data issue in the Karir GitHub repo.",
  },
  fixLink: { id: "Buka issue Koreksi data", en: "Open a Koreksi data issue" },
  fix2: {
    id: "Tulis nomor dan nama perusahaan, apa yang salah, apa yang benar, dan tautan halaman resmi yang kamu buka langsung sebagai bukti.",
    en: "Write the company number and name, what is wrong, what is right, and a link to the official page you opened yourself as proof.",
  },
  fix3: {
    id: "Perlu akun GitHub untuk membuka issue.",
    en: "You need a GitHub account to open an issue.",
  },
  suggestLabel: { id: "Usulan", en: "Suggestion" },
  suggestTitle: {
    id: "Usulkan perusahaan baru",
    en: "Suggest a new company",
  },
  suggest1: {
    id: "Belum ada formulir khusus untuk usulan perusahaan baru. Untuk sekarang, tulis usulan lewat issue Koreksi data yang sama, dan isi nama perusahaan serta tautan halaman karir resminya di kolom Yang benar.",
    en: "There is no dedicated form for new company suggestions yet. For now, write your suggestion through the same Koreksi data issue, and put the company name and a link to its official careers page in the Yang benar field.",
  },
  fraudLabel: { id: "Lowongan palsu", en: "Fake listing" },
  fraudTitle: {
    id: "Laporkan lowongan yang mencurigakan",
    en: "Report a suspicious listing",
  },
  fraud1: {
    id: "Rekrutmen resmi tidak pernah meminta bayaran. Bila ada perusahaan di daftar ini yang meminta bayaran, meminta foto KTP atau rekening di awal, atau menjanjikan gaji jauh di atas wajar, laporkan lewat issue Koreksi data.",
    en: "Legitimate recruitment never asks for payment. If a company in this list asks for payment, asks for a photo of your ID card or bank account early on, or promises pay far above what is reasonable, report it through a Koreksi data issue.",
  },
  fraud2a: {
    id: "Cara mengenali lowongan palsu ada di halaman ",
    en: "How to recognize fake listings is on the ",
  },
  fraud2b: { id: "Pertanyaan umum", en: "Frequently asked questions" },
  faqLabel: { id: "Pertanyaan", en: "Questions" },
  faqTitle: {
    id: "Pertanyaan yang sering ditanyakan",
    en: "Frequently asked questions",
  },
  faq1a: {
    id: "Jawaban singkat untuk hal yang paling sering ditanyakan ada di halaman ",
    en: "Short answers to the most common questions are on the ",
  },
  faq1b: { id: "Pertanyaan umum", en: "Frequently asked questions" },
  faq1c: {
    id: ". Cara data dicek ada di halaman ",
    en: ". How data is checked is on the ",
  },
  faq1d: { id: "Metode", en: "Method" },
  faq1e: { id: ".", en: "." },
  otherLabel: { id: "Cara lain", en: "Other ways" },
  otherTitle: {
    id: "Cara lain menghubungi pengelola",
    en: "Other ways to reach the maintainer",
  },
  other1: {
    id: "Untuk sekarang belum ada email, chat, atau nomor telepon bantuan. Semua laporan dan pertanyaan masuk lewat kanal di halaman ini.",
    en: "There is no help email, chat, or phone number yet. Every report and question goes through the channels on this page.",
  },
  updated: {
    id: "Terakhir diperbarui 15 November 2026.",
    en: "Last updated 15 November 2026.",
  },
};

export default async function Dukungan() {
  const locale = await getLocale();

  return (
    <div className="wrap narrow">
      <div className="page-head">
        <h1>{COPY.title[locale]}</h1>
        <p className="lede">{COPY.lede[locale]}</p>
      </div>

      <section className="dash-section" aria-label="Tautan mati">
        <p className="section-label">{COPY.deadLabel[locale]}</p>
        <h2>{COPY.deadTitle[locale]}</h2>
        <p>{COPY.dead1[locale]}</p>
        <p>{COPY.dead2[locale]}</p>
        <p>{COPY.dead3[locale]}</p>
      </section>

      <section className="dash-section" aria-label="Data salah">
        <p className="section-label">{COPY.fixLabel[locale]}</p>
        <h2>{COPY.fixTitle[locale]}</h2>
        <p>{COPY.fix1[locale]}</p>
        <p>
          <a href={KOREKSI_URL} target="_blank" rel="noopener noreferrer">
            {COPY.fixLink[locale]}
          </a>
        </p>
        <p>{COPY.fix2[locale]}</p>
        <p>{COPY.fix3[locale]}</p>
      </section>

      <section className="dash-section" aria-label="Usulan perusahaan baru">
        <p className="section-label">{COPY.suggestLabel[locale]}</p>
        <h2>{COPY.suggestTitle[locale]}</h2>
        <p>{COPY.suggest1[locale]}</p>
      </section>

      <section
        className="dash-section"
        aria-label="Lowongan yang mencurigakan"
      >
        <p className="section-label">{COPY.fraudLabel[locale]}</p>
        <h2>{COPY.fraudTitle[locale]}</h2>
        <p>{COPY.fraud1[locale]}</p>
        <p>
          {COPY.fraud2a[locale]}
          <Link href="/faq">{COPY.fraud2b[locale]}</Link>.
        </p>
      </section>

      <section
        className="dash-section"
        aria-label="Pertanyaan yang sering ditanyakan"
      >
        <p className="section-label">{COPY.faqLabel[locale]}</p>
        <h2>{COPY.faqTitle[locale]}</h2>
        <p>
          {COPY.faq1a[locale]}
          <Link href="/faq">{COPY.faq1b[locale]}</Link>
          {COPY.faq1c[locale]}
          <Link href="/metode">{COPY.faq1d[locale]}</Link>
          {COPY.faq1e[locale]}
        </p>
      </section>

      <section
        className="dash-section"
        aria-label="Cara lain menghubungi pengelola"
      >
        <p className="section-label">{COPY.otherLabel[locale]}</p>
        <h2>{COPY.otherTitle[locale]}</h2>
        <p>{COPY.other1[locale]}</p>
        <p className="section-note">{COPY.updated[locale]}</p>
      </section>
    </div>
  );
}
