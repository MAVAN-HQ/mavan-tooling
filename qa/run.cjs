#!/usr/bin/env node
/**
 * MAVAN QA scan: baseline-free fault and smell detector.
 *
 *   node qa/run.cjs --dist <built-folder>                      scan a built Astro site (serves it locally)
 *   node qa/run.cjs --url https://host --paths /,/about        scan a deployed site
 *
 *   --viewports 1440x900,768x1024,390x844   default shown
 *   --out <dir>        default ./qa-out (findings.json, report.md, evidence/)
 *   --enable id,id     also run rules that are off by default (geo.text-overlap, media.duplicate-sibling-src)
 *   --rules id,id      run only these rules
 *   --config <file>    JSON { "suppress": [{ "rule", "component"?, "selector"?, "reason" }] } approved exceptions
 *   --prior <file>     an earlier findings.json: marks findings existing / fixed
 *   --no-freeze        keep CSS animations running (default freezes them)
 *   --no-fail          exit 0 even when faults are found
 *
 * Exit 1 when any live (not suppressed) fault is found. Smells never fail a run.
 * Detects and reports only. It never edits the site.
 */
const fs = require("node:fs");
const path = require("node:path");
const { serve, routesOf } = require("./lib/serve.cjs");
const { scan } = require("./lib/engine.cjs");
const { buildFindings, validate, toMarkdown } = require("./lib/findings.cjs");

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i < 0 ? d : argv[i + 1]; };
const flag = (k) => argv.includes("--" + k);
const csv = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

function loadRules({ only, enable }) {
  const reg = JSON.parse(fs.readFileSync(path.join(__dirname, "rules.json"), "utf8"));
  return reg.rules.filter((r) => r.implemented !== false && (only.length ? only.includes(r.id) : r.default !== false || enable.includes(r.id)));
}

async function main() {
  const rules = loadRules({ only: csv(opt("rules")), enable: csv(opt("enable")) });
  const viewports = csv(opt("viewports", "1440x900,768x1024,390x844")).map((v) => { const [w, h] = v.split("x").map(Number); return { w, h }; });
  const out = path.resolve(opt("out", "qa-out"));
  fs.mkdirSync(out, { recursive: true });

  let server = null, baseUrl, paths;
  if (opt("dist")) {
    server = await serve(opt("dist"));
    baseUrl = server.url;
    paths = routesOf(opt("dist"));
  } else if (opt("url")) {
    baseUrl = opt("url").replace(/\/$/, "");
    paths = csv(opt("paths", "/"));
  } else {
    console.error("Give --dist <folder> or --url <base>. See the header of qa/run.cjs.");
    process.exit(2);
  }
  if (opt("paths") && opt("dist")) paths = csv(opt("paths"));

  console.log(`Scanning ${paths.length} page(s) x ${viewports.length} viewport(s) with ${rules.length} rules...`);
  let hits;
  try {
    hits = await scan({ baseUrl, paths, viewports, rules, freeze: !flag("no-freeze"), shotsDir: path.join(out, "evidence"), log: flag("verbose") ? console.log : undefined });
  } finally {
    if (server) await server.close();
  }

  const cfg = opt("config") ? JSON.parse(fs.readFileSync(opt("config"), "utf8")) : {};
  const prior = opt("prior") ? JSON.parse(fs.readFileSync(opt("prior"), "utf8")) : null;
  const findings = buildFindings(hits, rules, { suppress: cfg.suppress, prior });
  const bad = findings.flatMap((f) => validate(f).map((e) => f.id + ": " + e));
  if (bad.length) { console.error("Finding format errors:\n" + bad.join("\n")); process.exit(2); }

  fs.writeFileSync(path.join(out, "findings.json"), JSON.stringify(findings, null, 2));
  fs.writeFileSync(path.join(out, "report.md"), toMarkdown(findings, { pages: paths.length, viewports: viewports.length }));
  const live = findings.filter((f) => f.status !== "suppressed" && f.status !== "fixed");
  const faults = live.filter((f) => f.tier === "fault");
  console.log(`${faults.length} fault finding(s), ${live.length - faults.length} smell finding(s). Report: ${path.join(out, "report.md")}`);
  process.exit(faults.length && !flag("no-fail") ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
