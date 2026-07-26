/**
 * Build decoy HTML shells (1–2 lines) + XOR+base64 page payloads.
 * Real markup lives in src/pages/*.html — edit there, then run: npm run shell
 *
 * View-Source shows only the tiny shell; real UI is injected by js/boot.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pagesDir = path.join(root, "src", "pages");
const outV = path.join(root, "js", "v");
const KEY = 73;

const PAGES = [
  "index",
  "login",
  "signup",
  "dashboard",
  "profile",
  "telegram",
  "mtproto",
];

function xorEncode(str, key = KEY) {
  const bytes = Buffer.from(str, "utf8");
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = bytes[i] ^ (key + (i % 17));
  }
  return bytes.toString("base64");
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

ensureDir(outV);
ensureDir(pagesDir);

// If src/pages missing a file, seed from root (first-time)
for (const name of PAGES) {
  const src = path.join(pagesDir, `${name}.html`);
  const rootHtml = path.join(root, `${name}.html`);
  if (!fs.existsSync(src) && fs.existsSync(rootHtml)) {
    fs.copyFileSync(rootHtml, src);
  }
}

for (const name of PAGES) {
  const srcPath = path.join(pagesDir, `${name}.html`);
  if (!fs.existsSync(srcPath)) {
    console.warn("skip missing", name);
    continue;
  }
  let html = fs.readFileSync(srcPath, "utf8");

  // Ensure protect is present in real page
  if (!html.includes("js/protect.js")) {
    html = html.replace(/<head>/i, '<head>\n  <script src="js/protect.js" defer></script>');
  }

  const b64 = xorEncode(html);
  // Payload as plain script (not ESM) — hard to read as HTML in View Source of the shell
  const payloadJs =
    `(function(w){w.__AG__={p:${JSON.stringify(name)},d:${JSON.stringify(b64)}}})(this);`;
  fs.writeFileSync(path.join(outV, `${name}.js`), payloadJs);

  // Decoy shell: ~2 lines, no real app markup
  // View-Source decoy only (~1 line). Real markup is XOR+base64 in js/v/*.js
  const decoy =
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><title></title></head>` +
    `<body><script src="js/boot.js" data-p="${name}"></script></body></html>\n`;
  fs.writeFileSync(path.join(root, `${name}.html`), decoy);
  console.log("shell", name, "payload", Math.round(b64.length / 1024) + "kb");
}

// boot.js (readable source kept; minify step can compress for deploy)
const boot = `/*! boot */(function(){
  var sc=document.currentScript;
  var page=(sc&&sc.getAttribute("data-p"))||"index";
  var KEY=73;
  function dec(b64){
    var bin=atob(b64);
    var out=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i)^(KEY+(i%17));
    return new TextDecoder("utf-8").decode(out);
  }
  function paint(html){
    try{
      document.open();
      document.write(html);
      document.close();
    }catch(e){
      document.documentElement.innerHTML=html.replace(/^[^]*?<html[^>]*>/i,"").replace(/<\\/html>[^]*$/i,"");
    }
  }
  var s=document.createElement("script");
  s.src="js/v/"+page+".js";
  s.async=false;
  s.onload=function(){
    try{
      var pack=window.__AG__;
      if(!pack||!pack.d)return;
      paint(dec(pack.d));
      try{ delete window.__AG__; }catch(_){ window.__AG__=null; }
    }catch(err){
      document.body.textContent="Load error";
    }
  };
  s.onerror=function(){ document.body.textContent="Load error"; };
  (document.head||document.documentElement).appendChild(s);
})();
`;
fs.writeFileSync(path.join(root, "js", "boot.js"), boot);

console.log("OK — decoy HTML shells written. Edit real pages in src/pages/ then re-run npm run shell");
