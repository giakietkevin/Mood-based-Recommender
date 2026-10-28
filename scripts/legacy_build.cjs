// Lowers the frontend JavaScript so older TV browsers can run it.
// Samsung Tizen 5.0 TVs (2019) ship a Chrome 63 engine, which rejects syntax such as `?.` and `??`
// and then skips the whole file, leaving a black screen. This runs only inside the Docker build,
// on the copy of the code in the image; the source files in the repo stay untouched.
//
// Usage: node scripts/legacy_build.cjs <app root>
// Needs esbuild, acorn, core-js-bundle, postcss, tailwindcss@3 and its forms/typography plugins
// resolvable via NODE_PATH.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const esbuild = require("esbuild");
const acorn = require("acorn");

const TARGET = "chrome63";
const root = path.resolve(process.argv[2] || ".");
const jsDir = path.join(root, "js");
const vendorDir = path.join(jsDir, "vendor");
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

// Chrome 63 parses ES2018; anything newer makes it drop the whole script.
function parsesOnTarget(code) {
  try {
    acorn.parse(code, { ecmaVersion: 2018, sourceType: "script" });
    return true;
  } catch {
    return false;
  }
}

// Tailwind's play CDN needs BigInt (Chrome 67+), which can't be lowered. Build the same utilities
// ahead of time from the page's own tailwind.config and the classes used in the markup and scripts.
async function buildTailwindCss(html, scripts) {
  const postcss = require("postcss");
  const tailwindcss = require("tailwindcss");
  const configScript = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1])
    .find((body) => body.includes("tailwind.config"));
  const sandbox = { tailwind: {} };
  if (configScript) vm.runInNewContext(configScript, sandbox);
  const config = {
    ...(sandbox.tailwind.config || {}),
    content: [{ raw: html, extension: "html" }, ...scripts.map((raw) => ({ raw, extension: "js" }))],
    plugins: [require("@tailwindcss/forms"), require("@tailwindcss/typography")],
    // The opacity plugins emit rgb(r g b / var(--tw-...)), which Chrome 63 can't read; without them
    // colors come out as plain values.
    corePlugins: { backgroundOpacity: false, textOpacity: false, borderOpacity: false, divideOpacity: false, placeholderOpacity: false, ringOpacity: false },
  };
  const result = await postcss([tailwindcss(config)]).process("@tailwind base;\n@tailwind components;\n@tailwind utilities;", { from: undefined });
  const css = esbuild.transformSync(result.css, { loader: "css", target: TARGET, minify: true }).code;
  // esbuild leaves custom property values (gradients, rings) alone
  return css.replace(/rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/g, "rgba($1,$2,$3,$4)");
}

async function main() {
  let html = fs.readFileSync(indexPath, "utf8");
  const scriptNames = fs.readdirSync(jsDir).filter((name) => name.endsWith(".js"));

  // 1. Tailwind CSS for browsers the play CDN can't run on, loaded only where BigInt is missing
  try {
    const sources = scriptNames.map((name) => fs.readFileSync(path.join(jsDir, name), "utf8"));
    fs.writeFileSync(path.join(root, "css", "tailwind-legacy.css"), await buildTailwindCss(html, sources));
    html = html.replace(
      /(<script src="https:\/\/cdn\.tailwindcss\.com[^"]*"><\/script>)/,
      `$1\n<script>if (typeof BigInt === "undefined") document.write('<link rel="stylesheet" href="css/tailwind-legacy.css">');</script>`
    );
    console.log("[legacy] css/tailwind-legacy.css built");
  } catch (err) {
    console.warn(`[legacy] tailwind css skipped: ${err.message}`);
  }

  // 2. Script files under js/
  for (const name of scriptNames) {
    const file = path.join(jsDir, name);
    const out = lower(fs.readFileSync(file, "utf8"), `js/${name}`);
    if (out !== null) fs.writeFileSync(file, out);
  }

  // 3. Inline <script> blocks and on*="" handlers in index.html
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

  // 4. CDN scripts too new for the target (Tailwind's play CDN, lucide): download, lower and serve
  // them from js/vendor/. Scripts that already parse keep their CDN URL, since some (mediapipe)
  // load more files relative to where they were served from.
  fs.mkdirSync(vendorDir, { recursive: true });
  const external = [...html.matchAll(/<script\b[^>]*\bsrc="(https:\/\/[^"]+)"[^>]*><\/script>/gi)].map((m) => m[1]);
  for (const [i, url] of [...new Set(external)].entries()) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const code = await res.text();
      if (parsesOnTarget(code)) continue;
      const out = lower(code, url);
      if (out === null || !parsesOnTarget(out)) {
        console.warn(`[legacy] could not lower ${url}`);
        continue;
      }
      const local = `js/vendor/cdn-${i}.js`;
      fs.writeFileSync(path.join(root, local), out);
      html = html.split(`src="${url}"`).join(`src="${local}"`);
      console.log(`[legacy] ${url} -> ${local}`);
    } catch (err) {
      console.warn(`[legacy] kept ${url}: ${err.message}`);
    }
  }

  // 5. Polyfills for missing built-ins (replaceAll, allSettled, flat, ...), loaded before anything else
  fs.copyFileSync(require.resolve("core-js-bundle/minified.js"), path.join(vendorDir, "core-js.min.js"));
  html = html.replace(/<head([^>]*)>/i, `<head$1>\n<script src="js/vendor/core-js.min.js"></script>`);

  fs.writeFileSync(indexPath, html);
  console.log(`[legacy] frontend lowered to ${TARGET}`);
}

main().catch((err) => {
  console.error(`[legacy] failed: ${err.message}`);
  process.exit(1);
});
