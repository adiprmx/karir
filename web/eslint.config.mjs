// Konfigurasi ESLint (flat) untuk aplikasi Next.js Karir.
// Memakai aturan bawaan Next.js (core-web-vitals) lewat FlatCompat,
// sesuai jalur migrasi resmi dari `next lint` yang sudah deprecated.
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [...compat.extends("next/core-web-vitals")];

export default eslintConfig;
