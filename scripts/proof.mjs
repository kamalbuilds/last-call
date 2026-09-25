import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CHECKS = [
  {
    name: "convert-sim",
    command:
      "pnpm --filter @lastcall/convert build-tx CtB2LNTpRnD97zTcDqMnTih7usipMxrD5WYsdiC9V3Jb 6GJbPKBtovsrMEEMcic5KMi5tswh9qSyT5ZYLMqEwNgt PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh 1000000000 >/dev/null 2>&1 && node packages/convert/check.mjs",
  },
  { name: "sponsor-guard", command: "node packages/sponsor/check.mjs" },
  {
    name: "ledger-recount",
    command:
      "pnpm --filter @lastcall/ledger build >/dev/null 2>&1 && node packages/ledger/check.mjs",
  },
  { name: "slice-plan", command: "node packages/slice/check.mjs" },
  { name: "events", command: "node packages/events/check.mjs" },
];

function lastLine(text) {
  const lines = String(text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.length > 0 ? lines[lines.length - 1] : "";
}

const checks = [];
for (const { name, command } of CHECKS) {
  const ranAt = new Date().toISOString();
  let output = "";
  let exitCode = 1;
  try {
    const out = execSync(command, { cwd: root, shell: "/bin/sh", encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    output = lastLine(out);
    exitCode = 0;
  } catch (err) {
    const combined = [err?.stdout, err?.stderr].filter(Boolean).join("\n");
    output = lastLine(combined);
    exitCode = typeof err?.status === "number" ? err.status : 1;
    if (!output) output = `exit ${exitCode}`;
  }
  if (!output) {
    try {
      const r = spawnSync("sh", ["-c", command], { cwd: root, encoding: "utf8" });
      output = lastLine([r.stdout, r.stderr].filter(Boolean).join("\n")) || `exit ${r.status ?? 1}`;
      exitCode = r.status ?? 1;
    } catch {
      output = `exit ${exitCode}`;
    }
  }
  const ok = exitCode === 0 && (output.startsWith("ok") || output.includes("GREEN"));
  checks.push({ name, command, ok, output, ranAt: new Date().toISOString() });
  console.log(`${ok ? "ok" : "FAIL"}: ${name}: ${output}`);
  void ranAt;
}

const proof = { generatedAt: new Date().toISOString(), checks };
mkdirSync(path.join(root, "frontend", "public"), { recursive: true });
writeFileSync(
  path.join(root, "frontend", "public", "proof.json"),
  JSON.stringify(proof, null, 2) + "\n",
);
