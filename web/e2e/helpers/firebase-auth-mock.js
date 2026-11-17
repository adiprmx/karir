/* Mock Firebase Auth untuk tes E2E (P-01).
 *
 * Alasan: tes E2E berjalan melawan server dengan kunci Firebase
 * dummy (CI lokal) atau melawan deployment pratinjau Vercel.
 * Mendaftar sungguhan di kedua tempat itu tidak benar: di CI
 * kunci dummy membuat Auth menolak, dan di pratinjau pendaftaran
 * sungguhan akan membuat akun sampah di proyek Firebase produksi.
 * Karena itu panggilan REST Identity Toolkit dicegat di browser
 * dan dijawab dengan pengguna palsu yang konsisten.
 *
 * Yang dicegat (pola URL Identity Toolkit v1 + Secure Token):
 * - accounts:signUp, accounts:signInWithPassword: jawaban sukses
 *   dengan ID token JWT palsu (tanda tangan "palsu" — SDK klien
 *   tidak memverifikasi tanda tangan, hanya membaca payload).
 * - accounts:sendOobCode: kirim email verifikasi (dijawab kosong).
 * - accounts:update: ubah profil (dijawab seperti signUp).
 * - accounts:lookup: baca ulang data pengguna (dipakai SDK saat
 *   sesi dipulihkan dari IndexedDB sesudah navigasi).
 * - securetoken.googleapis.com/v1/token: segarkan token.
 *
 * Akun tes memakai domain .test (RFC 2606, tidak bisa terkirim
 * ke mana pun) dan UID yang jelas-jelas palsu. Tidak ada kredensial
 * asli di sini; kata sandi tes hanya memenuhi syarat kekuatan
 * formulir (minimal 8 huruf, campuran huruf besar/kecil, angka,
 * simbol) dan tidak pernah dipakai di luar mock ini.
 *
 * Firestore dari browser juga dimatikan di sini (mockFirestore-
 * Offline): pelacak dan profil memakai Firestore klien, dan
 * kegagalan jaringan yang menggantung akan memperlambat tes.
 * Jawaban 503 cepat membuat jalur gagal-cepat aplikasi bekerja
 * (pelacak lokal tetap jalan, sinkron ditandai tertunda).
 * Panggilan Firestore dari SERVER tidak kena — route interception
 * Playwright hanya berlaku untuk request browser. */

export const TEST_USER = {
  uid: "e2e-penguji-000000000000000000000001",
  email: "penguji-e2e@karir-e2e.test",
  password: "KataSandi-Uji-2026!",
};

function base64Url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/* ID token JWT palsu: header + payload + tanda tangan dummy.
 * SDK membaca `exp` (belum kedaluwarsa), `user_id`, `email`, dan
 * `email_verified` dari payload. Masa berlaku 1 jam dari dibuat. */
export function fakeIdToken(email, uid) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: "e2e-palsu", typ: "JWT" };
  const payload = {
    iss: "https://securetoken.google.com/karir-9d53a",
    aud: "karir-9d53a",
    auth_time: now,
    user_id: uid,
    sub: uid,
    iat: now,
    exp: now + 3600,
    email,
    email_verified: false,
    firebase: {
      identities: { email: [email] },
      sign_in_provider: "password",
    },
  };
  return `${base64Url(header)}.${base64Url(payload)}.tanda-tangan-palsu`;
}

function signUpBody(email, uid) {
  return {
    kind: "identitytoolkit#SignupNewUserResponse",
    idToken: fakeIdToken(email, uid),
    email,
    refreshToken: "e2e-refresh-token-palsu",
    expiresIn: "3600",
    localId: uid,
  };
}

/* Pasang seluruh intersep Auth di halaman. Panggil SEBELUM goto
 * pertama, supaya tidak ada panggilan Auth yang lolos. */
export async function mockFirebaseAuth(page, user = TEST_USER) {
  const authBase = "**/identitytoolkit.googleapis.com/v1/accounts";
  await page.route(`${authBase}:signUp*`, async (route) => {
    await route.fulfill({ status: 200, json: signUpBody(user.email, user.uid) });
  });
  await page.route(`${authBase}:signInWithPassword*`, async (route) => {
    await route.fulfill({ status: 200, json: signUpBody(user.email, user.uid) });
  });
  await page.route(`${authBase}:sendOobCode*`, async (route) => {
    await route.fulfill({ status: 200, json: { email: user.email } });
  });
  await page.route(`${authBase}:update*`, async (route) => {
    await route.fulfill({ status: 200, json: signUpBody(user.email, user.uid) });
  });
  await page.route(`${authBase}:lookup*`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        kind: "identitytoolkit#GetAccountInfoResponse",
        users: [
          {
            localId: user.uid,
            email: user.email,
            emailVerified: false,
            displayName: "",
            providerUserInfo: [
              { providerId: "password", email: user.email },
            ],
            validSince: "0",
            lastLoginAt: String(Date.now()),
            createdAt: String(Date.now()),
          },
        ],
      },
    });
  });
  await page.route("**/securetoken.googleapis.com/v1/token*", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        access_token: fakeIdToken(user.email, user.uid),
        expires_in: "3600",
        token_type: "Bearer",
        refresh_token: "e2e-refresh-token-palsu",
        user_id: user.uid,
        project_id: "karir-9d53a",
      },
    });
  });
}

/* Firestore dari browser: jawab 503 cepat. Lihat penjelasan di
 * kepala berkas ini. */
export async function mockFirestoreOffline(page) {
  await page.route("**/firestore.googleapis.com/**", async (route) => {
    await route.fulfill({
      status: 503,
      json: { error: { code: 503, message: "E2E: Firestore klien dimatikan" } },
    });
  });
}
