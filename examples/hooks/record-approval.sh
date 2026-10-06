#!/usr/bin/env bash
# Retired marker-only approvals are nonconforming under Apollo 2.0.
# This entry point writes nothing and never resolves a current PR head.
builtin trap '' PIPE || builtin exit 2
builtin printf '%s\n' 'Retired: markers cannot establish independent approval. See examples/fleet/README.md for the structured local contract and required forge integration.' >&2 || builtin exit 2
builtin exit 2
