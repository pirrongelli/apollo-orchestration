#!/usr/bin/env bash
# Retired marker-only gate. Do not install this placeholder as a Bash hook.
# If invoked, explicitly deny; an arbitrary marker cannot unblock a merge.
builtin printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Retired marker-only merge gate. Integrate the structured Apollo 2.0 contract with independently observed head/base, pinned merge and required forge checks; see examples/fleet/README.md. No approval is established here."}}'
exit 2
