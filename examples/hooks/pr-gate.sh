#!/usr/bin/env bash
# PreToolUse(Bash) gate for `gh pr create` — "no PR without the test suites
# green" as a wall, not a promise.
#
# DESIGN. Evidence is per-HEAD-SHA (.claude/test-evidence/<sha>), written only
# by scripts/preflight.sh on a green run. A new commit changes the SHA and
# invalidates the evidence for free — the same design as the merge gate's
# per-SHA review approvals (.claude/reviews/<sha>). Both live relative to the
# CURRENT worktree and are gitignored: evidence proves the suites ran HERE,
# on THIS tree.
#
# WHY A SEPARATE PREFLIGHT SCRIPT. The temptation is to run the suites inside
# the hook. Don't: hooks have short timeouts and no TTY, and a full suite can
# take minutes. The hook only CHECKS for evidence; the preflight script is the
# only WRITER of it, and it path-gates suites against the merge-base diff so a
# docs-only change costs nothing and a full run happens once, right before
# the PR — not on every dev iteration.
#
# Detection is broad on purpose (any command mentioning gh … pr … create in
# order, after normalisation), mirroring merge-gate.sh: the accepted false
# positive is an inert mention inside e.g. a --body string, and the deny
# message says how to pass. This stops the ACCIDENTAL un-tested PR, not an
# adversary; the human escape hatch is running the command with the ! prefix,
# which no hook intercepts.
set -uo pipefail

cmd=$(jq -r '.tool_input.command // empty')

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

norm=" $(printf '%s' "$cmd" | tr -c '[:alnum:]' ' ' | tr -s ' ') "
printf '%s' "$norm" | grep -qiE ' gh( [[:alnum:]]+)* pr( [[:alnum:]]+)* create ' || exit 0

# Fails closed: no resolvable HEAD means no verifiable evidence. The SHA is
# taken from git itself, never from the command string, so it is safe to use
# in a file path.
sha=$(git rev-parse HEAD 2>/dev/null) || deny "PR gate: cannot resolve HEAD in $(pwd), so test evidence cannot be verified. Run from inside the repo, or use the ! prefix."
# Check evidence from the repo toplevel: the preflight writes there, and the
# PR command may be issued from a subdirectory — without this, a false deny.
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || deny "PR gate: cannot resolve the repo toplevel, so test evidence cannot be verified."

[ -f ".claude/test-evidence/$sha" ] && exit 0

deny "PR gate: no test evidence recorded for HEAD $sha. Run: bash scripts/preflight.sh — it is path-gated (each suite runs only when the merge-base diff touches its area; a docs-only diff runs nothing) and on green records .claude/test-evidence/$sha, after which this command passes. New commits need a fresh preflight. If broken tests appear that are unrelated to your change, fix them anyway. Escape hatch: run the command yourself with the ! prefix."
