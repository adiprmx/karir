import Link from "next/link";

export function StatusBadge({ status }) {
  const cls =
    status === "Ada lowongan target"
      ? "badge ok"
      : status === "Ada lowongan target (tidak cocok)"
        ? "badge warn"
        : "badge";
  return <span className={cls}>{status}</span>;
}

export function safeLink(url) {
  return typeof url === "string" && /^https?:\/\//.test(url);
}

/* Baris hasil di tabel Cari. */
export function CompanyRow({ entry }) {
  const c = entry.company;
  const name = safeLink(c.link_karir) ? (
    <a href={c.link_karir} target="_blank" rel="noopener noreferrer">
      {c.perusahaan}
    </a>
  ) : (
    c.perusahaan
  );
  return (
    <tr>
      <td data-label="Perusahaan">
        <span className="cell-name">{name}</span>
        <span className="cell-sub">{c.kategori}</span>
        <span className="chip-row">
          {(entry.reasons || []).map((r) => (
            <span
              key={r}
              className={
                r === "Posisi cocok" || r === "Lokasi cocok" ? "chip match" : "chip"
              }
            >
              {r}
            </span>
          ))}
        </span>
        {entry.queryHasPosisi && !entry.positionMatched && !entry.nameMatched && (
          <p className="notice">
            Peran ini belum terverifikasi di data kami — cek langsung di portalnya.
          </p>
        )}
      </td>
      <td data-label="Lokasi" className="cell-muted">
        <span className="cell-clamp">{c.lokasi || "Tidak tercantum"}</span>
      </td>
      <td data-label="Posisi tercatat" className="cell-muted">
        <span className="cell-clamp">{c.posisi || "Tidak ada posisi terlihat"}</span>
      </td>
      <td data-label="Status">
        <StatusBadge status={c.status} />
      </td>
    </tr>
  );
}

export function ResultsTable({ entries, queryHasPosisi }) {
  if (entries.length === 0) {
    return (
      <div className="state">
        <strong>Tidak ada perusahaan yang cocok.</strong>
        <p>
          Coba kata kunci lain, atau kosongkan kolom dan tekan Cari untuk melihat
          semua perusahaan.
        </p>
      </div>
    );
  }
  return (
    <table className="results-table">
      <thead>
        <tr>
          <th>Perusahaan</th>
          <th>Lokasi</th>
          <th>Posisi tercatat</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <CompanyRow
            key={e.company.no}
            entry={{ ...e, queryHasPosisi }}
          />
        ))}
      </tbody>
    </table>
  );
}

/* Angka yang naik dari 0 ke nilai asli (mati di prefers-reduced-motion). */
export function CountUp({ value }) {
  return <span className="num">{value}</span>;
}
