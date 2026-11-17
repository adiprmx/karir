# Impor KANONIS CSV -> Firestore (proyek karir-9d53a, koleksi companies).
# Satu-satunya skrip impor yang sah sejak 14 Nov 2026 (W-P0-10).
# Membaca CSV LANGSUNG (bukan JSON terpisah) dan menulis SEMUA 13 field:
#   no (angka) + perusahaan, kategori, link_karir, status, tanggal_cek,
#   catatan, lokasi, posisi, email_hrd, wa_hrd, kontak_lain, batas_lamar.
# ATURAN KERAS: PATCH SELALU memakai updateMask lengkap (13 fieldPaths).
# PATCH tanpa updateMask bisa menghapus field yang tidak disebut — JANGAN
# PERNAH dilakukan. Dokumen yang belum ada dibuat lewat POST create
# (documentId = nomor baris); dokumen yang sudah ada di-PATCH.
#
# Mode:
#   --dry-run            tampilkan yang akan ditulis untuk SEMUA baris
#                        CSV, tanpa menulis apa pun ke Firestore.
#   --only 1,2,3         tulis hanya nomor-nomor itu (lalu verifikasi
#                        baca-balik ke-13 field tiap dokumen).
#   --sync-status        bandingkan status + tanggal_cek CSV vs live
#                        untuk SEMUA nomor; PATCH hanya nomor yang
#                        status CSV-nya berbeda DAN tanggal_cek CSV
#                        tidak lebih tua dari live (P-02, DATA P1-6).
#                        --dry-run adalah bawaan; tambah --apply
#                        untuk benar-benar menulis. Dijalankan terjadwal
#                        (harian, sesudah hunting) supaya commit manual
#                        CSV tidak lagi menggantung tanpa impor (kasus
#                        commit 32518e8c, 4 perusahaan arah B).
#   --csv PATH           CSV sumber (bawaan: CSV repo ini,
#                        data/daftar-link-karir.csv; timpa dengan
#                        env KARIR_CSV).
#   --holdlist PATH      holdlist status (bawaan: data/holdlist-
#                        status.txt di samping CSV); nomor holdlist
#                        TIDAK PERNAH diubah --sync-status.
# Tanpa --dry-run, --only, dan --sync-status, skrip berhenti (tidak
# ada tulis massal tanpa daftar nomor eksplisit).
#
# Token via sa_token.py (dibuat ulang otomatis bila file token hilang
# atau lebih dari 50 menit). Transport via curl (urllib mengabaikan
# proxy egress). Token dibaca dari file, TIDAK pernah dicetak.
#
# SALINAN BERVERSI (P-03, T11/DX-08): skrip ini tinggal di repo supaya
# perkakas pemulihan tidak hanya ada di satu mesin. Jalur secret
# lewat environment variable; CSV bawaan adalah CSV repo ini
# (dihitung relatif dari lokasi skrip, bukan dari mesin tertentu):
#   KARIR_SA_TOKEN_FILE  path berkas token (bawaan:
#                        ~/.cache/karir/sa-access-token.txt)
#   KARIR_CSV            timpa CSV sumber (argumen --csv lebih utama)
# Salinan agent-side di mesin pengelola (~/workspace/.claude-v280/)
# tetap dipakai untuk hunting harian dan WAJIB diselaraskan dari
# salinan repo ini bila logika berubah.
#
# Marker kesegaran (arsitektur seed-first S3, 15 Nov 2026): setelah
# impor menulis dokumen apa pun, rev dokumen meta/lastChange
# dinaikkan 1 (updatedAt=now) supaya semua instance server web
# refill dari Firestore di cek marker berikut. Tanpa ini, data baru
# tidak pernah terlihat instance yang sudah hangat. Dry-run tidak
# menyentuh marker; impor yang tidak menulis apa pun juga tidak.
import argparse
import csv
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)
TOKEN_PATH = os.environ.get(
    "KARIR_SA_TOKEN_FILE",
    os.path.expanduser("~/.cache/karir/sa-access-token.txt"),
)
BASE = "https://firestore.googleapis.com/v1/projects/karir-9d53a/databases/(default)/documents/companies"
META_URL = "https://firestore.googleapis.com/v1/projects/karir-9d53a/databases/(default)/documents/meta/lastChange"
DEFAULT_CSV = os.environ.get(
    "KARIR_CSV",
    os.path.join(REPO_ROOT, "data", "daftar-link-karir.csv"),
)

STRING_FIELDS = [
    "perusahaan", "kategori", "link_karir", "status", "tanggal_cek",
    "catatan", "lokasi", "posisi", "email_hrd", "wa_hrd", "kontak_lain",
    "batas_lamar",
]
# Taksonomi 4 status — TIDAK BOLEH diubah (P-02, Red Team).
VALID_STATUSES = {
    "Ada lowongan",
    "Tidak ada lowongan",
    "Tidak dapat diverifikasi",
    "Portal tidak bisa dibuka",
}
ALL_FIELDS = ["no"] + STRING_FIELDS
UPDATE_MASK = "&".join(f"updateMask.fieldPaths={f}" for f in ALL_FIELDS)


def ensure_token():
    need = True
    if os.path.exists(TOKEN_PATH):
        age = time.time() - os.path.getmtime(TOKEN_PATH)
        need = age > 50 * 60
    if need:
        print("token tidak ada/kedaluwarsa, membuat token baru via sa_token.py ...")
        subprocess.run([sys.executable, os.path.join(HERE, "sa_token.py")],
                       check=True)
    return open(TOKEN_PATH).read().strip()


def call(token, method, url, body=None):
    cmd = [
        "curl", "-s", "--max-time", "30", "-X", method, url,
        "-H", "Authorization: Bearer " + token,
        "-H", "Content-Type: application/json",
        "-w", "\nHTTP:%{http_code}",
    ]
    if body is not None:
        cmd += ["--data", json.dumps(body, ensure_ascii=False)]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    text, _, http = out.rpartition("\nHTTP:")
    return http.strip(), text


def to_fields(row):
    fields = {"no": {"integerValue": str(int(row["no"]))}}
    for k in STRING_FIELDS:
        fields[k] = {"stringValue": row.get(k, "") or ""}
    return {"fields": fields}


def from_fields(doc):
    f = doc.get("fields", {})
    out = {"no": int(f["no"]["integerValue"])}
    for k in STRING_FIELDS:
        out[k] = f.get(k, {}).get("stringValue", "")
    return out


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    assert rows, "CSV kosong"
    missing = [c for c in ALL_FIELDS if c not in rows[0]]
    assert not missing, f"CSV kekurangan kolom: {missing}"
    return rows


def dry_run(rows):
    print(f"dry-run: {len(rows)} baris dari CSV (TIDAK menulis)")
    filled = {k: 0 for k in STRING_FIELDS}
    for r in rows:
        for k in STRING_FIELDS:
            filled[k] += bool((r.get(k) or "").strip())
        ch = "".join([
            "E" if (r.get("email_hrd") or "").strip() else "-",
            "W" if (r.get("wa_hrd") or "").strip() else "-",
            "L" if (r.get("kontak_lain") or "").strip() else "-",
        ])
        bl = (r.get("batas_lamar") or "").strip()
        print(f"  no {int(r['no']):>3} {r['perusahaan'][:42]:<42} "
              f"[{r['status'][:22]:<22}] cek {r['tanggal_cek']} "
              f"kanal {ch} batas {bl or '-'}")
    print("ringkasan kolom terisi:")
    for k in STRING_FIELDS:
        print(f"  {k}: {filled[k]}/{len(rows)}")
    print("dry-run selesai, tidak ada yang ditulis.")


def today_wib():
    # WIB = UTC+7, tanpa daylight saving.
    return (datetime.now(timezone.utc) + timedelta(hours=7)).date().isoformat()


def bump_marker(token):
    """Naikkan rev meta/lastChange 1 (updatedAt=now).

    Bila dokumen belum ada, buat lengkap dengan pencacah nol (rev 1).
    Bila sudah ada, PATCH hanya rev + updatedAt supaya pencacah
    refill (refillsToday, readsEstimate, counterDay) tidak terganggu.
    Kembalikan True bila tulis berhasil. Token service account
    melewati rules Firestore.
    """
    code, text = call(token, "GET", META_URL)
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if code == "404":
        body = {"fields": {
            "rev": {"integerValue": "1"},
            "updatedAt": {"stringValue": now},
            "counterDay": {"stringValue": today_wib()},
            "refillsToday": {"integerValue": "0"},
            "readsEstimate": {"integerValue": "0"},
        }}
        code2, text2 = call(token, "PATCH", META_URL, body)
        if code2 == "200":
            print("marker: dibuat (rev 1)")
            return True
        print(f"marker: GAGAL dibuat ({code2}) {text2[:200]}")
        return False
    if code != "200":
        print(f"marker: baca gagal ({code}), tidak dinaikkan")
        return False
    try:
        rev = int(json.loads(text)["fields"]["rev"]["integerValue"])
    except (KeyError, TypeError, ValueError):
        rev = 0
    body = {"fields": {
        "rev": {"integerValue": str(rev + 1)},
        "updatedAt": {"stringValue": now},
    }}
    url = META_URL + "?updateMask.fieldPaths=rev&updateMask.fieldPaths=updatedAt"
    code2, text2 = call(token, "PATCH", url, body)
    if code2 == "200":
        print(f"marker: rev {rev} -> {rev + 1}")
        return True
    print(f"marker: GAGAL dinaikkan ({code2}) {text2[:200]}")
    return False


def write_docs(token, rows):
    ok, fail = 0, []
    for r in rows:
        no = int(r["no"])
        body = to_fields(r)
        written = False
        for attempt in range(1, 4):
            code, text = call(token, "PATCH", f"{BASE}/{no}?{UPDATE_MASK}", body)
            if code == "200":
                written = True
                break
            if code == "404":
                # Dokumen belum ada: buat baru (POST create).
                code2, text2 = call(
                    token, "POST", f"{BASE}?documentId={no}", body)
                if code2 == "200":
                    written = True
                    break
                text = text2
                code = code2
            if attempt < 3:
                time.sleep(10)
        if written:
            ok += 1
            print(f"  no {no} {r['perusahaan'][:40]}: tertulis")
        else:
            fail.append((no, code, text[:200]))
            print(f"  no {no}: GAGAL ({code}) {text[:200]}")
    print(f"tertulis: {ok}/{len(rows)}, gagal: {len(fail)}")
    return ok, fail


def verify(token, rows):
    bad = 0
    for r in rows:
        no = int(r["no"])
        code, text = call(token, "GET", f"{BASE}/{no}")
        if code != "200":
            print(f"  verifikasi no {no}: baca gagal ({code})")
            bad += 1
            continue
        got = from_fields(json.loads(text))
        want = {"no": no, **{k: (r.get(k) or "") for k in STRING_FIELDS}}
        mism = [k for k in ALL_FIELDS if got.get(k) != want[k]]
        if mism:
            print(f"  verifikasi no {no}: field tidak cocok: {mism}")
            bad += 1
    print("verifikasi baca-balik:",
          "SEMUA COCOK (13 field)" if bad == 0 else f"{bad} bermasalah")
    return bad


def load_holdlist(path):
    """Baca holdlist status: {no: alasan}. Hilang = kosong."""
    held = {}
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = [p.strip() for p in line.split("|")]
                try:
                    held[int(parts[0])] = parts[1] if len(parts) > 1 else ""
                except ValueError:
                    print(f"  holdlist: baris tidak valid dilewati: {line[:60]!r}")
    except OSError:
        print("  holdlist tidak ditemukan — dianggap kosong")
    return held


def list_live(token):
    """Baca SELURUH koleksi companies. Kembalikan {no: dict 13 field}."""
    live = {}
    url = BASE + "?pageSize=300"
    while url:
        code, text = call(token, "GET", url)
        if code != "200":
            raise RuntimeError(f"baca daftar live gagal ({code}) {text[:200]}")
        d = json.loads(text)
        for doc in d.get("documents", []):
            row = from_fields(doc)
            live[row["no"]] = row
        tok = d.get("nextPageToken")
        url = BASE + "?pageSize=300&pageToken=" + tok if tok else None
    return live


def plan_sync_status(rows, live, holdlist):
    """Rencana --sync-status (fungsi murni, bisa diuji tanpa Firestore).

    Aturan (§B2, §B4): CSV menang hanya bila perubahan CSV tidak lebih
    tua dari live — status CSV != live DAN tanggal_cek CSV >= live.
    Live yang lebih baru (flip recheck) TIDAK PERNAH ditimpa impor ini
    (itu urusan write-back + holdlist). Nomor holdlist tidak pernah
    diubah. Dokumen yang hanya ada di satu sisi hanya dilaporkan.
    Kembalikan (rencana, laporan) dengan rencana = [(no, row_csv,
    status_live, alasan)] dan laporan = [string].
    """
    by_no = {int(r["no"]): r for r in rows}
    plan, report = [], []
    for no in sorted(set(by_no) & set(live)):
        row = by_no[no]
        lrow = live[no]
        if row["status"] == lrow["status"]:
            continue
        # Validasi taksonomi (Red Team P-02): status CSV di luar 4 nilai
        # baku TIDAK PERNAH ditulis ke Firestore — CSV hunting belum
        # tentu lolos validate.py CI saat --sync-status berjalan.
        if row["status"] not in VALID_STATUSES:
            report.append(
                f"no {no}: DITOLAK, status CSV tidak dikenal "
                f"{row['status']!r} — perbaiki CSV dulu")
            continue
        csv_date = row.get("tanggal_cek") or ""
        live_date = lrow.get("tanggal_cek") or ""
        if no in holdlist:
            report.append(
                f"no {no}: DITAHAN (holdlist: {holdlist[no][:60]}) — "
                f"CSV={row['status']!r} live={lrow['status']!r}")
        elif live_date > csv_date:
            report.append(
                f"no {no}: dilewati, live lebih baru "
                f"(cek {live_date} > CSV {csv_date}) — urusan write-back")
        else:
            plan.append((no, row, lrow["status"],
                         "CSV lebih baru/sama (cek "
                         f"{csv_date} vs live {live_date})"))
    for no in sorted(set(by_no) - set(live)):
        report.append(f"no {no}: ada di CSV tapi tidak ada di live — "
                      f"tidak dibuat oleh --sync-status (pakai --only)")
    for no in sorted(set(live) - set(by_no)):
        report.append(f"no {no}: ada di live tapi tidak ada di CSV — "
                      f"tidak dihapus")
    return plan, report


def run_sync_status(args, rows):
    """Jalankan mode --sync-status. Kembalikan exit code."""
    token = ensure_token()
    try:
        live = list_live(token)
    except RuntimeError as e:
        print(f"BERHENTI: {e}")
        return 2
    print(f"dokumen live: {len(live)}")
    hold_path = args.holdlist or os.path.join(
        os.path.dirname(os.path.abspath(args.csv)), "holdlist-status.txt")
    holdlist = load_holdlist(hold_path)
    print(f"holdlist status: {len(holdlist)} nomor ditahan")
    plan, report = plan_sync_status(rows, live, holdlist)
    print(f"--sync-status: {len(plan)} nomor akan di-PATCH dari CSV")
    for no, row, live_status, reason in plan:
        print(f"  no {no} {row['perusahaan'][:40]}: "
              f"{live_status!r} -> {row['status']!r} ({reason})")
    for line in report:
        print(f"  {line}")
    if not plan:
        print("--sync-status: tidak ada yang perlu ditulis.")
        return 0
    if not args.apply:
        print("\nDRY-RUN: tidak ada yang ditulis (tambah --apply untuk menulis).")
        return 0
    chosen = [row for _, row, _, _ in plan]
    ok, fail = write_docs(token, chosen)
    bad = verify(token, chosen)
    if ok > 0:
        bump_marker(token)
    return 0 if (not fail and bad == 0) else 1


def main():
    ap = argparse.ArgumentParser(description="Impor kanonis CSV -> Firestore (13 field).")
    ap.add_argument("--csv", default=DEFAULT_CSV, help="CSV sumber")
    ap.add_argument("--dry-run", action="store_true",
                    help="tampilkan yang akan ditulis, tanpa menulis")
    ap.add_argument("--only", default="",
                    help="daftar nomor yang ditulis, pisah koma (mis. 1,2,3)")
    ap.add_argument("--sync-status", action="store_true",
                    help="PATCH status CSV->live bila CSV tidak lebih tua "
                         "(dry-run bawaan; tambah --apply untuk menulis)")
    ap.add_argument("--apply", action="store_true",
                    help="benar-benar menulis pada mode --sync-status")
    ap.add_argument("--holdlist", default="",
                    help="timpa path holdlist status")
    args = ap.parse_args()

    rows = read_csv(args.csv)
    print(f"CSV: {len(rows)} baris dari {args.csv}")

    if args.dry_run:
        dry_run(rows)
        return 0

    if args.sync_status:
        return run_sync_status(args, rows)

    if not args.only.strip():
        print("BERHENTI: tanpa --dry-run/--sync-status, wajib --only <daftar nomor>. "
              "Tidak ada tulis massal tanpa daftar eksplisit.")
        return 2
    wanted = [int(x) for x in args.only.split(",") if x.strip()]
    by_no = {int(r["no"]): r for r in rows}
    missing = [n for n in wanted if n not in by_no]
    if missing:
        print(f"BERHENTI: nomor tidak ada di CSV: {missing}")
        return 2
    chosen = [by_no[n] for n in wanted]

    token = ensure_token()
    ok, fail = write_docs(token, chosen)
    bad = verify(token, chosen)
    if ok > 0:
        # Data berubah (dokumen tertulis) -> marker wajib naik supaya
        # instance web refill, walau verifikasi menemukan selisih.
        bump_marker(token)
    return 0 if (not fail and bad == 0) else 1


if __name__ == "__main__":
    sys.exit(main())
