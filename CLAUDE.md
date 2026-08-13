# MAVAN Tooling — Project Instructions

This repo holds shared, versioned setup tooling used across all MAVAN site
projects (see [`README.md`](./README.md) for the full rationale and the
Phase A / Phase B model).

## Working in this repo

- This is infrastructure, not a client site — changes here affect every
  future MAVAN project's bootstrap process, not just one site. Treat edits
  with the same shared-component caution as a shared Astro component: a
  change here is never scoped to just the current task.
- Test changes to `bootstrap-check.ps1` by actually running it, including
  deliberately breaking a check (e.g. temporarily unsetting Git identity)
  and confirming it fails with a clear, correct message — then restoring
  state. Don't assume a script edit is correct just because it looks right.
- Keep the script honest: self-heal only what's genuinely safe to
  self-heal (missing/outdated software via winget). Never auto-generate a
  Git identity or otherwise invent values that must come from a human.
- winget's CLI output format is not a stable, well-documented contract
  (column spacing and exit codes have been observed to behave
  inconsistently). Prefer matching on known output phrases over trusting
  exit codes literally — see the comments in `bootstrap-check.ps1` for
  specifics already worked out.
