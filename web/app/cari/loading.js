const bar = {
  background: "#f4f4f5",
  borderRadius: 8,
  animation: "karir-pulse 1.4s ease-in-out infinite",
};

export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Memuat">
      <style>
        {`@keyframes karir-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }`}
      </style>
      <div className="page-head">
        <div style={{ ...bar, height: 48, maxWidth: 480 }} />
        <div style={{ ...bar, height: 20, maxWidth: 560, marginTop: 16 }} />
      </div>
      <div style={{ ...bar, height: 56 }} />
      <div style={{ ...bar, height: 200, marginTop: 24 }} />
    </div>
  );
}
