/* Aturan ESLint lokal Karir: larangan angka jumlah perusahaan
 * yang dikode keras (P-01, DX-10; mendukung DOK-01/BE2-19).
 *
 * Jumlah perusahaan berubah lewat hunting harian. Angka yang
 * ditulis langsung di kode sumber (bukan dibaca dari seed, API,
 * atau props) akan basi dan menyesatkan — riwayatnya: angka 639
 * tertinggal dari 685 di beberapa tempat (BE2-03/FE2-02/S-01).
 * Aturan ini menangkap dua angka itu sebagai literal bilangan
 * bulat di kode sumber aplikasi. Angka yang sama di berkas tes
 * diizinkan (tes memang menegaskan nilai), begitu pula di data
 * dan dokumen — aturan ini hanya dipasang untuk app/, lib/, dan
 * scripts/ non-tes lewat eslint.config.mjs.
 *
 * Bilangan desimal (mis. koordinat 112.6397 di lib/cities.js)
 * tidak kena: aturan hanya memeriksa literal bilangan bulat
 * yang nilainya persis sama. Bila suatu saat angka 685 atau 639
 * memang dibutuhkan sebagai konstanta yang bukan jumlah
 * perusahaan, pakai eslint-disable-next-line dengan alasan
 * tertulis di komentar yang sama. */

const FORBIDDEN = new Set([639, 685]);

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "larang literal 639/685 (jumlah perusahaan kode-keras) di kode sumber; baca dari seed/API/props",
    },
    schema: [],
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value !== "number") return;
        if (!Number.isInteger(node.value)) return;
        if (!FORBIDDEN.has(node.value)) return;
        context.report({
          node,
          message:
            "Jumlah perusahaan ({{value}}) tidak boleh dikode keras; " +
            "baca dari seed, API, atau props supaya ikut saat data berubah.",
          data: { value: String(node.value) },
        });
      },
    };
  },
};

export default rule;
