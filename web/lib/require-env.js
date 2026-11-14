/* Pembantu variabel lingkungan wajib. Kembalikan nilai variabel bila
 * ada dan tidak kosong; lempar Error yang jelas bila kosong. Tidak ada
 * nilai default untuk rahasia: bila variabel belum dipasang, pemanggil
 * wajib menangani kegagalan ini (misalnya menjawab 503), bukan memakai
 * nilai pengganti. Pesan error hanya menyebut nama variabel, tidak
 * pernah nilainya. Parameter env bisa disuntik untuk test; default
 * process.env. */
export function requireEnv(name, env = process.env) {
  const value = env?.[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Variabel ${name} belum dipasang`);
  }
  return value;
}
