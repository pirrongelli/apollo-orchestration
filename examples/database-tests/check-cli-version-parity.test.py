#!/usr/bin/env python3
"""Tests for check-cli-version-parity.py.

Run:  python3 examples/database-tests/check-cli-version-parity.test.py

Every case here is a way the gate could pass while the invariant is broken. A
gate nobody has watched fail is a gate nobody knows works, so the failure paths
get more cases than the happy one.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

CHECKER = Path(__file__).with_name("check-cli-version-parity.py").resolve()

MATCHING = """\
env:
  CLI_VERSION: '2.101.0'
jobs:
  build:
    steps:
      - uses: supabase/setup-cli@0000000000000000000000000000000000000000
        with:
          version: ${{ env.CLI_VERSION }}
"""

DEPLOY_FILES = ["deploy-dev.yml", "deploy-staging.yml", "deploy-production.yml"]

failures: list[str] = []


def run(files: dict[str, str]) -> tuple[int, str]:
    """Materialise a workflow tree and run the checker inside it."""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        wf = root / ".github" / "workflows"
        wf.mkdir(parents=True)
        for name, body in files.items():
            (wf / name).write_text(body)
        proc = subprocess.run(
            [sys.executable, str(CHECKER)],
            cwd=root,
            capture_output=True,
            text=True,
        )
        return proc.returncode, proc.stdout + proc.stderr


def tree(**overrides: str) -> dict[str, str]:
    files = {"database-tests.yml": MATCHING}
    for name in DEPLOY_FILES:
        files[name] = MATCHING
    files.update(overrides)
    return files


def check(name: str, files: dict[str, str], want_ok: bool, expect: str = "") -> None:
    code, out = run(files)
    ok = code == 0
    if ok != want_ok:
        failures.append(
            f"{name}: expected {'pass' if want_ok else 'FAIL'}, got exit {code}\n{out}"
        )
    elif expect and expect not in out:
        failures.append(f"{name}: output missing {expect!r}\n{out}")
    else:
        print(f"ok   {name}")


# The one case that should pass.
check("identical pins across every workflow", tree(), want_ok=True, expect="(matches)")

# Plain drift.
check(
    "a deploy workflow pinning a different version",
    tree(**{"deploy-dev.yml": MATCHING.replace("2.101.0", "2.50.0")}),
    want_ok=False,
    expect="but database-tests.yml installs",
)

# The env pin agrees, but the value actually handed to the setup step does not.
# Comparing only the env declaration would call this parity.
check(
    "env pin matches while the setup step is given a literal",
    tree(
        **{
            "deploy-dev.yml": """\
env:
  CLI_VERSION: '2.101.0'
jobs:
  build:
    steps:
      - uses: supabase/setup-cli@0000000000000000000000000000000000000000
        with:
          version: '2.50.0'
"""
        }
    ),
    want_ok=False,
)

# Step env outranks job and workflow env, so an identical-looking expression can
# still resolve to something else.
check(
    "step-level env overriding the workflow pin",
    tree(
        **{
            "deploy-dev.yml": """\
env:
  CLI_VERSION: '2.101.0'
jobs:
  build:
    steps:
      - uses: supabase/setup-cli@0000000000000000000000000000000000000000
        env:
          CLI_VERSION: '2.9.0'
        with:
          version: ${{ env.CLI_VERSION }}
"""
        }
    ),
    want_ok=False,
)

# A commented-out or prose mention of the old pin must not shadow the real one.
# This is why the checker parses YAML instead of grepping for the key.
check(
    "a comment mentioning the old pin above a drifted one",
    tree(
        **{
            "deploy-dev.yml": """\
# bumped from CLI_VERSION: '2.101.0'
env:
  CLI_VERSION: '2.150.0'
jobs:
  build:
    steps:
      - uses: supabase/setup-cli@0000000000000000000000000000000000000000
        with:
          version: ${{ env.CLI_VERSION }}
"""
        }
    ),
    want_ok=False,
)

# Two workflows can carry byte-identical unresolvable values and "agree" while
# installing anything at all.
check(
    "both sides referencing the same unresolvable expression",
    tree(
        **{
            "database-tests.yml": MATCHING.replace("'2.101.0'", "${{ vars.CLI }}"),
            "deploy-dev.yml": MATCHING.replace("'2.101.0'", "${{ vars.CLI }}"),
        }
    ),
    want_ok=False,
    expect="not a concrete pin",
)

check(
    "a floating tag instead of a pin",
    tree(**{"deploy-dev.yml": MATCHING.replace("${{ env.CLI_VERSION }}", "latest")}),
    want_ok=False,
    expect="not a concrete pin",
)

# Silence is not agreement: absence of a thing to check is a failure, not a pass.
check(
    "a setup step with no version input at all",
    tree(
        **{
            "deploy-dev.yml": """\
jobs:
  build:
    steps:
      - uses: supabase/setup-cli@0000000000000000000000000000000000000000
"""
        }
    ),
    want_ok=False,
    expect="no `version` input",
)

check(
    "a deploy workflow with no setup step",
    tree(**{"deploy-dev.yml": "jobs:\n  build:\n    steps:\n      - run: echo hi\n"}),
    want_ok=False,
    expect="no supabase/setup-cli step found",
)

check(
    "a version from an env that is never declared",
    tree(
        **{
            "deploy-dev.yml": """\
jobs:
  build:
    steps:
      - uses: supabase/setup-cli@0000000000000000000000000000000000000000
        with:
          version: ${{ env.NOT_DECLARED }}
"""
        }
    ),
    want_ok=False,
    expect="not declared",
)

check(
    "a missing deploy workflow",
    {"database-tests.yml": MATCHING, "deploy-dev.yml": MATCHING},
    want_ok=False,
    expect="not found",
)

# A prerelease pin is still a pin.
check(
    "a prerelease pin on both sides",
    tree(
        **{
            name: MATCHING.replace("2.101.0", "2.101.0-rc.1")
            for name in ["database-tests.yml", *DEPLOY_FILES]
        }
    ),
    want_ok=True,
)

if failures:
    print("\n--- FAILURES ---")
    for f in failures:
        print(f)
    sys.exit(1)

print("\nall parity-checker tests passed")
