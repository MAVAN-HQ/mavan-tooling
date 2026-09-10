# Elementor → Astro Migration Audit Checklist

A standalone rubric for auditing a client site pair through the Elementor
migration wave: the **legacy Elementor site** (baseline — what's actually
broken before anyone touches it) and **Jesse's migrated Astro build**
(what got fixed, what got carried over unfixed, what regressed). Two
passes, same checklist, diffed against each other.

Built entirely from tools already proven in-session — no Screaming Frog/
SEMrush license assumed. Every check below has a concrete method using
the Browser pane, direct crawling, or the PageSpeed Insights web tool.
Where a paid tool would add real signal this can't replicate, it's noted
inline rather than silently skipped.

**Run order:** baseline the Elementor site first, in full, before looking
at the Astro build at all — auditing the migration with the old site's
problems fresh in mind (not from memory of "what's usually wrong with
Elementor sites") is what makes the diff actually trustworthy.

## 0. Full site crawl (do this before anything else, both sides)

Enumerate every real, unique page — not the XML sitemap, the actual nav +
in-page body links (the mywellnessstudio.com audit found "concern"
category pages that looked like plain text but every named item was
actually its own real page — sitemap-only crawls miss this class of
content entirely). Method: `document.querySelectorAll('a[href]')`
site-wide via the Browser pane's `javascript_tool`, same-origin filter,
dedupe, cross-reference nav-only vs. footer-only vs. body-only links.

Output: a flat list of every real URL, tagged by where it's linked from
(nav / footer / body-only / orphaned-but-in-sitemap). This list is what
every other section below gets checked against — don't sample a handful
of pages and extrapolate.

## 1. Crawl & indexation health

- [ ] **Broken links** — every internal link from the §0 crawl actually
      resolves (200), not 4xx/5xx. Check via direct HTTP HEAD/GET per
      URL (Bash `curl -sI` or WebFetch), not just clicking through.
- [ ] **Redirect chains** — any link that 301/302s more than once before
      landing (each hop is a real, avoidable performance/SEO cost)
- [ ] **Duplicate URL variants** — trailing-slash vs. non-slash, `www` vs.
      non-`www`, `http` vs. `https` all serving the same content without
      a canonical/redirect resolving them to one — WordPress serves both
      slash variants of every page by default; confirmed present on
      mywellnessstudio.com, worth checking as a default assumption on
      any Elementor site, not a maybe.
- [ ] **XML sitemap accuracy** — every sitemap URL actually resolves
      (200, not 404/redirect); every real page from the §0 crawl is
      actually IN the sitemap (orphan pages found on mywellnessstudio.com
      via nav despite sitemap presence — sitemap presence alone proves
      nothing about real discoverability)
- [ ] **robots.txt correctness** — not blocking real content by accident,
      `Sitemap:` line present and resolving
- [ ] **Canonical tags** — present on every page, self-referencing
      correctly (not all pointing at the homepage, a real and common
      Elementor/plugin misconfiguration)
- [ ] **noindex correctness** — nothing real is accidentally noindexed;
      nothing that should be noindexed (thank-you pages, internal
      search results, tag archives) is indexed
- [ ] **Orphaned pages** — real, working pages with zero internal
      inbound links anywhere in the §0 crawl (found repeatedly on
      MAVAN's own audits — a page can be live, real, and complete, and
      still be undiscoverable except by direct URL)

*Astro-side note:* `@astrojs/sitemap` + a generated `robots.txt.ts`
deriving from `Astro.site` (the pattern every MAVAN template already
uses) structurally prevents most of this category by construction — if
any of these still show up post-migration, that's a real regression
worth flagging loudly, not a "still needs work."

## 2. On-page SEO

- [ ] **Title tags** — present, unique per page (duplicate titles across
      every page is a common Elementor/theme-default failure), reasonable
      length
- [ ] **Meta descriptions** — present, unique, reasonable length
- [ ] **Exactly one real `<h1>` per page** — Elementor pages frequently
      have zero (styled text that isn't a real heading tag) or multiple
      (a widget default plus the actual content heading)
- [ ] **Heading hierarchy** — no skipped levels (H2→H4). This has been a
      real, recurring bug class across every MAVAN build this session
      (Ivory, Artis) even in fresh Astro code — check it explicitly on
      both sides, don't assume the new build got it right by default
- [ ] **Alt text** — real, non-generic, on every meaningful image;
      empty `alt=""` only on genuinely decorative images
- [ ] **NAP consistency** (Name/Address/Phone) — same values, verbatim,
      across every page, the footer, and any schema markup.

### 2a. Business/entity bleed — explicit, named check (not a sub-bullet)

Confirmed real for this client pair specifically: Dr. Shireen Dhanani
runs two separately-branded practices at related addresses — My Wellness
Studio (med spa, mywellnessstudio.com) and My Dental Touch (dental,
mydentaltouch.com). Copy, photos, staff, and services can bleed between
the two identities in ways that are easy to miss on a single-page skim
but are a real compliance/brand risk at the sentence level. Check
explicitly, on both the baseline and the migrated build:

- [ ] Does any page's copy reference the WRONG business's services (e.g.
      dental-practice copy mentioning med-spa treatments, or vice versa)?
- [ ] Does the schema/JSON-LD business type and NAP match the domain
      it's actually on (a `Dentist` schema on the med-spa domain, or
      vice versa, is a real, checkable error, not a style nitpick)?
- [ ] Are staff photos/bios/testimonials correctly attributed to the
      practice they actually belong to?
- [ ] Does the footer/nav/contact info correctly point to THIS practice's
      real details, not the sister practice's?
- [ ] On the migrated Astro build specifically: did the migration
      (human or AI-driven) introduce NEW bleed by scraping the wrong
      sister domain for some sections, or carry forward bleed that
      already existed on the live site unchanged?

## 3. Structured data

- [ ] JSON-LD present (parse actual `<script type="application/ld+json">`
      content, don't just check it exists — validate the JSON parses and
      required fields are populated)
- [ ] Schema type is correct for the business (`Dentist`/`MedicalBusiness`/
      `LocalBusiness`, not a generic/wrong type)
- [ ] Schema's NAP/hours/etc. actually matches the visible page content —
      a common silent-drift bug when schema is hand-maintained separately
      from visible copy

*No Frog/SEMrush needed here* — Google's own Rich Results Test
(`search.google.com/test/rich-results`) is free and validates this
directly; use it via the Browser pane against both live URLs.

## 4. Performance / Core Web Vitals

- [ ] **PageSpeed Insights score, mobile AND desktop**, both sides — this
      is the headline metric driving the whole migration wave; get the
      real number, not an estimate
- [ ] **Total image payload weight** — sum of all image bytes on a
      representative page (homepage at minimum); Elementor sites
      routinely ship multi-MB unoptimized originals
- [ ] **Image format/compression** — WebP vs. legacy JPG/PNG; and on the
      Astro side specifically, **check the actual quality parameter**
      if images route through an optimization endpoint (Vercel's
      `/_vercel/image?...&q=` param, or equivalent) — `q=100` requests
      maximum quality and barely compresses anything, a real and easy
      corner to cut that defeats the point of migrating in the first
      place. This was found on Jesse's mydental-xi.vercel.app build;
      check for it by default on every migrated site.
- [ ] **Render-blocking resources** — count and identify (network
      waterfall via `read_network_requests`)
- [ ] **Font loading strategy** — self-hosted + preloaded (correct) vs.
      blocking `@import`/render-blocking third-party font requests
      (common Elementor default)
- [ ] **Third-party script bloat** — count of external scripts (analytics,
      chat widgets, plugin bloat); Elementor sites frequently carry
      dozens from stacked plugins, most migrations should shed most of
      these

## 5. Security & compliance

- [ ] HTTPS enforced, no mixed-content warnings
- [ ] Security headers present (CSP, X-Frame-Options, X-Content-Type-Options,
      Referrer-Policy) — expect **zero** of these on the legacy Elementor
      side by default; expect all 4 on the Astro side (every MAVAN
      template ships `vercel.json` with these already — absence post-migration
      is a real regression, not a gap to schedule)
- [ ] `/privacy-policy` and `/terms-and-conditions` (or equivalent) exist
      and are real, not both linked-but-404 — found broken on multiple
      MAVAN-adjacent sites this session (Ivory, MAVAN-website), worth
      checking as a default assumption rather than an edge case
- [ ] Contact-form consent language present and accurate for what the
      form actually does (marketing vs. non-marketing text consent,
      TCPA-relevant for any site with SMS opt-in)
- [ ] For a medical/dental practice specifically: no real PHI exposure
      risk in forms/analytics, and check whatever specific compliance
      concern was already flagged for this client in the migration-wave
      scoping before assuming it's resolved just because the design
      migrated cleanly

## 6. Accessibility (real legal risk category, not just nice-to-have)

- [ ] Color contrast on body text and CTAs (WCAG AA minimum — check the
      specific case that already surfaced this session: low-contrast
      "ghost text" as a permanent, non-animated state is a real failure,
      not just an aesthetic choice)
- [ ] Keyboard navigability of nav/forms/carousels
- [ ] Meaningful alt text (cross-reference with §2's alt-text check —
      same finding, different lens)
- [ ] ARIA roles on custom interactive widgets (accordions, carousels,
      mega-menus) aren't just visually functional but screen-reader
      sane

## 6a. Conversion-content depth on high-value pages

Added 2026-09-09, benchmarked against a genuinely stronger external audit
Andrew ran. A technically clean page can still be a real business problem
if it's thin on the exact page that sells the most expensive procedure on
the site. For every page representing a high-cost/high-consideration
service (implants, full-mouth reconstruction, any procedure in the
thousands of dollars), check:

- [ ] **No lorem ipsum or placeholder text visible in production** — grep
      the rendered HTML for it, then **verify it's actually visible before
      escalating it** (`offsetParent === null` or computed
      `display`/`visibility` via the Browser pane's `javascript_tool` —
      don't stop at raw source presence). Real finding on 2026-09-09: a
      49-page sitewide "lorem ipsum" match on mydentaltouch.com turned out
      to sit inside a container classed `elementor-hidden-desktop
      elementor-hidden-laptop elementor-hidden-tablet elementor-hidden-mobile`
      — hidden on every breakpoint, never seen by a real visitor. Confirmed
      via computed style on two separate pages before downgrading it from
      "critical sitewide bug" to "minor dead-markup cleanup." A `grep` hit
      in curl'd HTML is a lead, not a finding — the same
      verify-before-trusting-source discipline as
      [[feedback_figma_verify_visible_sections]], applied to live sites
      instead of Figma exports.
- [ ] **Cost/financing information present** — a range, financing
      mention, or at minimum a clear "consultation for pricing" - silence
      on cost for a $10k+ procedure is a real conversion gap, not neutral
- [ ] **Real comparison content** where the procedure has real
      alternatives patients are actually weighing (implants vs. dentures,
      All-on-4 vs. snap-in, etc.) - absence means the page doesn't answer
      the actual question a considering patient has
- [ ] **Timeline/process steps, sedation options, and before/after
      evidence** - the concrete, specific content that differentiates a
      real informative page from generic template copy
- [ ] **Practitioner credentialing is specific, not vague** — "a Leesburg
      dentist and cosmetic doctor" is not a credential; real degree,
      certifications, or years of specific experience are
- [ ] **Title tag actually contains the real target query** — check the
      page's evident SEO target (e.g. "full mouth dental implants") against
      the literal title tag text; dropping one word ("Dental") from an
      otherwise-matching title is a real, checkable miss, not a style
      nitpick

## 6b. Advertising-compliance risk (not just SEO)

Added 2026-09-09. Some findings are legal/regulatory risk, not ranking
risk, and need to be flagged as such rather than folded into generic SEO
language:

- [ ] **Unverifiable superlative claims** ("best dentist," "#1," "top
      rated") baked into permanent URL slugs or page copy — many states'
      medical/dental advertising rules (confirmed relevant: Florida)
      treat this as potentially misleading advertising if unsubstantiated.
      A URL slug is effectively permanent once indexed/linked, so this
      needs a real redirect strategy to fix, not a text edit — flag the
      slug pattern explicitly (e.g. `best-dentist-{city}` →
      `dentist-{city}-fl`), don't just flag the visible text
- [ ] **"Doorway page" patterns** — a set of near-identical city/location
      landing pages differing only in place-name, especially when some
      places in the set are geographically nonsensical (40+ miles out,
      or a village too small to be a real market) or duplicated verbatim
      across a sister domain. This is a real Google-penalty-risk practice
      pattern, not just thin content - identify which location(s) in the
      set actually matter (real nearby population center) vs. which are
      padding

## 6c. PHI / patient-privacy exposure (medical and dental clients specifically)

Added 2026-09-09. Distinct from general accessibility/alt-text checks —
this is about information that shouldn't be publicly exposed at all,
not content that's merely unoptimized:

- [ ] **Real patient names in image file paths/URLs** — a testimonial
      photo's filename containing a real full name is public and
      crawlable the moment the page is indexed, regardless of whether
      the displayed testimonial text mentions the name. Check actual
      `<img src>` values, not just visible page text
- [ ] **Testimonial/photo-to-name mismatches** — confirm the file being
      served for a given displayed name is actually that person's photo,
      not another patient's (a real, checkable bug: fetch each
      testimonial card's actual image URL and compare against its
      displayed name/quote)
- [ ] **Empty testimonial content with real identifying material** — a
      card showing a real patient's photo/name with no actual quote is a
      real gap even before the privacy question; combined with a filename
      leak, it's worth flagging together as one finding, not two
- [ ] Confirm (ask, don't assume) that real marketing/testimonial
      authorization was actually obtained for named-and-photographed
      patients before treating this as purely a technical fix

## 6d. Granular cross-brand bleed (beyond visible nav/footer/schema)

Added 2026-09-09, after an external audit caught several instances this
checklist's original §2a missed by checking only the obviously visible
surfaces. Check these specifically, not just "does the page visually
look consistent":

- [ ] **Contact email addresses** — does either sister site's header/
      footer display the OTHER site's email domain (e.g. a
      `@sisterdomain.com` address appearing on this domain's own contact
      block)? Check both directions, not just "does this site reference
      itself correctly"
- [ ] **`og:site_name` meta tag** — often missed because it's invisible
      on-page; check it explicitly, separately from the visible title/H1
- [ ] **On-page review/testimonial text itself** — does quoted review
      copy reference the correct business by name, or a garbled/wrong
      variant, independent of the schema-level name fields already
      checked in §2a
- [ ] **Tagline/trademark bleed** — a sister brand's own tagline or ™
      phrase appearing on this domain's pages, especially directly
      adjacent to page-specific headings where it reads as this page's
      own claim
- [ ] **H1 vs. title tag content mismatch** — a correct, descriptive
      `<title>` paired with a vague tagline as the actual `<h1>` is a
      real, checkable SEO gap (title tag alone doesn't compensate for a
      non-descriptive H1) - flag both together, they're one finding
- [ ] **Shared/duplicated content sets across sister domains** — e.g. an
      identical service page (both sites have a Botox page) or an
      identical location-page set built from the same address block.
      This needs a real content-ownership decision (which brand "owns"
      this topic), not a copy tweak - flag it as a strategy question for
      Eli/Andrew, with a concrete suggested split if one is evident from
      each business's actual real specialty

## 7. Migration-specific diff (the actual point of running this twice)

This is the section that makes a paired audit different from two
separate audits — every finding from §1-6 on the Elementor side gets a
disposition on the Astro side:

- [ ] **Fixed** — the baseline problem is genuinely gone (cite the
      specific evidence, not "looks fine now")
- [ ] **Carried over** — the exact same problem exists in the new build
      too (migration didn't touch it)
- [ ] **Regressed** — a NEW problem exists on the Astro side that wasn't
      present on the Elementor side (a real migration-introduced bug,
      the most important category to catch early and consistently)
- [ ] **Content dropped** — a real page/section from the baseline crawl
      has no equivalent in the new build. Distinguish a *deliberate,
      graceful* drop (bad/fabricated/off-brand content correctly
      excluded per the migration's own judgment call) from an
      *accidental* one (a real, legitimate page that just didn't get
      built) — these look identical in a page-count diff but mean
      opposite things
- [ ] **Page-count/structure parity** — every real page from the §0
      Elementor crawl has a disposition (migrated / deliberately
      dropped / missing) — no page silently falls through the cracks
      between the two audits

## Output format

One scorecard per client, structured as: full §0-§6 findings for the
Elementor baseline, full §0-§6 findings for the Astro build, then §7's
disposition table mapping every baseline finding to its outcome. Publish
as a reference report (Artifact) per client, not just chat output — this
needs to be handed to Andrew/reviewed later, not re-derived each time.

---

*Created 2026-09-09, Eli's first session as migration-wave auditor
(reporting on Jesse's Elementor→Astro migrations). Built entirely from
free/scriptable tooling — Browser pane, direct HTTP checks, PageSpeed
Insights, Google's Rich Results Test — no Screaming Frog/SEMrush license
in hand. Revisit tool selection if either becomes available; note where
a paid crawler would add signal free tools can't fully replicate (bulk
cross-site trend reporting across the full ~45-site migration wave is
the main one — this checklist is built for one-site-at-a-time depth, not
portfolio-wide dashboards).*
