// Konfigurasi ESLint (flat) untuk aplikasi Next.js Karir.
// Memakai aturan bawaan Next.js (core-web-vitals) lewat impor flat resmi
// dari eslint-config-next 16.
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [...nextVitals];

export default eslintConfig;
