# Elementor → Astro: Handoff-to-Launch SOP

**What this covers:** every step between the moment Jesse hands over a
completed migration and the moment DNS points at the new build and the site
is live. Nothing before, nothing after.

**Who this is for:** Andrew, Julia, and Christel need to understand what
happens in that window, in what order, and what comes out of each stage.
Eli executes it. Jesse's side of the line is deliberately not specified here
(see "Intake posture" below).

**Status:** first written 2026-09-14, from a real completed cycle on
`mydentaltouch.com` (audit → fix execution) plus the two standing checklists
in this repo. Phases 4 and 5 (siteData conversion, CMS) have **not** yet been
run end-to-end on a real client — they are specified here but their time
estimates are projections, not measurements. Everything else has been done at
least once for real.

**Companion documents in this repo:**
- [`ELEMENTOR-MIGRATION-AUDIT-CHECKLIST.md`](./ELEMENTOR-MIGRATION-AUDIT-CHECKLIST.md)
  — the audit rubric. Phases 1, 2, 3, and 6 below are orchestration around it;
  it holds the actual checks.
- [`TEMPLATE-COMPLETENESS-CHECKLIST.md`](./TEMPLATE-COMPLETENESS-CHECKLIST.md)
  — §4 (data injectability) and §5 (graceful omission) are the acceptance bar
  for Phase 4.

---

## The short version

A migrated site arrives as a working Astro build. It is not yet a launchable
MAVAN site, for three separate reasons:

1. **It inherits the old site's content problems.** A verbatim clone
   faithfully reproduces wrong phone numbers, another practice's name in a
   heading, broken schema, and dropped tracking. Fidelity to the source is
   the point of the clone — it also means every pre-existing defect survives.
2. **Its content is not editable by anyone.** Page content lives in a
   machine-generated ledger keyed by the old WordPress install's internal IDs.
   No client, and no CMS, can address it.
3. **Nothing has been verified against the live domain it's about to replace.**

Phases 1–3 fix (1). Phases 4–5 fix (2). Phases 6–8 handle (3) and the cutover
itself.

---

## Phase map

| # | Phase | Output | Est. |
|---|---|---|---|
| 0 | Intake & triage | Intake record | 0.5–1 hr |
| 1 | Baseline audit (legacy site) | Baseline findings (often pre-done) | 2–4 hr |
| 2 | Build audit & migration diff | Published audit artifact | 3–5 hr |
| 3 | Remediation | Fix commits + annotated artifact | 4–12 hr |
| 4 | siteData conversion | Typed content model + converted build | **TBD — see Open Decisions** |
| 5 | CMS integration | Live CMS + editor handover | **TBD — see Open Decisions** |
| 6 | Pre-launch verification | Go/no-go record | 2–3 hr |
| 7 | DNS cutover | Live site | 1–2 hr + monitoring |
| 8 | Post-launch watch | 30-day confirmation | ~2 hr spread over 30 days |

Estimates are per site, for a site of roughly mydentaltouch's size (196
routes). They assume Phase 1 was already run as part of the portfolio-wide
pre-scan. Phases 4 and 5 are unestimated pending the scope decision — putting
a number on them before that decision lands would be inventing one.

---

## Intake posture

There is no acceptance gate on the handoff. Jesse runs the same prompt and
tooling on every migration, so handoff quality is consistent site to site, and
whatever problems show up are broadly the problems the Elementor original had
in the first place. Those get caught in Phases 1–3, which is where they belong.
Phase 0 measures what arrived; it doesn't judge it.

---

## Phase 0 — Intake & triage

**Input:** a repo (or branch) Jesse considers complete.

**Work:**

1. Clone fresh, or `git fetch` and compare against `origin/main` — never
   assume an existing local clone is current.
2. Run the project's own preflight: `node scripts/preflight-check.js`.
3. Clean build from a clean environment: `npm ci && npm run build`. A build
   that doesn't succeed on arrival is the one thing that stops everything
   else, so it's checked first.
4. Run whatever verification the build already ships. In mydental that was a
   substantial set, and it should be inventoried per site rather than assumed:
   `npm run check`, `npm run check:architecture`, `npm run content:validate`,
   `npm run content:routes:verify`, `npm run audit:css:delivery`,
   `npm run audit:modules:visual`.
5. Read the repo's own docs before auditing anything — `CLAUDE.md`,
   `docs/`, `artifacts/`. Per audit checklist §15b, the developer's own QA
   artifacts are checked *first*; re-deriving what's already documented is
   wasted time.
6. **Inventory the content architecture.** This is the step that sizes
   Phases 4 and 5, and it's the reason Phase 0 exists at all:
   - Where does page content actually live? (mydental:
     `scripts/import-site/module-mappings.json`, 626 entries, 2.3 MB)
   - What's the route count and family breakdown?
     (`artifacts/route-inventory.json` — 341 URLs discovered, 196 imported,
     145 excluded)
   - Is there a `siteData.ts`, and what does it actually feed? (mydental:
     present, 1117 lines, but consumed only by `Layout.astro`, `404.astro`,
     and `llms.txt.ts` — the shell, not page bodies)
   - How many distinct components, and from where?
     (`@mavan/theme-core`: ~60 template + 14 shared)
   - Count ledger entries by status: mapped / hidden / shell / needs-design.
     Any `needs-design` entries are unbuilt content and get flagged now.

**Output:** a short intake record — build status, route counts, content
architecture, and a first-pass size estimate for Phases 3–5.

**Exit criteria:** clean build, and the content architecture is understood
well enough to estimate. If the build doesn't succeed, that goes back to Jesse
immediately — that isn't a quality gate, it's a blocked handoff.

---

## Phase 1 — Baseline audit (the legacy Elementor site)

**This is normally already done.** The standing plan is to pre-scan every
legacy site across the wave independently of Jesse's schedule (audit checklist
"Phase A"), so by the time a build arrives the baseline usually exists and
this phase is just retrieving it.

**Input:** the live Elementor site, still on its production domain.

**Work:** run §0–§6d of the audit checklist against the legacy site — full
crawl, indexation, on-page SEO, entity bleed, structured data, Core Web
Vitals, security, accessibility, conversion-content depth, advertising
compliance, PHI exposure, cross-brand bleed.

**Why it comes first and why it can't be skipped:** the entire value of Phase
2 is the *diff*. Without a baseline recorded before anyone looked at the new
build, there's no way to distinguish "the migration broke this" from "this was
always broken" — and those two findings have opposite implications for
Andrew's conversation with the client.

**Output:** baseline findings, severity-tagged, stored for the Phase 2 diff.

**Exit criteria:** every page in the crawl has been seen; findings recorded
with evidence, not impressions.

---

## Phase 2 — Build audit & migration diff

**Input:** Jesse's build (running locally and/or on its Vercel preview) plus
the Phase 1 baseline.

**Work:**

1. Run §0–§6d again, this time against the migrated build.
2. Run the sections that only apply to the new build: §8 analytics/tracking
   survival, §9 forms & conversion-path QA, §11 runtime/console health, §12
   staging/legacy leakage sweep, §13 Open Graph, §14 content parity.
3. **Run §7, the diff.** Every baseline finding gets exactly one disposition:
   *fixed*, *carried over*, *regressed*, or *content dropped*. Dropped content
   is further split into deliberate (bad or off-brand content correctly
   excluded) versus accidental (a real page that just didn't get built) —
   identical in a page count, opposite in meaning.
4. Confirm page-count/structure parity: every real page from the baseline
   crawl has a disposition. Nothing falls between the two audits.

**What this has actually caught, on a real client:** entity bleed (another
practice's details in the migrated content), a character-encoding bug, a wrong
title tag, missing `Dentist` schema fields, unwired `sameAs`/`hasMap`, a
console error, and archive pagination that rendered invisible. None of these
were speculative; all shipped as fixes.

**Output:** a **published audit artifact** for this client — baseline
findings, build findings, and the §7 disposition table. Published, not chat
output, because Andrew and the client-facing team need to reference it later
without it being re-derived.

**Exit criteria:** zero baseline findings without a disposition.

---

## Phase 3 — Remediation

**Input:** the Phase 2 artifact.

**Work:** fix, in severity order. The recurring categories, from the real
cycle:

- **Entity bleed** — any other business's name, address, phone, or branding
  anywhere in content, metadata, schema, or alt text. Highest priority: it's
  both a credibility problem and, for medical/dental clients, a compliance
  one.
- **Leftover Elementor/WordPress artifacts** — `wp-json` references,
  `?attachment_id=`/`?p=` links, shortcode remnants, and especially images
  still hotlinking `wp-content/uploads/...` on the old domain. That last one
  is a launch blocker: those URLs stop resolving when the old host goes away.
- **Structured data** — schema present, valid, and complete. Note the
  checklist's §3 warning about JS-injected schema: validate against rendered
  output, not source.
- **Analytics & tracking survival** — GA4, GTM, conversion events, call
  tracking, pixels. A technically perfect migration that silently drops
  conversion tracking is a real business failure that no other check catches.
- **Forms & booking paths** — every form submits somewhere real and the
  submission is confirmed received, not just "the form posted." Third-party
  booking links (NexHealth, etc.) resolve to the right practice.
- **Console/runtime health** — zero unexplained errors; accordions,
  carousels, mobile menu, modals actually function when clicked.
- **Staging/legacy leakage** — no `.vercel.app`, `localhost`, or old-domain
  references in canonical/OG/sitemap tags, images, forms, API calls, JS, CSS,
  or JSON.

**Annotate fixes into the same published artifact as they ship** — recolor and
add a short note in place. Never delete or rewrite a finding, and never spin
up a separate tracker: the artifact is the record of what was found *and* what
was done about it.

**Output:** fix commits, plus the annotated artifact.

**Exit criteria:** every high-severity finding is either fixed or explicitly
accepted with a recorded reason.

---

## Phase 4 — siteData conversion

This is the phase the team hasn't seen before, and the one that makes
everything in Phase 5 possible.

### What the problem actually is

In a verbatim clone, page content is stored as a generated ledger. In
mydental that's `scripts/import-site/module-mappings.json`: 626 entries, each
keyed by the source page's Elementor identity, each holding a component path
and a raw props blob. A representative key:

```
https://mydentaltouch.com/about/::single-page:551:0::6f500ba0::0
```

And a representative entry's props include the booking URL, the Google review
link, and seven social URLs — inline, on a hero module.

Three things follow from that, and each one independently blocks a CMS:

1. **There is no content model.** Nothing in the ledger says "this is the
   business phone number." It says "module `6f500ba0` has a prop named
   `ctaHref`." A CMS needs named, typed, stable fields; this has none.
2. **The keys expire.** They encode the old WordPress install's `pageId`,
   `templateId`, and a sha256 of the old HTML. After cutover, when that install
   is decommissioned, the only thing giving those keys meaning is gone.
3. **Facts are duplicated inline.** The same phone number, booking URL, and
   social links appear across many module props *and* in `siteData.ts`. Two
   sources of truth for the same fact is structurally how entity bleed gets in
   — and in a CMS it would surface as many separately-editable copies of the
   phone number.

`siteData.ts` is the opposite on all three counts: named fields, types that
survive a redesign, one canonical value per fact. It is also what the
graceful-omission work in the template checklist (§5) was built against — and
CMS editing guarantees clients will empty fields.

### Why this is low-risk visually, despite being a large change

The concern this phase naturally raises is: does rebuilding the content layer
put the site's appearance or behavior at risk? The architecture says no, for a
specific reason worth stating plainly.

**The ledger does not render anything.** It selects a `@mavan/theme-core`
component and hands it props. The rendered HTML is a pure function of
`(component, props)`. Conversion changes only where those props are *read
from* — ledger lookup becomes a `siteData` reference. Same component, same
prop values, same output.

That makes the guarantee mechanically provable rather than a matter of
judgment: **build before, build after, diff `dist/`.** Byte-identical HTML is
proof of zero visual and zero functional change — a far stronger check than
comparing screenshots. The conversion is data plumbing, not a redesign.

The difficulty is therefore volume and modelling, not fidelity risk. See
"Where the real difficulty is" below.

### The work

**4.1 — Extract the content model.** Script a pass over the ledger that emits
(a) every distinct component and the union of props it receives, and (b) a
duplicate-value report — every string appearing in more than one entry.
That second report is the dedup evidence and it drives most of what follows.
Classify every prop into one of three buckets:

- **Business fact** (name, address, phone, email, hours, social, booking URL,
  review links, map link) → collapses to a single canonical `siteData` field.
- **Page content** (headings, body copy, CTAs, images, list items) →
  page-scoped `siteData` keys.
- **Structural** (layout variants, ordering, decorative flags) → stays in
  code or route config; it isn't content and shouldn't be editable.

**4.2 — Author the typed shape.** Start from the `template-N` `siteData.ts`
spine — `business`, `social`, `navigation`, `footer`, `seo` — and extend with
page-scoped keys for the in-scope routes. One fact, one field, one place.

**4.3 — Rewrite the render path.** In-scope routes stop reading props from the
ledger and read from `siteData` instead. **The ledger is not deleted** — it's
the import provenance record and the sha256 chain back to the source, and it's
the only way to prove later what the original site actually said. It stops
being the render source; it stays as the audit trail.

Out-of-scope routes keep the existing imported render path untouched until the
scope decision lands (see Open Decisions).

**4.4 — Prove no regression by output diff.** Capture `dist/` before
conversion, convert, rebuild, and diff the two trees. The target is
byte-identical HTML on every converted route. Every intentional divergence —
principally deduplication that corrects a wrong value — must appear in the
diff as a line someone deliberately signed off on. An unexplained diff line is
a bug, not a judgment call.

Back that up with the tooling the build already ships:
`npm run audit:modules:visual` against the cached `artifacts/source-reference/`
captures, plus `npm run check`, `npm run build`, and
`npm run content:routes:verify`.

**4.5 — Re-run the leakage sweep.** Conversion is a prime moment to
reintroduce absolute old-domain URLs while moving strings around. Audit
checklist §12, again, after conversion.

**4.6 — Run the acceptance bar.** Template checklist §4 (data injectability:
can a new client's content go in via `siteData.ts` alone and produce a working
site?) and §5 (graceful omission: does an emptied field degrade cleanly or
render broken UI?). §4 explicitly includes the hardcoded-connective-phrase
trap — a heading like `At {name}, a leading medspa in {city}` is data-driven
in its props and vertical-locked in its literal text.

### Where the real difficulty is

Ranked by actual cost, not by how alarming it sounds:

1. **Volume.** 626 ledger entries, ~60 components, 196 routes. Mechanical,
   scriptable, and large. This is the bulk of the time.
2. **Deduplication is the one place output legitimately changes.** If a phone
   number appears in 47 modules and three of those are wrong, collapsing to a
   canonical field changes those three. That is a desirable Phase 3 fix — but
   it means "byte-identical" holds only after the intentional corrections are
   enumerated. Each divergence is a recorded decision, never a silent side
   effect.
3. **Long-tail one-off modules.** Modules appearing once with idiosyncratic
   props each need their own named home. Low risk, high tedium, poor
   automation leverage.
4. **Bulk editorial content.** 100+ blog and archive routes hold rich HTML
   bodies, not structured fields. Forcing those into named `siteData` fields
   is the wrong shape; they belong in an Astro content collection. This is
   precisely what Open Decision 1 turns on.
5. **Non-mapped ledger entries.** `hidden` (52) and `shell` (2) statuses must
   stay hidden and shell. They are easy to lose in a bulk rewrite and their
   loss is visible immediately.

**The leverage point:** every site in the wave comes out of Jesse's same
pipeline, with the same ledger format and the same `@mavan/theme-core`
components. The extraction script, the classification pass, and the
`dist/`-diff harness are written once and amortized across all ~45 sites. Site
one is substantially more expensive than site two, and that difference is the
main argument for running a deliberate pilot before quoting the wave.

**Output:** a converted build whose in-scope content is entirely
`siteData`-driven, provably identical in output, passing §4 and §5.

**Exit criteria:** `dist/` diff clean or fully accounted for; §4 and §5 pass;
build and route verification clean.

---

## Phase 5 — CMS integration

**Direction:** Sanity is the working assumption (Julia is evaluating it).
WordPress-as-headless is a live alternative and is assessed below. This phase
is written to be mostly product-independent: the content model from Phase 4 is
the real work, and it transfers.

### Why the Phase 4 order matters

The CMS schema is a transcription of `siteData`'s TypeScript types. That is
the entire integration, conceptually — which is only true because Phase 4
produced a typed content model first. Attempting CMS work directly against the
ledger means inventing that model anyway, later, with the source site already
decommissioned.

### The work

**5.1 — Author the schema.** Transcribe `siteData`'s types into Sanity schema
documents. Singletons for site-wide facts (business, social, navigation,
footer); document types for repeatable content (services, testimonials, team,
locations, posts). Validation rules on required fields — a required field is
the cheapest protection against a client blanking something critical.

**5.2 — Seed the dataset.** One-time push of the current `siteData` values
into the CMS as the initial content. The site's live content at launch is
exactly what was audited and fixed in Phase 3, not a re-entry.

**5.3 — Wire the build.** Build-time fetch → generate `siteData` → Astro
builds static as it does today. **Commit a content snapshot** so a build is
reproducible and a CMS outage can never block a deploy. Static output is
preserved; there is no runtime dependency on the CMS.

**5.4 — Publish → deploy.** CMS webhook → Vercel deploy hook, so an editor
hitting Publish rebuilds the site without anyone at MAVAN doing anything.

**5.5 — Images.** If images move to the CMS's CDN, this changes the image
pipeline: `astro:assets` optimization is replaced by the CMS's URL-based
transforms, and responsive `srcset` has to be rebuilt deliberately rather than
inherited. **This also changes the Content Security Policy** — the CMS's CDN
domains have to be added, and the build's CSP generation
(`scripts/generate-csp.js` in mydental) re-run and verified before commit.
Decide per site whether images stay in-repo (simpler, better optimization,
not client-editable) or move to the CMS (client-editable, more moving parts).

**5.6 — Guardrails and editor handover.** Roles and permissions; what's
editable versus locked; preview; and a short written handover for whoever at
the client actually edits. Locking business NAP behind MAVAN-only editing is
worth considering specifically — it's the field most damaging to get wrong and
the one clients are least likely to need to change.

### Sanity vs. WordPress headless

**First, what headless WordPress does and doesn't fix.** The performance
problem genuinely does go away: visitors never touch WordPress, Astro serves
static files, and Elementor's runtime rendering disappears entirely. That's
real and worth stating plainly, because it's the objection people expect.

The costs are elsewhere:

- **WordPress is an application, not an editing UI.** Headless or not, it
  needs a server, a MySQL database, and ongoing patching — core, plugins, PHP
  version — across all 45 installs, indefinitely. That doesn't reduce when it
  goes headless; it just becomes less visible.
- **It gets less safe, not more.** Once the install isn't the public website,
  nobody notices when it breaks or gets compromised. The discovery event is a
  failed build.
- **The familiarity argument mostly evaporates** — and this is the one that
  actually decides it. Going headless removes the Elementor editor; that's the
  point of going headless. So clients aren't editing the visual builder they
  know, they're editing ACF field groups in wp-admin. That's a new editing
  model either way, which means the real comparison is "learn Sanity" versus
  "learn a field-based wp-admin workflow *and* keep maintaining 45 WordPress
  installs to get there."
- **The Phase 4 work doesn't go away either.** Elementor stores content as a
  serialized blob in `wp_postmeta` (`_elementor_data`). Read headlessly, that's
  the same unusable structure as the ledger — so the content model has to be
  rebuilt into ACF fields regardless. Same conversion, worse authoring
  environment, plus a PHP dependency.

**Sanity.** Typed schemas map near-1:1 onto `siteData`, so the integration stays
small and the content model stays honest. Good non-technical editor UI, hosted,
no server to patch.

**Recommendation:** Sanity. If its licensing at 45 sites turns out prohibitive,
a git-based CMS (edits commit straight to the repo, `siteData.ts` stays
literally the source of truth, no per-seat fee) is a better fallback than
keeping 45 WordPress installs alive.

### Architecture: one project per client

Sanity's structure has two levels. A **project** is the top-level container —
its own ID, bill, user list, API endpoint, Studio and schema. A **dataset** is
a partition inside a project; datasets share that project's schema *and its
user list*.

**45 separate projects, one per client.** Fully isolated: separate billing,
separate logins, separate content. The cost is 45 things to administer and 45
schema deployments to keep in step — which is scriptable via Sanity's
management API, and should be scripted once rather than done by hand, exactly
like the Phase 4 extraction tooling.

**One project with 45 datasets is not an option.** It's structurally
attractive — one bill, one Studio, one schema deployment — but datasets inherit
the project's user list, and per-dataset access control is an Enterprise
feature. Below that tier, anyone with project access can read every dataset,
meaning one client's editor could read another client's content. Since the
whole premise here is that clients edit their own content, this is disqualified
on data isolation, not on price.

> **Verify before building:** "can a user be scoped to a single dataset, and on
> which plan?" That one question settles the architecture. The reasoning above
> reflects Sanity's tiering as understood pre-2026-05 and has not been
> confirmed against current terms.

### Cost model at 45+ sites

**Estimates for budgeting — not a quote.** Verify against current pricing.

Four free-tier limits exist per project; only two are live concerns:

| Limit | Free-tier allowance | Driver? |
|---|---|---|
| Documents | ~10k per project | **No.** A 196-route site runs to hundreds of documents including drafts |
| API requests | ~1M/month | **No.** A static build fetches once per deploy — ~30 requests/month |
| Seats | 3 included | **Yes — the main driver.** 1 MAVAN + 1–2 client editors fits; a bigger client team doesn't |
| Bandwidth | ~10GB/month | **Only if images move to Sanity's CDN.** Keeping images in the repo removes this entirely |

| Scenario | Assumes | Monthly |
|---|---|---|
| Floor | All 45 within 3 seats, images in repo | **$0** |
| Likely | ~10 sites need a 4th or 5th seat | **$150–300** |
| Ceiling | ~20 sites on paid seats, some on Sanity-hosted images | **~$600–700** |

**Budget $200–300/month.** Not zero — expecting all 45 clients to stay inside
three seats is optimistic. Not $700 either, short of seat demand running well
above expectation.

Both drivers are within our control: images in the repo (already the Phase 5
default, for image-optimization reasons) eliminates the bandwidth variable, and
seat count is a provisioning decision rather than something client traffic
imposes on us.

For comparison, 45 managed WordPress installs at $15–30/mo is **$675–1,350/mo**
plus patching labour — so at the likely figure Sanity is cheaper on licensing
as well as on labour.

**Action for Julia:** confirm the dataset access-control question above, then
ask about an agency or partner arrangement. 45 projects is exactly the
conversation Sanity's sales team wants, and self-serve rates are usually the
wrong number at that scale.

---

## Phase 6 — Pre-launch verification

Audit checklist §16. The point of this phase is that the build being deployed
is **not** the build that was audited in Phase 2 — Phases 3, 4, and 5 all
changed it.

**Work:**

1. Clean production build from a clean environment.
2. Re-run §1 (crawl/indexation), §3 (schema), §8 (analytics), §9 (forms),
   §10 (DNS/email), and §11 (console) against the actual final build.
3. **Apply Julia's redirect and canonical lists.** Two standing rules, set
   2026-09-14, that replace any per-site judgement about what to redirect:

   - **Redirects:** Julia supplies the full 301 list. **If a URL is not on
     that list, the page is kept.** No URL gets dropped or redirected on our
     own initiative.
   - **Canonicals:** Julia supplies the canonical list. Anything on it points
     where she says. **Everything else self-canonicals** — blanket rule, no
     exceptions inferred from the old site's behaviour.

   Implement the 301s in `vercel.json` and verify every entry resolves on the
   preview deployment before cutover. The imported build does not write
   redirects itself, so nothing happens here by default.

4. **Reconcile the route inventory against Julia's list, and flag the
   conflicts.** "Not on the list means keep it" resolves cleanly for most
   excluded URLs, but not all. On mydental, of 145 excluded from 341:

   | Category | Count | Under the rule |
   |---|---|---|
   | Redirect aliases the live site already answers | 77 | Should appear on Julia's list |
   | Media files under `/wp-content/` | 12 | Not HTML routes — rule doesn't apply |
   | Elementor AJAX pagination states (`?e-page-…`) | ~21 | Query-string states, not routes |
   | Source 404s | 3 | Already broken; no page exists to keep |
   | **Empty CPT singles + empty taxonomy archives** | **35** | **Conflict — see below** |

   The 35 are the real item. 22 testimonial singles and 11 before-after-photo
   singles return HTTP 200 on the live site and render a header, a footer, and
   zero characters of body content; their actual content publishes through
   loop grids on `/the-experience/testimonials/` and
   `/the-experience/our-work-of-art/`. Two empty taxonomy archives are the same
   class. Keeping them means building 35 pages that render nothing, which is
   worse than pointing them at the grids that carry their content. **Send these
   back to Julia as an explicit decision rather than resolving them locally.**

5. Confirm the launch plan is actually a hard DNS cutover for this client
   before assuming it. On the real cycle, an unchallenged assumption about the
   canonical domain survived several audit passes before being retracted.

**Output:** a go/no-go record — what was re-verified, what's outstanding, and
an explicit go decision.

**Exit criteria:** explicit go. Not implied by the absence of a no.

---

## Phase 7 — DNS cutover

Audit checklist §10.

### The one idea this whole phase rests on

**Two unrelated systems share the client's domain: their website, and their
email.** DNS is the only thing they have in common. You are changing the
website half and leaving the email half completely alone.

Get that backwards and the website looks perfect while the practice stops
receiving email — a failure no other phase in this SOP would catch, because
every other check only ever looks at the website.

So the whole phase reduces to: change exactly two records, touch nothing else,
and prove afterwards that mail still flows.

### Records you change — exactly these two

| Record | Host | Change to |
|---|---|---|
| `A` | `@` (apex, e.g. `client.com`) | Vercel's IP |
| `CNAME` | `www` | Vercel's target hostname |

Vercel gives you both exact values when you add the domain to the project.

### Records you do not touch — any of these

| Record | What it does | Breaks if changed |
|---|---|---|
| `MX` | Routes incoming mail to their provider | All inbound email |
| `TXT` (SPF) | Says which servers may send as them | Outbound mail marked spam |
| `DKIM` | Signs outbound mail | Outbound mail marked spam |
| `DMARC` | Policy for failed SPF/DKIM | Deliverability |
| Other `TXT` | Google / Meta / tool verifications | Whatever they verify |

If a DNS provider's UI offers "point this domain at a new host" as one action,
do not use it — those flows frequently rewrite the whole zone, mail records
included. Edit the two records individually.

### Timeline

**T-minus 48 hours**

1. **Export the entire existing DNS zone and save the file.** Every record, every
   type. This file is the rollback — nothing else is.
2. Lower TTL to `300` on the `A` and `CNAME` records only. This is what makes a
   rollback take minutes instead of hours, and it has to happen far enough ahead
   that the *old* long TTL has expired everywhere by cutover.
3. Add the domain to the Vercel project; record the exact target values it gives.
4. Confirm the old host stays paid up and running for 30 days.
5. Walk whoever is executing the change through the rollback, before the day of.

**T-zero — the change itself**

6. Change the `A` record. Change the `CNAME` record. Stop.

**T-plus 15 minutes**

7. SSL certificate issued for both the apex and `www`.
8. `www` and apex both resolve, and the redirect between them goes the right way.
9. Spot-check redirects from Julia's 301 list against the live domain.
10. Analytics recording a real session from the live domain.
11. **Send an email to the client's address from an outside account and confirm
    it arrives.** Then have them send one out. This is the check that catches
    the failure mode nothing else catches — do not skip it because the site
    looks fine.

**T-plus 1 day**

12. Submit the sitemap in Google Search Console; confirm the domain property.
13. Re-crawl the live domain and confirm no stray `noindex` survived from staging.

**T-plus 30 days**

14. Decommission the old host.

### Rollback

Put the `A` and `CNAME` records back to the values in the exported zone file.
With TTL at 300 that propagates in minutes. Nothing else needs reverting,
because nothing else was changed.

**Output:** a live site and a recorded cutover log.

---

## Phase 8 — Post-launch watch

Launch is not the end of the migration; it's the start of the window where
regressions surface against real traffic.

- **Day 1:** console/runtime health on the live domain; confirm forms and
  booking submit from production; confirm analytics is recording real
  sessions, not just firing.
- **Week 1:** Search Console coverage — crawl errors, 404 spikes (which
  usually mean a redirect-map gap), indexation of the new URLs.
- **Week 2–4:** Core Web Vitals on real field data, not lab scores. Compare
  against the Phase 1 baseline; this is the number Andrew will want, and it's
  the first point at which it's real rather than synthetic.
- **Day 30:** decommission the old host, once rollback is genuinely no longer
  needed. Not before.

---

## Roles

| Who | Owns |
|---|---|
| Jesse | The migration itself, up to handoff |
| Eli | Phases 0–8: audit, remediation, conversion, CMS, cutover |
| Julia | CMS product evaluation (Sanity); the 301 list and the canonical list, per site |
| Andrew | Client communication; the scope decision in Open Decisions |
| Christel | Client-facing reporting off the published audit artifacts |

---

## What the team can look at, and when

| After phase | Artifact |
|---|---|
| 0 | Intake record — build status, route counts, size estimate |
| 2 | Published audit artifact — baseline, build, and the disposition table |
| 3 | Same artifact, annotated in place as fixes ship |
| 6 | Go/no-go record |
| 7 | Cutover log |
| 8 | 30-day confirmation, including real-field CWV vs. baseline |

The audit artifact is the primary client-facing document. It is annotated in
place as work lands rather than replaced, so it reads as a single continuous
record of what was found and what was done.

---

## Open decisions

**1. CMS content scope — OPEN, blocking the Phase 4/5 estimates.**
How much of a migrated site becomes client-editable? mydental has 196 routes,
most of them blog, archive, and location pages. Three positions:

- *Tiered* (Eli's recommendation): shell plus money pages — home, about,
  services, contact, locations — become `siteData`/CMS-driven. Blog and
  archives become an Astro content collection fed by the CMS. Everything else
  stays static-imported. Far lower per-site conversion cost.
- *Everything editable*: all routes get a content model. Maximum client
  control; the single largest effort driver in this SOP.
- *Shell and business facts only*: NAP, hours, nav, footer, social, CTAs.
  Cheapest, and it kills entity bleed — but clients can't edit their own copy,
  which is probably not what's being asked for.

Until this lands, Phases 4 and 5 carry no time estimate.

**2. CMS product.** Sanity recommended; Julia evaluating. Needs real pricing
at ~45 sites before commitment — see the cost shape in Phase 5, and ask about
an agency/partner arrangement rather than taking self-serve rates.
WordPress-headless assessed in Phase 5 and not recommended.

**2b. The 35 empty CPT singles.** Under Julia's "not on the 301 list means keep
it" rule, mydental's 33 empty testimonial/before-after singles and 2 empty
taxonomy archives would each be built as a page rendering nothing. Needs an
explicit call from Julia — almost certainly they should redirect to the loop
grids that publish their content. See Phase 6.

**3. Per-site pricing and timeline.** Derives from (1). Worth running the
first full cycle — through Phases 4 and 5 — on one client before quoting the
wave, since Phase 4's tooling cost lands almost entirely on the first site.

**4. Rollout order across the ~45 sites.** Not addressed here. Worth deciding
whether the first CMS-integrated client is a low-risk site deliberately chosen
as a pilot.

---

*Created 2026-09-14, following a team meeting with Andrew, Julia, and
Christel. Phases 0–3 and 6–8 are grounded in a completed real cycle on
mydentaltouch.com. Phases 4 and 5 are specified but unproven — revise this
document with real numbers after the first client through them, rather than
letting the projections here harden into assumptions.*
