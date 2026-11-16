// Cache-bust the private app's assets: Cloudflare serves CSS/JS with a 4h
// browser cache, while the HTML is only cached for 10 min. Stamping a content
// hash into the URLs makes phones fetch the new bundle as soon as the HTML
// refreshes. Runs after `vite build`; deterministic, so rebuilding is a no-op.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const HTML = "p/a8f3k2/index.html";
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 10);

const html = readFileSync(HTML, "utf8")
  .replace(/src="app\.js(\?v=[0-9a-f]+)?"/, `src="app.js?v=${hash("p/a8f3k2/app.js")}"`)
  .replace(/href="\/styles\.css(\?v=[0-9a-f]+)?"/, `href="/styles.css?v=${hash("styles.css")}"`);
writeFileSync(HTML, html);
