// Independent check for /docs. Every tracked public docs page renders at /docs/<slug> with its H1,
// every internal link on those pages resolves, and untracked private pages (WIN-CONDITIONS) are unreachable.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { withApp, text } from "./serve.mjs";

const ROOT = join(new URL(".", import.meta.url).pathname, "..");
const pages = execSync("git ls-files 'docs/*.md'", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
if (pages.length < 13) throw new Error(`expected >= 13 tracked docs pages, got ${pages.length}`);
const route = (f) => (basename(f) === "README.md" ? "/docs" : `/docs/${basename(f, ".md")}`);
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

await withApp("@lastcall/web", 3161, async (get) => {
  const links = new Set();
  for (const f of pages) {
    const h1 = readFileSync(join(ROOT, f), "utf8").match(/^# (.+)$/m)[1].replace(/`/g, "");
    const res = await get(route(f));
    if (res.status !== 200) throw new Error(`${route(f)} -> ${res.status}`);
    const html = await res.text();
    const shown = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (!shown || decode(text(shown[1])).trim() !== h1) throw new Error(`${route(f)} H1 is "${shown && text(shown[1])}", want "${h1}"`);
    if (/\.md["#]/.test(html.match(/<article[\s\S]*<\/article>/)[0])) throw new Error(`${route(f)} still links to a .md file`);
    for (const [, href] of html.matchAll(/href="(\/[^"]*)"/g)) if (!href.startsWith("/_next")) links.add(`${route(f)} -> ${decode(href)}`);
  }
  const bodies = new Map();
  for (const l of links) {
    const [from, href] = l.split(" -> ");
    const [path, hash] = href.split("#");
    if (!bodies.has(path)) { const r = await get(path); bodies.set(path, { status: r.status, html: await r.text() }); }
    const { status, html } = bodies.get(path);
    if (status !== 200) throw new Error(`broken link on ${from}: ${href} -> ${status}`);
    if (hash && path.startsWith("/docs") && !html.includes(`id="${hash}"`)) throw new Error(`broken anchor on ${from}: ${href}`);
  }
  for (const p of ["/docs/WIN-CONDITIONS", "/docs/win-conditions", "/WIN-CONDITIONS.md", "/docs/WIN-CONDITIONS.md"]) {
    const r = await get(p);
    const body = await r.text();
    if (r.status !== 404 || /win condition/i.test(text(body).replace(/WIN-CONDITIONS/g, ""))) throw new Error(`private page reachable at ${p} (${r.status})`);
  }
  const docsHtml = [...bodies.values()].map((b) => b.html).join("");
  if (/WIN-CONDITIONS/i.test(docsHtml)) throw new Error("a docs page mentions WIN-CONDITIONS");
  if (!/href="\/docs"[^>]*>Docs</.test(bodies.get("/docs").html)) throw new Error("navbar has no Docs link");
  console.log(`ok: ${pages.length} pages render with their H1, ${links.size} internal links resolve (incl. anchors), WIN-CONDITIONS 404`);
});
