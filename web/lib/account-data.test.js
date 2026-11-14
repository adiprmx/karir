/* Tes unit untuk lib/account-data.js, memakai test runner bawaan Node.
 * Dijalankan dengan: node --test lib/account-data.test.js
 * Yang dites: authErrorMessage, passwordResetOutcome (termasuk
 * perilaku tidak membocorkan keberadaan email), clearLocalData
 * (keenam kunci, tanpa menyentuh kunci lain), dan buildAccountExport
 * (bentuk berkas unduh data pengguna). Tidak ada jaringan, tidak
 * ada Firebase: sendPasswordReset dan sendVerificationEmail tidak
 * dipanggil di sini karena butuh SDK auth. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_DATA_KEYS,
  VISITOR_KEY,
  authErrorMessage,
  buildAccountExport,
  clearLocalData,
  passwordResetOutcome,
} from "./account-data.js";

/* Tiruan localStorage minimal untuk clearLocalData. */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
    keys: () => Object.keys(data),
  };
}

describe("authErrorMessage", () => {
  it("memetakan kode email dan kata sandi ke bahasa sehari-hari", () => {
    assert.equal(
      authErrorMessage("auth/invalid-email"),
      "Alamat email tidak dikenal. Periksa lagi tulisannya.",
    );
    assert.equal(
      authErrorMessage("auth/email-already-in-use"),
      "Email ini sudah dipakai. Coba masuk, atau pakai email lain.",
    );
    assert.equal(
      authErrorMessage("auth/weak-password"),
      "Kata sandi terlalu pendek, minimal 6 huruf.",
    );
  });

  it("tidak membedakan email tidak ada dan kata sandi salah", () => {
    const message = "Email atau kata sandi salah.";
    assert.equal(authErrorMessage("auth/user-not-found"), message);
    assert.equal(authErrorMessage("auth/wrong-password"), message);
    assert.equal(authErrorMessage("auth/invalid-credential"), message);
  });

  it("memetakan batas laju dan jaringan", () => {
    assert.equal(
      authErrorMessage("auth/too-many-requests"),
      "Terlalu sering mencoba. Tunggu sebentar lalu coba lagi.",
    );
    assert.equal(
      authErrorMessage("auth/network-request-failed"),
      "Tidak ada koneksi. Periksa internet lalu coba lagi.",
    );
  });

  it("kode Google yang sudah tidak terpakai jatuh ke pesan umum", () => {
    const fallback = "Tidak bisa masuk sekarang. Coba lagi sebentar lagi.";
    assert.equal(authErrorMessage("auth/popup-blocked"), fallback);
    assert.equal(authErrorMessage("auth/popup-closed-by-user"), fallback);
    assert.equal(authErrorMessage("auth/provider-not-enabled"), fallback);
    assert.equal(authErrorMessage("auth/operation-not-allowed"), fallback);
  });

  it("kode tidak dikenal dan kode kosong jatuh ke pesan umum", () => {
    const fallback = "Tidak bisa masuk sekarang. Coba lagi sebentar lagi.";
    assert.equal(authErrorMessage("auth/entah-apa"), fallback);
    assert.equal(authErrorMessage(undefined), fallback);
    assert.equal(authErrorMessage(null), fallback);
  });
});

describe("passwordResetOutcome", () => {
  const sentMessage =
    "Tautan untuk membuat kata sandi baru sudah dikirim ke email itu. " +
    "Periksa kotak masuk, lalu ikuti tautannya.";

  it("berhasil mengirim tautan", () => {
    assert.deepEqual(passwordResetOutcome(null), {
      sent: true,
      message: sentMessage,
    });
    assert.deepEqual(passwordResetOutcome(undefined), {
      sent: true,
      message: sentMessage,
    });
  });

  it("email tidak terdaftar mendapat pesan yang sama (tidak bocor)", () => {
    assert.deepEqual(passwordResetOutcome("auth/user-not-found"), {
      sent: true,
      message: sentMessage,
    });
  });

  it("email tidak sah gagal dengan pesan format", () => {
    assert.deepEqual(passwordResetOutcome("auth/invalid-email"), {
      sent: false,
      message: "Alamat email tidak dikenal. Periksa lagi tulisannya.",
    });
  });

  it("batas laju dan jaringan gagal dengan pesan yang sesuai", () => {
    assert.deepEqual(passwordResetOutcome("auth/too-many-requests"), {
      sent: false,
      message: "Terlalu sering mencoba. Tunggu sebentar lalu coba lagi.",
    });
    assert.deepEqual(passwordResetOutcome("auth/network-request-failed"), {
      sent: false,
      message: "Tidak ada koneksi. Periksa internet lalu coba lagi.",
    });
  });

  it("kode lain gagal dengan pesan umum", () => {
    assert.deepEqual(passwordResetOutcome("auth/entah-apa"), {
      sent: false,
      message: "Tidak bisa mengirim tautan sekarang. Coba lagi sebentar lagi.",
    });
  });
});

describe("LOCAL_DATA_KEYS dan clearLocalData", () => {
  it("mendaftar tepat enam kunci data lokal", () => {
    assert.deepEqual([...LOCAL_DATA_KEYS].sort(), [
      "karir-lamaran",
      "karir-onboarding",
      "karir-recent-search",
      "karir-theme",
      "karir-visited-metode",
      "karir-visitor",
    ]);
    assert.equal(VISITOR_KEY, "karir-visitor");
  });

  it("penanda hapus pelacak tidak termasuk kunci hapus semua", () => {
    assert.equal(LOCAL_DATA_KEYS.includes("karir-lamaran-dihapus"), false);
  });

  it("menghapus keenam kunci dan melaporkan yang terhapus", () => {
    const storage = fakeStorage({
      "karir-onboarding": "{}",
      "karir-lamaran": "{}",
      "karir-recent-search": "{}",
      "karir-visitor": "abc",
      "karir-theme": "dark",
      "karir-visited-metode": "1",
      "karir-lamaran-dihapus": "{}",
      "kunci-lain": "tetap",
    });
    const removed = clearLocalData(storage);
    assert.deepEqual([...removed].sort(), [...LOCAL_DATA_KEYS].sort());
    assert.deepEqual(storage.keys().sort(), [
      "karir-lamaran-dihapus",
      "kunci-lain",
    ]);
  });

  it("kunci yang tidak ada dilaporkan tidak terhapus", () => {
    const storage = fakeStorage({ "karir-theme": "light" });
    assert.deepEqual(clearLocalData(storage), ["karir-theme"]);
    assert.deepEqual(storage.keys(), []);
  });

  it("penyimpanan kosong atau rusak tidak melempar", () => {
    assert.deepEqual(clearLocalData(null), []);
    assert.deepEqual(clearLocalData(undefined), []);
    assert.deepEqual(clearLocalData({}), []);
    const throwing = {
      getItem: () => {
        throw new Error("ditolak");
      },
      removeItem: () => {
        throw new Error("ditolak");
      },
    };
    assert.deepEqual(clearLocalData(throwing), []);
  });
});

describe("buildAccountExport", () => {
  const now = new Date("2026-11-15T00:30:00.000Z");

  it("menyusun berkas lengkap untuk pengguna yang masuk", () => {
    const out = buildAccountExport(
      {
        profile: {
          email: "nama@email.com",
          displayName: "Nama",
          emailVerified: true,
        },
        trackers: {
          12: {
            no: 12,
            status: "Ditandai",
            tanggal: "2026-11-01",
            catatan: "cek lagi",
          },
          5: {
            companyNo: 5,
            status: "Sudah dilamar",
            tanggal: "",
            catatan: "",
          },
        },
        onboarding: { domisili: "Depok", posisi: "Staff Gudang" },
        recentSearch: { domisili: "Bogor", posisi: "" },
        theme: "dark",
        visitorId: "0123456789abcdef",
      },
      now,
    );
    assert.deepEqual(out, {
      dieksporPada: "2026-11-15T00:30:00.000Z",
      akun: {
        email: "nama@email.com",
        namaTampilan: "Nama",
        emailTerverifikasi: true,
      },
      tandaLamaran: [
        {
          no: 5,
          status: "Sudah dilamar",
          tanggal: "",
          catatan: "",
        },
        {
          no: 12,
          status: "Ditandai",
          tanggal: "2026-11-01",
          catatan: "cek lagi",
        },
      ],
      pengaturan: {
        pilihan: { domisili: "Depok", posisi: "Staff Gudang" },
        pencarianTerakhir: { domisili: "Bogor", posisi: "" },
        tema: "dark",
      },
      nomorPengunjung: "0123456789abcdef",
    });
  });

  it("tamu mendapat akun null dan daftar kosong", () => {
    const out = buildAccountExport({}, now);
    assert.equal(out.akun, null);
    assert.deepEqual(out.tandaLamaran, []);
    assert.deepEqual(out.pengaturan, {
      pilihan: null,
      pencarianTerakhir: null,
      tema: null,
    });
    assert.equal(out.nomorPengunjung, null);
    assert.equal(out.dieksporPada, "2026-11-15T00:30:00.000Z");
  });

  it("entri tidak sah dibuang, tanggal tidak sah dikosongkan", () => {
    const out = buildAccountExport(
      {
        trackers: {
          1: { no: 1, status: "Ditandai", tanggal: "bukan-tanggal" },
          2: { no: 2, status: "Status karangan", tanggal: "2026-11-01" },
          3: { no: 0, status: "Ditandai", tanggal: "2026-11-01" },
          4: null,
          5: { no: 5, status: "Ditolak", tanggal: "2026-11-02" },
        },
      },
      now,
    );
    assert.deepEqual(out.tandaLamaran, [
      { no: 1, status: "Ditandai", tanggal: "", catatan: "" },
      { no: 5, status: "Ditolak", tanggal: "2026-11-02", catatan: "" },
    ]);
  });

  it("tema selain light dan dark menjadi null", () => {
    assert.equal(
      buildAccountExport({ theme: "sepia" }, now).pengaturan.tema,
      null,
    );
    assert.equal(
      buildAccountExport({ theme: "light" }, now).pengaturan.tema,
      "light",
    );
  });

  it("email tidak terverifikasi tercatat false", () => {
    const out = buildAccountExport(
      { profile: { email: "a@b.co", displayName: "", emailVerified: false } },
      now,
    );
    assert.equal(out.akun.emailTerverifikasi, false);
  });

  it("tanpa tanggal tetap, dieksporPada memakai waktu sekarang", () => {
    const before = new Date();
    const out = buildAccountExport({});
    const after = new Date();
    const exported = Date.parse(out.dieksporPada);
    assert.ok(exported >= before.getTime());
    assert.ok(exported <= after.getTime());
  });
});
