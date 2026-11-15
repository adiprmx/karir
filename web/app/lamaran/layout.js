/* Halaman lamaran adalah komponen klien sehingga tidak bisa
 * mengekspor metadata sendiri (FE-07); metadata ditaruh di layout
 * rute ini. Halaman personal: jangan diindeks mesin pencari (S7). */
import { getLocale, t } from "@/lib/i18n";
import { LabelsProvider } from "@/app/labels-provider";

export const metadata = {
  title: "Lamaran",
  description:
    "Lamaran yang dilacak: perusahaan yang sudah dilamar dan status tiap lamaran.",
  robots: { index: false, follow: false },
};

/* W2a (UX-08): label halaman Lamaran diteruskan lewat konteks —
 * komponen klien tidak bisa mengimpor lib/i18n (memakai
 * next/headers). Provider ini bersarang di dalam provider layout
 * akar; labelnya digabung, bukan menggantikan. */
export default async function LamaranLayout({ children }) {
  const locale = await getLocale();
  const labels = {
    title: t(locale, "lamaran.title"),
    lede: t(locale, "lamaran.lede"),
    ledeAccount: t(locale, "lamaran.ledeAccount"),
    ledeGuest: t(locale, "sync.guest"),
    loading: t(locale, "lamaran.loading"),
    retrySync: t(locale, "lamaran.retrySync"),
    lastSynced: t(locale, "lamaran.lastSynced"),
    guestBanner: t(locale, "lamaran.guestBanner"),
    mergeGuest: t(locale, "lamaran.mergeGuest"),
    or: t(locale, "lamaran.or"),
    leaveAlone: t(locale, "lamaran.leaveAlone"),
    filterLabel: t(locale, "lamaran.filterLabel"),
    emptyTitle: t(locale, "lamaran.emptyTitle"),
    emptyHint: t(locale, "lamaran.emptyHint"),
    searchCompanies: t(locale, "lamaran.searchCompanies"),
    noStatus: t(locale, "lamaran.noStatus"),
    viewAll: t(locale, "lamaran.viewAll"),
    companyNo: t(locale, "lamaran.companyNo"),
    openPortal: t(locale, "lamaran.openPortal"),
    notInData: t(locale, "lamaran.notInData"),
    statusLabel: t(locale, "lamaran.statusLabel"),
    namesFailed: t(locale, "lamaran.namesFailed"),
    retry: t(locale, "search.retry"),
    statusChanged: t(locale, "lamaran.statusChanged"),
    statusChangedUnknown: t(locale, "lamaran.statusChangedUnknown"),
    syncOk: t(locale, "lamaran.syncOk"),
    syncFail: t(locale, "lamaran.syncFail"),
    mergeOk: t(locale, "lamaran.mergeOk"),
    mergeFail: t(locale, "lamaran.mergeFail"),
    deleted: t(locale, "tracker.deleted"),
    deleteTitle: t(locale, "tracker.deleteTitle"),
    deleteMessage: t(locale, "tracker.deleteMessage"),
    deleteConfirm: t(locale, "common.deleteConfirm"),
    cancel: t(locale, "common.cancel"),
    close: t(locale, "common.close"),
    delete: t(locale, "common.delete"),
    all: t(locale, "common.all"),
    sync: {
      saved: t(locale, "sync.saved"),
      sending: t(locale, "sync.sending"),
      pending: t(locale, "sync.pending"),
      offline: t(locale, "sync.offline"),
      busy: t(locale, "sync.busy"),
      session: t(locale, "sync.session"),
      denied: t(locale, "sync.denied"),
      failed: t(locale, "sync.failed"),
      guest: t(locale, "sync.guest"),
    },
  };
  return (
    <LabelsProvider locale={locale} labels={labels}>
      {children}
    </LabelsProvider>
  );
}
