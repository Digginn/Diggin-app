"""Reproduce the shared DB's reviewed migration gaps on a disposable local DB."""

import argparse
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from deploy_shared_db import CSV_RECOVERY, RECOVERY_BASELINE, PROFANITY_BASELINE, PROFANITY_RECOVERY, deployment_plan, migration_files


def validate(profanity=False):
    root = Path(__file__).resolve().parent.parent
    baseline = PROFANITY_BASELINE if profanity else RECOVERY_BASELINE
    recovery = PROFANITY_RECOVERY if profanity else CSV_RECOVERY
    with tempfile.TemporaryDirectory(prefix="diggin-csv-recovery-") as temporary:
        workdir = Path(temporary)
        project = workdir / "supabase"
        project.mkdir()
        config = (root / "supabase/config.toml").read_text(encoding="utf-8")
        config = config.replace('project_id = "Diggin-app"', 'project_id = "Diggin-app-csv-recovery"')
        (project / "config.toml").write_text(config, encoding="utf-8")
        migrations = migration_files(root / "supabase/migrations")
        (project / "migrations").mkdir()
        # Reproduce the exact baseline before restoring the missing original files.
        for version, path in migrations.items():
            if version <= baseline and path.name not in recovery:
                shutil.copy2(path, project / "migrations" / path.name)
        shutil.copytree(root / "supabase/tests", project / "tests")

        def cli(*args):
            subprocess.run(["supabase", *args], cwd=workdir, check=True)

        try:
            cli("db", "start")
            cli("db", "reset", "--local", "--no-seed")
            for name in recovery:
                shutil.copy2(root / "supabase/migrations" / name, project / "migrations" / name)
            history = subprocess.run(
                ["supabase", "migration", "list", "--local", "--output-format", "text"],
                cwd=workdir, text=True, capture_output=True, check=True,
            ).stdout
            pending, include_all = deployment_plan(project / "migrations", history)
            if set(pending) != set(recovery) or not include_all:
                raise ValueError("Disposable DB did not reproduce the expected recovery state")
            subprocess.run(
                [sys.executable, str(root / "scripts/deploy_shared_db.py"), "--local"],
                cwd=workdir, check=True,
            )
            # Only after recovery, apply later migrations through the normal path.
            later = [path for version, path in migrations.items() if version > baseline]
            for path in later:
                shutil.copy2(path, project / "migrations" / path.name)
            history = subprocess.run(
                ["supabase", "migration", "list", "--local", "--output-format", "text"],
                cwd=workdir, text=True, capture_output=True, check=True,
            ).stdout
            pending, include_all = deployment_plan(project / "migrations", history)
            if set(pending) != {path.name for path in later} or include_all:
                raise ValueError("Post-recovery migrations must use the normal deployment path")
            subprocess.run(
                [sys.executable, str(root / "scripts/deploy_shared_db.py"), "--local"],
                cwd=workdir, check=True,
            )
            cli("test", "db", "--local")
            cli("db", "lint", "--local", "--schema", "public,private", "--fail-on", "error")
            cli("db", "advisors", "--local", "--level", "warn", "--fail-on", "error")
        finally:
            cli("stop", "--no-backup")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profanity", action="store_true", help="Reproduce the direct-block-first history")
    validate(parser.parse_args().profanity)
