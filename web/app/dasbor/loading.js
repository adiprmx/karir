import { getLocale, t } from "@/lib/i18n";

export default async function Loading() {
  const locale = await getLocale();
  return (
    <div className="wrap" aria-busy="true">
      <div className="page-head">
        <h1>{t(locale, "dash.metaTitle")}</h1>
        <p className="lede">{t(locale, "common.loading")}</p>
      </div>
      <div className="skeleton" style={{ height: 160 }} />
      <div className="skeleton" style={{ height: 220, marginTop: 16 }} />
    </div>
  );
}
