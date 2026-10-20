"""Run isolated HA fixtures and release cyclic objects before module finalization."""

import argparse
import gc
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))


def main() -> bool:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pattern", default="test_*.py")
    parser.add_argument("--test")
    args = parser.parse_args()
    suite = (unittest.defaultTestLoader.loadTestsFromName(args.test) if args.test else
             unittest.defaultTestLoader.discover(str(ROOT / "tests"), pattern=args.pattern))
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    passed = result.wasSuccessful()
    del result, suite
    # HA caches orjson.Fragment values in cyclic fixture graphs. Under CPython
    # 3.14, late collection after native heap types are finalized can crash.
    # Release fixtures while those modules/types are alive, never bypass exit.
    gc.collect()
    return passed


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
