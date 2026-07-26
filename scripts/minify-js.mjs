/**
 * Minify ESM client scripts with esbuild (shorten identifiers, strip comments).
 * Writes next to source as *.min.js when --out=min, or overwrites via temp for deploy.
 *
 * Usage: node scripts/minify-js.mjs
 * Output: dist/js/*.js (minified) + dist copies of html/css/api
 */
import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const jsFiles = [
  "js/app-shell.js",
  "js/auth.js",
  "js/dashboard.js",
  "js/firebase-config.js",
  "js/landing.js",
  "js/login.js",
  "js/mtproto-api.js",
  "js/mtproto.js",
  "js/profile.js",
  "js/protect.js",
  "js/signup.js",
  "js/telegram-api.js",
  "js/telegram-store.js",
  "js/telegram.js",
];

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest, filter) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (["node_modules", ".git", "dist", ".firebase", ".vercel"].includes(name)) continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d, filter);
    else if (!filter || filter(name, s)) fs.copyFileSync(s, d);
  }
}

rimraf(dist);
fs.mkdirSync(path.join(dist, "js"), { recursive: true });

// Copy static assets
for (const dir of ["css", "api"]) {
  copyDir(path.join(root, dir), path.join(dist, dir));
}
for (const f of fs.readdirSync(root)) {
  if (/\.(html|json|md)$/i.test(f) || f === ".env.example" || f === ".gitignore") {
    fs.copyFileSync(path.join(root, f), path.join(dist, f));
  }
}
// package files for Vercel install
fs.copyFileSync(path.join(root, "package.json"), path.join(dist, "package.json"));
if (fs.existsSync(path.join(root, "package-lock.json"))) {
  fs.copyFileSync(path.join(root, "package-lock.json"), path.join(dist, "package-lock.json"));
}
if (fs.existsSync(path.join(root, "vercel.json"))) {
  fs.copyFileSync(path.join(root, "vercel.json"), path.join(dist, "vercel.json"));
}

// Minify each JS module (keep ESM + firebase CDN imports as-is)
for (const rel of jsFiles) {
  const entry = path.join(root, rel);
  if (!fs.existsSync(entry)) continue;
  const out = path.join(dist, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const source = fs.readFileSync(entry, "utf8");
  const result = await esbuild.transform(source, {
    loader: "js",
    minify: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
    target: "es2020",
    format: "esm",
    legalComments: "none",
  });
  fs.writeFileSync(out, result.code);
}

// Inject protect.js into HTML pages (head)
const protectTag =
  '<script src="js/protect.js" defer></script>\n  <meta name="robots" content="noindex, nofollow" />';

for (const f of fs.readdirSync(dist)) {
  if (!f.endsWith(".html")) continue;
  let html = fs.readFileSync(path.join(dist, f), "utf8");
  if (!html.includes("js/protect.js")) {
    html = html.replace(/<head>/i, `<head>\n  ${protectTag}`);
  }
  // Collapse multi-space in HTML lightly
  html = html.replace(/\n{3,}/g, "\n\n");
  fs.writeFileSync(path.join(dist, f), html);
}

console.log("Build OK → dist/ (minified JS + protect)");
