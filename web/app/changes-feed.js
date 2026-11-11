"use client";

/* Umpan perubahan status: 10 perubahan terbaru yang dicatat cron cek ulang
 * harian dan cek massal admin. Bila belum ada, kalimat jujur, bukan contoh. */
import Link from "next/link";
import { StatusTag } from "@/app/visual";
import { isNewChange } from "@/lib/notify";
import { useChanges } from "@/app/use-changes";

export default function ChangesFeed() {
  const { changes, failed } = useChanges();
  if (failed) {
    return (
      <div className="state">
        <strong>Umpan perubahan belum bisa dimuat.</strong>
        <p>Itu tidak berarti tidak ada perubahan. Muat ulang halaman sebentar lagi.</p>
      </div>
    );
  }
  if (changes === null) return <div className="skeleton" style={{ height: 96 }} aria-label="Memuat perubahan" />;
  if (changes.length === 0) {
    return (
      <div className="state">
        <strong>Belum ada perubahan status yang tercatat.</strong>
        <p>
          Setiap hari pukul 01.00 WIB, portal target dicek ulang. Kalau ada
          status yang berubah, muncul di sini.
        </p>
      </div>
    );
  }
  return (
    <ol className="changes">
      {changes.map((c, i) => (
        <li key={c.id || `${c.companyNo}-${c.createdAt || i}`}>
          <Link href={`/perusahaan/${c.companyNo}`}>
            <span className="changes-name">
              {c.perusahaan}{" "}
              {(isNewChange(c.createdAt) || c.to === "Ada lowongan target") && (
                <span className="tag baru">Baru</span>
              )}
            </span>
            <span className="changes-flow">
              <StatusTag status={c.from} />
              <span aria-label="menjadi">menjadi</span>
              <StatusTag status={c.to} />
            </span>
            <span className="changes-date">Dicek {c.checkedAt}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
