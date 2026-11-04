#!/usr/bin/env node
/**
 * Self-test: proves every rule can fail. Each fixture in qa/fixtures contains exactly one planted defect;
 * the rule must fire on it. The clean fixture must produce no faults at any viewport. A rule with no fixture
 * that fires is reported as unproven and fails the self-test.
 *
 *   node qa/selftest.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { serve } = require("./lib/serve.cjs");
const { scan } = require("./lib/engine.cjs");

const reg = JSON.parse(fs.readFileSync(path.join(__dirname, "rules.json"), "utf8"));
const rules = reg.rules.filter((r) => r.implemented !== false); // everything, including rules off by default
const D = { w: 1440, h: 900 }, M = { w: 390, h: 844 };

// fixture page -> rule that must fire, viewport, optional selector prefix for the runtime rules
const CASES = [
  ["a1-viewport-overflow", "geo.viewport-overflow", D],
  ["a2-parent-overflow", "geo.parent-overflow", D],
  ["a3-clipped-text", "geo.clipped-text", D],
  ["a4-micro-scroller", "geo.micro-scroller", D],
  ["a5-zero-box", "geo.zero-box", D],
  ["a6-text-overlap", "geo.text-overlap", D],
  ["a7-duplicate-sibling-src", "media.duplicate-sibling-src", D],
  ["a8-image-distortion", "media.image-distortion", D],
  ["a9-image-upscaled", "media.image-upscaled", D],
  ["a10-percentage-clamp", "media.percentage-clamp", D],
  ["a11-console-errors", "run.console-errors", D],
  ["a12-failed-requests", "run.failed-requests", D],
  ["a12b-csp-violation", "run.failed-requests", D, "csp "],
  ["a13-heading-order", "seo.heading-order", D],
  ["a14-tap-target", "a11y.tap-target", M],
  ["b1-heading-line-count", "typo.heading-line-count", D],
  ["b2-extreme-aspect-text", "geo.extreme-aspect-text", D],
  ["b3-measure", "typo.measure", D],
  ["b5-orphan-width", "geo.orphan-width", D],
];

(async () => {
  const srv = await serve(path.join(__dirname, "fixtures"));
  let failed = 0;
  const proven = new Set();
  try {
    for (const [page, rule, vp, selPrefix] of CASES) {
      const hits = await scan({ baseUrl: srv.url, paths: ["/" + page], viewports: [vp], rules, freeze: true });
      const got = hits.filter((h) => h.rule === rule && (!selPrefix || h.selector.startsWith(selPrefix)));
      const ok = got.length > 0;
      if (ok) proven.add(rule); else failed++;
      console.log((ok ? "PASS " : "FAIL ") + rule.padEnd(30) + " fires on " + page + (ok ? "" : "   got: " + (hits.map((h) => h.rule).join(",") || "nothing")));
    }
    for (const vp of [{ w: 1440, h: 900 }, { w: 768, h: 1024 }, { w: 390, h: 844 }]) {
      const hits = await scan({ baseUrl: srv.url, paths: ["/clean"], viewports: [vp], rules, freeze: true });
      const bad = hits.filter((h) => (rules.find((r) => r.id === h.rule) || {}).tier === "fault");
      const ok = bad.length === 0;
      if (!ok) failed++;
      console.log((ok ? "PASS " : "FAIL ") + "clean page has no faults at " + vp.w + "x" + vp.h + (ok ? "" : "   got: " + bad.map((h) => h.rule + " " + h.selector).join("; ")));
    }
  } finally {
    await srv.close();
  }
  const unproven = rules.filter((r) => !proven.has(r.id)).map((r) => r.id);
  if (unproven.length) { failed += unproven.length; console.log("FAIL rules with no firing fixture: " + unproven.join(", ")); }
  console.log(failed ? `\n${failed} problem(s).` : `\nAll ${proven.size} rules proven able to fail; clean page is clean.`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
