// Lowers the frontend JavaScript so older TV browsers can run it.
// Samsung Tizen 5.0 TVs (2019) ship a Chrome 63 engine, which rejects syntax such as `?.` and `??`
// and then skips the whole file, leaving a black screen. This runs only inside the Docker build,
// on the copy of the code in the image; the source files in the repo stay untouched.
//
// Usage: node scripts/legacy_build.cjs <app root>
// Needs `esbuild` and `core-js-bundle` resolvable via NODE_PATH.

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const TARGET = "chrome63";
const root = path.resolve(process.argv[2] || ".");
const jsDir = path.join(root, "js");
const indexPath = path.join(root, "index.html");

function lower(code, label) {
  try {
    return esbuild.transformSync(code, { loader: "js", target: TARGET, charset: "utf8" }).code;
  } catch (err) {
    // Keep the original rather than breaking the build: modern browsers still run it.
    console.warn(`[legacy] skipped ${label}: ${err.message.split("\n")[0]}`);
    return null;
  }
}

// 1. Script files under js/
for (const name of fs.readdirSync(jsDir)) {
  if (!name.endsWith(".js")) continue;
  const file = path.join(jsDir, name);
  const out = lower(fs.readFileSync(file, "utf8"), `js/${name}`);
  if (out !== null) fs.writeFileSync(file, out);
}

// 2. Inline <script> blocks and on*="" handlers in index.html
let html = fs.readFileSync(indexPath, "utf8");

html = html.replace(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi, (whole, attrs, body) => {
  const type = (attrs.match(/\btype\s*=\s*["']([^"']*)["']/i) || [])[1];
  if (type && !/^(text|application)\/javascript$/i.test(type)) return whole;
  if (!body.trim()) return whole;
  const out = lower(body, "inline <script> in index.html");
  return out === null ? whole : `<script${attrs}>${out}</script>`;
});

html = html.replace(/(\son[a-z]+=)"([^"]*(?:\?\.|\?\?)[^"]*)"/gi, (whole, attr, code) => {
  const out = lower(code.replace(/&quot;/g, '"'), `handler ${attr.trim()}`);
  if (out === null) return whole;
  return `${attr}"${out.trim().replace(/;$/, "").replace(/"/g, "&quot;")}"`;
});

// 3. Polyfills for missing built-ins (replaceAll, allSettled, flat, ...), loaded before anything else
const vendorDir = path.join(jsDir, "vendor");
fs.mkdirSync(vendorDir, { recursive: true });
fs.copyFileSync(require.resolve("core-js-bundle/minified.js"), path.join(vendorDir, "core-js.min.js"));
html = html.replace(/<head([^>]*)>/i, `<head$1>\n<script src="js/vendor/core-js.min.js"></script>`);

fs.writeFileSync(indexPath, html);
console.log(`[legacy] frontend lowered to ${TARGET}`);
