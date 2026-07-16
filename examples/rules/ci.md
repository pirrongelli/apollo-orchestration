---
paths:
  - ".github/**"
---
## CI/CD Philosophy

Keep the pipeline **simple, cheap, and effective**. Every CI minute costs
money — don't add steps that don't catch real bugs.

- **Budget-conscious**: minimize runner time. Run fast checks first (lint,
  typecheck, unit tests), fail early before expensive steps (E2E,
  deployment). Don't run the full suite when only docs changed.
- **No gold-plating**: a working pipeline with lint + unit + E2E is better
  than an over-engineered one with fifteen stages that takes forty minutes.
  Add pipeline complexity only when a real problem demands it.
- **Gate deployments on what matters**: lint must pass, unit tests must
  pass, coverage must not regress, E2E critical paths must pass. That's the
  gate — don't invent more.
- **Keep configs readable**: CI/CD config files are code too. The same KISS
  rules apply — no clever YAML tricks, no deeply nested conditionals, no
  "reusable workflow" abstraction until you have three or more actual uses.
- **`continue-on-error` needs enforcement**: if a CI step uses
  `continue-on-error: true` to let subsequent steps run anyway, add a final
  "enforce hard gates" step that checks each such step's `outcome` and
  explicitly `exit 1` if any failed. Otherwise `continue-on-error` silently
  downgrades what looks like a blocking check to merely advisory.
- **Environment branching must be consistent**: when a workflow targets
  multiple environments (dev/staging/prod), *all* environment-dependent
  steps must branch consistently — secrets, DB hosts, project IDs. Branching
  the migration step correctly but hardcoding staging values in a later
  test step is a bug that only shows up when someone runs the workflow
  against a different target.
- **Template literals in CI step output**: indented template literals (four
  or more spaces) often render as Markdown code blocks when posted into PR
  comments or step summaries. Use an explicit join
  (`[...lines].join('\n')`) instead of a multi-line template literal when
  building comment bodies.
