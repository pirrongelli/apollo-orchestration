#!/usr/bin/env python3
"""Assert the database suite installs the same pinned CLI the deploy workflows use.

The database-test job validates migrations against a local Postgres brought up by
the pinned CLI. If that CLI drifts from the one the deploy workflows install, the
suite is validating migrations on a different CLI than the one that applies them.

Checking the CLI_VERSION env declaration alone is not enough: what actually
determines the installed CLI is the `version` input handed to the setup step. A
workflow can keep the env pin identical and still deploy on a different CLI by
passing a literal there instead. This resolves the EFFECTIVE version for every
setup step in every workflow checked, so both halves have to agree.

The wider point, which outlives this particular tool: a comment claiming an
invariant enforces nothing. Either assert it or delete the claim. This file
exists because a comment saying "pinned to match the deploy workflows" was the
only thing holding that invariant up.

Exits non-zero with ::error:: annotations on any mismatch, on an unresolvable
version expression, or when a workflow declares no setup-cli step at all.
Silence is never treated as agreement.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

WORKFLOWS = Path(".github/workflows")
REFERENCE = WORKFLOWS / "database-tests.yml"
TARGETS = ["deploy-dev.yml", "deploy-staging.yml", "deploy-production.yml"]

# The action whose `version` input decides which CLI actually gets installed.
# Swap this for whatever your stack uses; the logic below is not specific to it.
SETUP_CLI = "supabase/setup-cli"
# ${{ env.FOO }} / ${{ vars.FOO }} — only env is resolvable from the file itself.
EXPR = re.compile(r"^\$\{\{\s*([A-Za-z_][\w.-]*)\s*\}\}$")
# A pin we can actually compare, e.g. 2.101.0 or v2.101.0-rc.1. Anything else
# (an expression, a secret/vars reference, or "latest") is unverifiable: two
# workflows both saying ${{ vars.CLI }} would compare equal while the version
# they install stays unknown.
CONCRETE = re.compile(r"^v?\d+(\.\d+)*(-[0-9A-Za-z.+-]+)?$")

errors: list[str] = []


def fail(msg: str) -> None:
    errors.append(msg)
    print(f"::error::{msg}")


def load(path: Path) -> dict | None:
    try:
        return yaml.safe_load(path.read_text()) or {}
    except FileNotFoundError:
        fail(f"{path} not found")
    except yaml.YAMLError as exc:
        fail(f"{path} is not valid YAML: {exc}")
    return None


def resolve(raw, workflow_env: dict, job_env: dict, step_env: dict, where: str) -> str | None:
    """Resolve a setup-cli `version` input to a concrete version string."""
    if raw is None:
        fail(f"{where}: setup-cli step has no `version` input (would install latest)")
        return None

    value = str(raw).strip()
    match = EXPR.match(value)

    if match:
        ref = match.group(1)
        if not ref.startswith("env."):
            fail(f"{where}: version comes from {ref!r}, which cannot be verified here")
            return None

        name = ref[len("env.") :]
        # Actions' precedence: step env shadows job env, which shadows workflow env.
        for scope in (step_env, job_env, workflow_env):
            if name in scope:
                value = str(scope[name]).strip()
                break
        else:
            fail(f"{where}: version references env.{name}, which is not declared in the workflow")
            return None

    # Whether it arrived as a literal or via env, the value must be a concrete
    # version before it is worth comparing. Two workflows can carry byte-identical
    # unresolvable values and "agree" while installing anything at all.
    if not CONCRETE.match(value):
        fail(f"{where}: version {value!r} is not a concrete pin, so parity cannot be verified")
        return None

    return value


def effective_versions(path: Path) -> list[str]:
    doc = load(path)
    if doc is None:
        return []

    workflow_env = doc.get("env") or {}
    found: list[str] = []
    saw_step = False

    for job_name, job in (doc.get("jobs") or {}).items():
        if not isinstance(job, dict):
            continue
        job_env = job.get("env") or {}
        for index, step in enumerate(job.get("steps") or []):
            if not isinstance(step, dict):
                continue
            uses = str(step.get("uses") or "")
            if not uses.startswith(SETUP_CLI):
                continue
            saw_step = True
            where = f"{path.name} job {job_name} step {index}"
            step_env = step.get("env") or {}
            version = resolve(
                (step.get("with") or {}).get("version"), workflow_env, job_env, step_env, where
            )
            if version is not None:
                found.append(version)

    # Only report the missing-step case when no step was seen at all; a step that
    # was seen but could not be resolved has already reported its own reason.
    if not saw_step:
        fail(f"{path.name}: no {SETUP_CLI} step found — cannot confirm CLI parity")
    return found


def main() -> int:
    reference = effective_versions(REFERENCE)
    if not reference:
        return 1
    if len(set(reference)) > 1:
        fail(f"{REFERENCE.name} installs conflicting CLI versions: {sorted(set(reference))}")
        return 1

    expected = reference[0]
    print(f"{REFERENCE.name} installs pinned CLI {expected}")

    for target in TARGETS:
        for version in effective_versions(WORKFLOWS / target):
            if version == expected:
                print(f"{target} → {version} (matches)")
            else:
                fail(f"{target} installs pinned CLI {version} but {REFERENCE.name} installs {expected}")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
