# MAVAN Tooling

Shared, versioned tooling used to bootstrap every MAVAN site project the
same way. This repo is the first thing any dev or agent pulls down —
*before* creating or touching any client project — so the setup process
doesn't depend on files living only on one person's machine.

## Why this exists

Client site projects (e.g. `mavan-site`) are built with Claude Code as the
implementation agent. To keep that process consistent across machines and
across however many people eventually have access, the environment setup
step needs to be:

- **Automated** where the machine allows it (install/update missing or
  outdated tooling without manual intervention)
- **Self-contained** — doesn't assume anything already exists on the local
  disk beyond cloning this repo
- **Honest about its limits** — fails loudly with a clear manual next step
  when it can't safely proceed (permission-restricted machines, missing
  personal identity info, unsupported OS), rather than hanging or silently
  claiming success

## The two-phase model

**Phase A — machine-level, this repo.** Runs before any project folder
exists. Verifies/self-heals Node.js, npm, and Git at the OS level via
winget. Does **not** check against any specific project's version
requirements — it just keeps the toolchain current. See
[`bootstrap-check.ps1`](./bootstrap-check.ps1).

**Phase B — project-level, generated per project.** Once a specific
project is scaffolded (e.g. Astro sets a real `engines.node` value in its
`package.json`), that project gets its own `scripts/preflight-check.js`
checked into its own repo, validating against its *actual* requirements.
This is what `npm run preflight` runs for the life of that project. Phase A
passing makes Phase B failing rare — it's a safety net, not the primary
gate.

## Usage

```powershell
git clone https://github.com/MAVAN-HQ/mavan-tooling.git
cd mavan-tooling
powershell -ExecutionPolicy Bypass -File .\bootstrap-check.ps1
```

Exit code `0` = ready to start a new project. Exit code `1` = something
needs manual attention (the script tells you exactly what and how).

Re-runnable any time, safe to run repeatedly — it only installs/upgrades
what's actually missing or outdated.

## Current platform support

Windows + winget only. Non-Windows machines get a clear manual-setup
message instead of a silent failure — Mac/Linux automation isn't built yet
and should be added here if/when it's needed, not solved speculatively
ahead of time.

## What's not built yet

- Phase C: the actual "new project" orchestration (ask for a project name,
  scaffold Astro into `{workspace-root}/{name}`, generate that project's
  Phase B script from real values, git init, prompt for the repo URL).
  Currently done by hand following the same sequence; not yet scripted
  here.
