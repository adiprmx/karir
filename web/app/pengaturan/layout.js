/* Halaman pengaturan adalah komponen klien sehingga tidak bisa
 * mengekspor metadata sendiri (FE-07); metadata ditaruh di layout
 * rute ini. Halaman personal: jangan diindeks mesin pencari (S7). */
import { getLocale, t } from "@/lib/i18n";
import { LabelsProvider } from "@/app/labels-provider";

export const metadata = {
  title: "Pengaturan",
  description: "Atur tampilan, bahasa, dan data yang tersimpan di perangkat.",
  robots: { index: false, follow: false },
};

/* W2a (UX-08): label halaman Pengaturan diteruskan lewat konteks —
 * komponen klien tidak bisa mengimpor lib/i18n (memakai
 * next/headers). Provider ini bersarang di dalam provider layout
 * akar; labelnya digabung, bukan menggantikan. Kunci
 * invalidEmail..verifySent adalah pesan lib/account-data.js untuk
 * sendVerificationEmail (argumen kedua, bawaan Indonesia). */
export default async function PengaturanLayout({ children }) {
  const locale = await getLocale();
  const labels = {
    title: t(locale, "nav.settings"),
    lede: t(locale, "settings.lede"),
    loading: t(locale, "settings.loading"),
    browserData: t(locale, "settings.browserData"),
    choices: t(locale, "settings.choices"),
    noChoices: t(locale, "settings.noChoices"),
    deleteChoices: t(locale, "settings.deleteChoices"),
    delete: t(locale, "common.delete"),
    tracked: t(locale, "settings.tracked"),
    noTracked: t(locale, "lamaran.emptyTitle"),
    trackedCount: t(locale, "settings.trackedCount"),
    deleteAllTracked: t(locale, "settings.deleteAllTracked"),
    deleteAll: t(locale, "settings.deleteAll"),
    recentSearch: t(locale, "settings.recentSearch"),
    noRecent: t(locale, "settings.noRecent"),
    deleteRecent: t(locale, "settings.deleteRecent"),
    visitorNo: t(locale, "settings.visitorNo"),
    visitorHint: t(locale, "settings.visitorHint"),
    noVisitor: t(locale, "settings.noVisitor"),
    deleteVisitor: t(locale, "settings.deleteVisitor"),
    visitRecords: t(locale, "settings.visitRecords"),
    optOut: t(locale, "settings.optOut"),
    optOutHint: t(locale, "settings.optOutHint"),
    optOutHintAfter: t(locale, "settings.optOutHintAfter"),
    privacyPolicy: t(locale, "footer.privacyPolicy"),
    account: t(locale, "settings.account"),
    signedInAs: t(locale, "settings.signedInAs"),
    emailVerified: t(locale, "settings.emailVerified"),
    emailNotVerified: t(locale, "settings.emailNotVerified"),
    verifyEmail: t(locale, "settings.verifyEmail"),
    verifyHint: t(locale, "settings.verifyHint"),
    sending: t(locale, "settings.sending"),
    resendEmail: t(locale, "settings.resendEmail"),
    checkAgain: t(locale, "settings.checkAgain"),
    verifyStillNot: t(locale, "settings.verifyStillNot"),
    verifyCheckFailed: t(locale, "settings.verifyCheckFailed"),
    closeAccount: t(locale, "settings.closeAccount"),
    askOnGithub: t(locale, "settings.askOnGithub"),
    newTab: t(locale, "common.newTab"),
    closeHint: t(locale, "settings.closeHint"),
    notSignedIn: t(locale, "settings.notSignedIn"),
    downloadData: t(locale, "settings.downloadData"),
    downloadMine: t(locale, "settings.downloadMine"),
    downloadHint: t(locale, "settings.downloadHint"),
    downloadJson: t(locale, "settings.downloadJson"),
    downloadSyncWaiting: t(locale, "settings.downloadSyncWaiting"),
    downloading: t(locale, "settings.downloading"),
    wipeAll: t(locale, "settings.wipeAll"),
    wipeHint: t(locale, "settings.wipeHint"),
    confirmWipeAll: t(locale, "settings.confirmWipeAll"),
    wipeAllBtn: t(locale, "settings.wipeAllBtn"),
    toastTrackedDeleted: t(locale, "settings.toastTrackedDeleted"),
    toastVisitorDeleted: t(locale, "settings.toastVisitorDeleted"),
    toastChoicesDeleted: t(locale, "settings.toastChoicesDeleted"),
    toastRecentDeleted: t(locale, "settings.toastRecentDeleted"),
    toastOptOutOn: t(locale, "settings.toastOptOutOn"),
    toastOptOutOff: t(locale, "settings.toastOptOutOff"),
    toastDownloaded: t(locale, "settings.toastDownloaded"),
    toastWiped: t(locale, "settings.toastWiped"),
    toastWipedAccount: t(locale, "settings.toastWipedAccount"),
    deleteConfirm: t(locale, "common.deleteConfirm"),
    cancel: t(locale, "common.cancel"),
    close: t(locale, "common.close"),
    install: {
      title: t(locale, "install.title"),
      hint: t(locale, "install.hint"),
      installing: t(locale, "install.installing"),
      install: t(locale, "install.title"),
      later: t(locale, "install.later"),
    },
    invalidEmail: t(locale, "auth.errInvalidEmail"),
    wrongCredentials: t(locale, "auth.errWrongCredentials"),
    cannotRegister: t(locale, "auth.errCannotRegister"),
    weakPassword: t(locale, "auth.errWeakPassword"),
    tooManyRequests: t(locale, "auth.errTooManyRequests"),
    noConnection: t(locale, "auth.errNoConnection"),
    cannotSignIn: t(locale, "auth.errCannotSignIn"),
    resetSent: t(locale, "auth.resetSent"),
    cannotSendReset: t(locale, "auth.errCannotSendReset"),
    noAccount: t(locale, "auth.noAccount"),
    verifySent: t(locale, "auth.verifySent"),
  };
  return (
    <LabelsProvider locale={locale} labels={labels}>
      {children}
    </LabelsProvider>
  );
}
