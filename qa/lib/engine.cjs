const path = require("node:path");
const fs = require("node:fs");
const { detectInPage } = require("./detect.cjs");
const { idOf } = require("./findings.cjs");

function loadPlaywright() {
  const tries = [process.env.QA_PLAYWRIGHT, "playwright", path.resolve(__dirname, "../../../migration-tools/node_modules/playwright")].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch { /* try next */ } }
  throw new Error("Playwright not found. Set QA_PLAYWRIGHT to its folder, or install it (migration-tools/node_modules/playwright is the shared copy).");
}

const FREEZE_CSS = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;scroll-behavior:auto!important}";

async function sweep(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.round(window.innerHeight * 0.8));
    for (let y = 0, i = 0; i < 80; i++) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
      if (y >= document.documentElement.scrollHeight - window.innerHeight) break;
      y += step;
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(250);
}

/**
 * Scan pages of a running site. Returns raw hits (one per element/page/viewport) for qa/lib/findings.cjs to collapse.
 * opts: baseUrl, paths[], viewports[{w,h}], rules[] (registry rows to run), freeze, shotsDir, maxShots, log
 */
async function scan(opts) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const enabled = opts.rules.map((r) => r.id);
  const wants = (id) => enabled.includes(id);
  const hits = [];
  const seenShot = new Set();
  let shots = 0;
  const log = opts.log || (() => {});
  try {
    for (const vp of opts.viewports) {
      const vpName = vp.w + "x" + vp.h;
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => {
        window.__qaCsp = [];
        document.addEventListener("securitypolicyviolation", (e) => window.__qaCsp.push(e.violatedDirective + " " + e.blockedURI));
      });
      for (const p of opts.paths) {
        const page = await ctx.newPage();
        const runtime = [];
        page.on("console", (m) => {
          if (m.type() !== "error") return;
          const t = m.text();
          if (/^Failed to load resource|^Refused to /.test(t)) return; // covered by response / CSP events
          runtime.push({ rule: "run.console-errors", selector: "console: " + t.slice(0, 100), summary: "Console error: " + t.slice(0, 160), actual: t.slice(0, 160) });
        });
        page.on("pageerror", (e) => runtime.push({ rule: "run.console-errors", selector: "pageerror: " + String(e.message).slice(0, 100), summary: "Uncaught error: " + String(e.message).slice(0, 160), actual: String(e.message).slice(0, 160) }));
        page.on("response", (r) => {
          if (r.status() >= 400) {
            const u = new URL(r.url());
            runtime.push({ rule: "run.failed-requests", selector: r.status() + " " + (u.host === new URL(opts.baseUrl).host ? u.pathname : u.host + u.pathname), summary: "Request failed with " + r.status() + ": " + u.pathname, expected: "2xx/3xx", actual: String(r.status()) });
          }
        });
        page.on("requestfailed", (r) => {
          const f = (r.failure() || {}).errorText || "";
          if (/ERR_ABORTED/.test(f)) return;
          const u = new URL(r.url());
          runtime.push({ rule: "run.failed-requests", selector: "failed " + u.host + u.pathname, summary: "Request failed (" + f + "): " + u.host + u.pathname, expected: "loads", actual: f });
        });
        try {
          await page.goto(opts.baseUrl + p, { waitUntil: "load", timeout: 30000 });
          if (opts.freeze) await page.addStyleTag({ content: FREEZE_CSS });
          await page.evaluate(() => document.fonts && document.fonts.ready);
          await sweep(page);
          const raw = await page.evaluate(detectInPage, { enabled });
          const csp = wants("run.failed-requests") ? await page.evaluate(() => window.__qaCsp || []) : [];
          for (const c of csp) runtime.push({ rule: "run.failed-requests", selector: "csp " + c, summary: "Blocked by Content Security Policy: " + c, expected: "allowed", actual: c });
          for (const h of raw) {
            h.url = p; h.viewport = vpName;
            if (opts.shotsDir && shots < (opts.maxShots || 40)) {
              const key = idOf(h.rule, h.component, h.selector);
              const tier = (opts.rules.find((r) => r.id === h.rule) || {}).tier;
              if (tier === "fault" && !seenShot.has(key) && h.box && h.box.w > 0) {
                seenShot.add(key);
                try {
                  fs.mkdirSync(opts.shotsDir, { recursive: true });
                  const clip = { x: Math.max(0, h.box.x - 40), y: Math.max(0, h.box.y - 40), width: Math.min(h.box.w + 80, 1600), height: Math.min(h.box.h + 80, 1200) };
                  await page.screenshot({ path: path.join(opts.shotsDir, key + ".png"), clip, fullPage: true, timeout: 5000 });
                  h.evidence = "evidence/" + key + ".png";
                  shots++;
                } catch { /* evidence is best effort */ }
              }
            }
            hits.push(h);
          }
          for (const r of runtime) {
            if (!wants(r.rule)) continue;
            hits.push({ ...r, url: p, viewport: vpName, component: "runtime", box: { x: 0, y: 0, w: 0, h: 0 }, expected: r.expected || "no errors", actual: r.actual || "" });
          }
          log(vpName + " " + p + " " + (raw.length + runtime.length) + " hits");
        } catch (e) {
          hits.push({ rule: "run.failed-requests", url: p, viewport: vpName, selector: "navigation " + p, component: "runtime", box: { x: 0, y: 0, w: 0, h: 0 }, summary: "Page did not load: " + String(e.message).split("\n")[0], expected: "loads", actual: "error" });
        }
        await page.close();
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return hits;
}

module.exports = { scan };
