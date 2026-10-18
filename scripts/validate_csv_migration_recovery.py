"""Reproduce the shared DB's folder-first history on a disposable local DB."""

from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from deploy_shared_db import CSV_RECOVERY, deployment_plan


def validate():
    root = Path(__file__).resolve().parent.parent
    with tempfile.TemporaryDirectory(prefix="diggin-csv-recovery-") as temporary:
        workdir = Path(temporary)
        project = workdir / "supabase"
        project.mkdir()
        config = (root / "supabase/config.toml").read_text(encoding="utf-8")
        config = config.replace('project_id = "Diggin-app"', 'project_id = "Diggin-app-csv-recovery"')
        (project / "config.toml").write_text(config, encoding="utf-8")
        shutil.copytree(root / "supabase/migrations", project / "migrations")
        shutil.copytree(root / "supabase/tests", project / "tests")
        for name in CSV_RECOVERY:
            (project / "migrations" / name).unlink()

        def cli(*args):
            subprocess.run(["supabase", *args], cwd=workdir, check=True)

        try:
            cli("db", "start")
            cli("db", "reset", "--local", "--no-seed")
            # Restore only the two original files after the folder migrations are applied.
            for name in CSV_RECOVERY:
                shutil.copy2(root / "supabase/migrations" / name, project / "migrations" / name)
            history = subprocess.run(
                ["supabase", "migration", "list", "--local"],
                cwd=workdir, text=True, capture_output=True, check=True,
            ).stdout
            pending, include_all = deployment_plan(project / "migrations", history)
            if set(pending) != set(CSV_RECOVERY) or not include_all:
                raise ValueError("Disposable DB did not reproduce the expected CSV recovery state")
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
    validate()
