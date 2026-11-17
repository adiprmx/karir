# Mint OAuth2 access token dari service account Firebase (tanpa library Google).
# Baca SA JSON, bangun JWT RS256, tanda tangani via openssl, tukar ke token.
# Token ditulis ke file 0600, TIDAK pernah dicetak.
#
# SALINAN BERVERSI (P-03, T11/DX-08): skrip ini tinggal di repo supaya
# perkakas pemulihan tidak hanya ada di satu mesin. Jalur secret
# SELALU lewat environment variable — tidak ada nilai default yang
# mengarah ke mesin tertentu, dan tidak ada nilai rahasia di berkas
# ini:
#   KARIR_SA_JSON        path berkas JSON service account (WAJIB diisi)
#   KARIR_SA_TOKEN_FILE  path berkas token (bawaan:
#                        ~/.cache/karir/sa-access-token.txt)
# Kunci privat sementara ditulis ke berkas temp sistem (0600) dan
# dihapus segera sesudah penandatanganan.
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

SA_PATH = os.environ.get("KARIR_SA_JSON")
TOKEN_PATH = os.environ.get(
    "KARIR_SA_TOKEN_FILE",
    os.path.expanduser("~/.cache/karir/sa-access-token.txt"),
)


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def main():
    if not SA_PATH:
        print("BERHENTI: env KARIR_SA_JSON belum dipasang — isi dengan path "
              "berkas JSON service account Firebase.",
              file=sys.stderr)
        return 2
    try:
        with open(SA_PATH, encoding="utf-8") as fh:
            sa = json.load(fh)
    except (OSError, ValueError) as e:
        print(f"BERHENTI: tidak dapat membaca SA JSON ({e}).",
              file=sys.stderr)
        return 2
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    claim = {
        "iss": sa["client_email"],
        "scope": "https://www.googleapis.com/auth/cloud-platform",
        "aud": "https://oauth2.googleapis.com/token",
        "exp": now + 3600,
        "iat": now,
    }
    signing_input = (
        b64u(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + b64u(json.dumps(claim, separators=(",", ":")).encode())
    )
    key_fd, key_tmp = tempfile.mkstemp(prefix="karir-sa-key-")
    try:
        with os.fdopen(key_fd, "w") as f:
            f.write(sa["private_key"])
        os.chmod(key_tmp, 0o600)
        sig = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", key_tmp],
            input=signing_input.encode(),
            capture_output=True,
            check=True,
        ).stdout
    finally:
        try:
            os.remove(key_tmp)
        except OSError:
            pass
    jwt = signing_input + "." + b64u(sig)
    body = urllib.parse.urlencode(
        {
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": jwt,
        }
    )
    # urllib mengabaikan proxy egress di lingkungan ini (timeout) — pakai curl.
    out = subprocess.run(
        [
            "curl", "-s", "--max-time", "30",
            "-X", "POST", "https://oauth2.googleapis.com/token",
            "-H", "Content-Type: application/x-www-form-urlencoded",
            "--data", body,
        ],
        capture_output=True, text=True, check=True,
    ).stdout
    data = json.loads(out)
    token = data["access_token"]
    os.makedirs(os.path.dirname(TOKEN_PATH), exist_ok=True)
    with open(TOKEN_PATH, "w") as f:
        f.write(token)
    os.chmod(TOKEN_PATH, 0o600)
    print("token didapat, kedaluwarsa dalam", data.get("expires_in"), "detik")
    return 0


if __name__ == "__main__":
    sys.exit(main())
