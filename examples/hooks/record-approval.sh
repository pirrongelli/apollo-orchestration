#!/usr/bin/env bash
#
# record-approval.sh — record an independent-review approval for a PR.
#
# The flow this belongs to (see examples/hooks/README.md, "merge gate"):
#
#   1. A PR is ready to merge.
#   2. An INDEPENDENT reviewer — a different model/vendor than the one that
#      wrote the code — reviews the exact PR diff with a skeptical
#      SHIP/BLOCK prompt. The doer never judges its own work.
#   3. On a SHIP verdict, a human (or the orchestrating agent, after the
#      verdict) runs:  ./record-approval.sh <pr-number>
#   4. This script resolves the PR's CURRENT head SHA and touches
#      .claude/reviews/<sha>. The PreToolUse merge-gate hook allows
#      `gh pr merge` only when that exact file exists.
#   5. Any new commit changes the head SHA, so the old approval file no
#      longer matches — the merge is blocked again until the new diff is
#      re-reviewed and re-recorded. Approvals are per-diff, not per-PR.
#
# Fail-safe: keyed on the immutable head SHA (not the PR number or branch
# name), so an approval can never be reused for code it did not cover.

set -euo pipefail

PR_NUMBER="${1:?usage: record-approval.sh <pr-number>}"

# Ask GitHub for the PR's current head commit SHA.
HEAD_SHA=$(gh pr view "$PR_NUMBER" --json headRefOid --jq '.headRefOid')

if [ -z "$HEAD_SHA" ]; then
  echo "error: could not resolve head SHA for PR #$PR_NUMBER" >&2
  exit 1
fi

# Record the approval. The file's existence (named for the exact SHA) is
# what the merge-gate hook checks; its content is just an audit breadcrumb.
REVIEWS_DIR="$(git rev-parse --show-toplevel)/.claude/reviews"
mkdir -p "$REVIEWS_DIR"
{
  echo "pr: #$PR_NUMBER"
  echo "head: $HEAD_SHA"
  echo "recorded_at: $(date -Iseconds)"
} > "$REVIEWS_DIR/$HEAD_SHA"

echo "Approval recorded: PR #$PR_NUMBER @ $HEAD_SHA"
echo "-> $REVIEWS_DIR/$HEAD_SHA"
echo "gh pr merge $PR_NUMBER is now unblocked (until a new commit changes the head SHA)."
