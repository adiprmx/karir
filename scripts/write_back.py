#!/usr/bin/env python3
"""Write-back harian Firestore -> CSV + seed (keputusan S1, T8).

Cron cek ulang menulis status + tanggal_cek langsung ke Firestore.
Skrip ini menyalin perubahan itu kembali ke repo (CSV + seed) supaya
CSV tetap sumber kebenaran abadi dan tidak menyimpang dari live
(DATA-01). Dijalankan harian setelah cron 01:00 WIB — jadwal resmi
di .github/workflows/write-back.yml (03:00 WIB, via API publik);
skrip ini adalah pasangan agent-side-nya (via service account,
tanpa bergantung pada situs web).

ARAH SATU JALAN: skrip ini HANYA membaca Firestore. Ia TIDAK PERNAH
menulis ke Firestore, dan TIDAK menaikkan marker kesegaran
meta/lastChange (data live tidak berubah — hanya CSV yang menyusul).

Cara kerja:
1. Baca koleksi `changes` (jendela --since jam terakhir, bawaan 24)
   — jejak perubahan status dari cron/panel admin.
2. Sapuan penuh (bawaan aktif; --no-sweep mematikan): baca SELURUH
   daftar `companies` dan bandingkan status + tanggal_cek dengan CSV.
   Sapuan ini WAJIB karena entri `changes` hanya dibuat bila status
   BERUBAH — pembaruan tanggal_cek saja (mayoritas tulis cron) tidak
   meninggalkan jejak di `changes`, jadi write-back dari `changes`
   saja akan membiarkan tanggal_cek CSV basi dan DATA-01 kembali.
   Biaya: ~610 baca daftar + ~50 baca changes per run (~1,3% kuota
   harian Spark 50.000).
3. Terapkan selisih ke CSV + seed dengan aturan kesegaran:
   - tanggal_cek live LEBIH BARU dari CSV -> terapkan status +
     tanggal_cek live.
   - tanggal_cek live SAMA dan status berbeda -> terapkan status
     (perubahan hari yang sama, mis. dari panel admin).
   - tanggal_cek live LEBIH TUA dari CSV -> lewati + peringatan
     (CSV lebih baru; hunting akan mengimpornya ke live).
   - Field statis yang berbeda hanya dilaporkan (peringatan), TIDAK
     diterapkan — kecuali --include-static (untuk mengejar edit panel
     admin; tetap memakai aturan tanggal yang sama).
   - Dokumen live yang tidak ada di CSV hanya dilaporkan, TIDAK
     ditambahkan — kecuali --allow-new dan nomornya persis
     berurutan (max+1).
   - Baris CSV yang hilang di live hanya dilaporkan, TIDAK pernah
     dihapus otomatis (CSV adalah kebenaran abadi).
   - PENGAMAN FLIP MASSAL (P-02, K-08): bila satu run menemukan
     > 10 perubahan status, SEMUA perubahan status ditahan
     (tanggal_cek tetap jalan).
   - HOLDLIST STATUS (P-02, K-08): nomor dalam
     data/holdlist-status.txt selalu ditahan statusnya
     (tanggal_cek tetap disalin).
4. Tulis CSV (CRLF, urutan kolom sama) + seed (indent=1, tanpa
   newline akhir — sama seperti format sekarang), REGENERASI README
   + status-bar.svg dari CSV baru (Opsi A, P-02 — tanpa ini validasi
   DOK-01 gagal pada angkanya sendiri), lalu jalankan
   scripts/validate.py + scripts/check-consistency.py (non-live);
   bila validasi gagal, kembalikan isi semula dan keluar 1.
   Validasi yang sama juga dijalankan SEBELUM menulis sebagai
   prasyarat: write-back tidak berjalan di atas data yang sudah
   tidak valid/konsisten.

Mode:
  --mock FILE     pakai data contoh JSON, tanpa menyentuh Firestore
                  (untuk pengujian; format: {"changes": [...],
                  "companies": [...]} dengan dict polos 13 field —
                  lihat contoh di bawah).
  --apply         benar-benar menulis (tanpa ini: dry-run, hanya
                  menampilkan rencana).
  --since JAM     jendela entri changes (bawaan 24).
  --no-sweep      hanya dari `changes` (tanggal_cek saja tidak ikut).
  --include-static  terapkan juga selisih field statis.
  --allow-new     tambahkan dokumen live baru bernomor berurutan.
  --repo PATH     repo target (bawaan: repo hunting harian).
  --csv/--seed    timpa path CSV/seed.

Contoh file mock (--mock):
  {"changes": [{"companyNo": 1, "perusahaan": "Unilever Indonesia",
     "from": "Ada lowongan", "to": "Tidak ada lowongan",
     "checkedAt": "2026-11-15", "createdAt": "2026-11-15T01:00:00Z"}],
   "companies": [{"no": 1, "perusahaan": "Unilever Indonesia",
     "kategori": "FMCG", "link_karir": "https://...",
     "status": "Tidak ada lowongan", "tanggal_cek": "2026-11-15",
     "catatan": "", "lokasi": "Tangerang", "posisi": "",
     "email_hrd": "", "wa_hrd": "", "kontak_lain": "",
     "batas_lamar": ""}]}

Token via sa_token.py (pola yang sama dengan import_canonical.py);
transport curl (urllib mengabaikan proxy egress). Token dibaca dari
file, TIDAK pernah dicetak. Helper token + pemanggil REST + pemetaan
field dipakai ulang dari import_canonical.py (diimpor, bukan
didokumentasikan ulang — file itu tidak diubah skrip ini).

SALINAN BERVERSI (P-03, T11/DX-08): skrip ini tinggal di repo supaya
perkakas pemulihan tidak hanya ada di satu mesin. Repo bawaan adalah
repo yang memuat skrip ini (dihitung relatif dari lokasi skrip);
timpa dengan --repo atau env KARIR_REPO. Salinan agent-side di mesin
pengelola (~/workspace/.claude-v280/) tetap dipakai untuk hunting
harian dan WAJIB diselaraskan dari salinan repo ini bila logika
berubah.
"""
import argparse
import csv
import json
import os
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from import_canonical import (  # noqa: E402
    ALL_FIELDS,
    STRING_FIELDS,
    call,
    ensure_token,
    from_fields,
)

PROJECT = "karir-9d53a"
DOCS_BASE = (
    "https://firestore.googleapis.com/v1/projects/"
    f"{PROJECT}/databases/(default)/documents"
)
COMPANIES_URL = DOCS_BASE + "/companies"
CHANGES_URL = DOCS_BASE + "/changes"
DEFAULT_REPO = os.environ.get(
    "KARIR_REPO", os.path.dirname(HERE))  # root repo yang memuat skrip ini
VALID_STATUSES = {
    "Ada lowongan",
    "Tidak ada lowongan",
    "Tidak dapat diverifikasi",
    "Portal tidak bisa dibuka",
}
# Pengaman flip massal (P-02, K-08 — sama dengan write-back.yml):
# bila satu run menemukan > 10 perubahan status, SEMUA perubahan
# status ditahan (tanggal_cek tetap jalan). Nilai awal, ditinjau
# ulang setelah 2 minggu data recheck yang sudah diperbaiki (P-04).
MASS_FLIP_THRESHOLD = 10
HOLDLIST_REL = os.path.join("data", "holdlist-status.txt")


def load_holdlist(repo):
    """Baca holdlist status repo: {no: alasan}. Hilang = kosong."""
    held = {}
    path = os.path.join(repo, HOLDLIST_REL)
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


def regenerate_readme(repo):
    """Regenerasi README + status-bar.svg dari CSV baru (Opsi A, P-02).
    Kembalikan (ok, output)."""
    p = subprocess.run(
        [sys.executable, "scripts/regenerate_readme.py"], cwd=repo,
        capture_output=True, text=True,
    )
    return p.returncode == 0, p.stdout + p.stderr


def parse_iso(s):
    """Parse tanggal ISO (tanggal saja atau datetime Z) -> date/datetime."""
    if not s:
        return None
    try:
        if "T" in s:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        return datetime.fromisoformat(s).date()
    except ValueError:
        return None


def parse_date(s):
    d = parse_iso(s)
    if isinstance(d, datetime):
        return d.date()
    return d


def change_from_fields(doc):
    f = doc.get("fields", {})
    s = lambda k: f.get(k, {}).get("stringValue", "")  # noqa: E731
    no = f.get("companyNo", {}).get("integerValue")
    return {
        "companyNo": int(no) if no is not None else 0,
        "perusahaan": s("perusahaan"),
        "from": s("from"),
        "to": s("to"),
        "checkedAt": s("checkedAt"),
        "createdAt": s("createdAt"),
    }


def list_collection(token, url, page_size=300, order_by=None, max_pages=None):
    """List dokumen satu koleksi (ikuti nextPageToken sampai habis,
    atau sampai max_pages bila diisi)."""
    docs = []
    token_page = ""
    pages = 0
    while True:
        page_url = f"{url}?pageSize={page_size}"
        if order_by:
            page_url += f"&orderBy={order_by}"
        if token_page:
            page_url += f"&pageToken={token_page}"
        code, text = call(token, "GET", page_url)
        if code != "200":
            raise RuntimeError(f"list {url} gagal: HTTP {code} {text[:200]}")
        body = json.loads(text)
        docs.extend(body.get("documents", []))
        pages += 1
        token_page = body.get("nextPageToken") or ""
        if not token_page or (max_pages is not None and pages >= max_pages):
            return docs


def load_live(token, since_hours, sweep):
    """Baca changes (jendela, terbaru dulu, maks 100 entri) + dokumen
    perusahaan dari Firestore. Bila sweep aktif: seluruh daftar
    companies. Bila tidak: hanya dokumen yang disebut di changes
    (1 baca per perusahaan berubah — jauh lebih hemat)."""
    # orderBy createdAt desc + 1 halaman: koleksi changes tumbuh
    # tanpa batas (tiap run cron menambah entri), jadi hanya halaman
    # terbaru yang dibaca; sapuan penuh menutup sisanya.
    change_docs = list_collection(
        token, CHANGES_URL, page_size=100,
        order_by="createdAt%20desc", max_pages=1)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=since_hours)
    changes = []
    for d in change_docs:
        c = change_from_fields(d)
        created = parse_iso(c["createdAt"])
        if isinstance(created, datetime):
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
        elif isinstance(created, date):
            created = datetime(
                created.year, created.month, created.day,
                tzinfo=timezone.utc)
        if created is None or created >= cutoff:
            changes.append(c)
    changes.sort(key=lambda c: c["createdAt"], reverse=True)
    companies = {}
    if sweep:
        company_docs = list_collection(token, COMPANIES_URL, page_size=300)
        for d in company_docs:
            c = from_fields(d)
            companies[c["no"]] = c
    else:
        for no in {c["companyNo"] for c in changes if c.get("companyNo")}:
            code, text = call(token, "GET", f"{COMPANIES_URL}/{no}")
            if code == "200":
                c = from_fields(json.loads(text))
                companies[c["no"]] = c
    return changes, companies


def load_mock(path):
    """Muat file mock JSON. Entri mock dipakai apa adanya (tanpa
    filter --since — fixture-lah yang menentukan jendelanya)."""
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    changes = data.get("changes", [])
    companies = {}
    for c in data.get("companies", []):
        row = {"no": int(c["no"])}
        for k in STRING_FIELDS:
            row[k] = c.get(k, "") or ""
        companies[row["no"]] = row
    return changes, companies


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    assert rows, "CSV kosong"
    missing = [c for c in ALL_FIELDS if c not in rows[0]]
    assert not missing, f"CSV kekurangan kolom: {missing}"
    out = {}
    for r in rows:
        row = {k: (r.get(k) or "") for k in ALL_FIELDS}
        row["no"] = int(r["no"])
        out[row["no"]] = row
    return out


def read_seed(path):
    seed = json.loads(Path(path).read_text(encoding="utf-8"))
    out = {}
    for e in seed:
        row = {k: (e.get(k) or "") for k in ALL_FIELDS}
        row["no"] = int(e["no"])
        out[row["no"]] = row
    return out


def write_csv(path, rows):
    ordered = [rows[no] for no in sorted(rows)]
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=ALL_FIELDS, lineterminator="\r\n")
        w.writeheader()
        for r in ordered:
            w.writerow({k: r[k] for k in ALL_FIELDS})


def write_seed(path, rows):
    ordered = [{k: rows[no][k] for k in ALL_FIELDS} for no in sorted(rows)]
    text = json.dumps(ordered, indent=1, ensure_ascii=False)
    Path(path).write_text(text, encoding="utf-8")


def run_checks(repo):
    """Jalankan validate.py + check-consistency.py (non-live).
    Kembalikan (ok, output)."""
    out = []
    for script in ("scripts/validate.py", "scripts/check-consistency.py"):
        p = subprocess.run(
            [sys.executable, script], cwd=repo,
            capture_output=True, text=True,
        )
        out.append(p.stdout + p.stderr)
        if p.returncode != 0:
            return False, "".join(out)
    return True, "".join(out)


def main():
    ap = argparse.ArgumentParser(
        description="Write-back Firestore -> CSV + seed (baca-saja dari Firestore).")
    ap.add_argument("--repo", default=DEFAULT_REPO, help="repo target")
    ap.add_argument("--csv", default="", help="timpa path CSV")
    ap.add_argument("--seed", default="", help="timpa path seed")
    ap.add_argument("--mock", default="", help="file JSON mock (tanpa Firestore)")
    ap.add_argument("--apply", action="store_true",
                    help="benar-benar menulis (tanpa ini: dry-run)")
    ap.add_argument("--since", type=float, default=24,
                    help="jendela entri changes dalam jam (bawaan 24)")
    ap.add_argument("--no-sweep", action="store_true",
                    help="lewati sapuan penuh; hanya dari changes")
    ap.add_argument("--include-static", action="store_true",
                    help="terapkan juga selisih field statis")
    ap.add_argument("--allow-new", action="store_true",
                    help="tambahkan dokumen live baru bernomor berurutan")
    args = ap.parse_args()

    csv_path = args.csv or os.path.join(args.repo, "data", "daftar-link-karir.csv")
    seed_path = args.seed or os.path.join(args.repo, "web", "data", "companies.json")

    # Prasyarat: data repo harus valid + konsisten SEBELUM write-back.
    ok, check_out = run_checks(args.repo)
    print(check_out, end="")
    if not ok:
        print("BERHENTI: validasi repo gagal sebelum write-back — "
              "perbaiki dulu, jangan menumpuk perubahan otomatis di atas "
              "data yang tidak valid.")
        return 1

    csv_rows = read_csv(csv_path)
    seed_rows = read_seed(seed_path)
    print(f"CSV: {len(csv_rows)} baris; seed: {len(seed_rows)} entri")

    if args.mock:
        print(f"mode MOCK: {args.mock} (Firestore tidak disentuh)")
        changes, live = load_mock(args.mock)
    else:
        token = ensure_token()
        try:
            changes, live = load_live(token, args.since, not args.no_sweep)
        except RuntimeError as e:
            print(f"BERHENTI: {e}")
            return 2
    print(f"changes dalam {args.since} jam terakhir: {len(changes)} entri; "
          f"dokumen live: {len(live)}")

    # Rencana penerapan: salinan CSV yang akan diubah.
    new_rows = {no: dict(r) for no, r in csv_rows.items()}
    applied = []   # (no, perusahaan, keterangan)
    held = []      # (no, perusahaan, keterangan, alasan tahan)
    warnings = []
    static_diffs = 0
    changed_nos = {c["companyNo"] for c in changes if c.get("companyNo")}
    holdlist = load_holdlist(args.repo)
    print(f"holdlist status: {len(holdlist)} nomor ditahan")

    def apply_status(no, live_row, reason, hold_status=False):
        row = new_rows[no]
        before = (row["status"], row["tanggal_cek"])
        if hold_status:
            row["tanggal_cek"] = live_row["tanggal_cek"]
            applied.append(
                (no, row["perusahaan"],
                 f"status DITAHAN ({row['status']}), cek {before[1]} -> "
                 f"{row['tanggal_cek']} ({reason})")
            )
            held.append((no, row["perusahaan"],
                         f"{before[0]} -> {live_row['status']}",
                         holdlist.get(no, "pengaman flip massal")))
            return
        row["status"] = live_row["status"]
        row["tanggal_cek"] = live_row["tanggal_cek"]
        applied.append(
            (no, row["perusahaan"],
             f"{before[0]} -> {row['status']}, cek {before[1]} -> {row['tanggal_cek']} ({reason})")
        )

    if args.no_sweep:
        # Hanya perusahaan yang disebut di changes (status berubah).
        targets = sorted(changed_nos & set(live))
        missing_docs = sorted(changed_nos - set(live))
        for no in missing_docs:
            warnings.append(
                f"no {no}: ada di changes tapi dokumen live-nya tidak "
                f"ditemukan — dilewati")
    else:
        targets = sorted(set(live) & set(csv_rows))
        for no in sorted(set(live) - set(csv_rows)):
            if args.allow_new and no == max(csv_rows) + 1:
                new_rows[no] = dict(live[no])
                applied.append(
                    (no, live[no]["perusahaan"], "BARU dari live (nomor berurutan)"))
            else:
                warnings.append(
                    f"no {no} {live[no]['perusahaan'][:40]!r}: ada di live "
                    f"tapi tidak ada di CSV — tidak ditambahkan "
                    f"(pakai --allow-new bila nomornya berurutan)")
        for no in sorted(set(csv_rows) - set(live)):
            warnings.append(
                f"no {no} {csv_rows[no]['perusahaan'][:40]!r}: ada di CSV "
                f"tapi hilang di live — TIDAK dihapus dari CSV")

    # Tahap 1: kumpulkan kandidat perubahan (tanpa menulis dulu),
    # supaya pengaman flip massal dapat menilai jumlah flip SEBELUM
    # satu baris pun diubah (kembar dengan write-back.yml).
    candidates = []
    valid_targets = []
    for no in targets:
        live_row = live[no]
        row = csv_rows[no]
        live_date = parse_date(live_row["tanggal_cek"])
        csv_date = parse_date(row["tanggal_cek"])
        if live_date is None:
            warnings.append(
                f"no {no}: tanggal_cek live tidak valid "
                f"{live_row['tanggal_cek']!r} — dilewati")
            continue
        if live_row["status"] not in VALID_STATUSES:
            warnings.append(
                f"no {no}: status live tidak dikenal "
                f"{live_row['status']!r} — dilewati")
            continue
        if csv_date is not None and live_date < csv_date:
            if live_row["status"] != row["status"] or live_row["tanggal_cek"] != row["tanggal_cek"]:
                warnings.append(
                    f"no {no}: live lebih tua (cek {live_row['tanggal_cek']} "
                    f"< CSV {row['tanggal_cek']}) — dilewati, CSV lebih baru")
            continue
        status_diff = live_row["status"] != row["status"]
        date_diff = live_row["tanggal_cek"] != row["tanggal_cek"]
        valid_targets.append((no, live_row))
        if status_diff or date_diff:
            candidates.append((no, live_row, status_diff, date_diff))

    flips = [c for c in candidates if c[2] and c[0] not in holdlist]
    mass_flip = len(flips) > MASS_FLIP_THRESHOLD
    if mass_flip:
        print(f"PENGAMAN FLIP MASSAL: {len(flips)} flip status "
              f"(> {MASS_FLIP_THRESHOLD}) — SEMUA perubahan status "
              f"ditahan run ini, tanggal_cek tetap jalan.")

    # Tahap 2: terapkan (status ditahan untuk nomor holdlist / bila
    # pengaman flip massal aktif; tanggal_cek tetap disalin).
    for no, live_row, status_diff, date_diff in candidates:
        hold_status = no in holdlist or (mass_flip and status_diff)
        reason = "changes" if no in changed_nos else "sapuan tanggal_cek"
        apply_status(no, live_row, reason, hold_status=hold_status)
    held_nos = {h[0] for h in held}
    # Field statis: laporkan untuk SEMUA target yang valid (bukan hanya
    # kandidat perubahan); terapkan hanya dengan --include-static.
    for no, live_row in valid_targets:
        row = csv_rows[no]
        for k in STRING_FIELDS:
            if k in ("status", "tanggal_cek"):
                continue
            if (live_row.get(k) or "") != (row.get(k) or ""):
                static_diffs += 1
                if args.include_static:
                    new_rows[no][k] = live_row.get(k) or ""
                    applied.append(
                        (no, row["perusahaan"], f"field {k} dari live (--include-static)"))
                else:
                    warnings.append(
                        f"no {no}: field statis {k} berbeda "
                        f"(CSV={row.get(k, '')[:40]!r} live={(live_row.get(k) or '')[:40]!r}) "
                        f"— tidak diterapkan (pakai --include-static bila ini edit admin)")

    # Audit changes: tiap entri harus tercermin di hasil akhir,
    # kecuali yang statusnya sengaja ditahan (holdlist / pengaman).
    for c in changes:
        no = c.get("companyNo")
        if not no or no not in new_rows or no in held_nos:
            continue
        final = new_rows[no]
        checked = parse_date(c.get("checkedAt") or "")
        final_date = parse_date(final["tanggal_cek"])
        reflected = final["status"] == c.get("to") or (
            checked is not None and final_date is not None and final_date > checked
        )
        if not reflected:
            warnings.append(
                f"no {no}: entri changes ({c.get('from')} -> {c.get('to')} "
                f"pada {c.get('checkedAt')}) belum tercermin setelah "
                f"write-back — periksa manual")

    print(f"\nrencana: {len(applied)} perubahan pada {len({a[0] for a in applied})} perusahaan; "
          f"{len(held)} status ditahan; "
          f"{len(warnings)} peringatan; {static_diffs} selisih field statis")
    for no, name, desc in applied:
        print(f"  no {no} {name[:40]}: {desc}")
    for no, name, desc, reason in held:
        print(f"  DITAHAN no {no} {name[:40]}: {desc} [{reason[:60]}]")
    for w in warnings:
        print(f"  PERINGATAN: {w}")

    if not applied:
        print("tidak ada yang perlu ditulis.")
        return 0
    if not args.apply:
        print("\nDRY-RUN: tidak ada file yang ditulis (tambah --apply untuk menulis).")
        return 0

    # Tulis + regenerasi README/SVG (Opsi A) + validasi; bila validasi
    # gagal, kembalikan isi semula (termasuk README + SVG).
    readme_path = Path(args.repo) / "README.md"
    svg_path = Path(args.repo) / "assets" / "status-bar.svg"
    csv_backup = Path(csv_path).read_bytes()
    seed_backup = Path(seed_path).read_bytes()
    readme_backup = readme_path.read_bytes()
    svg_backup = svg_path.read_bytes()
    try:
        write_csv(csv_path, new_rows)
        write_seed(seed_path, new_rows)
    except OSError as e:
        print(f"BERHENTI: gagal menulis: {e}")
        return 1
    ok, regen_out = regenerate_readme(args.repo)
    print(regen_out, end="")
    if not ok:
        Path(csv_path).write_bytes(csv_backup)
        Path(seed_path).write_bytes(seed_backup)
        print("REGENERASI README GAGAL: isi CSV + seed dikembalikan "
              "seperti semula.")
        return 1
    ok, check_out = run_checks(args.repo)
    print(check_out, end="")
    if not ok:
        Path(csv_path).write_bytes(csv_backup)
        Path(seed_path).write_bytes(seed_backup)
        Path(readme_path).write_bytes(readme_backup)
        Path(svg_path).write_bytes(svg_backup)
        print("VALIDASI GAGAL SETELAH TULIS: isi CSV + seed + README + SVG "
              "dikembalikan seperti semula.")
        return 1
    print(f"SELESAI: {len(applied)} perubahan ditulis ke CSV + seed + README + SVG. "
          f"Firestore TIDAK disentuh; marker TIDAK dinaikkan.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
