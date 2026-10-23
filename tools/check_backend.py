"""Run every backend suite in a checked subprocess; optionally combine coverage."""

import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def test_ids(suite: unittest.TestSuite):
    for test in suite:
        if isinstance(test, unittest.TestSuite):
            yield from test_ids(test)
        else:
            yield test.id()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--coverage", action="store_true")
    args = parser.parse_args()
    suites = sorted((ROOT / "tests").glob("test_*.py"))
    if not suites:
        raise SystemExit("No backend suites found")
    with tempfile.TemporaryDirectory(prefix="hsm-check-") as temporary:
        env = {**os.environ, "COVERAGE_FILE": str(Path(temporary) / "coverage")}
        for suite in suites:
            print(f"Checking {suite.name}", flush=True)
            selections = [["--pattern", suite.name]]
            if suite.name in ("test_lifecycle.py", "test_standards.py", "test_domain_migration.py"):
                loaded = unittest.defaultTestLoader.discover(str(ROOT / "tests"), pattern=suite.name)
                selections = [["--test", identifier] for identifier in test_ids(loaded)]
                del loaded
            for selection in selections:
                command = [sys.executable]
                if args.coverage:
                    command += ["-m", "coverage", "run", "--parallel-mode"]
                command += ["tools/run_suite.py", *selection]
                subprocess.run(command, cwd=ROOT, env=env, check=True)
        if args.coverage:
            for command in ("combine", "report"):
                subprocess.run([sys.executable, "-m", "coverage", command], cwd=ROOT, env=env, check=True)
    print(f"All {len(suites)} backend suites passed", flush=True)


if __name__ == "__main__":
    main()
