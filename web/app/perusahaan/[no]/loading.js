import { getLocale, t } from "@/lib/i18n";

export default async function Loading() {
  const locale = await getLocale();
  return (
    <div className="wrap">
      <div className="page-head">
        <p className="lede">{t(locale, "common.loading")}</p>
      </div>
      <div className="skeleton" style={{ width: "60%", height: 36, marginBottom: 16 }} />
      <div className="skeleton" style={{ width: "220px", height: 44, marginBottom: 24 }} />
      <div className="skeleton" style={{ width: "100%", height: 120, marginBottom: 16 }} />
      <div className="skeleton" style={{ width: "80%", height: 120 }} />
    </div>
  );
}
