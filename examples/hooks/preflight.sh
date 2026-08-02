#!/usr/bin/env bash
# Pre-PR preflight: run the test suites the diff actually touches, then record
# the per-SHA evidence that pr-gate.sh requires before `gh pr create`.
#
# Path-gated to keep it cheap. Adapt the three globs to your repo layout —
# the shape is: one regex per suite, matched against the merge-base diff, so
# each suite runs only when the change could have broken it. During
# development you run targeted tests; the FULL relevant suites run exactly
# once, right before the PR.
#
# Evidence is .claude/test-evidence/<HEAD sha> — gitignored, per-machine.
# A new commit changes the SHA, so stale evidence can never cover a newer
# diff (same design as per-SHA review approvals for the merge gate).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

MAIN_BRANCH="${MAIN_BRANCH:-origin/main}"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "preflight: uncommitted tracked changes — commit first so the evidence matches what the PR will contain." >&2
  exit 1
fi

sha=$(git rev-parse HEAD)
base=$(git merge-base "$MAIN_BRANCH" HEAD)
changed=$(git diff --name-only "$base" HEAD)

run_unit=false; run_backend=false; run_e2e=false
echo "$changed" | grep -qE '^(src/|package(-lock)?\.json|vite\.config|vitest\.config|tsconfig)' && run_unit=true
echo "$changed" | grep -qE '^(server/|api/|functions/)' && run_backend=true
echo "$changed" | grep -qE '^(src/|e2e/|public/|index\.html)' && run_e2e=true
echo "preflight: HEAD=$sha unit=$run_unit backend=$run_backend e2e=$run_e2e"

if $run_unit; then
  npm run test:run
fi
if $run_backend; then
  npm run test:backend
fi
if $run_e2e; then
  npm run test:e2e
fi

mkdir -p .claude/test-evidence
{
  echo "sha=$sha"
  echo "date=$(date -u +%FT%TZ)"
  echo "unit=$run_unit backend=$run_backend e2e=$run_e2e"
} > ".claude/test-evidence/$sha"
echo "preflight: green — evidence recorded at .claude/test-evidence/$sha"
