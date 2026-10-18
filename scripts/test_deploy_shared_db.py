import shutil
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from deploy_shared_db import CSV_RECOVERY, RECOVERY_BASELINE, deploy, deployment_plan, parse_history


ROOT = Path(__file__).resolve().parent.parent


def history(local, remote):
    rows = ["  Local | Remote | Time (UTC)", " -------|--------|----------"]
    for version in sorted(set(local) | set(remote)):
        rows.append(f" {version if version in local else ''} | {version if version in remote else ''} | date")
    return "\n".join(rows)


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.directory = self.root / "supabase/migrations"
        shutil.copytree(ROOT / "supabase/migrations", self.directory)
        self.local = {path.name.split("_")[0] for path in self.directory.glob("*.sql")}
        self.csv = {name.split("_")[0] for name in CSV_RECOVERY}
        self.remote = self.local - self.csv

    def plan(self, remote=None):
        return deployment_plan(self.directory, history(self.local, self.remote if remote is None else remote))

    def test_known_csv_gaps_require_include_all(self):
        pending, include_all = self.plan()
        self.assertEqual(set(pending), set(CSV_RECOVERY))
        self.assertTrue(include_all)

    def test_partially_completed_recovery_can_resume(self):
        first, second = sorted(self.csv)
        self.assertEqual(self.plan(self.remote | {first}), ([next(name for name in CSV_RECOVERY if name.startswith(second))], True))

    def test_completed_recovery_is_a_noop(self):
        self.assertEqual(self.plan(self.local), ([], False))

    def test_normal_future_migration_does_not_use_include_all(self):
        (self.directory / "20261019000000_future.sql").write_text("select 1;", encoding="utf-8")
        self.local.add("20261019000000")
        self.assertEqual(self.plan(self.local - {"20261019000000"}), (["20261019000000_future.sql"], False))

    def test_unknown_historical_gap_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unreviewed out-of-order"):
            self.plan(self.remote - {"20261017065239"})

    def test_modified_csv_migration_is_rejected(self):
        with (self.directory / next(iter(CSV_RECOVERY))).open("a", encoding="utf-8") as file:
            file.write("\nselect 1;\n")
        with self.assertRaisesRegex(ValueError, "Unreviewed out-of-order"):
            self.plan()

    def test_line_endings_do_not_change_approved_sql(self):
        for name in CSV_RECOVERY:
            path = self.directory / name
            path.write_bytes(path.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
        self.assertTrue(self.plan()[1])

    def test_unknown_remote_version_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "remote migrations missing"):
            self.plan(self.remote | {"20261020000000"})

    def test_empty_remote_history_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Empty remote history"):
            self.plan(set())

    def test_folder_baseline_is_required_for_recovery(self):
        with self.assertRaisesRegex(ValueError, "already deployed folder"):
            self.plan(self.remote - {RECOVERY_BASELINE})

    def test_duplicate_local_version_is_rejected(self):
        (self.directory / "20261016040436_duplicate.sql").write_text("select 1;", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "duplicate migration version"):
            self.plan()

    def test_unrecognized_cli_output_is_rejected(self):
        for output in ("", "connection failed", "Local | Remote | Time\n garbage | | date"):
            with self.subTest(output=output), self.assertRaises(ValueError):
                parse_history(output)

    def test_markdown_table_format_is_supported(self):
        local, remote = parse_history("| Local | Remote | Time (UTC) |\n| --- | --- | --- |\n| `20261018114830` | `20261018114830` | date |")
        self.assertEqual(local, {RECOVERY_BASELINE})
        self.assertEqual(remote, local)

    def test_changed_history_after_dry_run_prevents_push(self):
        initial = history(self.local, self.remote)
        changed = history(self.local, self.remote | {min(self.csv)})
        with patch("deploy_shared_db.run_cli", side_effect=[initial, None, changed]) as cli:
            with self.assertRaisesRegex(ValueError, "changed during dry-run"):
                deploy(self.root, ["--local"])
        self.assertEqual(cli.call_count, 3)
        self.assertIn("--dry-run", cli.call_args_list[1].args[0])

    def test_recovery_uses_same_flags_for_dry_run_and_push(self):
        initial = history(self.local, self.remote)
        with patch("deploy_shared_db.run_cli", side_effect=[initial, None, initial, None, history(self.local, self.local)]) as cli:
            deploy(self.root, ["--local"])
        dry_run = cli.call_args_list[1].args[0]
        actual_push = cli.call_args_list[3].args[0]
        self.assertIn("--include-all", dry_run)
        self.assertIn("--include-all", actual_push)
        self.assertIn("--skip-vault", actual_push)
        self.assertNotIn("--include-seed", actual_push)

    def test_dry_run_failure_prevents_push(self):
        import subprocess
        with patch("deploy_shared_db.run_cli", side_effect=[history(self.local, self.remote), subprocess.CalledProcessError(1, ["supabase"])]) as cli:
            with self.assertRaises(subprocess.CalledProcessError):
                deploy(self.root, ["--local"])
        self.assertEqual(cli.call_count, 2)


if __name__ == "__main__":
    unittest.main()
