const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".avif": "image/avif", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".mp4": "video/mp4", ".webm": "video/webm",
  ".xml": "application/xml", ".txt": "text/plain", ".pdf": "application/pdf",
};

/** Serve a built folder (dist/) at the site root with clean-URL fallbacks, on a random free port. */
function serve(dir) {
  const root = path.resolve(dir);
  const srv = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(req.url.split("?")[0]); } catch { rel = "/"; }
    const cands = [rel, path.posix.join(rel, "index.html"), rel + ".html"];
    for (const c of cands) {
      const f = path.join(root, c);
      if (!f.startsWith(root)) continue;
      if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        res.writeHead(200, { "content-type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream" });
        fs.createReadStream(f).pipe(res);
        return;
      }
    }
    const nf = path.join(root, "404.html");
    res.writeHead(404, { "content-type": "text/html" });
    res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : "not found");
  });
  return new Promise((resolve) => {
    srv.listen(0, "127.0.0.1", () => resolve({ url: "http://127.0.0.1:" + srv.address().port, close: () => new Promise((r) => srv.close(r)) }));
  });
}

/** Page paths in a built folder: every .html, as the route a visitor would use. */
function routesOf(dir) {
  const root = path.resolve(dir);
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "_astro" && e.name !== "node_modules") walk(f); continue; }
      if (!e.name.endsWith(".html")) continue;
      let r = "/" + path.relative(root, f).split(path.sep).join("/");
      r = r.replace(/index\.html$/, "").replace(/\.html$/, "");
      if (r.length > 1 && r.endsWith("/")) r = r.slice(0, -1);
      out.push(r || "/");
    }
  })(root);
  return [...new Set(out)].sort();
}

module.exports = { serve, routesOf };
