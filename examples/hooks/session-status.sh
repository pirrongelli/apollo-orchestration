#!/usr/bin/env bash
# SessionStart hook: surface in-flight work so a new session has INITIATIVE,
# not just state. Documented in docs/07-engineering-loops.md, "Resumability
# vs initiative."
#
# Loops and multi-step plans leave durable state on disk (a loop-vision file,
# a plan-progress ledger), but nothing reads it at session start — so a
# session that restarts mid-campaign silently forgets the campaign exists.
# This happened twice on our project, and was only recovered because someone
# thought to look. This hook prints what is in flight so the very first
# message of a new session can offer to resume it.
#
# Read-only and fast: no network, no git writes, bounded output, silent
# outside a git repo and silent when nothing is in flight.
set -uo pipefail
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
out=""

# Active loops: the vision file marks a status per loop; anything not CLOSED
# is live. Adapt the path to wherever your loop/campaign log lives.
vision="$root/docs/loops/VISION.md"
if [ -f "$vision" ]; then
  # A loop heading carries an ID (L7, L1.1, HK, B1 ...). Plain prose headings
  # like "Remaining backlog" are not loops and must not be reported as active.
  # Active = has a STATUS that is not CLOSED, or has no STATUS line at all
  # (a freshly opened loop where STATUS was forgotten — surface, don't hide).
  active=$(grep -E '^###[[:space:]]+[A-Z]+[0-9.]*[[:space:]]*[-—]' "$vision" 2>/dev/null \
    | grep -viE 'STATUS:[[:space:]]*CLOSED' \
    | sed -E 's/^###[[:space:]]*//' \
    | cut -c1-110 \
    | head -n 5)
  if [ -n "$active" ]; then
    out+="ACTIVE LOOPS (docs/loops/VISION.md) — offer to resume before starting new work:"$'\n'
    while IFS= read -r line; do
      [ -n "$line" ] && out+="  - ${line}"$'\n'
    done <<< "$active"
  fi
fi

# Progress ledger: an unchecked task means a plan is mid-execution. Adapt the
# path to wherever your plan-execution tooling writes its ledger.
ledger="$root/.progress/ledger.md"
if [ -f "$ledger" ]; then
  pending=$(grep -cE '^\-[[:space:]]*\[[[:space:]]\]' "$ledger" 2>/dev/null || true)
  done_n=$(grep -cE '^\-[[:space:]]*\[[xX]\]' "$ledger" 2>/dev/null || true)
  planline=$(grep -m1 -E '^Plan:' "$ledger" 2>/dev/null | cut -c1-120)
  if [ "${pending:-0}" -gt 0 ]; then
    out+="PLAN IN FLIGHT: ${done_n:-0} task(s) complete, ${pending} not yet complete."$'\n'
    [ -n "$planline" ] && out+="  ${planline}"$'\n'
    out+="  Resume at the first incomplete task — do NOT re-run completed ones (trust the ledger and git log)."$'\n'
  fi
fi

# Unmerged approval markers hint at a PR mid-gate (see merge-gate.sh).
approvals="$root/.claude/reviews"
if [ -d "$approvals" ]; then
  recent=$(find "$approvals" -type f -newermt '-3 days' 2>/dev/null | wc -l | tr -d ' ')
  [ "${recent:-0}" -gt 0 ] && out+="Independent-review approvals recorded in the last 3 days: ${recent} (a PR may be awaiting merge)."$'\n'
fi

[ -z "$out" ] && exit 0
jq -n --arg ctx "$out" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx}}'
