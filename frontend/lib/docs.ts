import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { Marked, type Token, type Tokens } from "marked";

// Populated from the repo's tracked docs by sync-docs.mjs; read only at build time.
const DIR = join(process.cwd(), "content/docs");

export interface DocHeading { depth: number; text: string; id: string }
export interface DocLink { slug: string; title: string }
export interface DocGroup { name: string; blurb: string; pages: DocLink[] }
export interface Doc { slug: string; title: string; html: string; headings: DocHeading[] }

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : f.endsWith(".md") ? [p] : [];
  });
}

const slugOf = (file: string): string => (basename(file) === "README.md" ? "index" : basename(file, ".md"));
const SOURCES = new Map(files(DIR).map((p) => [slugOf(p), p]));

export const docHref = (slug: string): string => (slug === "index" ? "/docs" : `/docs/${slug}`);

/** Rewrites a relative markdown link to its /docs route; external and absolute links pass through. */
export function rewriteHref(href: string): string {
  if (/^[a-z]+:|^\/|^#/i.test(href)) return href;
  const [path, hash] = href.split("#");
  if (path.endsWith(".md")) {
    const slug = slugOf(path);
    return `${docHref(slug)}${hash ? `#${hash}` : ""}`;
  }
  // The tracked HTML diagram carries em dashes and raw scroll listeners the UI gate rejects; the site ships its PNG render.
  if (path.endsWith(".html")) return `/${path.replace(/^(\.\.\/)+/, "").replace(/\.html$/, ".png")}`;
  return href;
}

/** GitHub-style heading id, so anchors written against GitHub keep working. */
function githubId(text: string, seen: Map<string, number>): string {
  const base = text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}

const plain = (tokens: Token[] | undefined): string =>
  (tokens ?? []).map((t) => ("tokens" in t && t.tokens ? plain(t.tokens) : "text" in t ? String(t.text) : "")).join("");

const escape = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function render(src: string): { title: string; html: string; headings: DocHeading[] } {
  const headings: DocHeading[] = [];
  const seen = new Map<string, number>();
  let title = "";
  const md = new Marked({
    gfm: true,
    walkTokens(t) {
      if (t.type === "link") t.href = rewriteHref(t.href);
    },
    renderer: {
      heading({ tokens, depth }) {
        const text = plain(tokens);
        const id = githubId(text, seen);
        const inner = this.parser.parseInline(tokens);
        if (depth === 1) {
          title ||= text;
          return `<h1 id="${id}">${inner}</h1>\n`;
        }
        if (depth <= 3) headings.push({ depth, text, id });
        return `<h${depth} id="${id}"><a class="docs-anchor" href="#${id}" aria-label="Link to this section">#</a>${inner}</h${depth}>\n`;
      },
      table(token: Tokens.Table) {
        const cell = (c: Tokens.TableCell, tag: string) =>
          `<${tag}${c.align ? ` style="text-align:${c.align}"` : ""}>${this.parser.parseInline(c.tokens)}</${tag}>`;
        const head = `<tr>${token.header.map((c) => cell(c, "th")).join("")}</tr>`;
        const body = token.rows.map((r) => `<tr>${r.map((c) => cell(c, "td")).join("")}</tr>`).join("");
        return `<div class="docs-table"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>\n`;
      },
      code({ text, lang }) {
        const label = lang ? `<div class="docs-code-lang">${escape(lang)}</div>` : "";
        return `<div class="docs-code">${label}<pre><code>${escape(text)}</code></pre></div>\n`;
      },
      link({ href, title: t, tokens }) {
        const external = /^https?:/.test(href);
        return `<a href="${escape(href)}"${t ? ` title="${escape(t)}"` : ""}${external ? ' target="_blank" rel="noreferrer"' : ""}>${this.parser.parseInline(tokens)}</a>`;
      },
    },
  });
  const html = md.parse(src, { async: false });
  return { title, html, headings };
}

const cache = new Map<string, Doc>();
export function getDoc(slug: string): Doc | null {
  const file = SOURCES.get(slug);
  if (file === undefined) return null;
  if (!cache.has(slug)) cache.set(slug, { slug, ...render(readFileSync(file, "utf8")) });
  return cache.get(slug)!;
}

/** Sidebar groups, taken from the README's "**Group.** blurb" paragraphs and the link list after each. */
export function getGroups(): DocGroup[] {
  const tokens = new Marked().lexer(readFileSync(SOURCES.get("index")!, "utf8"));
  const groups: DocGroup[] = [];
  for (const t of tokens) {
    if (t.type === "paragraph" && t.tokens?.[0]?.type === "strong") {
      const [strong, ...rest] = t.tokens;
      groups.push({ name: plain([strong]).replace(/\.$/, ""), blurb: plain(rest).trim(), pages: [] });
    } else if (t.type === "list" && groups.length > 0) {
      for (const item of (t as Tokens.List).items) {
        const link = item.tokens.flatMap((x) => ("tokens" in x && x.tokens ? x.tokens : [])).find((x) => x.type === "link") as Tokens.Link | undefined;
        if (link?.href.endsWith(".md")) groups.at(-1)!.pages.push({ slug: slugOf(link.href), title: plain(link.tokens) });
      }
    }
  }
  return groups;
}

/** Reading order: overview, then pages as the README lists them, then any page the README forgot. */
export function getOrder(): DocLink[] {
  const listed = [{ slug: "index", title: "Overview" }, ...getGroups().flatMap((g) => g.pages)];
  const rest = [...SOURCES.keys()].filter((s) => !listed.some((l) => l.slug === s)).map((slug) => ({ slug, title: getDoc(slug)!.title }));
  return [...listed, ...rest];
}

export const docSlugs = (): string[] => [...SOURCES.keys()];
export const docSourcePath = (slug: string): string => relative(join(process.cwd(), ".."), SOURCES.get(slug) ?? "").replace("frontend/content/", "");
