// Konfigurasi ESLint (flat) untuk aplikasi Next.js Karir.
// Memakai aturan bawaan Next.js (core-web-vitals) lewat impor flat resmi
// dari eslint-config-next 16, ditambah aturan proyek (P-01, DX-10):
// - no-console (hanya warn/error yang boleh) di kode aplikasi app/ dan
//   lib/: console.log tanpa level membuat log produksi tidak bisa
//   disaring dan menandakan debug yang tertinggal. Berkas scripts/
//   (perkakas CLI: impor, cadangan, smoke-check) sengaja dikecualikan
//   — mencetak ke stdout adalah fungsi utama perkakas itu.
// - karir/no-hardcoded-company-count: larangan literal 639/685 di kode
//   sumber non-tes (app/, lib/, scripts/); jumlah perusahaan wajib
//   dibaca dari seed, API, atau props (DOK-01/BE2-19). Berkas tes
//   dikecualikan karena tes memang menegaskan nilai.
import nextVitals from "eslint-config-next/core-web-vitals";
import noHardcodedCompanyCount from "./eslint-rules/no-hardcoded-company-count.mjs";

const eslintConfig = [
  ...nextVitals,
  {
    files: ["app/**/*.js", "lib/**/*.js", "lib/**/*.mjs"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["app/**/*.js", "lib/**/*.js", "lib/**/*.mjs", "scripts/**/*.mjs"],
    ignores: ["**/*.test.js"],
    plugins: {
      karir: {
        rules: {
          "no-hardcoded-company-count": noHardcodedCompanyCount,
        },
      },
    },
    rules: {
      "karir/no-hardcoded-company-count": "error",
    },
  },
];

export default eslintConfig;
