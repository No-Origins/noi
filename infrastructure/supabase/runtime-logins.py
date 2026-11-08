#!/usr/bin/env python3
"""Gives Mero and Governance their own database logins (step 3, 7 Nov), and writes each one to an
owner-only file on this Mac. Run by the operator, who keeps the `postgres` login for migrations,
backups and restoring.

    python3 -I infrastructure/supabase/runtime-logins.py            # first time
    python3 -I infrastructure/supabase/runtime-logins.py --rotate   # new passwords, same files

Mero's login (noi_mer_runtime) reaches only schema mer; Governance's (noi_gov_runtime) only schema
gov: their migrations grant nothing else. The database logs role changes, so only a SCRAM verifier
is sent, never a password; the passwords exist only in the two files.
"""
import base64
import hashlib
import hmac
import os
import secrets
import subprocess
import sys
from pathlib import Path

CONTAINER = "supabase_db_no-origins-systems"
HOST = "127.0.0.1:55322"
NOI = Path(__file__).resolve().parents[2] / "noi"
LOGINS = {
    # role: (file, variable, extra lines)
    "noi_mer_runtime": (NOI / "mero.local.env", "DATABASE_URL", ["NOI_GOV_URL=http://127.0.0.1:8788"]),
    "noi_gov_runtime": (NOI / "governance.local.env", "NOI_GOV_DATABASE_URL", []),
}


def scram(password: str) -> str:
    """PostgreSQL's SCRAM-SHA-256 verifier: enough to check a password, not to recover it."""
    salt = secrets.token_bytes(16)
    iterations = 4096
    salted = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    client_key = hmac.new(salted, b"Client Key", hashlib.sha256).digest()
    stored_key = hashlib.sha256(client_key).digest()
    server_key = hmac.new(salted, b"Server Key", hashlib.sha256).digest()
    b64 = lambda b: base64.b64encode(b).decode()
    return f"SCRAM-SHA-256${iterations}:{b64(salt)}${b64(stored_key)}:{b64(server_key)}"


def write_owner_only(path: Path, text: str, replace: bool) -> None:
    flags = os.O_WRONLY | os.O_CREAT | (os.O_TRUNC if replace else os.O_EXCL)
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(text)
    os.chmod(path, 0o600)


def main() -> None:
    rotate = "--rotate" in sys.argv[1:]
    existing = [str(f) for f, _, _ in LOGINS.values() if f.exists()]
    if existing and not rotate:
        sys.exit(f"{', '.join(existing)} exist: keep them, or pass --rotate for new passwords")
    passwords = {role: secrets.token_hex(32) for role in LOGINS}
    sql = "".join(f"ALTER ROLE {role} LOGIN PASSWORD '{scram(pw)}';\n" for role, pw in passwords.items())
    subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"],
        input=sql.encode(),
        check=True,
    )
    for role, (path, variable, extra) in LOGINS.items():
        url = f"postgresql://{role}:{passwords[role]}@{HOST}/postgres"
        lines = [f"# {role}: this Mac's database login for {path.stem.split('.')[0]}. Owner-only; never in source.", f"{variable}={url}", *extra]
        write_owner_only(path, "\n".join(lines) + "\n", rotate)
        print(f"{role}: login on; written to {path} (owner-only)")


if __name__ == "__main__":
    main()
