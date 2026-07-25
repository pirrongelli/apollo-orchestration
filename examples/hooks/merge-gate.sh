#!/usr/bin/env bash
# PreToolUse(Bash) gate for `gh pr merge` — a hardened, standalone version of
# the cross-vendor merge gate summarized in settings.hooks.json (see this
# directory's README, section "Cross-vendor merge gate"). Where that version
# is a one-line spec for the common case, this one is the production-grade
# implementation: written up in docs/02-multi-llm-verification.md.
#
# Two rules, both previously convention-only until independent review pointed
# out that "convention-only" and "enforced" are not the same claim:
#   1. No merge without an independent-reviewer SHIP verdict recorded for the
#      PR's EXACT head SHA (.claude/reviews/<headRefOid>). New commits change
#      the SHA, which invalidates the approval for free — no separate
#      "has this PR changed since review" check is needed.
#   2. No full-branch promotion (dev->main, main->prod, dev->prod). Changes
#      bound for a customer-facing or production branch travel as
#      cherry-picked hotfix/* branches, never a full-branch merge.
#
# DESIGN: a regex cannot enumerate every way a shell can spell an invocation
# ("gh" pr merge / $(command -v gh) pr merge / gh -R other/repo pr merge / ...).
# Independent review bypassed the first version of this gate several different
# ways. So detection is deliberately BROAD — any command mentioning gh ... pr
# ... merge in that order is treated as a merge attempt — and the command must
# then match a narrow CANONICAL form to proceed. Anything else is DENIED with
# instructions, never waved through. The consequence is one accepted false
# positive: an inert mention like `echo "gh pr merge 1"` is also denied. That
# is the safe direction, and the same trade-off other destructive-command
# guards in this pattern already make (see the psql/SQL guard in
# settings.hooks.json).
#
# THREAT MODEL, stated plainly: this gate stops an ACCIDENTAL merge — the
# agent forgetting the independent review — not a determined adversary
# obfuscating shell syntax. Detection normalises two ways (separators, and
# punctuation stripped so g''h / g"h" / g\h / g$'h' rejoin into `gh`), but a
# form needing shell evaluation, e.g. g${x}h, cannot be resolved by inspecting
# a command string at all. Repeated review rounds kept producing new
# spellings, which is the nature of the problem, not a missing case. The
# UNEVADABLE version of this rule is a server-side required status check in
# the forge's branch protection; that is an infrastructure/owner decision.
# Until then this is a high wall, not an infinite one.
#
# Fails CLOSED throughout: unparseable command, unresolvable PR, or a head
# value that is not a full-length hex SHA all deny. A gate that cannot verify
# must not allow. The human escape hatch is running the command with the `!`
# prefix, which no hook intercepts.
#
# Approvals live at .claude/reviews/ relative to the CURRENT worktree and are
# gitignored, so an approval recorded in one worktree is not visible from
# another. That fails safe and matches the normal flow: review and merge from
# the same worktree the work was done in.
set -uo pipefail

cmd=$(jq -r '.tool_input.command // empty')

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# ---- Broad detection: gh ... pr ... merge in order, any spelling --------------
# Two normalisations, because they defeat different tricks and either one
# matching is enough:
#   A. separators   — quotes/substitution/env prefixes/odd spacing become spaces
#   B. quote-strip  — quote and backslash characters are DELETED first, so
#                     intra-word quoting (g''h, g"h", g\h) rejoins into `gh`,
#                     which the shell itself would do before exec.
norm_a=" $(printf '%s' "$cmd" | tr -c '[:alnum:]' ' ' | tr -s ' ') "
norm_b=" $(printf '%s' "$cmd" | tr -d '[:punct:]' | tr -c '[:alnum:]' ' ' | tr -s ' ') "
words=' gh( [[:alnum:]]+)* pr( [[:alnum:]]+)* merge '
if ! printf '%s' "$norm_a" | grep -qiE "$words" && ! printf '%s' "$norm_b" | grep -qiE "$words"; then
  exit 0
fi

# A merge must be its own single-line command. grep is line-oriented, so a
# multiline command could present an approved merge on one line while bash goes
# on to execute a different, unverified merge on the next.
case "$cmd" in
  *$'\n'*)
    deny "Merge gate: a merge must be its own single-line command. This command spans multiple lines, so the gate cannot guarantee that the merge it verified is the only one that would run. Split it up and merge in a dedicated command."
    ;;
esac

# ---- Canonical form: `gh pr merge [<number>] [--flags]` and nothing else -----
# No env prefix, no quoting of the binary, no substitution, no chaining/piping,
# no repo/host selector, no URL or branch selector.
canonical='^[[:space:]]*gh[[:space:]]+pr[[:space:]]+merge([[:space:]]+[0-9]+)?([[:space:]]+--[A-Za-z-]+([= ][^;|&<>`$]*)?)*[[:space:]]*$'
if ! printf '%s' "$cmd" | grep -qE "$canonical"; then
  deny "Merge gate: this command is not the canonical merge form, so the gate cannot verify WHICH pull request it would merge. Run exactly: gh pr merge <number> --squash [--subject ... --body ...] as its own command — no env prefix, quoting of gh, command substitution, chaining/piping, --repo/-R or URL/branch selector. (If you genuinely need one of those, run it yourself with the ! prefix after confirming the independent-review approval.) Command was: $cmd"
fi

# Repo/host selectors would point gh at a different PR than the one verified.
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]])(-R|--repo|--hostname)([[:space:]]|=)'; then
  deny "Merge gate: --repo/-R/--hostname selectors are refused — the gate verifies the approval for the PR in THIS repository and cannot confirm a cross-repo target. Merge from a checkout of that repository, or use the ! prefix after confirming the approval yourself."
fi

# ---- Resolve the PR (explicit number, else the current branch) ---------------
pr=$(printf '%s' "$cmd" | sed -nE 's/^[[:space:]]*gh[[:space:]]+pr[[:space:]]+merge[[:space:]]+([0-9]+).*/\1/p' | head -n1)

if ! meta=$(gh pr view ${pr:+"$pr"} --json headRefOid,baseRefName,headRefName 2>/dev/null); then
  deny "Merge gate: could not resolve the PR to verify its independent-review approval$( [ -n "$pr" ] && printf ' (#%s)' "$pr" ). Refusing to merge — a gate that cannot verify must not allow. Check \`gh auth status\`, or run the merge yourself with the ! prefix if you have confirmed the approval."
fi

sha=$(printf '%s' "$meta" | jq -r '.headRefOid // empty')
base=$(printf '%s' "$meta" | jq -r '.baseRefName // empty')
head=$(printf '%s' "$meta" | jq -r '.headRefName // empty')

# A head value that is not a commit SHA must never be used to build a path:
# a spoofed value like ../hooks/merge-gate.sh would let an existing file pass.
if ! printf '%s' "$sha" | grep -qE '^[0-9a-f]{40}$'; then
  deny "Merge gate: the PR head value is not a 40-character commit SHA (got: '${sha:-<empty>}'), so the per-SHA approval cannot be checked safely. Refusing to merge."
fi

# ---- Rule 2 — hotfix-only promotion (checked BEFORE the approval) ------------
case "$base" in
  main|prod)
    case "$head" in
      hotfix/*) : ;; # cherry-picked hotfix: the sanctioned promotion path
      dev|main|prod)
        deny "Merge gate: full-branch promotion $head -> $base is blocked. Changes bound for a customer-facing or production branch land on the development branch first, then travel to $base as a cherry-picked hotfix/* branch. Open a hotfix PR instead."
        ;;
    esac
    ;;
esac

# ---- Rule 1 — per-SHA independent-review approval ----------------------------
if [ ! -f ".claude/reviews/$sha" ]; then
  deny "Merge gate: no independent-review approval recorded for head SHA $sha (PR $head -> $base). The doer never judges its own work. Have an independent reviewer (a different model vendor than the author) review the exact diff; on a SHIP verdict record it with: ./record-approval.sh${pr:+ $pr} — then merge. New commits change the SHA and require a fresh review."
fi

exit 0
