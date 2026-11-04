# MAVAN QA engine

Baseline-free fault and smell detector for built Astro sites. Design basis: Andrew's artifacts are the template for new and migration builds (see `../QA-COVERAGE-MATRIX.md`). It detects and reports only; it never edits a site.

## Run it
```
node qa/run.cjs --dist ../some-site/dist           # scan a built site (served locally)
node qa/run.cjs --url https://host --paths /,/about # scan a deployed site
node qa/selftest.cjs                                # prove every rule can fail (run this before trusting a change)
```
Output: `qa-out/findings.json` (one finding per root cause, many occurrences), `report.md`, `evidence/*.png`. Exit 1 on any live fault; smells never fail a run. Options are listed in the header of `run.cjs`.

Playwright is not installed here. It resolves `QA_PLAYWRIGHT`, then `playwright`, then `../migration-tools/node_modules/playwright` (the shared copy).

## What is in it
- `rules.json`: the rule registry (14 faults A1-A14, 5 smells B1-B5, from the Marylebone session's list). `default:false` rules (`geo.text-overlap`, `media.duplicate-sibling-src`) need the component registry and run only with `--enable`. `typo`/contrast (B4) is not implemented here; site-checks (axe) covers it.
- `findings.schema.json`: the one finding format. `lib/findings.cjs` collapses hits into findings, applies approved exceptions (`--config`), and tracks new/existing/fixed (`--prior`).
- `lib/detect.cjs`: the in-page rules. `lib/engine.cjs`: Playwright runner (scroll sweep, animations frozen, console/response/CSP capture).
- `fixtures/` + `selftest.cjs`: one planted defect per rule plus a clean page. The self-test fails if any rule cannot fire or the clean page raises a fault.

## Not built yet
- Adapters re-emitting `scroll-containers`, `extra-checks`, `site-checks` in this format.
- Baseline diff (before/after boxes), template-fit check against `template-spec/expected.json`, regression-from-defect loop, component registry (needed to enable the two disabled rules), provenance ("present before, absent now").
- Retiring the per-repo copies of the older tools.

## Known limits
- A3 only checks text-bearing boxes (inline children), so it skips carousel tracks on purpose. A2 skips anything inside a clipping ancestor for the same reason.
- First real run (artis-new, 42 pages x 3 widths) took about 3.5 minutes. Reduce with `--viewports` or `--paths`.
