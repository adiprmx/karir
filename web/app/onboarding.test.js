/* Tes unit untuk app/onboarding.js, memakai test runner bawaan Node.
 * Dijalankan dengan: node --test app/onboarding.test.js
 * Mencakup regresi ONB-02 (T17): satu definisi "pilihan tersimpan"
 * (hasOnboardingChoice) yang dipakai /mulai, Dasbor, dan Pengaturan,
 * supaya pilihan sebagian diakui di semua tempat. Juga mencakup
 * penyimpanan localStorage: simpan, baca, hapus, dan data rusak.
 * window + localStorage di-stub di sini; tidak ada DOM sungguhan. */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ONBOARDING_KEY,
  clearOnboarding,
  hasOnboardingChoice,
  isOnboardingComplete,
  loadOnboarding,
  saveOnboarding,
} from "./onboarding.js";

function makeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _dump: () => Object.fromEntries(store),
  };
}

let dispatched;

function installWindow(storage) {
  dispatched = 0;
  globalThis.window = {
    localStorage: storage,
    dispatchEvent: () => {
      dispatched += 1;
    },
  };
}

beforeEach(() => {
  installWindow(makeStorage());
});

describe("hasOnboardingChoice: satu definisi pilihan tersimpan", () => {
  it("kedua kolom terisi: tersimpan", () => {
    assert.equal(
      hasOnboardingChoice({ domisili: "Bogor", posisi: "Helper Gudang", selesai: true }),
      true,
    );
  });

  it("hanya domisili terisi: tersimpan (pilihan sebagian diakui)", () => {
    assert.equal(
      hasOnboardingChoice({ domisili: "Bogor", posisi: "", selesai: true }),
      true,
    );
  });

  it("hanya posisi terisi: tersimpan (pilihan sebagian diakui)", () => {
    assert.equal(
      hasOnboardingChoice({ domisili: "", posisi: "Packing", selesai: true }),
      true,
    );
  });

  it("kedua kolom kosong: belum ada pilihan", () => {
    assert.equal(
      hasOnboardingChoice({ domisili: "", posisi: "", selesai: true }),
      false,
    );
  });

  it("hanya spasi: belum ada pilihan", () => {
    assert.equal(
      hasOnboardingChoice({ domisili: "   ", posisi: "", selesai: true }),
      false,
    );
  });

  it("null, undefined, dan bentuk salah: belum ada pilihan", () => {
    assert.equal(hasOnboardingChoice(null), false);
    assert.equal(hasOnboardingChoice(undefined), false);
    assert.equal(hasOnboardingChoice("Bogor"), false);
    assert.equal(hasOnboardingChoice([]), false);
    assert.equal(
      hasOnboardingChoice({ domisili: "Bogor", posisi: "Packing" }),
      false,
    );
    assert.equal(
      hasOnboardingChoice({ domisili: "Bogor", posisi: "Packing", selesai: false }),
      false,
    );
    assert.equal(
      hasOnboardingChoice({ domisili: 12, posisi: "Packing", selesai: true }),
      false,
    );
  });
});

describe("isOnboardingComplete: kedua kolom terisi", () => {
  it("kedua kolom terisi: lengkap", () => {
    assert.equal(
      isOnboardingComplete({ domisili: "Bogor", posisi: "Packing", selesai: true }),
      true,
    );
  });

  it("pilihan sebagian: belum lengkap", () => {
    assert.equal(
      isOnboardingComplete({ domisili: "Bogor", posisi: "", selesai: true }),
      false,
    );
    assert.equal(
      isOnboardingComplete({ domisili: "", posisi: "Packing", selesai: true }),
      false,
    );
  });

  it("data tidak sah: belum lengkap", () => {
    assert.equal(isOnboardingComplete(null), false);
    assert.equal(
      isOnboardingComplete({ domisili: "Bogor", posisi: "Packing", selesai: false }),
      false,
    );
  });
});

describe("simpan dan baca localStorage", () => {
  it("save lalu load mengembalikan data yang sama, sudah dipangkas", () => {
    saveOnboarding({ domisili: "  Bogor ", posisi: " Packing " });
    assert.deepEqual(loadOnboarding(), {
      domisili: "Bogor",
      posisi: "Packing",
      selesai: true,
    });
  });

  it("save pilihan sebagian: load mengembalikan sebagian, diakui tersimpan", () => {
    saveOnboarding({ domisili: "Bogor", posisi: "" });
    const data = loadOnboarding();
    assert.deepEqual(data, { domisili: "Bogor", posisi: "", selesai: true });
    assert.equal(hasOnboardingChoice(data), true);
    assert.equal(isOnboardingComplete(data), false);
  });

  it("save mengirim event perubahan sekali", () => {
    saveOnboarding({ domisili: "Bogor", posisi: "" });
    assert.equal(dispatched, 1);
  });

  it("load tanpa data tersimpan: null", () => {
    assert.equal(loadOnboarding(), null);
  });

  it("load JSON rusak: null, bukan throw", () => {
    installWindow(makeStorage({ [ONBOARDING_KEY]: "{bukan json" }));
    assert.equal(loadOnboarding(), null);
  });

  it("load bentuk data salah: null", () => {
    installWindow(
      makeStorage({
        [ONBOARDING_KEY]: JSON.stringify({ domisili: "Bogor" }),
      }),
    );
    assert.equal(loadOnboarding(), null);
  });

  it("clear menghapus data dan mengirim event perubahan", () => {
    saveOnboarding({ domisili: "Bogor", posisi: "Packing" });
    assert.notEqual(loadOnboarding(), null);
    clearOnboarding();
    assert.equal(loadOnboarding(), null);
    assert.equal(dispatched, 2);
  });

  it("gagal tulis (storage menolak): tidak throw, data tetap null", () => {
    installWindow({
      getItem: () => null,
      setItem: () => {
        throw new Error("storage penuh");
      },
      removeItem: () => {},
    });
    assert.doesNotThrow(() => saveOnboarding({ domisili: "Bogor", posisi: "" }));
    assert.equal(loadOnboarding(), null);
  });

  it("tanpa window (server): load null, save dan clear diam", () => {
    const saved = globalThis.window;
    try {
      delete globalThis.window;
      assert.equal(loadOnboarding(), null);
      assert.doesNotThrow(() => saveOnboarding({ domisili: "Bogor", posisi: "" }));
      assert.doesNotThrow(() => clearOnboarding());
    } finally {
      globalThis.window = saved;
    }
  });
});

/* --- W1-TRACKER (ONB-09): save/clear mengembalikan status --- */
describe("status sukses/gagal simpan dan hapus (ONB-09)", () => {
  it("save berhasil: true, clear berhasil: true", () => {
    assert.equal(saveOnboarding({ domisili: "Bogor", posisi: "" }), true);
    assert.equal(clearOnboarding(), true);
  });

  it("save gagal (storage menolak): false, tanpa event perubahan", () => {
    installWindow({
      getItem: () => null,
      setItem: () => {
        throw new Error("storage penuh");
      },
      removeItem: () => {},
    });
    assert.equal(saveOnboarding({ domisili: "Bogor", posisi: "" }), false);
    assert.equal(dispatched, 0);
  });

  it("clear gagal (storage menolak): false, tanpa event perubahan", () => {
    installWindow({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error("storage menolak");
      },
    });
    assert.equal(clearOnboarding(), false);
    assert.equal(dispatched, 0);
  });

  it("tanpa window (server): save dan clear false", () => {
    const saved = globalThis.window;
    try {
      delete globalThis.window;
      assert.equal(saveOnboarding({ domisili: "Bogor", posisi: "" }), false);
      assert.equal(clearOnboarding(), false);
    } finally {
      globalThis.window = saved;
    }
  });
});
