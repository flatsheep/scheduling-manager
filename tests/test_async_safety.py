"""Cold-cache checks must not inherit warmed timezone/import caches from tests."""

from pathlib import Path
import subprocess
import sys
import unittest


class AsyncSafetyTests(unittest.TestCase):
    def test_cold_runtime_has_no_loop_io_or_integration_warnings(self):
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            [sys.executable, "tools/check_async_safety.py"],
            cwd=root, capture_output=True, text=True, timeout=60, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
