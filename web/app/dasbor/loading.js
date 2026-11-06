import { getLocale, t } from "@/lib/i18n";

export default async function Loading() {
  const locale = await getLocale();
  return (
    <div className="wrap">
      <div className="page-head">
        <h1>{t(locale, "dash.metaTitle")}</h1>
        <p className="lede">{t(locale, "common.loading")}</p>
      </div>
      <div className="skeleton" style={{ width: "40%", height: 32, marginBottom: 16 }} />
      <div className="skeleton" style={{ width: "100%", height: 180, marginBottom: 16 }} />
      <div className="skeleton" style={{ width: "100%", height: 120, marginBottom: 16 }} />
      <div className="skeleton" style={{ width: "70%", height: 120 }} />
    </div>
  );
}
