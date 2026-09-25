// Copies the git-tracked public docs into the app so Vercel (which ignores repo-root docs/) ships them.
// Untracked files such as docs/WIN-CONDITIONS.md are never copied. No-op when docs/ is absent (hosted builds).
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const APP = new URL(".", import.meta.url).pathname;
const ROOT = join(APP, "..");
if (!existsSync(join(ROOT, "docs/README.md"))) process.exit(0);

const tracked = execSync("git ls-files docs", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const OUT = join(APP, "content/docs");
rmSync(OUT, { recursive: true, force: true });
for (const f of tracked) {
  const dest = f.endsWith(".md") ? join(OUT, f.slice("docs/".length)) : f.endsWith(".html") ? join(APP, "public", f.slice("docs/".length)) : null;
  if (dest === null) continue;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(ROOT, f), dest);
}
