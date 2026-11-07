import { getLocale, t } from "@/lib/i18n";

export default async function Loading() {
  const locale = await getLocale();
  return (
    <div className="wrap" aria-busy="true">
      <p className="lede" style={{ marginTop: 24 }}>
        {t(locale, "common.loading")}
      </p>
      <div style={{ display: "flex", gap: 16, marginTop: 20 }}>
        <div className="skeleton" style={{ width: 64, height: 64 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ width: "60%", height: 32 }} />
          <div className="skeleton" style={{ width: 160, height: 24, marginTop: 12 }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 52, marginTop: 24 }} />
      <div className="skeleton" style={{ height: 180, marginTop: 24 }} />
    </div>
  );
}
