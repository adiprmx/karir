/* Pembangun umpan RSS 2.0 untuk perubahan lowongan (MKT-10).
 * Fungsi murni: menerima daftar perubahan (bentuk dari
 * lib/changes.js) dan mengembalikan dokumen XML. Rute
 * web/app/feed.xml/route.js hanya memanggil getChanges lalu fungsi
 * ini. Semua teks di-escape XML supaya nama perusahaan dengan
 * karakter khusus (&, <, >) tidak merusak dokumen. */

const SITE_URL = "https://karir-adiprmx.vercel.app";

export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* Tanggal publikasi item: createdAt (ISO) bila sah, kalau tidak
 * checkedAt ("YYYY-MM-DD"), kalau tidak ada keduanya, item tanpa
 * pubDate. */
function pubDateOf(change) {
  const raw = change.createdAt || change.checkedAt || "";
  if (!raw) return "";
  const d = new Date(raw.length === 10 ? `${raw}T00:00:00Z` : raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toUTCString();
}

export function buildFeedXml(changes, now = new Date()) {
  const items = (changes || [])
    .map((c) => {
      const link = `${SITE_URL}/perusahaan/${c.companyNo}`;
      const title = `${c.perusahaan}: ${c.from} → ${c.to}`;
      const description = `Status ${c.perusahaan} berubah dari ${c.from} menjadi ${c.to}.`;
      const guid = c.id || `${c.companyNo}-${c.checkedAt}`;
      const pubDate = pubDateOf(c);
      return [
        "    <item>",
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="false">${escapeXml(guid)}</guid>`,
        `      <description>${escapeXml(description)}</description>`,
        ...(pubDate ? [`      <pubDate>${pubDate}</pubDate>`] : []),
        "    </item>",
      ].join("\n");
    })
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>Karir — Perubahan lowongan</title>",
    `    <link>${SITE_URL}</link>`,
    "    <description>Perubahan status kanal karir perusahaan di Karir: mana yang baru ada lowongan dan mana yang berubah.</description>",
    "    <language>id-ID</language>",
    `    <lastBuildDate>${now.toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
