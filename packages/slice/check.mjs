// Entry point for `node packages/slice/check.mjs`. Plain Node's native TS
// stripping loads a single .ts file fine, but does not remap the ".js"
// specifiers this repo's TS sources use for sibling ".ts" files (see
// @fineprint/exec's internal imports), so it cannot load a multi-file
// workspace package on its own. Delegate the real check to tsx, which
// already handles that remap correctly, and inherit its stdio/exit code.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tsx = fileURLToPath(new URL("./node_modules/.bin/tsx", import.meta.url));
const impl = fileURLToPath(new URL("./check.impl.mjs", import.meta.url));
const result = spawnSync(tsx, [impl], { stdio: "inherit" });
if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
