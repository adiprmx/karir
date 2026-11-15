/* Halaman mulai adalah komponen klien sehingga tidak bisa
 * mengekspor metadata sendiri (FE-07/ONB-06); metadata ditaruh
 * di layout rute ini. */
import { getLocale, t } from "@/lib/i18n";
import { LabelsProvider } from "@/app/labels-provider";

export const metadata = {
  title: "Mulai",
  description:
    "Tiga langkah menemukan kanal lowongan yang cocok: pilih domisili dan posisi, lalu lihat kanal yang sesuai.",
  /* SEO-04 + MKT-03 (pass metadata kanonis, W2b). */
  alternates: { canonical: "/mulai" },
};

/* W2a (ONB-07): label halaman Mulai diteruskan lewat konteks —
 * komponen klien tidak bisa mengimpor lib/i18n (memakai
 * next/headers). Provider ini bersarang di dalam provider layout
 * akar; labelnya digabung, bukan menggantikan. */
export default async function MulaiLayout({ children }) {
  const locale = await getLocale();
  const labels = {
    title: t(locale, "nav.mulai"),
    lede: t(locale, "mulai.lede"),
    loadingChoices: t(locale, "mulai.loadingChoices"),
    currentChoices: t(locale, "mulai.currentChoices"),
    domisili: t(locale, "home.domisili"),
    posisi: t(locale, "home.posisi"),
    notFilled: t(locale, "mulai.notFilled"),
    viewMatches: t(locale, "mulai.viewMatches"),
    editChoices: t(locale, "mulai.editChoices"),
    clearChoices: t(locale, "mulai.clearChoices"),
    savedLocal: t(locale, "mulai.savedLocal"),
    clearTitle: t(locale, "mulai.clearTitle"),
    clearMessage: t(locale, "mulai.clearMessage"),
    wizardLabel: t(locale, "mulai.wizardLabel"),
    stepOf: t(locale, "mulai.stepOf"),
    whereLive: t(locale, "mulai.whereLive"),
    domisiliPh: t(locale, "home.domisiliPh"),
    whatRole: t(locale, "mulai.whatRole"),
    posisiPh: t(locale, "mulai.posisiPh"),
    matchedChannels: t(locale, "mulai.matchedChannels"),
    verifiedAmong: t(locale, "mulai.verifiedAmong"),
    topThree: t(locale, "mulai.topThree"),
    countError: t(locale, "mulai.countError"),
    fillOne: t(locale, "mulai.fillOne"),
    back: t(locale, "common.back"),
    skip: t(locale, "mulai.skip"),
    next: t(locale, "mulai.next"),
    saveFailed: t(locale, "mulai.saveFailed"),
    clearFailed: t(locale, "mulai.clearFailed"),
    deleteConfirm: t(locale, "common.deleteConfirm"),
    cancel: t(locale, "common.cancel"),
    close: t(locale, "common.close"),
  };
  return (
    <LabelsProvider locale={locale} labels={labels}>
      {children}
    </LabelsProvider>
  );
}
