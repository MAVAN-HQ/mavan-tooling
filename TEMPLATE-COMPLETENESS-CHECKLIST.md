# Template Completeness Checklist

A standalone rubric for "is this MAVAN template done." When a template is
getting close to finished, run it through this list — nothing else
required. **Every item here is judged against the template's own
repo, on its own terms — never by diffing it against another
`template-N`.** Page count, section depth, and scope are whatever that
template's own Figma/brief calls for; a smaller or differently-scoped
template is not "behind" a bigger one, and this checklist should never
require spinning up a cross-template comparison audit to answer "is this
one done." That's the whole point of this file existing — one list,
checked once per template, instead of N-way comparisons every time.

Most of this is cheap to check (a few commands, a few file reads). Only
the data-injectability section (§4) requires reading every component, and
that's the one worth skipping unless something changed since the last
confirmed-clean pass — see the note at the bottom of that section.

## 1. Build baseline (cheap — run these, nothing else)

```bash
git status --short      # must be empty (or only expected in-flight work)
npm run check            # astro check — must be 0 errors/0 warnings
npm run build             # must complete, including the postbuild CSP step
```

`generate-csp.js`'s postbuild output tells you two things for free: how
many script-src hashes exist (sanity count — should roughly track how
many inline `<script>` blocks the site has) and whether it just updated
vs. was already current (updated = something changed since the last
build, worth knowing why).

## 2. SEO framework (per repo)

- [ ] Canonical URL — `<link rel="canonical">` in `Layout.astro`, derived
      from `Astro.site` (not hardcoded)
- [ ] Meta description — per-page via a `description` prop
- [ ] OG/Twitter cards — `og:type/title/description/url/image/site_name`,
      `twitter:card/title/description/image`
- [ ] JSON-LD `LocalBusiness` schema — wired sitewide via `Layout.astro`
- [ ] `sitemap.xml` — `@astrojs/sitemap` integration in
      `astro.config.mjs`; confirm `sitemap-index.xml` actually appears in
      `dist/` after a real build (don't just trust the config exists)
- [ ] `robots.txt` — generated endpoint (`robots.txt.ts`), `Sitemap:`
      line derived from `Astro.site`, not a static file (a static file
      can silently drift from the real domain)
- [ ] `llms.txt` — generated endpoint, same pattern
- [ ] Alt text — every `<img>`/`<Image>` across every component has real,
      siteData-sourced alt text (not empty, not a generic filename)
- [ ] `BreadcrumbList`/`FAQPage`/`Service` JSON-LD — only expected once
      the relevant content exists (breadcrumb trail, FAQ section, service
      page). Absence is correct, not a gap, on a homepage-only or
      FAQ-less site — confirm the `schema.ts` builder functions exist and
      `Layout.astro`'s `additionalSchema` prop is ready to receive them,
      don't demand they be wired with nothing to describe.

## 3. Security

- [ ] `vercel.json` has all 4 headers: `X-Frame-Options`,
      `X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy`
- [ ] CSP `script-src` hash allowlist is current — confirmed via
      `generate-csp.js`'s own postbuild check reporting "already up to
      date," not by eyeballing the hash count
- [ ] Never hand-edit `vercel.json`'s CSP value directly — it's generated

## 4. Data injectability — "can a new client drop their content into `siteData.ts` alone and get a working site?"

For the **base template** (`template-N`, not the `-demo`): every piece of
client-specific content rendered anywhere — business name, copy,
headings, CTAs, images, contact info, testimonials, service/treatment
items, nav items, social links, SEO metadata — must trace back to a
`siteData.ts` field via props, not be a literal string/path in a
`.astro` file. Dynamic routes (`services/[slug].astro`,
`gallery/[slug].astro`, etc.) must be genuine `getStaticPaths()`
implementations driven by a `siteData` array, not hardcoded per-slug
branches.

**Not violations** (fine to hardcode): structural UI microcopy that's
identical for any business — "Submit," generic aria-labels, icon alt
text, pagination text, form-field defaults like "First Name." Also fine:
`siteData.ts` itself carrying obvious bracket-placeholder values
(`"[Business Name]"`, `"[email@example.com]"`) — that's the intended
find-and-replace convention, not a bug.

Also confirm `siteData.ts`'s placeholder quality: consistent bracketed
tokens across every client-specific field (not empty strings, which can
silently produce blank sections or break the build), and arrays
(`testimonials.items`, `serviceDetails`, etc.) shipping with real
placeholder entries at the correct shape/count.

**Findings baseline (2026-08-24, full read-only audit, both #1 and #2
independently landed on the same two minor gaps — worth checking first
before re-auditing from scratch, since a shared component may still
carry them):**
- `SiteFooter.astro`'s third footer column heading ("Company") is a
  hardcoded literal, unlike its siblings which pull from
  `siteData.footer.columns[].heading`
- `[slug].astro` dynamic-route pages' `backLabel`/`backHref` are
  hardcoded literals in some routes instead of siteData-driven (services
  routes do this correctly in #2; gallery routes in both #1 and #2 don't)
- `TestimonialCard.astro`'s "Read more" link is decorative-only
  (`href="#"`), not wired to any siteData field — not a data-injection
  gap since the label itself is generic, but the link can never go
  anywhere real regardless of what's edited

None of these block "drop content into siteData.ts alone" — they're
cosmetic/consistency gaps, not functional ones. **Deliberately deferred**
(Eli 2026-08-24: "leave for now but backlog so i do at some point") — not
forgotten, just not urgent. Fix in #1 and #2 whenever there's a natural
opening (e.g. touching `SiteFooter.astro` or the gallery route for
something else anyway):
- [ ] `SiteFooter.astro`'s "Company" footer-column heading → siteData field
- [ ] `gallery/[slug].astro`'s `backLabel`/`backHref` → siteData-driven,
      matching the services route's already-correct pattern

**Watch for this pattern specifically:** a heading assembled from siteData
props with a hardcoded literal *connective phrase* stitched in between
them, e.g. `At {introBusinessName}, a leading medspa in {introCity}...` —
the props are data-driven but the surrounding sentence isn't, and it can
carry vertical-specific wording ("medspa," "procedure") that a different
client/vertical couldn't reword without touching component code. This is
a real functional gap, not cosmetic — found across 4-5 spots in Template
#3 (`ConcernsSection`, `WhatWeOfferSection` x2, `WhyChooseUsSection`,
borderline in `ContactFormSection`'s "Procedure" label), while #1/#2
mostly avoided it (their headings assemble entirely from props with no
literal connective text). Check every heading built from more than one
prop for this specifically, not just "is there a prop at all."

**When to re-run this section:** only after new template-specific
components or pages are added, or a shared component
(`Nav`/`Footer`/etc.) changes. If nothing's changed since a template's
last confirmed-clean pass, trust the baseline instead of re-reading every
component again.

## 5. Scope is self-determined, not comparative

This template's required page tree, section depth, and component set are
whatever its own Figma/brief actually calls for — full stop. Do not use
another template's page count or structure as the yardstick, and do not
treat "template-N has a page/section/component this one doesn't" as a
finding on its own. The only question that matters: does this template
cover everything ITS OWN source material calls for? If yes, it's
complete regardless of how many pages that turns out to be. (Template #3
stayed homepage-only by design; treating that as an automatic gap versus
#1/#2's 7-page scope was a real mistake caught and corrected 2026-08-24 —
see `project_mavan_template3` memory. Don't repeat it.)

## 6. Demo-repo specifics (`-demo` repos only)

- [ ] `astro.config.mjs`'s `site` value is the real deployed URL (Vercel
      preview or real client domain), not the `example.com` placeholder
      the base template ships with
- [ ] Real client content substituted throughout (not the base template's
      bracket placeholders)
- [ ] Rebuild after any `site` value change — canonical/OG URLs and the
      CSP hash (JSON-LD embeds the URL) both need regenerating

---

## Current status by template (as of 2026-08-24 full audit)

| | #1 | #1-demo | #2 | #2-demo | #3 | #3-demo | #4 | #4-demo |
|---|---|---|---|---|---|---|---|---|
| Build/check/git clean | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 2026-08-26 | ✅ 2026-08-26 |
| SEO framework | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ fixed 2026-08-26 | ✅ fixed 2026-08-26 |
| Security headers + CSP | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 2026-08-26 | ✅ 2026-08-26 |
| Alt text on every image | (not separately tracked) | (not separately tracked) | (not separately tracked) | (not separately tracked) | (not separately tracked) | (not separately tracked) | ✅ fixed 2026-08-26 | ✅ fixed 2026-08-26 |
| Data injectability | 2 minor gaps (deferred) | n/a (real content) | 2 minor gaps (deferred) | n/a (real content) | ✅ fixed 2026-08-24 | n/a (real content) | ✅ fixed 2026-08-26 | n/a (real content) |
| Demo `site` = real URL, not example.com | n/a | ✅ | n/a | ✅ | n/a | ✅ | n/a | ✅ fixed 2026-08-26 (was example.com) |

`n/a` = the injectability check is about the *base* template only; a
`-demo` repo has real content by design, so it isn't re-checked the same
way.

**#1 minor gaps:** `SiteFooter.astro`'s "Company" column heading
hardcoded; `gallery/[slug].astro`'s `backLabel`/`backHref` hardcoded
(services route does it correctly); `TestimonialCard.astro`'s "Read
more" link is decorative-only (`href="#"`), not siteData-wired.

**#2 minor gaps:** identical two gaps as #1 (`SiteFooter.astro` "Company"
heading, `gallery/[slug].astro` back-link) — likely from a shared
component/pattern both templates inherited. Services route in #2 does
the back-link correctly, gallery route doesn't.

**#3's 5 real gaps** (more significant — see the "watch for this
pattern" callout above): `ConcernsSection.astro:63`, `WhatWeOfferSection
.astro:40` and `:49`, `WhyChooseUsSection.astro:41` each hardcode a
literal connective sentence fragment around otherwise-siteData-driven
heading pieces, including vertical-specific wording ("leading medspa").
`ContactFormSection.astro:48`'s "Procedure you're interested in" label
was the same class of issue. **Fixed 2026-08-24**: all five extracted to
new siteData fields (`introPrefix`/`introConnector`/`introEmPrefix`/
`introSuffix` on `concerns`, `headingPrefix` on `whatWeOffer` and its
`philosophy` sub-object and on `whyChooseUs`, `interestLabel` on
`contact`); base template's defaults bracket the vertical-locked word
("leading `[Business Type]` in", "`[Procedure]` you're interested in")
matching the file's existing convention. Demo's rendered copy confirmed
byte-identical in a fresh build — pure refactor, no visual change.

**#4's findings (2026-08-26, triggered by a live SEOQuake/Screaming Frog
crawl of `template-4-demo.vercel.app`, not a code-only audit):**
- `template-4-demo/astro.config.mjs`'s `site` was still the placeholder
  `https://example.com` — root cause of both a missing sitemap and a
  missing/wrong canonical on the crawled site, since canonical, OG URLs,
  JSON-LD, the sitemap, and `robots.txt`'s `Sitemap:` line all derive
  from this one value. **Fixed** — set to the real deployed URL,
  rebuilt, confirmed live in `dist/`.
- `llms.txt.ts` **did not exist at all** in either #4 repo — deferred at
  scaffold time pending `siteData.ts`, then never actually built once
  that landed. **Fixed** — added following #3's homepage-only pattern,
  synced to both repos.
- Two real alt-text gaps (Eli's own pass, not a crawler finding):
  `Hero.astro`'s main photo and all 3 `VideoFeatureSection.astro`
  poster images had `alt=""` despite being real content. **Fixed** —
  added `imageAlt`/`posterAlt` props following #1/#2's `AboutHero.astro`
  convention. One background photo (`FeatureSplitSection.astro`'s
  overlay `feature__bg`) correctly keeps `alt=""` — genuinely
  decorative, documented inline.
- Data injectability audited 2026-08-26 (full component read, not just
  grep). `SiteFooter.astro`'s columns checked against the exact #1/#2
  baseline bug first — correctly clean here. **6 real violations found
  and fixed:** `index.astro` hardcoded `imageAlt` literals for 5 real
  photos (skinServices/about/wellness/mindServices/sisterBrandTeaser)
  instead of sourcing from `siteData` — added `imageAlt` fields to all
  5 entries and wired them through. `ContactFormSection.astro`'s
  decorative watermark was a hardcoded `"MD"` literal tied to this
  client's actual name ("Mind MD") — made it an opt-in `watermarkText`
  prop (unset in base, `"MD"` in demo to preserve the exact visual).
  No connective-phrase-pattern gaps found (the #3 gap-class) — every
  multi-prop heading composition checked out clean.

**Takeaway worth generalizing:** the SEO framework section of this
checklist was previously being marked "done" off a code-only read (does
`Layout.astro` wire up canonical/OG/JSON-LD, does `astro.config.mjs` have
the sitemap integration) without confirming the **actual deployed site**
resolves correctly — #4's `site` placeholder would have been caught
immediately by checking a real build's `dist/index.html` or the live
domain, not just the presence of the code that's supposed to generate it.
Prefer verifying the live crawl surface (or at minimum a fresh
`dist/index.html`/`dist/sitemap-index.xml`/`dist/robots.txt`) over
code-only inspection when re-running §2 on any template going forward.

---

*Created 2026-08-24 after full audits of templates #1, #2, and #3 all
landed clean on build/security/SEO, with #3 additionally turning up a
real (not cosmetic) data-injectability gap-class the other two didn't
have. Use this file instead of re-auditing from scratch — update the
status table and this section as gaps get fixed or new templates get
added, and note new findings under the relevant checklist section rather
than only in conversation.*

*Updated 2026-08-26: added #4/#4-demo to the status table and a new "Alt
text on every image" row; #4's `site` placeholder, missing `llms.txt`,
and two real alt-text gaps found and fixed (see the findings block
above) — added the "verify the live crawl surface, not just the code"
takeaway so this doesn't recur on future templates. Later the same day:
ran #4's data-injectability audit (§4) for real, found and fixed 6
violations (5 hardcoded `imageAlt` literals in `index.astro`, one
client-name-specific hardcoded watermark) — #4 is now fully clean on
every section of this checklist except video sources (deliberately
left as placeholders, Eli's call) and scope (confirmed intentionally
homepage-only, not pending more pages).*
