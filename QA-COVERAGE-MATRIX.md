# QA coverage matrix: GPT's 18-category list vs the tools we have today

Status 2026-11-04. Read-only inventory, nothing here is built yet.
Legend: HAVE = a tool does it now; PART = partly, or only against an artifact baseline; GAP = nothing exists; LATER = blocked until it is wired (forms, tracking, Sanity).

## Where the existing tools live
- Per-repo copies in `artis-new|lhp-new|mavan-new|ivory-new/design/tools/`: `full-audit.cjs`, `parity.cjs`, `box.cjs`, `markup-audit.cjs`, `hover-audit.cjs`, `interaction-tests.cjs`, `site-checks.cjs`, `extra-checks.cjs`, `scroll-containers.cjs`, `render-reference.cjs`.
- Shared in `migration-tools/`: Playwright, `visual-parity-check.js`, `a11y-scan.js`, `scrollwidth-divergence-scan.js`, `check-h2-contrast-sweep.js`, `dom-measure.js`, `sitewide-parity-scan-*.js` (per client).
- `mavan-tooling` holds docs and checklists only. It has NO QA code today, so there is nothing to replace there; the new engine is additive.

## Structural problems (bigger than any single missing check)
1. Copied per repo, so a fix in one never reaches the others.
2. Most tools need a baseline (the artifact render or the live Elementor page). Nothing runs against a bare URL with no baseline.
3. Each tool writes its own JSON. No shared finding format, no dedupe by component.
4. No saved-regression loop: a defect found by a human is not turned into a check.
5. No component registry, so intentional overlaps cannot be whitelisted.

## Matrix
| # | GPT category | Status | What covers it / what is missing |
|---|---|---|---|
| 1 | Inventory, routing | PART | site-checks (sitemap, robots, links), extra-checks (orphans, dead routes). GAP: old-vs-new URL classification, redirect chains. |
| 2 | Links, navigation | HAVE | site-checks + extra-checks (anchors, `#`, mailto/tel, menu coverage). GAP: obscured-by-overlay, pointer-events none, new-tab rel. |
| 3 | Layout geometry | PART | scroll-containers, extra-checks (horizontal overflow), scrollwidth-divergence, full-audit (rect diff vs baseline). GAP: baseline-free faults (parent overflow, overlap, clipped text, zero-size, off-screen). |
| 4 | Responsive | PART | extra-checks (7 widths, mobile menu, 24px targets). GAP: breakpoint-edge widths, height variation, zoom. |
| 5 | Typography | PART | full-audit computed styles vs baseline, h2 sweeps. GAP: heading-line-count smell, fallback-font detection, entity/encoding artifacts. |
| 6 | Images, media | PART | markup-audit (src/alt/size vs baseline), percentage-clamp rule, extra-checks (alt). GAP: aspect distortion and upscaling without a baseline, duplicate src among siblings, broken video poster. |
| 7 | Visual regression | HAVE (artifact) | full-audit pixel diff, parity, box, hover-audit; visual-parity-check for live Elementor. GAP: last-approved-build baseline diff (Marylebone's "tool 1"). |
| 8 | Interactions | PART | interaction-tests (scripted per project), hover-audit. GAP: generic state-aware tester (accordion/tab/menu contracts) not hand-scripted per site. |
| 9 | Forms | LATER | Forms exist but are unwired. Static field/label checks only. |
| 10 | Technical SEO | HAVE | site-checks (title/desc/canonical/h1/og/JSON-LD/robots). GAP: compare against Julia's sheet as machine-readable truth. |
| 11 | Migration parity | PART | visual-parity-check, wave audit checklists, per-client sitewide scans. GAP: semantic section matching, redirect map validation. |
| 12 | Accessibility | HAVE | site-checks axe at desktop + mobile, a11y-scan, extra-checks (names, labels, ids). GAP: keyboard journeys, focus traps. |
| 13 | Performance | PART | PSI by hand (key file). GAP: no automated CWV/transfer-size/bundle gate. |
| 14 | Analytics, GTM | LATER | CSP covers inline scripts; no event tests. Tracking not wired. |
| 15 | Astro, build | HAVE | `astro check`, postbuild chain (CSP, placeholders, internal links). |
| 16 | Sanity | LATER | Sanity is last. |
| 17 | Runtime, security | PART | console errors, failed requests, mixed content (site-checks); CSP generation. GAP: security-header assertions, source-map exposure, `.env` exposure. |
| 18 | Lifecycle, animation | PART | scroll sweeps reveal animations (scroll-containers). GAP: no-JS render, slow-network, resize/rotate regressions. |

## Marylebone's five misses vs this matrix
All five (shared-image fallback, squeezed pills, 7-line H1, 123px strips, 51px table scroll) are baseline-free faults in category 3/6/5. Today only the scroll one is caught (scroll-containers). This is the first gap to close.

## Proposed order (nothing started)
1. Shared findings format + wrap existing tools in it (so results merge and dedupe).
2. Baseline-free objective-fault detector (category 3/5/6 GAP items), two tiers: objective faults can fail a build, smells report only.
3. Baseline diff (box + computed style snapshots, before/after a change).
4. Regression-from-defect loop + component registry with approved exceptions.
5. De-copy: one engine in mavan-tooling, repos call it.
Skip for now: Firefox/WebKit, SQLite, vision pass, auto-fix (detect and propose only, per standing rule).
