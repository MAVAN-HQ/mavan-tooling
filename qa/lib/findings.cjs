const crypto = require("node:crypto");

const SEVERITY = ["critical", "high", "medium", "low"];
const TIER = ["fault", "smell"];
const MAX_OCC = 200;

const idOf = (rule, component, selector) => crypto.createHash("sha1").update(rule + "|" + component + "|" + selector).digest("hex").slice(0, 10);

/** Collapse raw hits (one per element/page/viewport) into one finding per rule+component+selector. */
function buildFindings(hits, rules, opts = {}) {
  const byRule = new Map(rules.map((r) => [r.id, r]));
  const map = new Map();
  for (const h of hits) {
    const rule = byRule.get(h.rule);
    if (!rule) continue;
    const id = idOf(h.rule, h.component, h.selector);
    let f = map.get(id);
    if (!f) {
      f = {
        id, rule: h.rule, tier: rule.tier, severity: rule.severity, confidence: rule.confidence,
        baseline: rule.baseline, summary: h.summary, component: h.component, expected: h.expected, actual: h.actual,
        occurrences: [], status: "new",
      };
      map.set(id, f);
    }
    f.occurrenceCount = (f.occurrenceCount || 0) + 1;
    if (f.occurrences.length < MAX_OCC) {
      f.occurrences.push({ url: h.url, viewport: h.viewport, selector: h.selector, box: h.box, ...(h.evidence ? { evidence: h.evidence } : {}) });
    }
  }
  let list = [...map.values()];

  if (opts.suppress && opts.suppress.length) {
    for (const f of list) {
      const s = opts.suppress.find((x) => x.rule === f.rule && (!x.component || x.component === f.component) && (!x.selector || f.occurrences.some((o) => o.selector.includes(x.selector))));
      if (s) { f.status = "suppressed"; f.suppression = s.reason || "approved exception"; }
    }
  }
  if (opts.prior) {
    const prior = new Map(opts.prior.map((p) => [p.id, p]));
    for (const f of list) if (f.status === "new" && prior.has(f.id)) f.status = "existing";
    for (const p of opts.prior) {
      if (!map.has(p.id) && p.status !== "fixed") list.push({ ...p, status: "fixed" });
    }
  }
  const order = (s) => SEVERITY.indexOf(s);
  list.sort((a, b) => (a.tier === b.tier ? 0 : a.tier === "fault" ? -1 : 1) || order(a.severity) - order(b.severity) || b.occurrences.length - a.occurrences.length);
  return list;
}

/** Light structural check against qa/findings.schema.json (no external validator needed). */
function validate(f) {
  const errs = [];
  for (const k of ["id", "rule", "tier", "severity", "summary", "occurrences"]) if (f[k] === undefined) errs.push("missing " + k);
  if (f.tier && !TIER.includes(f.tier)) errs.push("bad tier " + f.tier);
  if (f.severity && !SEVERITY.includes(f.severity)) errs.push("bad severity " + f.severity);
  if (!Array.isArray(f.occurrences) || !f.occurrences.length) errs.push("no occurrences");
  else for (const o of f.occurrences) if (!o.url || !o.viewport) errs.push("occurrence missing url/viewport");
  if (f.status === "suppressed" && !f.suppression) errs.push("suppressed without reason");
  return errs;
}

function toMarkdown(list, meta) {
  const live = list.filter((f) => f.status !== "suppressed" && f.status !== "fixed");
  const faults = live.filter((f) => f.tier === "fault");
  const smells = live.filter((f) => f.tier === "smell");
  let md = "# QA scan\n\n";
  md += `${meta.pages} pages x ${meta.viewports} viewports. **${faults.length} faults** (can fail a build), ${smells.length} smells (report only), ${list.filter((f) => f.status === "suppressed").length} suppressed, ${list.filter((f) => f.status === "fixed").length} fixed since the prior run.\n\n`;
  const sect = (title, arr) => {
    if (!arr.length) return "";
    let s = `## ${title}\n\n`;
    for (const f of arr) {
      const pages = [...new Set(f.occurrences.map((o) => o.url))];
      const vps = [...new Set(f.occurrences.map((o) => o.viewport))];
      s += `- **${f.rule}** [${f.severity}, ${f.status}] ${f.summary}\n  - where: \`${f.component}\` \`${f.occurrences[0].selector}\`\n  - ${pages.length} page(s): ${pages.slice(0, 5).join(", ")}${pages.length > 5 ? ", ..." : ""}; viewports: ${vps.join(", ")}\n  - expected ${f.expected || "n/a"}, actual ${f.actual || "n/a"}; id ${f.id}${f.occurrences[0].evidence ? "; evidence " + f.occurrences[0].evidence : ""}\n`;
    }
    return s + "\n";
  };
  md += sect("Faults", faults) + sect("Smells", smells);
  if (!faults.length && !smells.length) md += "No findings.\n";
  return md;
}

module.exports = { buildFindings, validate, toMarkdown, idOf };
