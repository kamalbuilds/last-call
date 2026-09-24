// Entry point for `node packages/events/check.mjs`. check.impl.mjs imports
// ./src/index.ts, which imports @fineprint/core, whose own multi-file source
// uses ".js" specifiers for sibling ".ts" files. Plain Node's native TS
// stripping does not remap that, so delegate to tsx (see packages/slice's
// check.mjs, same reasoning) and inherit its stdio/exit code.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tsx = fileURLToPath(new URL("./node_modules/.bin/tsx", import.meta.url));
const impl = fileURLToPath(new URL("./check.impl.mjs", import.meta.url));
const result = spawnSync(tsx, [impl], { stdio: "inherit" });
if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
