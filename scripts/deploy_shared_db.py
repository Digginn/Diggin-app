"""Deploy normally, allowing only the reviewed CSV migrations to fill history gaps."""

import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess


RECOVERY_BASELINE = "20261018114830"
CSV_RECOVERY = {
    "20261016124751_csv_import.sql": "c9aac0df85c0d69231e3a0a46a398d8cf3c7242498ee53ebe01a8be10162585b",
    "20261017082235_csv_import_review_fixes.sql": "f70f8e61334271aaab2b920e9a30b02d9704173abcff4be27329f4c3fd26887d",
}


def migration_files(directory):
    files = {}
    for path in sorted(directory.glob("*.sql")):
        match = re.fullmatch(r"(\d{14})_.+\.sql", path.name)
        if not match or match[1] in files:
            raise ValueError(f"Invalid or duplicate migration version: {path.name}")
        files[match[1]] = path
    if not files:
        raise ValueError("No local migrations found")
    return files


def parse_history(output):
    """Read the pinned CLI's Local | Remote | Time table; reject other formats."""
    local, remote = set(), set()
    has_header = False
    for line in output.splitlines():
        if "|" not in line:
            continue
        row = line.strip()
        if row.startswith("|") and row.endswith("|"):
            row = row[1:-1]
        cells = [cell.strip().strip("`").strip() for cell in row.split("|")]
        if len(cells) != 3:
            raise ValueError("Unexpected migration history table")
        if cells[:2] == ["Local", "Remote"]:
            has_header = True
            continue
        if re.fullmatch(r"[\s|:+-]+", line):
            continue
        if not has_header:
            raise ValueError("Missing migration history header")
        for version, versions in zip(cells[:2], (local, remote)):
            if version:
                if not re.fullmatch(r"\d{14}", version) or version in versions:
                    raise ValueError("Invalid or duplicate migration history row")
                versions.add(version)
    if not has_header:
        raise ValueError("Missing migration history table")
    return local, remote


def deployment_plan(directory, history):
    files = migration_files(directory)
    local, remote = parse_history(history)
    if local != set(files):
        raise ValueError("CLI local migration history does not match the checkout")
    if not remote or remote - local:
        raise ValueError("Empty remote history or remote migrations missing from this checkout")
    pending = sorted(local - remote)
    backwards = [version for version in pending if version < max(remote)]
    if backwards:
        if RECOVERY_BASELINE not in remote:
            raise ValueError("CSV recovery requires the already deployed folder migration")
        for version in backwards:
            path = files[version]
            digest = hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()
            if CSV_RECOVERY.get(path.name) != digest:
                raise ValueError(f"Unreviewed out-of-order migration: {path.name}")
    return [files[version].name for version in pending], bool(backwards)


def run_cli(args, capture=False):
    # Never print the command: --db-url contains the database password.
    if args[:2] == ["migration", "list"]:
        args = [*args, "--output-format", "text"]
    result = subprocess.run(["supabase", *args], text=True, capture_output=capture, check=True)
    if capture:
        print(result.stdout, end="")
        return result.stdout


def deploy(root, target):
    directory = root / "supabase" / "migrations"
    history = run_cli(["migration", "list", *target], capture=True)
    pending, include_all = deployment_plan(directory, history)
    print("Pending migrations:", ", ".join(pending) or "none", flush=True)
    if not pending:
        return
    flags = ["--include-all"] if include_all else []
    run_cli(["db", "push", *target, "--dry-run", "--skip-vault", *flags])
    # A changed history must be reviewed again, rather than applying a stale plan.
    current = run_cli(["migration", "list", *target], capture=True)
    if parse_history(current) != parse_history(history):
        raise ValueError("Migration history changed during dry-run; retry with a fresh plan")
    run_cli(["db", "push", *target, "--skip-vault", "--yes", *flags])
    final_history = run_cli(["migration", "list", *target], capture=True)
    remaining, _ = deployment_plan(directory, final_history)
    if remaining:
        raise ValueError("Deployment finished with unapplied migrations")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local", action="store_true", help="Use only the disposable local database")
    args = parser.parse_args()
    root = Path.cwd()
    target = ["--local"] if args.local else ["--db-url", os.environ["DB_URL"]]
    try:
        deploy(root, target)
    except (ValueError, subprocess.CalledProcessError) as error:
        # CalledProcessError includes argv (and credentials) in its default message.
        message = str(error) if isinstance(error, ValueError) else "Supabase command failed"
        raise SystemExit(message) from None


if __name__ == "__main__":
    main()
